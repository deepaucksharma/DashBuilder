/**
 * Metric Classifier
 * Intelligently classifies metrics and determines optimal visualizations
 */

class MetricClassifier {
  constructor() {
    // Metric patterns and their characteristics
    this.metricPatterns = {
      // Counter metrics (monotonically increasing)
      counter: {
        patterns: [/\.total$/, /\.count$/, /\.operations$/, /\.bytes$/, /\.io$/],
        characteristics: ['monotonic', 'cumulative'],
        preferredVisualizations: ['viz.line', 'viz.area'],
        aggregations: ['rate', 'derivative'],
        defaultAggregation: 'rate'
      },
      
      // Gauge metrics (can go up or down)
      gauge: {
        patterns: [/\.usage$/, /\.utilization$/, /\.percentage$/, /\.ratio$/, /\.load/],
        characteristics: ['instantaneous', 'bounded'],
        preferredVisualizations: ['viz.billboard', 'viz.line', 'viz.area'],
        aggregations: ['average', 'latest', 'max', 'min'],
        defaultAggregation: 'latest'
      },
      
      // Histogram metrics
      histogram: {
        patterns: [/\.histogram$/, /\.distribution$/, /\.latency$/, /\.duration$/],
        characteristics: ['distribution', 'percentiles'],
        preferredVisualizations: ['viz.heatmap', 'viz.line'],
        aggregations: ['percentile', 'average', 'max'],
        defaultAggregation: 'percentile'
      },
      
      // State metrics (categorical)
      state: {
        patterns: [/\.state$/, /\.status$/, /\.phase$/],
        characteristics: ['categorical', 'enumerated'],
        preferredVisualizations: ['viz.pie', 'viz.table'],
        aggregations: ['uniqueCount', 'count'],
        defaultAggregation: 'uniqueCount'
      }
    };

    // Metric categories for grouping
    this.categories = {
      system: {
        subcategories: ['cpu', 'memory', 'disk', 'network', 'filesystem'],
        patterns: [/^system\./],
        defaultDashboard: 'system-health'
      },
      application: {
        subcategories: ['http', 'database', 'cache', 'queue'],
        patterns: [/^app\./, /^application\./],
        defaultDashboard: 'application-performance'
      },
      business: {
        subcategories: ['revenue', 'users', 'transactions', 'conversion'],
        patterns: [/^business\./, /revenue/, /conversion/],
        defaultDashboard: 'business-kpis'
      },
      infrastructure: {
        subcategories: ['container', 'kubernetes', 'cloud', 'serverless'],
        patterns: [/^kube/, /^container/, /^aws/, /^gcp/, /^azure/],
        defaultDashboard: 'infrastructure-overview'
      }
    };

    // Visualization rules based on data characteristics
    this.visualizationRules = {
      'timeseries-single': {
        conditions: ['hasTimeRange', 'singleSeries'],
        visualization: 'viz.line',
        layout: { width: 6, height: 3 }
      },
      'timeseries-multi': {
        conditions: ['hasTimeRange', 'multiSeries', 'faceted'],
        visualization: 'viz.area',
        layout: { width: 6, height: 3 }
      },
      'single-value': {
        conditions: ['noTimeRange', 'singleValue'],
        visualization: 'viz.billboard',
        layout: { width: 3, height: 3 }
      },
      'distribution': {
        conditions: ['hasFacet', 'categorical'],
        visualization: 'viz.pie',
        layout: { width: 4, height: 3 }
      },
      'comparison': {
        conditions: ['hasFacet', 'numeric', 'noTimeRange'],
        visualization: 'viz.bar',
        layout: { width: 6, height: 3 }
      },
      'detailed-list': {
        conditions: ['multiAttribute', 'needsDetail'],
        visualization: 'viz.table',
        layout: { width: 12, height: 3 }
      }
    };
  }

  // Classify a single metric
  classifyMetric(metricName) {
    const classification = {
      name: metricName,
      type: 'unknown',
      category: 'unknown',
      subcategory: 'unknown',
      characteristics: [],
      suggestedVisualizations: [],
      suggestedAggregations: []
    };

    // Determine metric type
    for (const [type, config] of Object.entries(this.metricPatterns)) {
      if (config.patterns.some(pattern => pattern.test(metricName))) {
        classification.type = type;
        classification.characteristics = config.characteristics;
        classification.suggestedVisualizations = config.preferredVisualizations;
        classification.suggestedAggregations = config.aggregations;
        classification.defaultAggregation = config.defaultAggregation;
        break;
      }
    }

    // Determine category
    for (const [category, config] of Object.entries(this.categories)) {
      if (config.patterns.some(pattern => pattern.test(metricName))) {
        classification.category = category;
        
        // Find subcategory
        for (const subcategory of config.subcategories) {
          if (metricName.includes(subcategory)) {
            classification.subcategory = subcategory;
            break;
          }
        }
        break;
      }
    }

    // Special handling for specific metrics
    classification.specialHandling = this.getSpecialHandling(metricName);

    return classification;
  }

  // Classify all metrics and group them intelligently
  classifyMetrics(metricsList) {
    const classified = {
      byType: {},
      byCategory: {},
      bySubcategory: {},
      relationships: [],
      dashboardSuggestions: []
    };

    // Classify each metric
    const classifications = metricsList.map(metric => this.classifyMetric(metric));

    // Group by type
    classifications.forEach(c => {
      if (!classified.byType[c.type]) {
        classified.byType[c.type] = [];
      }
      classified.byType[c.type].push(c);
    });

    // Group by category and subcategory
    classifications.forEach(c => {
      if (!classified.byCategory[c.category]) {
        classified.byCategory[c.category] = {};
      }
      if (!classified.byCategory[c.category][c.subcategory]) {
        classified.byCategory[c.category][c.subcategory] = [];
      }
      classified.byCategory[c.category][c.subcategory].push(c);
    });

    // Detect relationships
    classified.relationships = this.detectRelationships(classifications);

    // Generate dashboard suggestions
    classified.dashboardSuggestions = this.suggestDashboards(classified);

    return classified;
  }

  // Detect relationships between metrics
  detectRelationships(classifications) {
    const relationships = [];

    // Find related metrics by name similarity
    classifications.forEach((metric1, i) => {
      classifications.slice(i + 1).forEach(metric2 => {
        const similarity = this.calculateSimilarity(metric1.name, metric2.name);
        if (similarity > 0.7) {
          relationships.push({
            metric1: metric1.name,
            metric2: metric2.name,
            type: 'similar',
            score: similarity,
            suggestedWidget: 'combined-visualization'
          });
        }
      });
    });

    // Find complementary metrics (e.g., read/write, in/out)
    const complementaryPairs = [
      ['read', 'write'],
      ['in', 'out'],
      ['rx', 'tx'],
      ['sent', 'received'],
      ['ingress', 'egress']
    ];

    complementaryPairs.forEach(([term1, term2]) => {
      classifications.forEach(metric1 => {
        if (metric1.name.includes(term1)) {
          const metric2 = classifications.find(m => 
            m.name.includes(term2) && 
            m.name.replace(term1, '') === metric1.name.replace(term1, '')
          );
          if (metric2) {
            relationships.push({
              metric1: metric1.name,
              metric2: metric2.name,
              type: 'complementary',
              suggestedWidget: 'dual-axis-chart'
            });
          }
        }
      });
    });

    return relationships;
  }

  // Calculate string similarity
  calculateSimilarity(str1, str2) {
    const parts1 = str1.split(/[._-]/);
    const parts2 = str2.split(/[._-]/);
    const common = parts1.filter(p => parts2.includes(p)).length;
    return (2 * common) / (parts1.length + parts2.length);
  }

  // Get special handling rules for specific metrics
  getSpecialHandling(metricName) {
    const rules = [];

    // Percentage metrics
    if (metricName.includes('percentage') || metricName.includes('percent')) {
      rules.push({
        type: 'bounds',
        min: 0,
        max: 100,
        format: 'percentage'
      });
    }

    // Memory metrics (convert to human-readable)
    if (metricName.includes('memory') || metricName.includes('bytes')) {
      rules.push({
        type: 'unit-conversion',
        fromUnit: 'bytes',
        toUnit: 'auto',
        format: 'bytes'
      });
    }

    // Rate metrics
    if (metricName.includes('rate') || metricName.includes('per_second')) {
      rules.push({
        type: 'rate',
        interval: '1 second',
        format: 'rate'
      });
    }

    return rules;
  }

  // Suggest dashboards based on available metrics
  suggestDashboards(classified) {
    const suggestions = [];

    // System dashboard if we have system metrics
    if (classified.byCategory.system && 
        Object.keys(classified.byCategory.system).length >= 3) {
      suggestions.push({
        name: 'System Health Dashboard',
        priority: 'high',
        template: 'system-health',
        sections: Object.keys(classified.byCategory.system),
        estimatedWidgets: this.estimateWidgetCount(classified.byCategory.system)
      });
    }

    // Performance dashboard if we have latency/duration metrics
    const performanceMetrics = classified.byType.histogram?.filter(m => 
      m.name.includes('latency') || m.name.includes('duration')
    ) || [];
    
    if (performanceMetrics.length > 0) {
      suggestions.push({
        name: 'Performance Dashboard',
        priority: 'high',
        template: 'performance',
        metrics: performanceMetrics.map(m => m.name),
        estimatedWidgets: performanceMetrics.length + 2
      });
    }

    // Cost optimization dashboard if we have usage metrics
    const usageMetrics = classified.byType.gauge?.filter(m => 
      m.name.includes('usage') || m.name.includes('utilization')
    ) || [];
    
    if (usageMetrics.length > 0) {
      suggestions.push({
        name: 'Resource Utilization Dashboard',
        priority: 'medium',
        template: 'resource-utilization',
        metrics: usageMetrics.map(m => m.name),
        estimatedWidgets: Math.ceil(usageMetrics.length / 2)
      });
    }

    return suggestions;
  }

  // Estimate widget count for a category
  estimateWidgetCount(categoryMetrics) {
    let count = 0;
    Object.values(categoryMetrics).forEach(metrics => {
      // Group similar metrics
      count += Math.ceil(metrics.length / 3);
    });
    return count;
  }

  // Generate optimal query for a metric
  generateOptimalQuery(classification, options = {}) {
    const {
      timeRange = 'SINCE 30 minutes ago',
      facet = null,
      hostFilter = "host.id = 'dashbuilder-host'"
    } = options;

    let query = 'SELECT ';
    
    // Choose aggregation based on metric type
    const aggregation = classification.defaultAggregation || 'latest';
    
    if (aggregation === 'rate' && classification.type === 'counter') {
      query += `rate(max(${classification.name}), 1 second)`;
    } else {
      query += `${aggregation}(${classification.name})`;
    }

    // Add unit conversion if needed
    const specialHandling = classification.specialHandling || [];
    const unitConversion = specialHandling.find(r => r.type === 'unit-conversion');
    if (unitConversion) {
      query += ' / 1e9'; // Convert bytes to GB
    }

    // Add FROM clause
    query += ' FROM Metric';

    // Add WHERE clause
    const whereClauses = [hostFilter];
    if (options.additionalFilters) {
      whereClauses.push(...options.additionalFilters);
    }
    query += ` WHERE ${whereClauses.join(' AND ')}`;

    // Add FACET if specified
    if (facet) {
      query += ` FACET ${facet}`;
    }

    // Add time range
    if (options.timeseries) {
      query += ` TIMESERIES`;
    }
    query += ` ${timeRange}`;

    return query;
  }
}

module.exports = MetricClassifier;