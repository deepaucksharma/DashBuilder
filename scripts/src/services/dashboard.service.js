import { NerdGraphClient } from '../core/api-client.js';
import { NRQLService } from './nrql.service.js';
import { SchemaService } from './schema.service.js';
import { Cache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { validateDashboard, isValidVisualization, extractAttributesFromQuery, calculateQueryComplexity } from '../utils/validators.js';
import { ValidationError } from '../utils/errors.js';

export class DashboardService {
  constructor(config) {
    this.config = config;
    this.client = new NerdGraphClient(config);
    this.nrqlService = new NRQLService(config);
    this.schemaService = new SchemaService(config);
    this.cache = new Cache({ 
      enabled: config.enableCache, 
      ttl: config.cacheTTL 
    });
    
    // NRDOT v2: Load profile configurations
    this.profiles = this.loadMonitoringProfiles();
    
    // NRDOT v2: Process metrics cost factors
    this.costFactors = {
      processMetrics: {
        baseCostPerQuery: 0.05,
        costPerProcess: 0.001,
        costPerAttribute: 0.0005
      },
      queryComplexity: {
        low: 1.0,
        medium: 1.5,
        high: 2.5
      }
    };
  }

  // NRDOT v2: Monitoring profile definitions
  loadMonitoringProfiles() {
    return {
      Conservative: {
        maxWidgetsPerDashboard: 15,
        maxProcessesPerWidget: 50,
        queryTimeRange: '1 hour',
        refreshInterval: 300, // 5 minutes
        complexity: 'low'
      },
      Moderate: {
        maxWidgetsPerDashboard: 25,
        maxProcessesPerWidget: 100,
        queryTimeRange: '30 minutes',
        refreshInterval: 180, // 3 minutes
        complexity: 'medium'
      },
      Aggressive: {
        maxWidgetsPerDashboard: 35,
        maxProcessesPerWidget: 200,
        queryTimeRange: '15 minutes',
        refreshInterval: 120, // 2 minutes
        complexity: 'medium'
      },
      Critical: {
        maxWidgetsPerDashboard: 50,
        maxProcessesPerWidget: 500,
        queryTimeRange: '10 minutes',
        refreshInterval: 60, // 1 minute
        complexity: 'high'
      },
      Emergency: {
        maxWidgetsPerDashboard: 100,
        maxProcessesPerWidget: 1000,
        queryTimeRange: '5 minutes',
        refreshInterval: 30, // 30 seconds
        complexity: 'high'
      }
    };
  }

  async listDashboards(limit = 100) {
    const accountId = this.config.requireAccountId();
    const cacheKey = this.cache.generateKey('dashboards', accountId, limit);
    
    return await this.cache.get(cacheKey, async () => {
      const dashboards = await this.client.getDashboards(accountId, limit);
      
      return dashboards.map(dashboard => ({
        name: dashboard.name,
        guid: dashboard.guid,
        pages: dashboard.pages?.length || 0,
        widgets: dashboard.pages?.reduce((sum, page) => sum + (page.widgets?.length || 0), 0) || 0,
        createdAt: dashboard.createdAt,
        updatedAt: dashboard.updatedAt,
        permissions: dashboard.permissions
      }));
    });
  }

  async exportDashboard(guid) {
    const dashboard = await this.client.getDashboard(guid);
    
    if (!dashboard) {
      throw new ValidationError(`Dashboard with GUID ${guid} not found`);
    }

    // Transform to importable format
    return {
      name: dashboard.name,
      permissions: dashboard.permissions,
      pages: dashboard.pages.map(page => ({
        name: page.name,
        widgets: page.widgets.map(widget => ({
          title: widget.title,
          visualization: widget.visualization,
          configuration: widget.configuration,
          layout: widget.layout
        }))
      }))
    };
  }

  async importDashboard(dashboard, accountId = null) {
    accountId = accountId || this.config.requireAccountId();
    
    // Validate dashboard structure
    const validation = await this.validateDashboard(dashboard);
    if (!validation.valid) {
      throw new ValidationError(`Invalid dashboard: ${validation.errors.join(', ')}`);
    }

    return await this.client.createDashboard(accountId, dashboard);
  }

  async updateDashboard(guid, dashboard) {
    // Validate dashboard structure
    const validation = await this.validateDashboard(dashboard);
    if (!validation.valid) {
      throw new ValidationError(`Invalid dashboard: ${validation.errors.join(', ')}`);
    }

    return await this.client.updateDashboard(guid, dashboard);
  }

  async deleteDashboard(guid) {
    return await this.client.deleteDashboard(guid);
  }

  async validateDashboard(dashboard) {
    const errors = [];
    const warnings = [];

    try {
      validateDashboard(dashboard);
    } catch (error) {
      errors.push(error.message);
      return { valid: false, errors, warnings };
    }

    // Validate widgets
    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        // Check visualization type
        if (!isValidVisualization(widget.visualization.id)) {
          warnings.push(`Widget '${widget.title}' uses unknown visualization type: ${widget.visualization.id}`);
        }

        // Validate NRQL if present
        if (widget.configuration?.nrql?.query) {
          try {
            const validation = await this.nrqlService.validateQuery(widget.configuration.nrql.query);
            if (!validation.valid) {
              errors.push(`Widget '${widget.title}' has invalid query: ${validation.error}`);
            }
          } catch (error) {
            errors.push(`Widget '${widget.title}' query validation failed: ${error.message}`);
          }
        }

        // Check layout
        if (widget.layout) {
          if (widget.layout.column < 1 || widget.layout.column > 12) {
            errors.push(`Widget '${widget.title}' has invalid column: ${widget.layout.column}`);
          }
          if (widget.layout.width < 1 || widget.layout.width > 12) {
            errors.push(`Widget '${widget.title}' has invalid width: ${widget.layout.width}`);
          }
          if (widget.layout.column + widget.layout.width - 1 > 12) {
            errors.push(`Widget '${widget.title}' extends beyond grid boundary`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  async validateWidgets(dashboard, options = {}) {
    const results = {
      allValid: true,
      totalWidgets: 0,
      validWidgets: 0,
      invalidWidgets: 0,
      widgets: [],
      suggestions: {}
    };

    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        results.totalWidgets++;
        
        const widgetResult = {
          page: page.name,
          widget: widget.title,
          valid: true,
          errors: [],
          warnings: []
        };

        // Validate NRQL query
        if (widget.configuration?.nrql?.query) {
          try {
            const validation = await this.nrqlService.validateQuery(widget.configuration.nrql.query);
            
            if (!validation.valid) {
              widgetResult.valid = false;
              widgetResult.errors.push(validation.error);
              results.invalidWidgets++;
              results.allValid = false;

              if (options.includeSuggestions && validation.suggestions?.length > 0) {
                results.suggestions[widget.title] = validation.suggestions;
              }
            } else {
              results.validWidgets++;
              
              // Check for warnings
              if (validation.warnings?.length > 0) {
                widgetResult.warnings = validation.warnings;
              }
            }
          } catch (error) {
            widgetResult.valid = false;
            widgetResult.errors.push(`Query validation error: ${error.message}`);
            results.invalidWidgets++;
            results.allValid = false;
          }
        } else {
          results.validWidgets++;
        }

        // Check visualization compatibility
        if (!isValidVisualization(widget.visualization.id)) {
          widgetResult.warnings.push(`Unknown visualization type: ${widget.visualization.id}`);
        }

        results.widgets.push(widgetResult);
      }
    }

    results.invalidCount = results.invalidWidgets;
    return results;
  }

  async findBrokenWidgets(dashboard) {
    const brokenWidgets = [];

    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        if (widget.configuration?.nrql?.query) {
          try {
            const validation = await this.nrqlService.validateQuery(
              widget.configuration.nrql.query,
              { expectNoError: true, minResults: 1 }
            );
            
            if (!validation.valid || validation.resultCount === 0) {
              const broken = {
                page: page.name,
                widget: widget.title,
                query: widget.configuration.nrql.query,
                error: validation.error || 'No data returned'
              };

              // Get suggestions for fix
              if (validation.suggestions?.length > 0) {
                broken.suggestion = validation.suggestions[0];
              } else if (validation.resultCount === 0) {
                broken.suggestion = 'Check time range or WHERE conditions';
              }

              brokenWidgets.push(broken);
            }
          } catch (error) {
            brokenWidgets.push({
              page: page.name,
              widget: widget.title,
              query: widget.configuration.nrql.query,
              error: error.message,
              suggestion: 'Check query syntax and permissions'
            });
          }
        }
      }
    }

    return brokenWidgets;
  }

  async analyzePerformance(dashboard) {
    const analysis = {
      dashboardName: dashboard.name,
      totalPages: dashboard.pages.length,
      totalWidgets: 0,
      estimatedLoadTime: 0,
      widgetAnalysis: [],
      recommendations: [],
      performanceScore: 100
    };

    const queryTimes = [];
    const highCardinalityFacets = [];
    const missingTimeWindows = [];
    const largeDataQueries = [];

    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        analysis.totalWidgets++;
        
        if (widget.configuration?.nrql?.query) {
          const widgetAnalysis = {
            widget: widget.title,
            page: page.name
          };

          try {
            // Validate and time the query
            const startTime = Date.now();
            const validation = await this.nrqlService.validateQuery(widget.configuration.nrql.query);
            const executionTime = Date.now() - startTime;
            
            widgetAnalysis.queryTime = executionTime;
            widgetAnalysis.dataPoints = validation.resultCount || 0;
            queryTimes.push(executionTime);

            // Analyze query for performance issues
            const queryAnalysis = await this.nrqlService.explainQuery(widget.configuration.nrql.query);
            
            // Check for performance issues
            if (queryAnalysis.complexity === 'High') {
              widgetAnalysis.complexity = 'High';
              analysis.performanceScore -= 5;
            }

            if (queryAnalysis.components.facets?.length > 0) {
              for (const facet of queryAnalysis.components.facets) {
                const cardinality = await this.estimateFacetCardinality(
                  queryAnalysis.components.eventType,
                  facet
                );
                if (cardinality > 1000) {
                  highCardinalityFacets.push({
                    widget: widget.title,
                    facet,
                    cardinality
                  });
                  analysis.performanceScore -= 3;
                }
              }
            }

            if (!queryAnalysis.components.timeWindow) {
              missingTimeWindows.push(widget.title);
              analysis.performanceScore -= 2;
            }

            if (validation.resultCount > 10000) {
              largeDataQueries.push({
                widget: widget.title,
                dataPoints: validation.resultCount
              });
              analysis.performanceScore -= 2;
            }

            analysis.widgetAnalysis.push(widgetAnalysis);
          } catch (error) {
            analysis.widgetAnalysis.push({
              widget: widget.title,
              page: page.name,
              error: error.message
            });
            analysis.performanceScore -= 10;
          }
        }
      }
    }

    // Calculate estimated load time
    analysis.estimatedLoadTime = Math.max(...queryTimes) + (analysis.totalWidgets * 50); // 50ms overhead per widget

    // Generate recommendations
    if (highCardinalityFacets.length > 0) {
      analysis.recommendations.push({
        issue: `${highCardinalityFacets.length} widgets use high-cardinality facets`,
        impact: 'Slow query execution and increased memory usage',
        solution: 'Consider using FACET cases() to bucket values or remove high-cardinality facets',
        widgets: highCardinalityFacets.map(f => f.widget)
      });
    }

    if (missingTimeWindows.length > 0) {
      analysis.recommendations.push({
        issue: `${missingTimeWindows.length} widgets have no time window`,
        impact: 'Queries scan all available data, causing slow performance',
        solution: 'Add SINCE clauses to limit data scanned',
        widgets: missingTimeWindows
      });
    }

    if (largeDataQueries.length > 0) {
      analysis.recommendations.push({
        issue: `${largeDataQueries.length} widgets return large result sets`,
        impact: 'Increased data transfer and rendering time',
        solution: 'Add LIMIT clauses or use aggregations to reduce data points',
        widgets: largeDataQueries.map(q => q.widget)
      });
    }

    if (analysis.totalWidgets > 20) {
      analysis.recommendations.push({
        issue: 'Dashboard has many widgets',
        impact: 'Longer initial load time and potential browser performance issues',
        solution: 'Consider splitting into multiple dashboards or pages'
      });
      analysis.performanceScore -= 10;
    }

    // Ensure score doesn't go below 0
    analysis.performanceScore = Math.max(0, analysis.performanceScore);

    return analysis;
  }

  async checkAttributeUsage(dashboard, eventType) {
    const accountId = this.config.requireAccountId();
    const availableAttributes = await this.schemaService.getEventAttributes(
      accountId,
      eventType,
      '1 hour ago'
    );
    
    const attributeSet = new Set(availableAttributes);
    const usage = {
      eventType,
      allValid: true,
      totalAttributes: 0,
      validAttributes: 0,
      invalidAttributes: 0,
      widgets: []
    };

    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        if (widget.configuration?.nrql?.query) {
          try {
            const usedAttributes = extractAttributesFromQuery(widget.configuration.nrql.query);
            const invalidAttrs = usedAttributes.filter(attr => !attributeSet.has(attr));
            
            if (invalidAttrs.length > 0) {
              usage.allValid = false;
              usage.invalidAttributes += invalidAttrs.length;
              
              usage.widgets.push({
                page: page.name,
                widget: widget.title,
                invalidAttributes: invalidAttrs,
                suggestions: invalidAttrs.map(attr => {
                  const suggestions = suggestCorrection(attr, availableAttributes, 3);
                  return {
                    attribute: attr,
                    suggestions
                  };
                })
              });
            }
            
            usage.totalAttributes += usedAttributes.length;
            usage.validAttributes += usedAttributes.length - invalidAttrs.length;
          } catch (error) {
            logger.debug(`Failed to extract attributes from widget ${widget.title}: ${error.message}`);
          }
        }
      }
    }

    return usage;
  }

  async replicateDashboard(dashboard, targetAccountId, options = {}) {
    // Update account IDs in queries if requested
    if (options.updateQueries) {
      const sourceAccountId = this.config.requireAccountId();
      dashboard = this.updateAccountIdsInDashboard(dashboard, sourceAccountId, targetAccountId);
    }

    // Import to target account
    return await this.client.createDashboard(targetAccountId, dashboard);
  }

  // Helper methods
  updateAccountIdsInDashboard(dashboard, sourceId, targetId) {
    const updated = JSON.parse(JSON.stringify(dashboard)); // Deep clone
    
    for (const page of updated.pages) {
      for (const widget of page.widgets) {
        if (widget.configuration?.nrql?.query) {
          widget.configuration.nrql.query = widget.configuration.nrql.query.replace(
            new RegExp(`account\\s*=\\s*${sourceId}`, 'gi'),
            `account = ${targetId}`
          );
        }
      }
    }
    
    return updated;
  }

  async estimateFacetCardinality(eventType, facet) {
    if (!eventType || !facet) return 0;
    
    try {
      const query = `SELECT uniqueCount(${facet}) FROM ${eventType} SINCE 1 hour ago`;
      const result = await this.client.nrql(this.config.requireAccountId(), query);
      if (result.results.length > 0) {
        return result.results[0][`uniqueCount.${facet}`] || 0;
      }
    } catch (error) {
      logger.debug(`Failed to estimate facet cardinality: ${error.message}`);
    }
    
    return 0;
  }
}