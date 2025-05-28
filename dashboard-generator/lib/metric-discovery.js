const https = require('https');
const { promisify } = require('util');

class MetricDiscoveryService {
  constructor(apiKey, accountId) {
    this.apiKey = apiKey;
    this.accountId = accountId;
    this.cache = new Map();
    this.cacheTTL = 3600000; // 1 hour
  }

  async discoverMetrics(options = {}) {
    const {
      namespace = null,
      pattern = null,
      limit = 1000,
      useCache = true
    } = options;

    const cacheKey = `metrics:${namespace || 'all'}:${pattern || 'all'}`;
    
    if (useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const metrics = await this.fetchMetricsFromNewRelic(namespace, pattern, limit);
      
      const enrichedMetrics = await Promise.all(
        metrics.map(metric => this.enrichMetric(metric))
      );

      const result = {
        metrics: enrichedMetrics,
        count: enrichedMetrics.length,
        timestamp: new Date().toISOString()
      };

      if (useCache) {
        this.cache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }

      return result;
    } catch (error) {
      console.error('Error discovering metrics:', error);
      throw error;
    }
  }

  async fetchMetricsFromNewRelic(namespace, pattern, limit) {
    const { query, nrql } = this.buildDiscoveryQuery(namespace, pattern, limit);
    const response = await this.executeNerdGraphQuery(query, { nrql });
    
    if (response.data?.actor?.account?.nrql?.results) {
      return response.data.actor.account.nrql.results.map(result => ({
        name: result.facet || result.metricName,
        namespace: this.extractNamespace(result.facet || result.metricName),
        count: result['count'] || 0
      }));
    }

    return [];
  }

  buildDiscoveryQuery(namespace, pattern, limit) {
    let whereClause = '';
    const conditions = [];

    if (namespace) {
      conditions.push(`metricName LIKE '${namespace}.%'`);
    }

    if (pattern) {
      // Convert glob pattern to SQL LIKE pattern
      const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
      conditions.push(`metricName LIKE '${sqlPattern}'`);
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    const nrql = `SELECT count(*) FROM Metric ${whereClause} SINCE 1 day ago FACET metricName LIMIT ${limit}`;

    const query = `
      query discoverMetrics($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `;

    return { query, nrql };
  }

  async getMetricMetadata(metricName) {
    const cacheKey = `metadata:${metricName}`;
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    try {
      const [samples, dimensions, statistics] = await Promise.all([
        this.getMetricSamples(metricName, '5 minutes'),
        this.getMetricDimensions(metricName),
        this.getMetricStatistics(metricName)
      ]);

      const metadata = {
        name: metricName,
        namespace: this.extractNamespace(metricName),
        type: this.inferMetricType(samples, statistics),
        unit: this.inferMetricUnit(metricName),
        dimensions,
        statistics,
        samples: samples.slice(0, 5),
        lastUpdated: new Date().toISOString()
      };

      this.cache.set(cacheKey, {
        data: metadata,
        timestamp: Date.now()
      });

      return metadata;
    } catch (error) {
      console.error(`Error getting metadata for ${metricName}:`, error);
      return null;
    }
  }

  async getMetricSamples(metricName, timeRange = '1 hour') {
    const nrql = `SELECT average(metricName) FROM Metric WHERE metricName = '${metricName}' SINCE ${timeRange} TIMESERIES 1 minute`;
    
    const query = `
      query getMetricSamples($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `;

    const response = await this.executeNerdGraphQuery(query, { nrql });
    
    if (response.data?.actor?.account?.nrql?.results) {
      return response.data.actor.account.nrql.results.map(result => ({
        timestamp: result.beginTimeSeconds * 1000,
        value: result['average.metricName'] || result['average'] || 0
      }));
    }

    return [];
  }

  async getMetricDimensions(metricName) {
    const nrql = `SELECT keyset() FROM Metric WHERE metricName = '${metricName}' SINCE 1 hour ago LIMIT 1`;
    
    const query = `
      query getMetricDimensions($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `;

    const response = await this.executeNerdGraphQuery(query, { nrql });
    
    if (response.data?.actor?.account?.nrql?.results?.[0]) {
      const keys = response.data.actor.account.nrql.results[0]['keyset()'] || [];
      return keys.filter(key => 
        !['timestamp', 'metricName', 'newrelic.source'].includes(key)
      );
    }

    return [];
  }

  async getMetricStatistics(metricName) {
    const nrql = `SELECT average(metricName) AS avg, min(metricName) AS min, max(metricName) AS max, stddev(metricName) AS stddev, count(metricName) AS count FROM Metric WHERE metricName = '${metricName}' SINCE 1 hour ago`;
    
    const query = `
      query getMetricStatistics($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `;

    const response = await this.executeNerdGraphQuery(query, { nrql });
    
    if (response.data?.actor?.account?.nrql?.results?.[0]) {
      const result = response.data.actor.account.nrql.results[0];
      return {
        average: result.avg || 0,
        min: result.min || 0,
        max: result.max || 0,
        stddev: result.stddev || 0,
        count: result.count || 0
      };
    }

    return null;
  }

  async searchMetrics(searchTerm, options = {}) {
    const { limit = 100, category = null } = options;
    
    const patterns = [
      `%${searchTerm}%`,
      `${searchTerm}.%`,
      `%.${searchTerm}.%`,
      `%.${searchTerm}`
    ];

    const results = await Promise.all(
      patterns.map(pattern => 
        this.discoverMetrics({ pattern, limit: Math.floor(limit / patterns.length) })
      )
    );

    const allMetrics = results.flatMap(r => r.metrics);
    const uniqueMetrics = this.deduplicateMetrics(allMetrics);
    
    return {
      metrics: this.rankSearchResults(uniqueMetrics, searchTerm),
      count: uniqueMetrics.length,
      searchTerm,
      timestamp: new Date().toISOString()
    };
  }

  extractNamespace(metricName) {
    const parts = metricName.split('.');
    if (parts.length > 1) {
      return parts[0];
    }
    return 'custom';
  }

  inferMetricType(samples, statistics) {
    if (!samples || samples.length === 0) {
      return 'unknown';
    }

    const values = samples.map(s => s.value);
    const uniqueValues = [...new Set(values)];
    
    if (uniqueValues.length <= 2 && uniqueValues.every(v => v === 0 || v === 1)) {
      return 'state';
    }
    
    const isMonotonic = values.every((val, idx) => 
      idx === 0 || val >= values[idx - 1]
    );
    
    if (isMonotonic && statistics?.min >= 0) {
      return 'counter';
    }
    
    if (statistics?.stddev > statistics?.average * 0.5) {
      return 'distribution';
    }
    
    return 'gauge';
  }

  inferMetricUnit(metricName) {
    const lowerName = metricName.toLowerCase();
    
    const unitPatterns = {
      'bytes': ['bytes', 'byte', '_b_', '.b.'],
      'milliseconds': ['ms', 'millis', 'milliseconds', 'latency', 'duration'],
      'seconds': ['seconds', 'sec', '_s_', '.s.', 'uptime'],
      'percent': ['percent', 'pct', 'percentage', 'utilization', 'usage'],
      'count': ['count', 'total', 'sum', 'number'],
      'rate': ['rate', 'per_second', 'ps', 'per_minute']
    };

    for (const [unit, patterns] of Object.entries(unitPatterns)) {
      if (patterns.some(pattern => lowerName.includes(pattern))) {
        return unit;
      }
    }

    return 'none';
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

  rankSearchResults(metrics, searchTerm) {
    const lowerSearch = searchTerm.toLowerCase();
    
    return metrics.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      
      if (aName === lowerSearch) return -1;
      if (bName === lowerSearch) return 1;
      
      if (aName.startsWith(lowerSearch) && !bName.startsWith(lowerSearch)) return -1;
      if (!aName.startsWith(lowerSearch) && bName.startsWith(lowerSearch)) return 1;
      
      const aIndex = aName.indexOf(lowerSearch);
      const bIndex = bName.indexOf(lowerSearch);
      
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      
      return a.name.length - b.name.length;
    });
  }

  async enrichMetric(metric) {
    return {
      ...metric,
      type: this.inferMetricType([], null),
      unit: this.inferMetricUnit(metric.name),
      category: this.categorizeMetric(metric.name)
    };
  }

  categorizeMetric(metricName) {
    const lowerName = metricName.toLowerCase();
    
    if (lowerName.includes('cpu') || lowerName.includes('memory') || lowerName.includes('disk')) {
      return 'system';
    }
    if (lowerName.includes('request') || lowerName.includes('response') || lowerName.includes('error')) {
      return 'application';
    }
    if (lowerName.includes('revenue') || lowerName.includes('transaction') || lowerName.includes('user')) {
      return 'business';
    }
    if (lowerName.includes('network') || lowerName.includes('bandwidth')) {
      return 'network';
    }
    
    return 'other';
  }

  async executeNerdGraphQuery(query, variables = {}) {
    const payload = JSON.stringify({
      query,
      variables: {
        accountId: parseInt(this.accountId),
        ...variables
      }
    });

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

  clearCache() {
    this.cache.clear();
  }
}

module.exports = MetricDiscoveryService;