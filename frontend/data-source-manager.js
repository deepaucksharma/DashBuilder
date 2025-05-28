/**
 * Data Source Manager
 * Unified interface for all data sources with proper error handling,
 * caching, and real-world API integration
 */

class DataSourceManager {
  constructor(config = {}) {
    this.config = {
      apiEndpoint: config.apiEndpoint || process.env.NEW_RELIC_API_ENDPOINT,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      cacheTimeout: config.cacheTimeout || 60000, // 1 minute
      batchSize: config.batchSize || 10,
      rateLimitPerMinute: config.rateLimitPerMinute || 60,
      ...config
    };
    
    // Core services
    this.auth = new AuthManager(config.auth);
    this.cache = new QueryCache(this.config.cacheTimeout);
    this.rateLimiter = new RateLimiter(this.config.rateLimitPerMinute);
    this.queryOptimizer = new QueryOptimizer();
    this.errorHandler = new DataSourceErrorHandler();
    
    // Query queue for batching
    this.queryQueue = [];
    this.batchTimer = null;
    
    // Connection state
    this.connectionState = 'disconnected';
    this.reconnectAttempts = 0;
    
    // Metrics
    this.metrics = {
      queries: 0,
      hits: 0,
      misses: 0,
      errors: 0,
      avgResponseTime: 0
    };
  }

  /**
   * Execute NRQL query with full error handling and optimization
   */
  async query(nrql, options = {}) {
    try {
      // Validate query
      const validation = this.validateQuery(nrql);
      if (!validation.valid) {
        throw new QueryValidationError(validation.errors);
      }
      
      // Check cache first
      const cacheKey = this.getCacheKey(nrql, options);
      const cached = await this.cache.get(cacheKey);
      if (cached && !options.noCache) {
        this.metrics.hits++;
        return cached;
      }
      
      // Check rate limit
      await this.rateLimiter.acquire();
      
      // Optimize query
      const optimizedQuery = this.queryOptimizer.optimize(nrql, options);
      
      // Execute query
      const startTime = performance.now();
      const result = await this.executeQuery(optimizedQuery, options);
      const duration = performance.now() - startTime;
      
      // Update metrics
      this.updateMetrics(duration);
      
      // Cache result
      if (!options.noCache) {
        await this.cache.set(cacheKey, result);
      }
      
      this.metrics.misses++;
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      return this.errorHandler.handle(error, { nrql, options });
    }
  }

  /**
   * Execute batch queries efficiently
   */
  async batchQuery(queries, options = {}) {
    try {
      // Validate all queries
      const validations = queries.map(q => ({
        query: q,
        validation: this.validateQuery(q.nrql)
      }));
      
      const invalid = validations.filter(v => !v.validation.valid);
      if (invalid.length > 0) {
        throw new BatchQueryValidationError(invalid);
      }
      
      // Check cache for all queries
      const results = new Array(queries.length);
      const toExecute = [];
      
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        const cacheKey = this.getCacheKey(query.nrql, query.options);
        const cached = await this.cache.get(cacheKey);
        
        if (cached && !query.options?.noCache) {
          results[i] = cached;
          this.metrics.hits++;
        } else {
          toExecute.push({ index: i, query });
        }
      }
      
      // Execute uncached queries in batches
      if (toExecute.length > 0) {
        const batches = this.createBatches(toExecute, this.config.batchSize);
        
        for (const batch of batches) {
          await this.rateLimiter.acquire(batch.length);
          
          const batchResults = await this.executeBatch(batch);
          
          // Place results and cache them
          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            const result = batchResults[i];
            
            results[item.index] = result;
            
            if (!item.query.options?.noCache) {
              const cacheKey = this.getCacheKey(item.query.nrql, item.query.options);
              await this.cache.set(cacheKey, result);
            }
          }
        }
      }
      
      return results;
      
    } catch (error) {
      return this.errorHandler.handle(error, { queries, options });
    }
  }

  /**
   * Stream real-time data
   */
  async stream(nrql, options = {}) {
    const streamId = this.generateStreamId();
    
    try {
      // Validate query
      const validation = this.validateQuery(nrql);
      if (!validation.valid) {
        throw new QueryValidationError(validation.errors);
      }
      
      // Create stream
      const stream = new DataStream({
        id: streamId,
        query: nrql,
        options,
        onData: options.onData,
        onError: options.onError,
        onEnd: options.onEnd
      });
      
      // Connect to real-time endpoint
      await this.connectStream(stream);
      
      return stream;
      
    } catch (error) {
      return this.errorHandler.handle(error, { nrql, options, streamId });
    }
  }

  /**
   * Execute query with retries
   */
  async executeQuery(query, options = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Check connection
        if (this.connectionState !== 'connected') {
          await this.connect();
        }
        
        // Prepare request
        const request = {
          query: this.buildGraphQLQuery(query, options),
          variables: options.variables || {}
        };
        
        // Add auth headers
        const headers = await this.auth.getHeaders();
        
        // Execute request
        const response = await fetch(this.config.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: JSON.stringify(request),
          signal: options.abortSignal
        });
        
        // Handle response
        if (!response.ok) {
          throw new APIError(`HTTP ${response.status}: ${response.statusText}`, response);
        }
        
        const data = await response.json();
        
        // Check for GraphQL errors
        if (data.errors) {
          throw new GraphQLError(data.errors);
        }
        
        // Transform response
        return this.transformResponse(data, query, options);
        
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors
        if (error instanceof QueryValidationError || error instanceof AuthError) {
          throw error;
        }
        
        // Exponential backoff
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await this.delay(delay);
        }
      }
    }
    
    throw new RetryExhaustedError(`Failed after ${this.config.maxRetries} retries`, lastError);
  }

  /**
   * Build GraphQL query from NRQL
   */
  buildGraphQLQuery(nrql, options = {}) {
    const accountId = options.accountId || this.config.accountId;
    
    return `
      query NrqlQuery($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
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
            }
          }
        }
      }
    `;
  }

  /**
   * Transform GraphQL response to consistent format
   */
  transformResponse(data, query, options) {
    const nrqlData = data?.data?.actor?.account?.nrql;
    
    if (!nrqlData) {
      throw new DataError('Invalid response structure');
    }
    
    return {
      results: nrqlData.results,
      metadata: {
        ...nrqlData.metadata,
        query,
        timestamp: Date.now(),
        cached: false
      }
    };
  }

  /**
   * Validate NRQL query
   */
  validateQuery(nrql) {
    const errors = [];
    
    if (!nrql || typeof nrql !== 'string') {
      errors.push('Query must be a non-empty string');
      return { valid: false, errors };
    }
    
    // Check for required clauses
    if (!nrql.match(/SELECT/i)) {
      errors.push('Query must contain SELECT clause');
    }
    
    if (!nrql.match(/FROM/i)) {
      errors.push('Query must contain FROM clause');
    }
    
    // Check for SQL injection patterns
    const dangerousPatterns = [
      /;\s*DROP/i,
      /;\s*DELETE/i,
      /;\s*UPDATE/i,
      /;\s*INSERT/i,
      /--/,
      /\/\*/
    ];
    
    for (const pattern of dangerousPatterns) {
      if (nrql.match(pattern)) {
        errors.push('Query contains potentially dangerous pattern');
        break;
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Connection management
   */
  async connect() {
    try {
      // Verify auth
      await this.auth.verify();
      
      // Test connection
      const testQuery = 'SELECT count(*) FROM Transaction LIMIT 1';
      await this.executeQuery(testQuery, { noCache: true, noRetry: true });
      
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      
    } catch (error) {
      this.connectionState = 'error';
      throw new ConnectionError('Failed to connect to data source', error);
    }
  }

  /**
   * Create batches from queries
   */
  createBatches(items, batchSize) {
    const batches = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Execute batch of queries
   */
  async executeBatch(batch) {
    const batchQuery = this.buildBatchGraphQLQuery(batch);
    
    const response = await fetch(this.config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await this.auth.getHeaders())
      },
      body: JSON.stringify({ query: batchQuery })
    });
    
    if (!response.ok) {
      throw new APIError(`Batch query failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract individual results
    return batch.map((item, i) => {
      const key = `query${i}`;
      return this.transformResponse(
        { data: { actor: { account: { nrql: data.data[key] } } } },
        item.query.nrql,
        item.query.options
      );
    });
  }

  /**
   * Build batch GraphQL query
   */
  buildBatchGraphQLQuery(batch) {
    const fragments = batch.map((item, i) => {
      const accountId = item.query.options?.accountId || this.config.accountId;
      return `
        query${i}: account(id: ${accountId}) {
          nrql(query: "${item.query.nrql.replace(/"/g, '\\"')}") {
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
          }
        }
      `;
    }).join('\n');
    
    return `
      query BatchQuery {
        actor {
          ${fragments}
        }
      }
    `;
  }

  /**
   * Cache key generation
   */
  getCacheKey(nrql, options = {}) {
    const normalized = nrql.toLowerCase().replace(/\s+/g, ' ').trim();
    const optionsKey = JSON.stringify(options, Object.keys(options).sort());
    return `${normalized}-${optionsKey}`;
  }

  /**
   * Update performance metrics
   */
  updateMetrics(duration) {
    this.metrics.queries++;
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.queries - 1) + duration) / 
      this.metrics.queries;
  }

  /**
   * Utility methods
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateStreamId() {
    return `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const hitRate = this.metrics.queries > 0 
      ? this.metrics.hits / this.metrics.queries 
      : 0;
    
    return {
      ...this.metrics,
      hitRate,
      errorRate: this.metrics.queries > 0 
        ? this.metrics.errors / this.metrics.queries 
        : 0
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Dispose and cleanup
   */
  dispose() {
    this.cache.dispose();
    this.rateLimiter.dispose();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
  }
}

/**
 * Auth Manager
 */
class AuthManager {
  constructor(config = {}) {
    this.config = config;
    this.token = null;
    this.tokenExpiry = null;
  }

  async getHeaders() {
    const token = await this.getToken();
    return {
      'Api-Key': token
    };
  }

  async getToken() {
    // Check if token is still valid
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }
    
    // Get token from secure storage
    this.token = await this.retrieveToken();
    this.tokenExpiry = Date.now() + 3600000; // 1 hour
    
    return this.token;
  }

  async retrieveToken() {
    // In production, this would retrieve from secure storage
    // or refresh from auth service
    if (this.config.apiKey) {
      return this.config.apiKey;
    }
    
    throw new AuthError('No API key configured');
  }

  async verify() {
    const token = await this.getToken();
    if (!token) {
      throw new AuthError('Authentication required');
    }
  }
}

/**
 * Query Cache
 */
class QueryCache {
  constructor(timeout = 60000) {
    this.cache = new Map();
    this.timeout = timeout;
    this.timers = new Map();
  }

  async get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiry) {
      this.delete(key);
      return null;
    }
    
    entry.lastAccess = Date.now();
    return entry.data;
  }

  async set(key, data) {
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }
    
    // Store data
    const entry = {
      data,
      expiry: Date.now() + this.timeout,
      lastAccess: Date.now()
    };
    
    this.cache.set(key, entry);
    
    // Set cleanup timer
    const timer = setTimeout(() => this.delete(key), this.timeout);
    this.timers.set(key, timer);
  }

  delete(key) {
    this.cache.delete(key);
    
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    
    this.cache.clear();
    this.timers.clear();
  }

  dispose() {
    this.clear();
  }
}

/**
 * Rate Limiter
 */
class RateLimiter {
  constructor(maxPerMinute = 60) {
    this.maxPerMinute = maxPerMinute;
    this.tokens = maxPerMinute;
    this.lastRefill = Date.now();
    this.queue = [];
  }

  async acquire(count = 1) {
    this.refill();
    
    if (this.tokens >= count) {
      this.tokens -= count;
      return;
    }
    
    // Queue the request
    return new Promise(resolve => {
      this.queue.push({ count, resolve });
      this.processQueue();
    });
  }

  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const toAdd = (elapsed / 60000) * this.maxPerMinute;
    
    this.tokens = Math.min(this.maxPerMinute, this.tokens + toAdd);
    this.lastRefill = now;
  }

  processQueue() {
    if (this.queue.length === 0) return;
    
    setTimeout(() => {
      this.refill();
      
      while (this.queue.length > 0 && this.tokens >= this.queue[0].count) {
        const request = this.queue.shift();
        this.tokens -= request.count;
        request.resolve();
      }
      
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }, 1000);
  }

  dispose() {
    // Resolve all pending requests
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      request.resolve();
    }
  }
}

/**
 * Query Optimizer
 */
class QueryOptimizer {
  optimize(nrql, options = {}) {
    let optimized = nrql;
    
    // Add LIMIT if not present for safety
    if (!nrql.match(/LIMIT/i)) {
      optimized += ' LIMIT 1000';
    }
    
    // Add SINCE if not present
    if (!nrql.match(/SINCE/i) && !nrql.match(/UNTIL/i)) {
      optimized += ' SINCE 1 hour ago';
    }
    
    // Optimize facets
    if (nrql.match(/FACET/i)) {
      // Ensure facet limit
      if (!nrql.match(/FACET.*LIMIT/i)) {
        optimized = optimized.replace(/FACET(.+?)(?:$|SINCE|UNTIL)/i, 'FACET$1 LIMIT 100 ');
      }
    }
    
    return optimized;
  }
}

/**
 * Data Stream
 */
class DataStream {
  constructor(config) {
    this.id = config.id;
    this.query = config.query;
    this.options = config.options;
    this.onData = config.onData;
    this.onError = config.onError;
    this.onEnd = config.onEnd;
    
    this.state = 'initialized';
    this.buffer = [];
  }

  start() {
    this.state = 'streaming';
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'streaming';
      this.flush();
    }
  }

  stop() {
    this.state = 'stopped';
    if (this.onEnd) {
      this.onEnd();
    }
  }

  push(data) {
    if (this.state === 'stopped') return;
    
    if (this.state === 'streaming' && this.onData) {
      this.onData(data);
    } else {
      this.buffer.push(data);
    }
  }

  flush() {
    if (this.buffer.length > 0 && this.onData) {
      const data = this.buffer.splice(0);
      this.onData(data);
    }
  }

  error(error) {
    if (this.onError) {
      this.onError(error);
    }
    this.stop();
  }
}

/**
 * Error Types
 */
class DataSourceError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'DataSourceError';
    this.cause = cause;
  }
}

class QueryValidationError extends DataSourceError {
  constructor(errors) {
    super(`Query validation failed: ${errors.join(', ')}`);
    this.name = 'QueryValidationError';
    this.errors = errors;
  }
}

class APIError extends DataSourceError {
  constructor(message, response) {
    super(message);
    this.name = 'APIError';
    this.response = response;
  }
}

class GraphQLError extends DataSourceError {
  constructor(errors) {
    super(`GraphQL errors: ${errors.map(e => e.message).join(', ')}`);
    this.name = 'GraphQLError';
    this.errors = errors;
  }
}

class AuthError extends DataSourceError {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

class ConnectionError extends DataSourceError {
  constructor(message, cause) {
    super(message, cause);
    this.name = 'ConnectionError';
  }
}

class RetryExhaustedError extends DataSourceError {
  constructor(message, lastError) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.lastError = lastError;
  }
}

class BatchQueryValidationError extends DataSourceError {
  constructor(invalid) {
    super(`Batch query validation failed for ${invalid.length} queries`);
    this.name = 'BatchQueryValidationError';
    this.invalid = invalid;
  }
}

class DataError extends DataSourceError {
  constructor(message) {
    super(message);
    this.name = 'DataError';
  }
}

/**
 * Error Handler
 */
class DataSourceErrorHandler {
  handle(error, context) {
    // Log error with context
    console.error('DataSource error:', error, context);
    
    // Return user-friendly error response
    return {
      error: true,
      message: this.getUserMessage(error),
      type: error.name || 'UnknownError',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
      context: process.env.NODE_ENV === 'development' ? context : undefined,
      timestamp: Date.now()
    };
  }

  getUserMessage(error) {
    if (error instanceof QueryValidationError) {
      return 'Invalid query syntax. Please check your NRQL query.';
    }
    
    if (error instanceof AuthError) {
      return 'Authentication failed. Please check your API credentials.';
    }
    
    if (error instanceof ConnectionError) {
      return 'Unable to connect to New Relic. Please try again later.';
    }
    
    if (error instanceof RetryExhaustedError) {
      return 'Request failed after multiple attempts. Please try again later.';
    }
    
    if (error instanceof APIError) {
      return `API request failed: ${error.message}`;
    }
    
    if (error instanceof GraphQLError) {
      return 'Query execution failed. Please check your query syntax.';
    }
    
    return 'An unexpected error occurred. Please try again.';
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DataSourceManager,
    AuthManager,
    QueryCache,
    RateLimiter,
    QueryOptimizer,
    DataStream,
    // Error types
    DataSourceError,
    QueryValidationError,
    APIError,
    GraphQLError,
    AuthError,
    ConnectionError,
    RetryExhaustedError,
    BatchQueryValidationError,
    DataError
  };
}