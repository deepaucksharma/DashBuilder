const MetricDiscoveryService = require('./metric-discovery');
const MetricClassifier = require('./metric-classifier');
const DashboardTemplateEngine = require('./template-engine');
const QueryBuilder = require('./query-builder');
const LayoutOptimizer = require('./layout-optimizer');
const https = require('https');

class DashboardOrchestrator {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.accountId = config.accountId;
    
    // Initialize all components
    this.metricDiscovery = new MetricDiscoveryService(this.apiKey, this.accountId);
    this.metricClassifier = new MetricClassifier();
    this.templateEngine = new DashboardTemplateEngine();
    this.queryBuilder = new QueryBuilder();
    this.layoutOptimizer = new LayoutOptimizer(config.layoutOptions || {});
    
    this.dashboardCache = new Map();
  }

  async generateDashboard(options = {}) {
    const {
      name = 'Auto-Generated Dashboard',
      description = 'Dashboard generated automatically based on available metrics',
      template = 'auto',
      metrics = {},
      layoutPreference = 'balanced',
      timeRange = '1 hour',
      autoRefresh = true
    } = options;

    try {
      console.log('Starting dashboard generation...');
      
      // Step 1: Discover metrics
      const discoveredMetrics = await this.discoverAndFilterMetrics(metrics);
      console.log(`Discovered ${discoveredMetrics.length} metrics`);
      
      if (discoveredMetrics.length === 0) {
        throw new Error('No metrics found matching the criteria');
      }
      
      // Step 2: Classify metrics
      const classifiedMetrics = await this.classifyMetrics(discoveredMetrics);
      console.log('Metrics classified successfully');
      
      // Step 3: Select or generate template
      const selectedTemplate = await this.selectTemplate(template, classifiedMetrics);
      console.log(`Using template: ${selectedTemplate.name}`);
      
      // Step 4: Generate widgets
      const widgets = await this.generateWidgets(classifiedMetrics, selectedTemplate, timeRange);
      console.log(`Generated ${widgets.length} widgets`);
      
      // Step 5: Optimize layout
      const layout = this.layoutOptimizer.optimizeLayout(widgets, {
        layoutPreference,
        groupBy: selectedTemplate.groupBy || 'category'
      });
      console.log('Layout optimized');
      
      // Step 6: Build dashboard structure
      const dashboard = this.buildDashboardStructure({
        name,
        description,
        layout,
        timeRange,
        autoRefresh
      });
      
      // Step 7: Validate dashboard
      const validation = await this.validateDashboard(dashboard);
      if (!validation.valid) {
        throw new Error(`Dashboard validation failed: ${validation.errors.join(', ')}`);
      }
      
      return {
        dashboard,
        metadata: {
          metricsUsed: classifiedMetrics.length,
          widgetsCreated: widgets.length,
          template: selectedTemplate.name,
          generatedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('Error generating dashboard:', error);
      throw error;
    }
  }

  async discoverAndFilterMetrics(metricsConfig) {
    const { include = [], exclude = [], namespace = null } = metricsConfig;
    
    let allMetrics = [];
    
    if (include.length > 0) {
      // Discover metrics for each include pattern
      const discoveryPromises = include.map(pattern => 
        this.metricDiscovery.discoverMetrics({ pattern, namespace })
      );
      
      const results = await Promise.all(discoveryPromises);
      allMetrics = results.flatMap(r => r.metrics);
    } else {
      // Discover all metrics in namespace
      const result = await this.metricDiscovery.discoverMetrics({ namespace });
      allMetrics = result.metrics;
    }
    
    // Apply exclusions
    if (exclude.length > 0) {
      allMetrics = allMetrics.filter(metric => {
        return !exclude.some(pattern => 
          this.matchPattern(metric.name, pattern)
        );
      });
    }
    
    // Deduplicate
    const uniqueMetrics = this.deduplicateMetrics(allMetrics);
    
    return uniqueMetrics;
  }

  async classifyMetrics(metrics) {
    const classificationPromises = metrics.map(async (metric) => {
      // Get additional metadata
      const metadata = await this.metricDiscovery.getMetricMetadata(metric.name);
      
      // Classify the metric
      const classification = this.metricClassifier.classifyMetric(metric.name);
      
      return {
        ...metric,
        ...classification,
        metadata
      };
    });
    
    return Promise.all(classificationPromises);
  }

  async selectTemplate(templateName, classifiedMetrics) {
    if (templateName === 'auto') {
      // Analyze metrics to determine best template
      const metricCategories = {};
      
      classifiedMetrics.forEach(metric => {
        const category = metric.category || 'other';
        metricCategories[category] = (metricCategories[category] || 0) + 1;
      });
      
      // Find dominant category
      const dominantCategory = Object.entries(metricCategories)
        .sort(([,a], [,b]) => b - a)[0][0];
      
      // Map category to template
      const categoryTemplateMap = {
        'system': 'system-health',
        'application': 'application-performance',
        'business': 'business-kpi',
        'infrastructure': 'system-health',
        'other': 'general-metrics'
      };
      
      templateName = categoryTemplateMap[dominantCategory] || 'general-metrics';
    }
    
    // Get template
    const template = this.templateEngine.templates[templateName];
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }
    
    return template;
  }

  async generateWidgets(classifiedMetrics, template, timeRange) {
    const widgets = [];
    const usedMetrics = new Set();
    
    // Generate widgets from template sections
    for (const section of template.sections) {
      for (const widgetTemplate of section.widgets) {
        const matchingMetrics = this.findMatchingMetrics(
          classifiedMetrics, 
          widgetTemplate.metrics
        );
        
        if (matchingMetrics.length > 0) {
          const widget = await this.createWidget(
            widgetTemplate,
            matchingMetrics,
            timeRange
          );
          
          if (widget) {
            widgets.push({
              ...widget,
              category: section.title
            });
            
            matchingMetrics.forEach(m => usedMetrics.add(m.name));
          }
        }
      }
    }
    
    // Add remaining metrics as additional widgets
    const unusedMetrics = classifiedMetrics.filter(m => !usedMetrics.has(m.name));
    
    for (const metric of unusedMetrics) {
      const widget = await this.createMetricWidget(metric, timeRange);
      if (widget) {
        widgets.push(widget);
      }
    }
    
    return widgets;
  }

  async createWidget(template, metrics, timeRange) {
    const { type, title, query: queryTemplate } = template;
    
    let nrqlQuery;
    
    if (queryTemplate) {
      // Use template query
      nrqlQuery = this.interpolateQuery(queryTemplate, metrics, timeRange);
    } else {
      // Build query based on widget type
      if (metrics.length === 1) {
        const queryOptions = {
          timeWindow: timeRange,
          facets: this.queryBuilder.suggestFacets(metrics[0]).slice(0, 2)
        };
        
        const result = this.queryBuilder.buildQuery(metrics[0], queryOptions);
        nrqlQuery = result.nrql;
      } else {
        // Multi-metric widget
        const result = this.queryBuilder.buildMultiMetricQuery(metrics, {
          timeWindow: timeRange
        });
        nrqlQuery = result.nrql;
      }
    }
    
    return {
      id: this.generateId(),
      type,
      title: title || this.generateWidgetTitle(metrics),
      query: nrqlQuery,
      metrics: metrics.map(m => m.name)
    };
  }

  async createMetricWidget(metric, timeRange) {
    const visualization = metric.suggestedVisualizations[0] || 'line';
    
    const queryOptions = {
      timeWindow: timeRange
    };
    
    // Add facets for certain metric types
    if (metric.category === 'application' || metric.category === 'system') {
      queryOptions.facets = this.queryBuilder.suggestFacets(metric).slice(0, 1);
    }
    
    const result = this.queryBuilder.buildQuery(metric, queryOptions);
    
    return {
      id: this.generateId(),
      type: visualization,
      title: this.formatMetricName(metric.name),
      query: result.nrql,
      metrics: [metric.name],
      category: metric.category
    };
  }

  buildDashboardStructure(options) {
    const { name, description, layout, timeRange, autoRefresh } = options;
    
    const pages = [{
      name: 'Main',
      description: description,
      widgets: layout.widgets.map(widget => ({
        title: widget.title,
        configuration: {
          [widget.type]: {
            nrqlQueries: [{
              accountId: parseInt(this.accountId),
              query: widget.query
            }]
          }
        },
        layout: {
          column: widget.column + 1, // NR uses 1-based indexing
          row: widget.row + 1,
          width: widget.width,
          height: widget.height
        },
        visualization: {
          id: this.mapVisualizationType(widget.type)
        }
      }))
    }];
    
    return {
      name,
      description,
      permissions: 'PUBLIC_READ_WRITE',
      pages,
      variables: []
    };
  }

  async validateDashboard(dashboard) {
    const errors = [];
    
    // Validate structure
    if (!dashboard.name) {
      errors.push('Dashboard name is required');
    }
    
    if (!dashboard.pages || dashboard.pages.length === 0) {
      errors.push('Dashboard must have at least one page');
    }
    
    // Validate widgets
    dashboard.pages.forEach((page, pageIndex) => {
      if (!page.widgets || page.widgets.length === 0) {
        errors.push(`Page ${pageIndex + 1} has no widgets`);
      }
      
      page.widgets.forEach((widget, widgetIndex) => {
        if (!widget.title) {
          errors.push(`Widget ${widgetIndex + 1} on page ${pageIndex + 1} has no title`);
        }
        
        if (!widget.configuration) {
          errors.push(`Widget ${widgetIndex + 1} on page ${pageIndex + 1} has no configuration`);
        }
      });
    });
    
    // Validate layout
    const layoutValidation = this.layoutOptimizer.validateLayout({
      widgets: dashboard.pages[0].widgets.map(w => ({
        column: w.layout.column - 1,
        row: w.layout.row - 1,
        width: w.layout.width,
        height: w.layout.height
      }))
    });
    
    errors.push(...layoutValidation.errors);
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  async deployDashboard(dashboard) {
    const mutation = `
      mutation createDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
            permalink
          }
          errors {
            description
            type
          }
        }
      }
    `;
    
    const variables = {
      accountId: parseInt(this.accountId),
      dashboard
    };
    
    try {
      const response = await this.executeNerdGraphMutation(mutation, variables);
      
      if (response.data?.dashboardCreate?.errors?.length > 0) {
        const errors = response.data.dashboardCreate.errors
          .map(e => e.description)
          .join(', ');
        throw new Error(`Failed to create dashboard: ${errors}`);
      }
      
      return response.data.dashboardCreate.entityResult;
    } catch (error) {
      console.error('Error deploying dashboard:', error);
      throw error;
    }
  }

  async previewDashboard(options) {
    const result = await this.generateDashboard(options);
    
    // Generate preview HTML
    const previewHtml = this.generatePreviewHtml(result.dashboard);
    
    return {
      ...result,
      preview: previewHtml
    };
  }

  // Helper methods
  matchPattern(str, pattern) {
    const regex = new RegExp(
      pattern.replace(/\*/g, '.*').replace(/\?/g, '.'),
      'i'
    );
    return regex.test(str);
  }

  deduplicateMetrics(metrics) {
    const seen = new Set();
    return metrics.filter(metric => {
      if (seen.has(metric.name)) {
        return false;
      }
      seen.add(metric.name);
      return true;
    });
  }

  findMatchingMetrics(metrics, patterns) {
    if (!patterns || patterns.length === 0) {
      return [];
    }
    
    return metrics.filter(metric => 
      patterns.some(pattern => this.matchPattern(metric.name, pattern))
    );
  }

  interpolateQuery(template, metrics, timeRange) {
    let query = template;
    
    // Replace metric placeholders
    metrics.forEach((metric, index) => {
      query = query.replace(new RegExp(`\\{metric${index}\\}`, 'g'), metric.name);
      query = query.replace(new RegExp(`\\{metric\\}`, 'g'), metric.name);
    });
    
    // Replace time range
    query = query.replace(/\{timeRange\}/g, timeRange);
    
    return query;
  }

  generateWidgetTitle(metrics) {
    if (metrics.length === 1) {
      return this.formatMetricName(metrics[0].name);
    }
    
    // Find common prefix
    const names = metrics.map(m => m.name.split('.'));
    const commonPrefix = this.findCommonPrefix(names);
    
    if (commonPrefix.length > 0) {
      return commonPrefix.join('.') + ' Metrics';
    }
    
    return 'Multiple Metrics';
  }

  formatMetricName(name) {
    return name
      .split(/[._-]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  findCommonPrefix(arrays) {
    if (arrays.length === 0) return [];
    
    const prefix = [];
    const firstArray = arrays[0];
    
    for (let i = 0; i < firstArray.length; i++) {
      const element = firstArray[i];
      if (arrays.every(arr => arr[i] === element)) {
        prefix.push(element);
      } else {
        break;
      }
    }
    
    return prefix;
  }

  generateId() {
    return `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  mapVisualizationType(type) {
    const typeMap = {
      'line': 'viz.line',
      'area': 'viz.area',
      'billboard': 'viz.billboard',
      'bar': 'viz.bar',
      'pie': 'viz.pie',
      'table': 'viz.table',
      'histogram': 'viz.histogram',
      'heatmap': 'viz.heatmap',
      'markdown': 'viz.markdown'
    };
    
    return typeMap[type] || 'viz.line';
  }

  generatePreviewHtml(dashboard) {
    // Simplified HTML preview
    const widgets = dashboard.pages[0].widgets.map(w => `
      <div class="widget" style="grid-column: span ${w.layout.width}; grid-row: span ${w.layout.height};">
        <h3>${w.title}</h3>
        <div class="widget-content">${w.visualization.id}</div>
        <pre>${w.configuration[Object.keys(w.configuration)[0]].nrqlQueries[0].query}</pre>
      </div>
    `).join('');
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${dashboard.name} - Preview</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .dashboard { display: grid; grid-template-columns: repeat(12, 1fr); gap: 10px; }
          .widget { border: 1px solid #ddd; padding: 10px; background: #f5f5f5; }
          .widget h3 { margin: 0 0 10px 0; }
          .widget pre { font-size: 11px; overflow: auto; }
        </style>
      </head>
      <body>
        <h1>${dashboard.name}</h1>
        <p>${dashboard.description}</p>
        <div class="dashboard">${widgets}</div>
      </body>
      </html>
    `;
  }

  async executeNerdGraphMutation(mutation, variables) {
    const payload = JSON.stringify({ query: mutation, variables });
    
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.newrelic.com',
        path: '/graphql',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'API-Key': this.apiKey,
          'Content-Length': payload.length
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.errors) {
              reject(new Error(JSON.stringify(response.errors)));
            } else {
              resolve(response);
            }
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

module.exports = DashboardOrchestrator;