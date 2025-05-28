/**
 * Dashboard Template Engine
 * Provides templates and patterns for automatic dashboard generation
 */

class DashboardTemplateEngine {
  constructor() {
    // Dashboard templates
    this.templates = {
      'system-health': {
        name: 'System Health Monitoring',
        description: 'Comprehensive system performance and health metrics',
        sections: [
          {
            name: 'Overview',
            widgets: [
              { type: 'health-score', position: { col: 1, row: 1, width: 3, height: 3 } },
              { type: 'alert-summary', position: { col: 4, row: 1, width: 3, height: 3 } },
              { type: 'resource-usage', position: { col: 7, row: 1, width: 6, height: 3 } }
            ]
          },
          {
            name: 'CPU & Memory',
            widgets: [
              { type: 'cpu-usage', position: { col: 1, row: 1, width: 6, height: 3 } },
              { type: 'memory-usage', position: { col: 7, row: 1, width: 6, height: 3 } },
              { type: 'load-average', position: { col: 1, row: 4, width: 4, height: 3 } },
              { type: 'memory-breakdown', position: { col: 5, row: 4, width: 8, height: 3 } }
            ]
          },
          {
            name: 'Storage & Network',
            widgets: [
              { type: 'disk-io', position: { col: 1, row: 1, width: 6, height: 3 } },
              { type: 'network-io', position: { col: 7, row: 1, width: 6, height: 3 } },
              { type: 'filesystem-usage', position: { col: 1, row: 4, width: 12, height: 3 } }
            ]
          }
        ]
      },
      
      'application-performance': {
        name: 'Application Performance',
        description: 'Application-level performance metrics and KPIs',
        sections: [
          {
            name: 'Golden Signals',
            widgets: [
              { type: 'request-rate', position: { col: 1, row: 1, width: 3, height: 3 } },
              { type: 'error-rate', position: { col: 4, row: 1, width: 3, height: 3 } },
              { type: 'latency-p99', position: { col: 7, row: 1, width: 3, height: 3 } },
              { type: 'saturation', position: { col: 10, row: 1, width: 3, height: 3 } }
            ]
          },
          {
            name: 'Service Health',
            widgets: [
              { type: 'service-map', position: { col: 1, row: 1, width: 8, height: 4 } },
              { type: 'top-errors', position: { col: 9, row: 1, width: 4, height: 4 } }
            ]
          }
        ]
      },
      
      'cost-optimization': {
        name: 'Cost & Resource Optimization',
        description: 'Resource utilization and cost optimization metrics',
        sections: [
          {
            name: 'Cost Overview',
            widgets: [
              { type: 'monthly-cost', position: { col: 1, row: 1, width: 3, height: 3 } },
              { type: 'cost-trend', position: { col: 4, row: 1, width: 6, height: 3 } },
              { type: 'cost-by-service', position: { col: 10, row: 1, width: 3, height: 3 } }
            ]
          },
          {
            name: 'Resource Efficiency',
            widgets: [
              { type: 'underutilized-resources', position: { col: 1, row: 1, width: 6, height: 3 } },
              { type: 'optimization-opportunities', position: { col: 7, row: 1, width: 6, height: 3 } }
            ]
          }
        ]
      },
      
      'minimal': {
        name: 'Minimal Dashboard',
        description: 'Essential metrics only',
        sections: [
          {
            name: 'Key Metrics',
            widgets: [
              { type: 'primary-kpi', position: { col: 1, row: 1, width: 4, height: 3 } },
              { type: 'secondary-kpi', position: { col: 5, row: 1, width: 4, height: 3 } },
              { type: 'trend', position: { col: 9, row: 1, width: 4, height: 3 } }
            ]
          }
        ]
      }
    };

    // Widget type definitions
    this.widgetTypes = {
      'health-score': {
        title: 'System Health Score',
        visualization: 'viz.billboard',
        buildQuery: (metrics) => {
          return `SELECT 100 - (count(*) FILTER(WHERE value > threshold) / count(*) * 100) AS health_score FROM Metric WHERE metricName IN (${metrics.map(m => `'${m}'`).join(',')}) SINCE 5 minutes ago`;
        }
      },
      
      'cpu-usage': {
        title: 'CPU Usage',
        visualization: 'viz.area',
        buildQuery: (metrics) => {
          const cpuMetric = metrics.find(m => m.includes('cpu.time') || m.includes('cpu.usage'));
          if (!cpuMetric) return null;
          return `SELECT rate(max(${cpuMetric}), 1 second) FROM Metric WHERE host.id = 'dashbuilder-host' FACET state TIMESERIES SINCE 30 minutes ago`;
        }
      },
      
      'memory-usage': {
        title: 'Memory Usage',
        visualization: 'viz.area',
        buildQuery: (metrics) => {
          const memMetric = metrics.find(m => m.includes('memory.usage'));
          if (!memMetric) return null;
          return `SELECT latest(${memMetric}) / 1e9 AS memory_gb FROM Metric WHERE host.id = 'dashbuilder-host' FACET state TIMESERIES SINCE 30 minutes ago`;
        }
      },
      
      'disk-io': {
        title: 'Disk I/O',
        visualization: 'viz.line',
        buildQuery: (metrics) => {
          const diskMetric = metrics.find(m => m.includes('disk.io'));
          if (!diskMetric) return null;
          return `SELECT rate(max(${diskMetric}), 1 second) / 1e6 AS mb_per_sec FROM Metric WHERE host.id = 'dashbuilder-host' FACET device, direction TIMESERIES SINCE 30 minutes ago`;
        }
      },
      
      'network-io': {
        title: 'Network I/O',
        visualization: 'viz.line',
        buildQuery: (metrics) => {
          const netMetric = metrics.find(m => m.includes('network.io'));
          if (!netMetric) return null;
          return `SELECT rate(max(${netMetric}), 1 second) / 1e6 AS mb_per_sec FROM Metric WHERE host.id = 'dashbuilder-host' AND device != 'lo' FACET device, direction TIMESERIES SINCE 30 minutes ago`;
        }
      },
      
      'filesystem-usage': {
        title: 'Filesystem Usage',
        visualization: 'viz.table',
        buildQuery: (metrics) => {
          const fsMetric = metrics.find(m => m.includes('filesystem.usage'));
          if (!fsMetric) return null;
          return `SELECT latest(${fsMetric}) / 1e9 AS used_gb, latest(mountpoint) AS mount, latest(type) AS fs_type FROM Metric WHERE host.id = 'dashbuilder-host' FACET device LIMIT 20`;
        }
      },
      
      'load-average': {
        title: 'Load Average',
        visualization: 'viz.billboard',
        buildQuery: (metrics) => {
          const loadMetrics = metrics.filter(m => m.includes('load_average'));
          if (loadMetrics.length === 0) return null;
          return `SELECT ${loadMetrics.map(m => `latest(${m})`).join(', ')} FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 5 minutes ago`;
        }
      },
      
      'monthly-cost': {
        title: 'Estimated Monthly Cost',
        visualization: 'viz.billboard',
        buildQuery: (metrics) => {
          return `SELECT rate(count(*), 1 month) / 1e9 AS billion_points, rate(count(*), 1 month) / 1e9 * 0.30 AS estimated_cost_usd FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago`;
        }
      },
      
      'cost-trend': {
        title: 'Cost Trend',
        visualization: 'viz.line',
        buildQuery: (metrics) => {
          return `SELECT rate(count(*), 1 hour) * 24 * 30 / 1e9 * 0.30 AS projected_monthly_cost FROM Metric WHERE host.id = 'dashbuilder-host' TIMESERIES SINCE 7 days ago`;
        }
      },
      
      'resource-usage': {
        title: 'Resource Usage Overview',
        visualization: 'viz.line',
        buildQuery: (metrics) => {
          return `SELECT average(cpu.usage) AS cpu_percent, average(memory.usage) / 1e9 AS memory_gb FROM Metric WHERE host.id = 'dashbuilder-host' TIMESERIES SINCE 1 hour ago`;
        }
      }
    };

    // Layout optimization rules
    this.layoutRules = {
      maxWidth: 12,
      defaultHeight: 3,
      preferredWidths: {
        'viz.billboard': 3,
        'viz.line': 6,
        'viz.area': 6,
        'viz.table': 12,
        'viz.pie': 4,
        'viz.bar': 6
      },
      responsiveBreakpoints: {
        small: { maxWidgets: 4, columns: 12 },
        medium: { maxWidgets: 8, columns: 12 },
        large: { maxWidgets: 12, columns: 12 }
      }
    };
  }

  // Generate dashboard from template
  generateFromTemplate(templateName, availableMetrics, options = {}) {
    const template = this.templates[templateName];
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    const dashboard = {
      name: options.name || template.name,
      description: options.description || template.description,
      permissions: options.permissions || 'PUBLIC_READ_WRITE',
      pages: []
    };

    // Generate pages based on template sections
    template.sections.forEach(section => {
      const page = {
        name: section.name,
        description: section.description || '',
        widgets: []
      };

      // Generate widgets for this section
      section.widgets.forEach(widgetDef => {
        const widget = this.generateWidget(widgetDef, availableMetrics);
        if (widget) {
          page.widgets.push(widget);
        }
      });

      // Only add page if it has widgets
      if (page.widgets.length > 0) {
        dashboard.pages.push(page);
      }
    });

    // Optimize layout
    dashboard.pages = dashboard.pages.map(page => 
      this.optimizePageLayout(page)
    );

    return dashboard;
  }

  // Generate a single widget
  generateWidget(widgetDef, availableMetrics) {
    const widgetType = this.widgetTypes[widgetDef.type];
    if (!widgetType) return null;

    // Build query
    const query = widgetType.buildQuery(availableMetrics);
    if (!query) return null;

    return {
      title: widgetType.title,
      visualization: {
        id: widgetType.visualization
      },
      layout: {
        column: widgetDef.position.col,
        row: widgetDef.position.row,
        width: widgetDef.position.width,
        height: widgetDef.position.height
      },
      rawConfiguration: {
        nrqlQueries: [{
          accountIds: [parseInt(process.env.NEW_RELIC_ACCOUNT_ID || '3630072')],
          query: query
        }],
        ...this.getVisualizationConfig(widgetType.visualization)
      }
    };
  }

  // Get visualization-specific configuration
  getVisualizationConfig(vizType) {
    const configs = {
      'viz.line': {
        legend: { enabled: true },
        yAxisLeft: { zero: true }
      },
      'viz.area': {
        legend: { enabled: true },
        yAxisLeft: { zero: true },
        facet: { showOtherSeries: false }
      },
      'viz.billboard': {
        thresholds: []
      },
      'viz.table': {
        facet: { showOtherSeries: false }
      },
      'viz.pie': {
        facet: { showOtherSeries: false },
        legend: { enabled: true }
      }
    };

    return configs[vizType] || {};
  }

  // Optimize page layout
  optimizePageLayout(page) {
    // Sort widgets by row and column
    page.widgets.sort((a, b) => {
      if (a.layout.row !== b.layout.row) {
        return a.layout.row - b.layout.row;
      }
      return a.layout.column - b.layout.column;
    });

    // Pack widgets efficiently
    let currentRow = 1;
    let currentCol = 1;

    page.widgets.forEach(widget => {
      // Find next available position
      if (currentCol + widget.layout.width > this.layoutRules.maxWidth + 1) {
        currentRow += this.layoutRules.defaultHeight;
        currentCol = 1;
      }

      widget.layout.column = currentCol;
      widget.layout.row = currentRow;
      
      currentCol += widget.layout.width;
    });

    return page;
  }

  // Auto-generate dashboard based on metrics
  autoGenerate(classifiedMetrics, options = {}) {
    // Determine best template based on available metrics
    const template = this.selectBestTemplate(classifiedMetrics);
    
    // Get all metric names
    const allMetrics = [];
    Object.values(classifiedMetrics.byCategory).forEach(category => {
      Object.values(category).forEach(metrics => {
        allMetrics.push(...metrics.map(m => m.name));
      });
    });

    // Generate dashboard
    return this.generateFromTemplate(template, allMetrics, options);
  }

  // Select best template based on metrics
  selectBestTemplate(classifiedMetrics) {
    const categories = Object.keys(classifiedMetrics.byCategory);
    
    if (categories.includes('system')) {
      return 'system-health';
    } else if (categories.includes('application')) {
      return 'application-performance';
    } else if (classifiedMetrics.byType.gauge?.some(m => m.name.includes('cost'))) {
      return 'cost-optimization';
    }
    
    return 'minimal';
  }

  // Create custom template
  createCustomTemplate(name, config) {
    this.templates[name] = config;
  }

  // Export template for reuse
  exportTemplate(templateName) {
    const template = this.templates[templateName];
    if (!template) return null;
    
    return {
      name: templateName,
      template: JSON.parse(JSON.stringify(template)),
      version: '1.0',
      exportDate: new Date().toISOString()
    };
  }
}

module.exports = DashboardTemplateEngine;