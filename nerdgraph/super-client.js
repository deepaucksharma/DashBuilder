const https = require('https');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

/**
 * NerdGraph Super Client - Advanced GraphQL client for New Relic
 * Pushes boundaries with batching, subscriptions, and intelligence
 */
class NerdGraphSuperClient extends EventEmitter {
  constructor(config) {
    super();
    this.apiKey = config.apiKey;
    this.accountId = config.accountId;
    this.endpoint = config.endpoint || 'https://api.newrelic.com/graphql';
    this.wsEndpoint = config.wsEndpoint || 'wss://api.newrelic.com/graphql';
    
    // Advanced features
    this.batchQueue = [];
    this.batchTimer = null;
    this.subscriptions = new Map();
    this.cache = new Map();
    this.queryAnalyzer = new QueryAnalyzer();
    
    // Configuration
    this.config = {
      batchSize: config.batchSize || 50,
      batchTimeout: config.batchTimeout || 100,
      cacheEnabled: config.cacheEnabled !== false,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };
  }

  /**
   * Execute a single GraphQL query with optimizations
   */
  async query(query, variables = {}, options = {}) {
    // Check cache first
    if (this.config.cacheEnabled && options.cache !== false) {
      const cached = this.getCached(query, variables);
      if (cached) return cached;
    }

    // Analyze and optimize query
    const optimized = this.queryAnalyzer.optimize(query);
    
    // Execute query
    const result = await this.execute(optimized, variables, options);
    
    // Cache result
    if (this.config.cacheEnabled && options.cache !== false) {
      this.setCached(query, variables, result, options.ttl);
    }
    
    return result;
  }

  /**
   * Execute multiple queries in a single request
   */
  async batchQuery(queries) {
    const batch = queries.map((q, index) => ({
      id: `query_${index}`,
      query: this.queryAnalyzer.optimize(q.query),
      variables: q.variables || {}
    }));

    const batchQuery = this.buildBatchQuery(batch);
    const result = await this.execute(batchQuery.query, batchQuery.variables);
    
    // Unpack batch results
    return this.unpackBatchResults(result, batch);
  }

  /**
   * Add query to batch queue for automatic batching
   */
  async queueQuery(query, variables = {}) {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        query: this.queryAnalyzer.optimize(query),
        variables,
        resolve,
        reject
      });
      
      this.scheduleBatchExecution();
    });
  }

  /**
   * Subscribe to real-time data with GraphQL subscriptions
   */
  subscribe(subscription, variables = {}, handlers = {}) {
    const subscriptionId = this.generateSubscriptionId();
    
    const ws = new WebSocket(this.wsEndpoint, {
      headers: {
        'Api-Key': this.apiKey
      }
    });
    
    const sub = {
      id: subscriptionId,
      subscription,
      variables,
      handlers,
      ws,
      reconnectAttempts: 0
    };
    
    this.setupWebSocket(sub);
    this.subscriptions.set(subscriptionId, sub);
    
    return {
      id: subscriptionId,
      unsubscribe: () => this.unsubscribe(subscriptionId)
    };
  }

  /**
   * Get schema introspection
   */
  async introspect() {
    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          types {
            name
            kind
            description
            fields {
              name
              type {
                name
                kind
              }
            }
          }
        }
      }
    `;
    
    return this.query(introspectionQuery, {}, { cache: true, ttl: 86400 });
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  async analyzeQuery(query, variables = {}) {
    const startTime = Date.now();
    
    // Execute with explain plan
    const explainQuery = `
      query ExplainQuery($query: String!) {
        explainQuery(query: $query) {
          estimatedCost
          estimatedTime
          suggestions
          warnings
        }
      }
    `;
    
    const analysis = await this.query(explainQuery, { query });
    const executionTime = Date.now() - startTime;
    
    return {
      ...analysis.explainQuery,
      actualExecutionTime: executionTime,
      optimizations: this.queryAnalyzer.suggest(query)
    };
  }

  /**
   * Execute NRQL query with enhanced features
   */
  async nrql(query, options = {}) {
    const graphqlQuery = `
      query NrqlQuery($accountId: Int!, $query: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $query) {
              results
              metadata {
                eventTypes
                facets
                messages
                timeWindow {
                  begin
                  end
                }
              }
              ${options.includeSuggestions ? 'suggestions { nrql }' : ''}
              ${options.includePerformance ? 'performanceStats { inspectedCount wallClockTime }' : ''}
            }
          }
        }
      }
    `;
    
    return this.query(graphqlQuery, {
      accountId: parseInt(this.accountId),
      query
    });
  }

  /**
   * Execute predictive NRQL query
   */
  async predict(metric, duration, options = {}) {
    const query = `
      SELECT PREDICT(${metric}, ${duration}) 
      FROM ${options.from || 'Metric'} 
      ${options.where ? `WHERE ${options.where}` : ''}
      ${options.facet ? `FACET ${options.facet}` : ''}
      SINCE ${options.since || '7 days ago'}
    `;
    
    const result = await this.nrql(query, { includeSuggestions: true });
    
    return {
      predictions: result.actor.account.nrql.results,
      confidence: this.calculatePredictionConfidence(result),
      suggestions: result.actor.account.nrql.suggestions
    };
  }

  /**
   * Detect anomalies in metrics
   */
  async detectAnomalies(metrics, options = {}) {
    const queries = metrics.map(metric => `
      SELECT anomaly(${metric.aggregation || 'average'}(${metric.name})) 
      FROM ${metric.from || 'Metric'} 
      ${metric.where ? `WHERE ${metric.where}` : ''}
      ${metric.facet ? `FACET ${metric.facet}` : ''}
      SINCE ${options.since || '1 week ago'}
    `);
    
    const results = await Promise.all(queries.map(q => this.nrql(q)));
    
    return this.correlateAnomalies(results, metrics);
  }

  // Private methods

  async execute(query, variables = {}, options = {}) {
    const payload = JSON.stringify({ query, variables });
    
    return this.retryableRequest(async () => {
      return new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.newrelic.com',
          path: '/graphql',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Api-Key': this.apiKey,
            'Content-Length': payload.length
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              if (response.errors) {
                reject(new GraphQLError(response.errors));
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
    }, options.retryAttempts || this.config.retryAttempts);
  }

  async retryableRequest(fn, attempts) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        
        const delay = this.config.retryDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  scheduleBatchExecution() {
    if (this.batchTimer) return;
    
    this.batchTimer = setTimeout(() => {
      this.executeBatch();
    }, this.config.batchTimeout);
  }

  async executeBatch() {
    if (this.batchQueue.length === 0) return;
    
    const batch = this.batchQueue.splice(0, this.config.batchSize);
    this.batchTimer = null;
    
    try {
      const results = await this.batchQuery(batch.map(b => ({
        query: b.query,
        variables: b.variables
      })));
      
      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      batch.forEach(item => item.reject(error));
    }
    
    // Schedule next batch if queue not empty
    if (this.batchQueue.length > 0) {
      this.scheduleBatchExecution();
    }
  }

  buildBatchQuery(batch) {
    const query = `
      query BatchQuery(${batch.map(b => `$${b.id}_vars: JSON`).join(', ')}) {
        ${batch.map(b => `
          ${b.id}: executeQuery(query: "${b.query.replace(/"/g, '\\"')}", variables: $${b.id}_vars) {
            data
            errors
          }
        `).join('\n')}
      }
    `;
    
    const variables = {};
    batch.forEach(b => {
      variables[`${b.id}_vars`] = b.variables;
    });
    
    return { query, variables };
  }

  unpackBatchResults(result, batch) {
    return batch.map(b => {
      const queryResult = result.data[b.id];
      if (queryResult.errors) {
        throw new GraphQLError(queryResult.errors);
      }
      return queryResult.data;
    });
  }

  setupWebSocket(sub) {
    const { ws, handlers } = sub;
    
    ws.on('open', () => {
      // Send connection init
      ws.send(JSON.stringify({
        type: 'connection_init',
        payload: {
          'Api-Key': this.apiKey
        }
      }));
      
      // Send subscription
      ws.send(JSON.stringify({
        id: sub.id,
        type: 'start',
        payload: {
          query: sub.subscription,
          variables: sub.variables
        }
      }));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'data':
          if (handlers.onData) {
            handlers.onData(message.payload);
          }
          break;
        case 'error':
          if (handlers.onError) {
            handlers.onError(message.payload);
          }
          break;
        case 'complete':
          if (handlers.onComplete) {
            handlers.onComplete();
          }
          break;
      }
    });
    
    ws.on('error', (error) => {
      if (handlers.onError) {
        handlers.onError(error);
      }
      this.handleSubscriptionError(sub, error);
    });
    
    ws.on('close', () => {
      this.handleSubscriptionClose(sub);
    });
  }

  handleSubscriptionError(sub, error) {
    console.error(`Subscription ${sub.id} error:`, error);
    
    // Attempt reconnection
    if (sub.reconnectAttempts < 5) {
      sub.reconnectAttempts++;
      setTimeout(() => {
        this.reconnectSubscription(sub);
      }, 1000 * sub.reconnectAttempts);
    }
  }

  handleSubscriptionClose(sub) {
    if (sub.handlers.onClose) {
      sub.handlers.onClose();
    }
    
    // Clean up
    this.subscriptions.delete(sub.id);
  }

  reconnectSubscription(sub) {
    // Create new WebSocket
    sub.ws = new WebSocket(this.wsEndpoint, {
      headers: {
        'Api-Key': this.apiKey
      }
    });
    
    this.setupWebSocket(sub);
  }

  unsubscribe(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return;
    
    // Send stop message
    if (sub.ws.readyState === WebSocket.OPEN) {
      sub.ws.send(JSON.stringify({
        id: subscriptionId,
        type: 'stop'
      }));
    }
    
    // Close WebSocket
    sub.ws.close();
    
    // Remove from subscriptions
    this.subscriptions.delete(subscriptionId);
  }

  getCached(query, variables) {
    const key = this.getCacheKey(query, variables);
    const cached = this.cache.get(key);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    
    return null;
  }

  setCached(query, variables, data, ttl = 300) {
    const key = this.getCacheKey(query, variables);
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttl * 1000)
    });
  }

  getCacheKey(query, variables) {
    return `${query}:${JSON.stringify(variables)}`;
  }

  generateSubscriptionId() {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  calculatePredictionConfidence(result) {
    // Implement confidence calculation based on data variance
    // This is a simplified example
    const variance = this.calculateVariance(result.actor.account.nrql.results);
    return Math.max(0, Math.min(100, 100 - (variance * 10)));
  }

  calculateVariance(data) {
    if (!data || data.length === 0) return 0;
    
    const values = data.map(d => d.value || 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }

  correlateAnomalies(results, metrics) {
    // Implement anomaly correlation logic
    const anomalies = results.map((result, index) => ({
      metric: metrics[index],
      anomalies: result.actor.account.nrql.results,
      severity: this.calculateAnomalySeverity(result)
    }));
    
    // Find correlated anomalies
    const correlations = this.findCorrelations(anomalies);
    
    return {
      anomalies,
      correlations,
      summary: this.generateAnomalySummary(anomalies, correlations)
    };
  }

  calculateAnomalySeverity(result) {
    // Implement severity calculation
    return 'medium'; // Placeholder
  }

  findCorrelations(anomalies) {
    // Implement correlation detection
    return []; // Placeholder
  }

  generateAnomalySummary(anomalies, correlations) {
    return {
      totalAnomalies: anomalies.reduce((sum, a) => sum + a.anomalies.length, 0),
      criticalMetrics: anomalies.filter(a => a.severity === 'critical').map(a => a.metric.name),
      correlatedGroups: correlations.length
    };
  }
}

/**
 * Query Analyzer for optimization
 */
class QueryAnalyzer {
  optimize(query) {
    let optimized = query;
    
    // Remove unnecessary whitespace
    optimized = optimized.replace(/\s+/g, ' ').trim();
    
    // Optimize field selection
    optimized = this.optimizeFieldSelection(optimized);
    
    // Add query hints
    optimized = this.addQueryHints(optimized);
    
    return optimized;
  }

  optimizeFieldSelection(query) {
    // Implement field optimization logic
    return query;
  }

  addQueryHints(query) {
    // Add performance hints
    return query;
  }

  suggest(query) {
    const suggestions = [];
    
    // Check for missing indexes
    if (query.includes('WHERE') && !query.includes('INDEX')) {
      suggestions.push('Consider adding index hints for WHERE clause fields');
    }
    
    // Check for expensive operations
    if (query.includes('SELECT *')) {
      suggestions.push('Specify exact fields instead of SELECT *');
    }
    
    return suggestions;
  }
}

/**
 * Custom GraphQL Error class
 */
class GraphQLError extends Error {
  constructor(errors) {
    super(errors.map(e => e.message).join(', '));
    this.name = 'GraphQLError';
    this.errors = errors;
  }
}

module.exports = NerdGraphSuperClient;