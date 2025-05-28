const { NerdGraphClient } = require('../core/api-client.js');
const { NRQLService } = require('./nrql.service.js');
const { SchemaService } = require('./schema.service.js');
const { Cache } = require('../utils/cache.js');
const { logger } = require('../utils/logger.js');
const { validateDashboard, isValidVisualization, extractAttributesFromQuery, calculateQueryComplexity } = require('../utils/validators.js');
const { ValidationError } = require('../utils/errors.js');

class DashboardService {
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

    // Collect all widgets for parallel validation
    const allWidgets = [];
    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        results.totalWidgets++;
        allWidgets.push({ page, widget });
      }
    }

    // Process widgets in batches for parallel validation
    const batchSize = 10;
    for (let i = 0; i < allWidgets.length; i += batchSize) {
      const batch = allWidgets.slice(i, i + batchSize);
      
      // Create validation promises for the batch
      const batchPromises = batch.map(async ({ page, widget }) => {
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

              if (options.includeSuggestions && validation.suggestions?.length > 0) {
                widgetResult.suggestions = validation.suggestions;
              }
            } else {
              // Check for warnings
              if (validation.warnings?.length > 0) {
                widgetResult.warnings = validation.warnings;
              }
            }
          } catch (error) {
            widgetResult.valid = false;
            widgetResult.errors.push(`Query validation error: ${error.message}`);
          }
        }

        // Check visualization compatibility
        if (!isValidVisualization(widget.visualization.id)) {
          widgetResult.warnings.push(`Unknown visualization type: ${widget.visualization.id}`);
        }

        return widgetResult;
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process batch results
      batchResults.forEach(widgetResult => {
        if (widgetResult.valid) {
          results.validWidgets++;
        } else {
          results.invalidWidgets++;
          results.allValid = false;
        }
        
        if (widgetResult.suggestions) {
          results.suggestions[widgetResult.widget] = widgetResult.suggestions;
          delete widgetResult.suggestions;
        }
        
        results.widgets.push(widgetResult);
      });
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

  // NRDOT v2: Process-aware dashboard validation
  async validateProcessDashboard(dashboard, profile = 'Moderate') {
    const profileConfig = this.profiles[profile];
    const validation = {
      valid: true,
      profile,
      errors: [],
      warnings: [],
      processMetrics: {
        totalProcessQueries: 0,
        estimatedProcesses: 0,
        coverageIssues: []
      },
      costEstimate: 0
    };

    // Check widget count against profile
    const totalWidgets = dashboard.pages.reduce((sum, page) => sum + page.widgets.length, 0);
    if (totalWidgets > profileConfig.maxWidgetsPerDashboard) {
      validation.warnings.push(
        `Dashboard has ${totalWidgets} widgets, exceeding ${profile} profile limit of ${profileConfig.maxWidgetsPerDashboard}`
      );
    }

    // Analyze each widget for process metrics
    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        if (widget.configuration?.nrql?.query) {
          const query = widget.configuration.nrql.query;
          
          // Check if this is a process metrics query
          if (query.includes('ProcessSample') || query.includes('processDisplayName')) {
            validation.processMetrics.totalProcessQueries++;
            
            // Estimate process count
            const processCount = await this.estimateProcessCount(query);
            validation.processMetrics.estimatedProcesses += processCount;
            
            if (processCount > profileConfig.maxProcessesPerWidget) {
              validation.warnings.push(
                `Widget '${widget.title}' may query ${processCount} processes, exceeding ${profile} profile limit of ${profileConfig.maxProcessesPerWidget}`
              );
            }
            
            // Check for process intelligence patterns
            const intelligence = await this.analyzeProcessQuery(query);
            if (intelligence.missingCriticalProcesses.length > 0) {
              validation.processMetrics.coverageIssues.push({
                widget: widget.title,
                missing: intelligence.missingCriticalProcesses
              });
            }
          }
          
          // Calculate query complexity and cost
          const complexity = calculateQueryComplexity(query);
          validation.costEstimate += this.calculateQueryCost(query, complexity, profileConfig);
        }
      }
    }

    // Check for 95% coverage requirement
    if (validation.processMetrics.coverageIssues.length > 0) {
      validation.warnings.push(
        `Dashboard may not meet 95% critical process coverage requirement. ${validation.processMetrics.coverageIssues.length} widgets have coverage gaps`
      );
    }

    validation.valid = validation.errors.length === 0;
    return validation;
  }

  // NRDOT v2: Analyze process query for intelligence patterns
  async analyzeProcessQuery(query) {
    const accountId = this.config.requireAccountId();
    const intelligence = {
      coversDatabase: false,
      coversMessaging: false,
      coversCompute: false,
      coversWebServer: false,
      missingCriticalProcesses: []
    };

    // Get process patterns from schema service
    const processIntelligence = await this.schemaService.getProcessIntelligence(
      accountId,
      'ProcessSample',
      '1 hour ago'
    );

    // Check coverage
    const criticalCategories = ['database', 'messaging', 'compute', 'webServer'];
    for (const category of criticalCategories) {
      const patterns = processIntelligence.processCategories[category]?.patterns || [];
      const covered = patterns.some(pattern => 
        query.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (!covered) {
        intelligence.missingCriticalProcesses.push(category);
      } else {
        intelligence[`covers${category.charAt(0).toUpperCase() + category.slice(1)}`] = true;
      }
    }

    return intelligence;
  }

  // NRDOT v2: Estimate process count from query
  async estimateProcessCount(query) {
    try {
      // Extract WHERE conditions to estimate scope
      const whereMatch = query.match(/WHERE\s+(.+?)(?:FACET|SINCE|LIMIT|$)/i);
      if (!whereMatch) {
        // No WHERE clause means all processes
        return 1000; // Assume worst case
      }

      // Count restricting conditions
      const conditions = whereMatch[1];
      let estimate = 500; // Base estimate
      
      // Reduce estimate based on conditions
      if (conditions.includes('processDisplayName')) estimate *= 0.1;
      if (conditions.includes('commandLine')) estimate *= 0.05;
      if (conditions.includes('hostname')) estimate *= 0.2;
      if (conditions.includes('pid')) estimate = 1;
      
      return Math.ceil(estimate);
    } catch (error) {
      logger.debug(`Failed to estimate process count: ${error.message}`);
      return 100; // Default estimate
    }
  }

  // NRDOT v2: Calculate query cost
  calculateQueryCost(query, complexity, profileConfig) {
    const baseCost = this.costFactors.processMetrics.baseCostPerQuery;
    const complexityMultiplier = this.costFactors.queryComplexity[complexity.level.toLowerCase()];
    
    // Estimate data points
    const processCount = query.includes('ProcessSample') ? 100 : 10;
    const attributeCount = (query.match(/,/g) || []).length + 1;
    
    const cost = baseCost * complexityMultiplier +
                 (processCount * this.costFactors.processMetrics.costPerProcess) +
                 (attributeCount * this.costFactors.processMetrics.costPerAttribute);
    
    // Apply refresh interval factor
    const refreshMultiplier = 3600 / profileConfig.refreshInterval; // Queries per hour
    
    return cost * refreshMultiplier;
  }

  // NRDOT v2: Generate process-optimized dashboard
  async generateProcessDashboard(options = {}) {
    const {
      profile = 'Moderate',
      categories = ['database', 'messaging', 'compute', 'webServer'],
      includeAnomalies = true,
      includeTrends = true
    } = options;

    const profileConfig = this.profiles[profile];
    const accountId = this.config.requireAccountId();

    // Get process intelligence
    const intelligence = await this.schemaService.getProcessIntelligence(
      accountId,
      'ProcessSample',
      profileConfig.queryTimeRange
    );

    const dashboard = {
      name: `Process Metrics Dashboard - ${profile} Profile`,
      permissions: 'PUBLIC_READ_WRITE',
      pages: []
    };

    // Overview page
    const overviewPage = {
      name: 'Process Overview',
      widgets: []
    };

    // Add summary widget
    overviewPage.widgets.push(this.createProcessSummaryWidget(profileConfig));

    // Add category widgets
    let column = 1;
    let row = 1;
    for (const category of categories) {
      const widget = this.createProcessCategoryWidget(category, intelligence, profileConfig);
      widget.layout = { column, row, width: 6, height: 3 };
      overviewPage.widgets.push(widget);
      
      column += 6;
      if (column > 7) {
        column = 1;
        row += 3;
      }
    }

    dashboard.pages.push(overviewPage);

    // Anomaly detection page
    if (includeAnomalies) {
      dashboard.pages.push(this.createAnomalyDetectionPage(profileConfig));
    }

    // Trend analysis page
    if (includeTrends) {
      dashboard.pages.push(this.createTrendAnalysisPage(profileConfig));
    }

    return dashboard;
  }

  // NRDOT v2: Create process summary widget
  createProcessSummaryWidget(profileConfig) {
    return {
      title: 'Process Health Summary',
      visualization: { id: 'viz.billboard' },
      configuration: {
        nrql: {
          query: `SELECT count(*) as 'Total Processes', 
                         filter(count(*), WHERE cpuPercent > 80) as 'High CPU', 
                         filter(count(*), WHERE memoryResidentSizeBytes > 1e9) as 'High Memory'
                  FROM ProcessSample 
                  SINCE ${profileConfig.queryTimeRange} ago`
        }
      }
    };
  }

  // NRDOT v2: Create process category widget
  createProcessCategoryWidget(category, intelligence, profileConfig) {
    const categoryInfo = intelligence.processCategories[category] || { patterns: [] };
    const whereClause = categoryInfo.patterns
      .map(p => `processDisplayName LIKE '%${p}%'`)
      .join(' OR ');

    return {
      title: `${category.charAt(0).toUpperCase() + category.slice(1)} Processes`,
      visualization: { id: 'viz.line' },
      configuration: {
        nrql: {
          query: `SELECT average(cpuPercent) as 'CPU %', 
                         average(memoryResidentSizeBytes) / 1e6 as 'Memory MB'
                  FROM ProcessSample 
                  WHERE ${whereClause || '1=1'}
                  SINCE ${profileConfig.queryTimeRange} ago 
                  TIMESERIES`
        }
      }
    };
  }

  // NRDOT v2: Create anomaly detection page
  createAnomalyDetectionPage(profileConfig) {
    return {
      name: 'Anomaly Detection',
      widgets: [
        {
          title: 'CPU Anomalies',
          visualization: { id: 'viz.line' },
          configuration: {
            nrql: {
              query: `SELECT average(cpuPercent) as 'CPU', 
                             stddev(cpuPercent) as 'StdDev'
                      FROM ProcessSample 
                      FACET processDisplayName 
                      WHERE cpuPercent > average(cpuPercent) + 2 * stddev(cpuPercent)
                      SINCE ${profileConfig.queryTimeRange} ago 
                      TIMESERIES`
            }
          },
          layout: { column: 1, row: 1, width: 12, height: 3 }
        },
        {
          title: 'Memory Anomalies',
          visualization: { id: 'viz.table' },
          configuration: {
            nrql: {
              query: `SELECT processDisplayName, hostname, 
                             average(memoryResidentSizeBytes) / 1e9 as 'Avg Memory GB',
                             max(memoryResidentSizeBytes) / 1e9 as 'Max Memory GB'
                      FROM ProcessSample 
                      WHERE memoryResidentSizeBytes > percentile(memoryResidentSizeBytes, 95)
                      SINCE ${profileConfig.queryTimeRange} ago 
                      LIMIT 20`
            }
          },
          layout: { column: 1, row: 4, width: 12, height: 3 }
        }
      ]
    };
  }

  // NRDOT v2: Create trend analysis page
  createTrendAnalysisPage(profileConfig) {
    return {
      name: 'Trend Analysis',
      widgets: [
        {
          title: 'Process Count Trends',
          visualization: { id: 'viz.area' },
          configuration: {
            nrql: {
              query: `SELECT count(*) as 'Process Count'
                      FROM ProcessSample 
                      FACET cases(
                        WHERE processDisplayName LIKE '%mysql%' OR processDisplayName LIKE '%postgres%' as 'Database',
                        WHERE processDisplayName LIKE '%kafka%' OR processDisplayName LIKE '%rabbitmq%' as 'Messaging',
                        WHERE processDisplayName LIKE '%nginx%' OR processDisplayName LIKE '%apache%' as 'Web Server'
                      )
                      SINCE ${profileConfig.queryTimeRange} ago 
                      TIMESERIES`
            }
          },
          layout: { column: 1, row: 1, width: 12, height: 3 }
        },
        {
          title: 'Resource Utilization Trends',
          visualization: { id: 'viz.line' },
          configuration: {
            nrql: {
              query: `SELECT average(cpuPercent) as 'Avg CPU %',
                             percentile(cpuPercent, 95) as 'P95 CPU %',
                             average(memoryResidentSizeBytes) / 1e9 as 'Avg Memory GB'
                      FROM ProcessSample 
                      SINCE ${profileConfig.queryTimeRange} ago 
                      TIMESERIES`
            }
          },
          layout: { column: 1, row: 4, width: 12, height: 3 }
        }
      ]
    };
  }

  // NRDOT v2: Optimize existing dashboard for profile
  async optimizeDashboardForProfile(dashboard, targetProfile = 'Moderate') {
    const profileConfig = this.profiles[targetProfile];
    const optimized = JSON.parse(JSON.stringify(dashboard)); // Deep clone
    const optimizationLog = [];

    // Optimize each widget
    for (const page of optimized.pages) {
      const widgetsToRemove = [];
      
      for (let i = 0; i < page.widgets.length; i++) {
        const widget = page.widgets[i];
        
        if (widget.configuration?.nrql?.query) {
          const query = widget.configuration.nrql.query;
          const complexity = calculateQueryComplexity(query);
          
          // Remove high complexity queries in conservative profiles
          if (profileConfig.complexity === 'low' && complexity.level === 'High') {
            widgetsToRemove.push(i);
            optimizationLog.push(`Removed high-complexity widget: ${widget.title}`);
            continue;
          }
          
          // Optimize time windows
          if (!query.includes('SINCE')) {
            widget.configuration.nrql.query += ` SINCE ${profileConfig.queryTimeRange} ago`;
            optimizationLog.push(`Added time window to widget: ${widget.title}`);
          }
          
          // Add LIMIT for process queries
          if (query.includes('ProcessSample') && !query.includes('LIMIT')) {
            const limit = Math.min(profileConfig.maxProcessesPerWidget, 100);
            widget.configuration.nrql.query += ` LIMIT ${limit}`;
            optimizationLog.push(`Added LIMIT ${limit} to widget: ${widget.title}`);
          }
        }
      }
      
      // Remove widgets in reverse order to maintain indices
      for (let i = widgetsToRemove.length - 1; i >= 0; i--) {
        page.widgets.splice(widgetsToRemove[i], 1);
      }
    }

    // Trim to profile widget limit
    let totalWidgets = 0;
    for (const page of optimized.pages) {
      for (let i = page.widgets.length - 1; i >= 0; i--) {
        if (totalWidgets >= profileConfig.maxWidgetsPerDashboard) {
          page.widgets.splice(i, 1);
          optimizationLog.push(`Removed widget to meet profile limit`);
        } else {
          totalWidgets++;
        }
      }
    }

    return {
      dashboard: optimized,
      optimizationLog,
      profile: targetProfile,
      estimatedCostReduction: optimizationLog.length * 10 // Rough estimate: 10% per optimization
    };
  }
}

module.exports = {
  DashboardService
};