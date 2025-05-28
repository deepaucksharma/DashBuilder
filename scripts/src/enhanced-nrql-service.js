/**
 * Enhanced NRQL Service
 * Leverages all new NRQL capabilities from 2024 updates
 */

const NRQLService = require('./services/nrql.service');

class EnhancedNRQLService extends NRQLService {
  constructor() {
    super();
    
    // New NRQL functions available in 2024
    this.newFunctions = {
      string: ['upper', 'lower', 'substring', 'position'],
      json: ['jparse', 'mapKeys', 'mapValues'],
      conditional: ['if'],
      performance: ['aparse'], // Optimized alternative to regex
      limits: {
        results: 5000, // Up from 2000
        captureGroups: 16, // Up from 11
        subqueries: 3,
        joinCardinality: 100
      }
    };
  }

  /**
   * Generate intelligent queries using new capabilities
   */
  generateIntelligentQuery(config) {
    const { metric, aggregation, conditions, predict } = config;
    
    let query = this.buildBaseQuery(metric, aggregation);
    
    // Apply conditional logic
    if (conditions) {
      query = this.applyConditionalLogic(query, conditions);
    }
    
    // Add predictive analytics
    if (predict) {
      query = this.addPrediction(query, predict);
    }
    
    // Optimize for new limits
    query = this.optimizeForLimits(query);
    
    return query;
  }

  /**
   * Apply new conditional logic capabilities
   */
  applyConditionalLogic(query, conditions) {
    const { threshold, categories } = conditions;
    
    if (threshold) {
      // Use new if() function
      const condition = `if(value > ${threshold.high}, 'Critical', 
                         if(value > ${threshold.medium}, 'Warning', 'Normal'))`;
      query = query.replace('SELECT', `SELECT ${condition} as status,`);
    }
    
    if (categories) {
      // Use string functions for categorization
      const categorization = categories.map(cat => 
        `if(lower(name) LIKE '%${cat.pattern}%', '${cat.label}', '')`
      ).join(', ');
      query += ` FACET ${categorization} as category`;
    }
    
    return query;
  }

  /**
   * Add predictive analytics using PREDICT clause
   */
  addPrediction(query, predictConfig) {
    const { duration, unit, algorithm = 'hw' } = predictConfig;
    
    // Ensure query has TIMESERIES
    if (!query.includes('TIMESERIES')) {
      query += ' TIMESERIES';
    }
    
    // Add PREDICT clause (Holt-Winters by default)
    query += ` PREDICT ${duration} ${unit}`;
    
    if (algorithm !== 'hw') {
      query += ` ALGORITHM ${algorithm}`;
    }
    
    return query;
  }

  /**
   * Use new JSON processing capabilities
   */
  processJsonData(query, jsonConfig) {
    const { field, extractKeys, transformValues } = jsonConfig;
    
    if (extractKeys) {
      // Use mapKeys to extract JSON keys
      query = query.replace(
        'SELECT',
        `SELECT mapKeys(jparse(${field})) as keys,`
      );
    }
    
    if (transformValues) {
      // Use mapValues for transformation
      query = query.replace(
        'SELECT',
        `SELECT mapValues(jparse(${field}), (k, v) => ${transformValues}) as transformed,`
      );
    }
    
    return query;
  }

  /**
   * Optimize string operations with new functions
   */
  optimizeStringOperations(query) {
    // Replace regex with aparse for better performance
    query = query.replace(
      /capture\([^,]+,\s*r'([^']+)'\)/g,
      (match, pattern) => {
        if (this.canUseAparse(pattern)) {
          return `aparse(attribute, '${this.convertToAparsePattern(pattern)}')`;
        }
        return match;
      }
    );
    
    // Use new string functions
    query = query.replace(/toLowerCase\(/g, 'lower(');
    query = query.replace(/toUpperCase\(/g, 'upper(');
    
    return query;
  }

  /**
   * Optimize for new 5000 result limit
   */
  optimizeForLimits(query) {
    const resultCount = this.estimateResultCount(query);
    
    if (resultCount > 5000) {
      // Apply intelligent sampling or aggregation
      if (query.includes('FACET') && !query.includes('LIMIT')) {
        // Add LIMIT to FACET queries
        query += ' LIMIT 100';
      } else if (!query.includes('TIMESERIES')) {
        // Add time-based sampling
        query = this.addTimeSampling(query);
      }
    }
    
    return query;
  }

  /**
   * Build complex multi-source queries
   */
  buildJoinQuery(config) {
    const { primary, secondary, joinCondition, cardinality } = config;
    
    // Validate cardinality (max 1:100)
    if (cardinality > 100) {
      throw new Error('Join cardinality cannot exceed 1:100');
    }
    
    return `
      ${primary.query}
      JOIN (
        ${secondary.query}
      ) ON ${joinCondition}
      LIMIT ${Math.min(cardinality, 100)}
    `;
  }

  /**
   * Create subqueries (max 3 per query)
   */
  buildSubquery(config) {
    const { queries, aggregation } = config;
    
    if (queries.length > 3) {
      throw new Error('Maximum 3 subqueries allowed per query');
    }
    
    const subqueries = queries.map((q, i) => 
      `(${q}) as subquery${i + 1}`
    ).join(', ');
    
    return `SELECT ${aggregation}(${subqueries}) FROM (${queries[0]})`;
  }

  /**
   * Generate anomaly detection queries
   */
  generateAnomalyQuery(metric, options = {}) {
    const { 
      sensitivity = 2, 
      method = 'stddev',
      timeWindow = '1 hour'
    } = options;
    
    if (method === 'stddev') {
      return `
        SELECT average(${metric}) as value,
               average(${metric}) + (stddev(${metric}) * ${sensitivity}) as upper_bound,
               average(${metric}) - (stddev(${metric}) * ${sensitivity}) as lower_bound,
               if(${metric} > average(${metric}) + (stddev(${metric}) * ${sensitivity}) OR
                  ${metric} < average(${metric}) - (stddev(${metric}) * ${sensitivity}), 
                  1, 0) as is_anomaly
        FROM Metric
        SINCE ${timeWindow}
        TIMESERIES
      `;
    }
    
    // Use predictive analytics for anomaly detection
    return `
      SELECT ${metric} as actual,
             predict(${metric}, 1, 'hour') as predicted,
             abs(${metric} - predict(${metric}, 1, 'hour')) as deviation,
             if(abs(${metric} - predict(${metric}, 1, 'hour')) > 
                ${sensitivity} * stddev(${metric}), 1, 0) as is_anomaly
      FROM Metric
      SINCE ${timeWindow}
      TIMESERIES
    `;
  }

  /**
   * Performance analysis using new capabilities
   */
  analyzeQueryPerformance(query) {
    const analysis = super.analyzePerformance(query);
    
    // Enhanced analysis with new functions
    analysis.optimizations = [];
    
    // Check for regex that could use aparse
    if (query.includes('capture') && query.includes("r'")) {
      analysis.optimizations.push({
        type: 'performance',
        suggestion: 'Consider using aparse() instead of capture() with regex',
        impact: 'high'
      });
    }
    
    // Check for string operations
    if (query.match(/toLowerCase|toUpperCase/)) {
      analysis.optimizations.push({
        type: 'syntax',
        suggestion: 'Use new lower() and upper() functions',
        impact: 'low'
      });
    }
    
    // Check result set size
    if (!query.includes('LIMIT') && this.estimateResultCount(query) > 2000) {
      analysis.optimizations.push({
        type: 'limits',
        suggestion: 'Query may return > 2000 results. New limit is 5000, but consider adding LIMIT',
        impact: 'medium'
      });
    }
    
    return analysis;
  }

  /**
   * Helper methods
   */
  
  canUseAparse(pattern) {
    // Check if pattern is simple enough for aparse
    return !pattern.includes('[') && 
           !pattern.includes('(') && 
           !pattern.includes('*') &&
           !pattern.includes('+');
  }
  
  convertToAparsePattern(regexPattern) {
    // Convert simple regex to aparse pattern
    return regexPattern
      .replace(/\./g, '%')
      .replace(/\?/g, '_');
  }
  
  estimateResultCount(query) {
    // Estimate based on query structure
    if (query.includes('FACET') && !query.includes('LIMIT')) {
      return 10000; // Assume high cardinality
    }
    if (query.includes('TIMESERIES')) {
      const sinceMatch = query.match(/SINCE (\d+) (\w+)/);
      if (sinceMatch) {
        const [, value, unit] = sinceMatch;
        const minutes = this.convertToMinutes(value, unit);
        return minutes; // One data point per minute
      }
    }
    return 1000; // Default estimate
  }
  
  convertToMinutes(value, unit) {
    const conversions = {
      'minute': 1,
      'minutes': 1,
      'hour': 60,
      'hours': 60,
      'day': 1440,
      'days': 1440
    };
    return parseInt(value) * (conversions[unit] || 1);
  }
  
  addTimeSampling(query) {
    // Add sampling to reduce result count
    if (query.includes('WHERE')) {
      query = query.replace('WHERE', 'WHERE mod(timestamp, 5) = 0 AND');
    } else {
      query = query.replace('FROM', 'FROM WHERE mod(timestamp, 5) = 0');
    }
    return query;
  }
}

module.exports = EnhancedNRQLService;