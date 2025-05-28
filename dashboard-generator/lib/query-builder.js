// Simple NRQL query builder class
class NRQL {
  constructor() {
    this.selectClause = '';
    this.fromClause = '';
    this.whereClause = '';
    this.facetClause = '';
    this.sinceClause = '';
    this.compareClause = '';
    this.timeseriesClause = '';
    this.limitClause = '';
  }

  select(expression) {
    this.selectClause = `SELECT ${expression}`;
    return this;
  }

  as(alias) {
    this.selectClause += ` AS '${alias}'`;
    return this;
  }

  from(source) {
    this.fromClause = `FROM ${source}`;
    return this;
  }

  where(condition) {
    if (!this.whereClause) {
      this.whereClause = `WHERE ${condition}`;
    } else {
      this.whereClause += ` AND ${condition}`;
    }
    return this;
  }

  facet(facets) {
    this.facetClause = `FACET ${facets}`;
    return this;
  }

  since(timeRange) {
    this.sinceClause = `SINCE ${timeRange}`;
    return this;
  }

  compare(comparison) {
    this.compareClause = `COMPARE WITH ${comparison}`;
    return this;
  }

  timeseries(interval) {
    this.timeseriesClause = interval ? `TIMESERIES ${interval}` : 'TIMESERIES';
    return this;
  }

  limit(count) {
    this.limitClause = `LIMIT ${count}`;
    return this;
  }

  build() {
    const parts = [
      this.selectClause,
      this.fromClause,
      this.whereClause,
      this.facetClause,
      this.sinceClause,
      this.compareClause,
      this.timeseriesClause,
      this.limitClause
    ].filter(part => part);

    return parts.join(' ');
  }
}

class QueryBuilder {
  constructor() {
    this.aggregationFunctions = {
      counter: ['sum', 'rate', 'derivative'],
      gauge: ['average', 'latest', 'max', 'min'],
      histogram: ['percentile', 'histogram', 'average', 'max'],
      distribution: ['percentile', 'average', 'sum', 'count'],
      state: ['uniqueCount', 'latest', 'filter']
    };

    this.timeWindows = {
      realtime: '1 minute',
      short: '5 minutes',
      medium: '1 hour',
      long: '1 day',
      historical: '1 week'
    };

    this.facetSuggestions = {
      service: ['service.name', 'service.namespace', 'service.instance.id'],
      host: ['host.name', 'host.type', 'cloud.provider'],
      application: ['app.name', 'environment', 'deployment.id'],
      business: ['customer.tier', 'product.name', 'transaction.type']
    };
  }

  buildQuery(metric, options = {}) {
    const {
      aggregation,
      timeWindow = 'medium',
      facets = [],
      filters = {},
      compareWith = null,
      alias = null
    } = options;

    const query = new NRQL();
    
    const selectedAggregation = aggregation || this.selectAggregation(metric);
    
    if (metric.type === 'histogram' && selectedAggregation === 'percentile') {
      query.select(`percentile(metricName, 50, 90, 95, 99)`);
    } else {
      query.select(`${selectedAggregation}(metricName)`);
    }

    if (alias) {
      query.as(alias);
    }

    query.from('Metric');
    query.where(`metricName = '${metric.name}'`);

    if (Object.keys(filters).length > 0) {
      Object.entries(filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          query.where(`${key} IN (${value.map(v => `'${v}'`).join(', ')})`);
        } else {
          query.where(`${key} = '${value}'`);
        }
      });
    }

    if (facets.length > 0) {
      query.facet(facets.join(', '));
    }

    query.since(this.timeWindows[timeWindow] || timeWindow);

    if (compareWith) {
      query.compare(compareWith);
    }

    const builtQuery = {
      nrql: query.build(),
      metadata: {
        aggregation: selectedAggregation,
        timeWindow: this.timeWindows[timeWindow] || timeWindow,
        facets,
        filters,
        compareWith
      }
    };

    return builtQuery;
  }

  buildMultiMetricQuery(metrics, options = {}) {
    const { timeWindow = 'medium', facets = [], filters = {} } = options;
    
    // For multiple metrics, we'll create a single query filtering by metric names
    const query = new NRQL();
    
    const aggregation = this.selectAggregation(metrics[0]); // Use same aggregation for all
    query.select(`${aggregation}(metricName)`);
    query.from('Metric');
    
    // Filter to include only the specified metrics
    const metricNames = metrics.map(m => `'${m.name}'`).join(', ');
    query.where(`metricName IN (${metricNames})`);

    if (Object.keys(filters).length > 0) {
      Object.entries(filters).forEach(([key, value]) => {
        query.where(`${key} = '${value}'`);
      });
    }

    // Always facet by metricName for multi-metric queries
    const allFacets = ['metricName', ...facets];
    query.facet(allFacets.join(', '));

    query.since(this.timeWindows[timeWindow] || timeWindow);
    query.timeseries();

    return {
      nrql: query.build(),
      metadata: {
        metrics: metrics.map(m => m.name),
        timeWindow: this.timeWindows[timeWindow] || timeWindow,
        facets: allFacets,
        filters
      }
    };
  }

  buildComparisonQuery(metric, options = {}) {
    const {
      compareWith = 'week',
      aggregation,
      facets = []
    } = options;

    const query = this.buildQuery(metric, {
      ...options,
      aggregation,
      facets,
      compareWith
    });

    return query;
  }

  buildThresholdQuery(metric, threshold, options = {}) {
    const { operator = '>', duration = '5 minutes' } = options;
    
    const baseQuery = this.buildQuery(metric, options);
    const nrql = baseQuery.nrql;
    
    const thresholdQuery = `${nrql} WHERE result ${operator} ${threshold}`;
    
    return {
      nrql: thresholdQuery,
      metadata: {
        ...baseQuery.metadata,
        threshold,
        operator,
        duration
      }
    };
  }

  buildDistributionQuery(metric, options = {}) {
    const { buckets = 10, timeWindow = 'medium' } = options;
    
    const query = new NRQL();
    query.select(`histogram(${metric.name}, ${buckets})`);
    query.from('Metric');
    query.since(this.timeWindows[timeWindow] || timeWindow);
    
    return {
      nrql: query.build(),
      metadata: {
        type: 'distribution',
        buckets,
        timeWindow: this.timeWindows[timeWindow] || timeWindow
      }
    };
  }

  buildCorrelationQuery(metric1, metric2, options = {}) {
    const { timeWindow = 'medium' } = options;
    
    const query = new NRQL();
    query.select(
      `average(${metric1.name}) AS '${metric1.alias || metric1.name}'`,
      `average(${metric2.name}) AS '${metric2.alias || metric2.name}'`
    );
    query.from('Metric');
    query.since(this.timeWindows[timeWindow] || timeWindow);
    query.timeseries();
    
    return {
      nrql: query.build(),
      metadata: {
        type: 'correlation',
        metrics: [metric1.name, metric2.name],
        timeWindow: this.timeWindows[timeWindow] || timeWindow
      }
    };
  }

  suggestFacets(metric) {
    const suggestions = [];
    
    if (metric.name.includes('service')) {
      suggestions.push(...this.facetSuggestions.service);
    }
    
    if (metric.name.includes('host') || metric.name.includes('system')) {
      suggestions.push(...this.facetSuggestions.host);
    }
    
    if (metric.name.includes('app') || metric.name.includes('application')) {
      suggestions.push(...this.facetSuggestions.application);
    }
    
    if (metric.category === 'business') {
      suggestions.push(...this.facetSuggestions.business);
    }
    
    return [...new Set(suggestions)];
  }

  selectAggregation(metric) {
    const aggregations = this.aggregationFunctions[metric.type] || ['average'];
    
    if (metric.characteristics.includes('rate-based')) {
      return 'rate';
    }
    
    if (metric.characteristics.includes('cumulative')) {
      return 'derivative';
    }
    
    if (metric.type === 'counter') {
      return 'sum';
    }
    
    if (metric.type === 'gauge') {
      return 'average';
    }
    
    if (metric.type === 'histogram' || metric.type === 'distribution') {
      return 'percentile';
    }
    
    return aggregations[0];
  }

  optimizeQuery(query, performanceHints = {}) {
    let optimizedQuery = query;
    
    if (performanceHints.largeDataset) {
      optimizedQuery = this.addSampling(optimizedQuery, performanceHints.sampleRate || 100);
    }
    
    if (performanceHints.limitResults) {
      optimizedQuery = this.addLimit(optimizedQuery, performanceHints.limit || 100);
    }
    
    if (performanceHints.indexedAttributes) {
      optimizedQuery = this.reorderWhereClause(optimizedQuery, performanceHints.indexedAttributes);
    }
    
    return optimizedQuery;
  }

  addSampling(query, sampleRate) {
    return query.replace(/FROM Metric/, `FROM Metric SAMPLE ${sampleRate}`);
  }

  addLimit(query, limit) {
    if (!query.includes('LIMIT')) {
      return `${query} LIMIT ${limit}`;
    }
    return query;
  }

  reorderWhereClause(query, indexedAttributes) {
    return query;
  }

  validateQuery(query) {
    const errors = [];
    
    if (!query.includes('SELECT')) {
      errors.push('Query must include SELECT clause');
    }
    
    if (!query.includes('FROM')) {
      errors.push('Query must include FROM clause');
    }
    
    const aggregationPattern = /(\w+)\s*\(/g;
    const matches = query.match(aggregationPattern);
    if (matches) {
      const validAggregations = ['sum', 'average', 'min', 'max', 'count', 'rate', 
                                 'derivative', 'latest', 'percentile', 'histogram', 
                                 'uniqueCount', 'filter'];
      matches.forEach(match => {
        const func = match.replace('(', '').trim();
        if (!validAggregations.includes(func)) {
          errors.push(`Invalid aggregation function: ${func}`);
        }
      });
    }
    
    if (query.includes('FACET')) {
      const facetMatch = query.match(/FACET\s+([^S]+?)(?:SINCE|UNTIL|LIMIT|$)/);
      if (facetMatch && facetMatch[1].trim().split(',').length > 5) {
        errors.push('Maximum 5 facets allowed');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  generateExampleQueries(metric) {
    const examples = [];
    
    examples.push({
      title: 'Basic aggregation',
      query: this.buildQuery(metric).nrql,
      description: `Shows the ${this.selectAggregation(metric)} of ${metric.name}`
    });
    
    const suggestedFacets = this.suggestFacets(metric);
    if (suggestedFacets.length > 0) {
      examples.push({
        title: 'With faceting',
        query: this.buildQuery(metric, { facets: [suggestedFacets[0]] }).nrql,
        description: `Breaks down by ${suggestedFacets[0]}`
      });
    }
    
    examples.push({
      title: 'Week-over-week comparison',
      query: this.buildComparisonQuery(metric, { compareWith: '1 week ago' }).nrql,
      description: 'Compares current values with last week'
    });
    
    if (metric.type === 'histogram' || metric.type === 'distribution') {
      examples.push({
        title: 'Distribution analysis',
        query: this.buildDistributionQuery(metric).nrql,
        description: 'Shows value distribution in histogram'
      });
    }
    
    return examples;
  }
}

module.exports = QueryBuilder;