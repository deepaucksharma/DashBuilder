const { SchemaService } = require('./schema.service.js');
const { NRQLService } = require('./nrql.service.js');
const { DashboardService } = require('./dashboard.service.js');
const { logger } = require('../utils/logger.js');

/**
 * LLM Enhancement Service
 * Provides intelligent context and validation for LLM-based operations
 */
class LLMEnhancementService {
  constructor(config) {
    this.config = config;
    this.schemaService = new SchemaService(config);
    this.nrqlService = new NRQLService(config);
    this.dashboardService = new DashboardService(config);
  }

  /**
   * Generate context for LLM prompts based on discovered schemas
   */
  async generateContext(options = {}) {
    const context = {
      eventTypes: [],
      commonAttributes: {},
      queryPatterns: [],
      performanceHints: [],
      timestamp: new Date().toISOString()
    };

    try {
      // Discover available event types
      const eventTypes = await this.schemaService.discoverEventTypes(options.since || '7 days ago');
      context.eventTypes = eventTypes.slice(0, 10); // Top 10 most relevant

      // Get common attributes for key event types
      for (const eventType of ['Transaction', 'PageView', 'Span', 'Log']) {
        try {
          const schema = await this.schemaService.describeEventType(
            eventType,
            '1 hour ago',
            { includeDataTypes: true }
          );
          
          if (schema.attributes) {
            context.commonAttributes[eventType] = {
              attributes: schema.attributes.slice(0, 20),
              dataTypes: schema.dataTypes || {}
            };
          }
        } catch (error) {
          logger.debug(`Skipping ${eventType}: ${error.message}`);
        }
      }

      // Add common query patterns
      context.queryPatterns = this.getCommonQueryPatterns();
      
      // Add performance hints
      context.performanceHints = await this.getPerformanceHints();

      return context;
    } catch (error) {
      logger.error('Failed to generate LLM context', error);
      throw error;
    }
  }

  /**
   * Validate and enhance LLM-generated queries
   */
  async enhanceQuery(query, options = {}) {
    const enhancement = {
      originalQuery: query,
      valid: false,
      enhancedQuery: query,
      corrections: [],
      optimizations: [],
      warnings: []
    };

    try {
      // First, try to auto-fix common issues
      const autoFixed = await this.nrqlService.autofixQuery(query);
      if (autoFixed.hasFixableIssues) {
        enhancement.enhancedQuery = autoFixed.fixedQuery;
        enhancement.corrections = autoFixed.fixes;
      }

      // Validate the query
      const validation = await this.nrqlService.validateQuery(enhancement.enhancedQuery);
      enhancement.valid = validation.valid;

      if (!validation.valid) {
        enhancement.error = validation.error;
        enhancement.suggestions = validation.suggestions || [];
        return enhancement;
      }

      // Optimize if valid
      const optimization = await this.nrqlService.optimizeQuery(enhancement.enhancedQuery);
      if (optimization.optimizedQuery) {
        enhancement.enhancedQuery = optimization.optimizedQuery;
        enhancement.optimizations = optimization.suggestions;
      }

      // Check for performance issues
      const analysis = await this.nrqlService.explainQuery(enhancement.enhancedQuery);
      if (analysis.warnings?.length > 0) {
        enhancement.warnings = analysis.warnings;
      }

      // Add attribute validation if event type is known
      if (options.validateAttributes) {
        try {
          const eventType = this.extractEventTypeFromQuery(enhancement.enhancedQuery);
          const usedAttributes = this.extractAttributesFromQuery(enhancement.enhancedQuery);
          const availableAttributes = await this.schemaService.getEventAttributes(
            this.config.requireAccountId(),
            eventType,
            '1 hour ago'
          );

          const missingAttributes = usedAttributes.filter(attr => !availableAttributes.includes(attr));
          if (missingAttributes.length > 0) {
            enhancement.warnings.push(`Unknown attributes: ${missingAttributes.join(', ')}`);
            
            // Suggest corrections
            for (const missing of missingAttributes) {
              const suggestions = this.suggestCorrection(missing, availableAttributes);
              if (suggestions.length > 0) {
                enhancement.suggestions = enhancement.suggestions || [];
                enhancement.suggestions.push(`Did you mean '${suggestions[0]}' instead of '${missing}'?`);
              }
            }
          }
        } catch (error) {
          logger.debug('Could not validate attributes:', error.message);
        }
      }

    } catch (error) {
      enhancement.error = error.message;
    }

    return enhancement;
  }

  /**
   * Generate a dashboard from natural language description
   */
  async generateDashboardFromDescription(description, options = {}) {
    const result = {
      success: false,
      description,
      dashboard: null,
      queries: [],
      warnings: [],
      context: {}
    };

    try {
      // Generate context
      result.context = await this.generateContext();

      // Parse intent from description
      const intent = this.parseIntent(description);
      
      // Generate appropriate queries based on intent
      const queries = await this.generateQueriesForIntent(intent, result.context);
      
      // Validate and enhance each query
      for (const query of queries) {
        const enhanced = await this.enhanceQuery(query.query, { validateAttributes: true });
        if (enhanced.valid) {
          result.queries.push({
            title: query.title,
            query: enhanced.enhancedQuery,
            visualization: query.visualization,
            corrections: enhanced.corrections,
            optimizations: enhanced.optimizations
          });
        } else {
          result.warnings.push(`Failed to generate valid query for ${query.title}: ${enhanced.error}`);
        }
      }

      // Build dashboard structure
      if (result.queries.length > 0) {
        result.dashboard = this.buildDashboard(
          intent.name || 'LLM Generated Dashboard',
          result.queries,
          options
        );

        // Validate the complete dashboard
        const validation = await this.dashboardService.validateDashboard(result.dashboard);
        result.success = validation.valid;
        if (!validation.valid) {
          result.errors = validation.errors;
        }
      }

    } catch (error) {
      result.error = error.message;
    }

    return result;
  }

  /**
   * Suggest improvements for existing dashboards
   */
  async suggestDashboardImprovements(dashboard) {
    const suggestions = {
      performance: [],
      queries: [],
      layout: [],
      visualizations: []
    };

    try {
      // Analyze performance
      const perfAnalysis = await this.dashboardService.analyzePerformance(dashboard);
      if (perfAnalysis.recommendations?.length > 0) {
        suggestions.performance = perfAnalysis.recommendations;
      }

      // Check each widget
      for (const page of dashboard.pages) {
        for (const widget of page.widgets) {
          if (widget.configuration?.nrql?.query) {
            const enhanced = await this.enhanceQuery(widget.configuration.nrql.query);
            
            if (enhanced.optimizations?.length > 0) {
              suggestions.queries.push({
                widget: widget.title,
                optimizations: enhanced.optimizations,
                optimizedQuery: enhanced.enhancedQuery
              });
            }

            // Check visualization appropriateness
            const vizSuggestion = this.suggestVisualization(
              widget.configuration.nrql.query,
              widget.visualization.id
            );
            if (vizSuggestion) {
              suggestions.visualizations.push({
                widget: widget.title,
                current: widget.visualization.id,
                suggested: vizSuggestion.visualization,
                reason: vizSuggestion.reason
              });
            }
          }
        }
      }

      // Layout suggestions
      const layoutSuggestions = this.analyzeLayout(dashboard);
      if (layoutSuggestions.length > 0) {
        suggestions.layout = layoutSuggestions;
      }

    } catch (error) {
      logger.error('Failed to generate improvement suggestions:', error);
    }

    return suggestions;
  }

  // Helper methods
  getCommonQueryPatterns() {
    return [
      {
        name: 'Transaction Count',
        pattern: 'SELECT count(*) FROM Transaction',
        use: 'Basic traffic volume'
      },
      {
        name: 'Average Response Time',
        pattern: 'SELECT average(duration) FROM Transaction',
        use: 'Performance baseline'
      },
      {
        name: 'Error Rate',
        pattern: 'SELECT percentage(count(*), WHERE error IS true) FROM Transaction',
        use: 'Error tracking'
      },
      {
        name: 'Apdex Score',
        pattern: 'SELECT apdex(duration, 0.5) FROM Transaction',
        use: 'User satisfaction'
      },
      {
        name: 'Top N by Attribute',
        pattern: 'SELECT count(*) FROM Transaction FACET attribute LIMIT N',
        use: 'Distribution analysis'
      }
    ];
  }

  async getPerformanceHints() {
    return [
      'Always include SINCE clause to limit data scanned',
      'Avoid high-cardinality attributes in FACET (>1000 unique values)',
      'Use LIMIT on non-aggregated queries',
      'Prefer specific attribute selection over SELECT *',
      'Use TIMESERIES with appropriate buckets for time ranges',
      'Consider using cases() for bucketing high-cardinality data'
    ];
  }

  parseIntent(description) {
    const intent = {
      name: null,
      metrics: [],
      eventTypes: [],
      timeRange: '1 hour ago',
      groupBy: []
    };

    const lower = description.toLowerCase();

    // Detect metrics
    if (lower.includes('performance') || lower.includes('response time')) {
      intent.metrics.push('response_time');
    }
    if (lower.includes('error') || lower.includes('failure')) {
      intent.metrics.push('error_rate');
    }
    if (lower.includes('traffic') || lower.includes('volume') || lower.includes('throughput')) {
      intent.metrics.push('throughput');
    }
    if (lower.includes('apdex') || lower.includes('satisfaction')) {
      intent.metrics.push('apdex');
    }

    // Detect event types
    if (lower.includes('transaction') || lower.includes('api')) {
      intent.eventTypes.push('Transaction');
    }
    if (lower.includes('browser') || lower.includes('page')) {
      intent.eventTypes.push('PageView');
    }
    if (lower.includes('log')) {
      intent.eventTypes.push('Log');
    }

    // Detect time range
    const timeMatches = lower.match(/last\s+(\d+)\s+(hour|day|week)/);
    if (timeMatches) {
      intent.timeRange = `${timeMatches[1]} ${timeMatches[2]}s ago`;
    }

    // Detect grouping
    if (lower.includes('by application') || lower.includes('per app')) {
      intent.groupBy.push('appName');
    }
    if (lower.includes('by host') || lower.includes('per server')) {
      intent.groupBy.push('host');
    }

    // Extract dashboard name
    const nameMatch = description.match(/["']([^"']+)["']/);
    if (nameMatch) {
      intent.name = nameMatch[1];
    }

    return intent;
  }

  async generateQueriesForIntent(intent, context) {
    const queries = [];
    const eventType = intent.eventTypes[0] || 'Transaction';
    const timeRange = intent.timeRange;
    const facet = intent.groupBy.length > 0 ? `FACET ${intent.groupBy.join(', ')}` : '';

    // Generate queries based on requested metrics
    if (intent.metrics.includes('response_time')) {
      queries.push({
        title: 'Average Response Time',
        query: `SELECT average(duration) FROM ${eventType} ${facet} TIMESERIES SINCE ${timeRange}`,
        visualization: 'line'
      });
      
      queries.push({
        title: 'Response Time Percentiles',
        query: `SELECT percentile(duration, 50, 90, 99) FROM ${eventType} SINCE ${timeRange}`,
        visualization: 'billboard'
      });
    }

    if (intent.metrics.includes('error_rate')) {
      queries.push({
        title: 'Error Rate',
        query: `SELECT percentage(count(*), WHERE error IS true) as 'Error Rate' FROM ${eventType} ${facet} TIMESERIES SINCE ${timeRange}`,
        visualization: 'line'
      });
      
      queries.push({
        title: 'Error Breakdown',
        query: `SELECT count(*) FROM ${eventType} WHERE error IS true FACET error.class SINCE ${timeRange}`,
        visualization: 'pie'
      });
    }

    if (intent.metrics.includes('throughput')) {
      queries.push({
        title: 'Transaction Volume',
        query: `SELECT rate(count(*), 1 minute) as 'Requests/min' FROM ${eventType} ${facet} TIMESERIES SINCE ${timeRange}`,
        visualization: 'area'
      });
    }

    if (intent.metrics.includes('apdex')) {
      queries.push({
        title: 'Apdex Score',
        query: `SELECT apdex(duration, 0.5) FROM ${eventType} ${facet} TIMESERIES SINCE ${timeRange}`,
        visualization: 'line'
      });
    }

    // Add a summary table if grouping is used
    if (facet) {
      queries.push({
        title: 'Summary by ' + intent.groupBy.join(' and '),
        query: `SELECT count(*) as 'Count', average(duration) as 'Avg Duration', percentage(count(*), WHERE error IS true) as 'Error %' FROM ${eventType} ${facet} SINCE ${timeRange}`,
        visualization: 'table'
      });
    }

    return queries;
  }

  buildDashboard(name, queries, options = {}) {
    const dashboard = {
      name,
      description: options.description || `Generated by LLM on ${new Date().toISOString()}`,
      permissions: options.permissions || 'PUBLIC_READ_ONLY',
      pages: [{
        name: 'Overview',
        widgets: []
      }]
    };

    // Calculate grid layout
    const columns = 3;
    let currentRow = 1;
    let currentColumn = 1;

    for (const query of queries) {
      // Determine widget size based on visualization
      const width = query.visualization === 'table' ? 6 : 4;
      const height = query.visualization === 'table' ? 4 : 3;

      // Check if widget fits in current row
      if (currentColumn + width - 1 > 12) {
        currentRow += 3;
        currentColumn = 1;
      }

      dashboard.pages[0].widgets.push({
        title: query.title,
        visualization: { id: query.visualization },
        configuration: {
          nrql: { query: query.query }
        },
        layout: {
          column: currentColumn,
          row: currentRow,
          width,
          height
        }
      });

      currentColumn += width;
    }

    return dashboard;
  }

  suggestVisualization(query, currentViz) {
    const lower = query.toLowerCase();
    
    // Time series data
    if (lower.includes('timeseries')) {
      if (lower.includes('count(') || lower.includes('rate(')) {
        return currentViz === 'area' ? null : {
          visualization: 'area',
          reason: 'Area charts work well for volume/rate over time'
        };
      }
      return currentViz === 'line' ? null : {
        visualization: 'line',
        reason: 'Line charts are ideal for metrics over time'
      };
    }

    // Single values
    if (!lower.includes('facet') && !lower.includes('timeseries')) {
      if (lower.includes('percentage(') || lower.includes('apdex(')) {
        return currentViz === 'billboard' ? null : {
          visualization: 'billboard',
          reason: 'Billboard is perfect for single KPI values'
        };
      }
    }

    // Faceted data
    if (lower.includes('facet')) {
      const facetCount = (lower.match(/facet/g) || []).length;
      
      if (facetCount > 1 || lower.includes('limit 20')) {
        return currentViz === 'table' ? null : {
          visualization: 'table',
          reason: 'Tables handle multiple facets and many rows well'
        };
      }
      
      if (lower.includes('percentage(') || lower.includes('rate(')) {
        return currentViz === 'pie' ? null : {
          visualization: 'pie',
          reason: 'Pie charts show proportions effectively'
        };
      }
      
      return currentViz === 'bar' ? null : {
        visualization: 'bar',
        reason: 'Bar charts are great for comparing faceted values'
      };
    }

    return null;
  }

  analyzeLayout(dashboard) {
    const suggestions = [];
    
    for (const page of dashboard.pages) {
      // Check for overlapping widgets
      const positions = new Map();
      
      for (const widget of page.widgets) {
        const { column, row, width, height } = widget.layout;
        
        for (let c = column; c < column + width; c++) {
          for (let r = row; r < row + height; r++) {
            const key = `${c},${r}`;
            if (positions.has(key)) {
              suggestions.push({
                type: 'overlap',
                message: `Widgets "${widget.title}" and "${positions.get(key)}" overlap at position ${key}`,
                severity: 'error'
              });
            }
            positions.set(key, widget.title);
          }
        }
        
        // Check if widget extends beyond grid
        if (column + width - 1 > 12) {
          suggestions.push({
            type: 'overflow',
            message: `Widget "${widget.title}" extends beyond grid boundary`,
            severity: 'error'
          });
        }
      }
      
      // Suggest optimal layout if too many widgets
      if (page.widgets.length > 15) {
        suggestions.push({
          type: 'density',
          message: `Page "${page.name}" has ${page.widgets.length} widgets. Consider splitting into multiple pages`,
          severity: 'warning'
        });
      }
    }
    
    return suggestions;
  }

  // Re-export utility methods for consistency
  extractEventTypeFromQuery(query) {
    const match = query.match(/FROM\s+([A-Za-z][A-Za-z0-9_]*)/i);
    return match ? match[1] : null;
  }

  extractAttributesFromQuery(query) {
    const attributes = new Set();
    
    // This is a simplified version - the full implementation is in validators.js
    const patterns = [
      /SELECT\s+(.+?)\s+FROM/i,
      /WHERE\s+(.+?)(?:\s+FACET|\s+SINCE|\s+UNTIL|\s+LIMIT|\s*$)/i,
      /FACET\s+(.+?)(?:\s+SINCE|\s+UNTIL|\s+LIMIT|\s*$)/i
    ];
    
    patterns.forEach(pattern => {
      const match = query.match(pattern);
      if (match) {
        const clause = match[1];
        const attrMatches = clause.match(/[A-Za-z][A-Za-z0-9_.]*(?=\s*[,\s)]|$)/g);
        if (attrMatches) {
          attrMatches.forEach(attr => attributes.add(attr));
        }
      }
    });
    
    return Array.from(attributes);
  }

  suggestCorrection(input, validOptions) {
    // Simple Levenshtein distance implementation
    const distances = validOptions.map(option => {
      let distance = 0;
      const maxLength = Math.max(input.length, option.length);
      
      for (let i = 0; i < maxLength; i++) {
        if (input[i] !== option[i]) distance++;
      }
      
      return { option, distance };
    });
    
    return distances
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .filter(d => d.distance <= 3)
      .map(d => d.option);
  }
}

module.exports = {
  LLMEnhancementService
};