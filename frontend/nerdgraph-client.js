/**
 * NerdGraph Client
 * Comprehensive GraphQL client for New Relic's NerdGraph API
 */

class NerdGraphClient {
  constructor(config = {}) {
    this.config = {
      endpoint: config.endpoint || 'https://api.newrelic.com/graphql',
      apiKey: config.apiKey,
      accountId: config.accountId,
      region: config.region || 'US',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      enableBatching: config.enableBatching !== false,
      batchInterval: config.batchInterval || 50,
      maxBatchSize: config.maxBatchSize || 10,
      enableSubscriptions: config.enableSubscriptions !== false,
      enableIntrospection: config.enableIntrospection !== false,
      ...config
    };
    
    // Core components
    this.queryCache = new Map();
    this.subscriptions = new Map();
    this.batchQueue = [];
    this.batchTimer = null;
    
    // Schema information
    this.schema = null;
    this.typeMap = new Map();
    
    // Metrics
    this.metrics = {
      queries: 0,
      mutations: 0,
      subscriptions: 0,
      errors: 0,
      cacheHits: 0,
      avgLatency: 0
    };
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize the client
   */
  async initialize() {
    // Validate configuration
    if (!this.config.apiKey) {
      throw new Error('NerdGraph API key is required');
    }
    
    // Set up region endpoint
    if (this.config.region === 'EU') {
      this.config.endpoint = 'https://api.eu.newrelic.com/graphql';
    }
    
    // Load schema if introspection is enabled
    if (this.config.enableIntrospection) {
      await this.loadSchema();
    }
  }

  /**
   * Execute a GraphQL query
   */
  async query(query, variables = {}, options = {}) {
    const startTime = performance.now();
    
    try {
      // Check cache
      const cacheKey = this.getCacheKey('query', query, variables);
      if (!options.noCache && this.queryCache.has(cacheKey)) {
        this.metrics.cacheHits++;
        return this.queryCache.get(cacheKey);
      }
      
      // Execute query
      const result = await this.execute({
        query,
        variables,
        operationType: 'query'
      }, options);
      
      // Cache result
      if (!options.noCache && result.data) {
        this.queryCache.set(cacheKey, result);
      }
      
      // Update metrics
      this.metrics.queries++;
      this.updateLatency(performance.now() - startTime);
      
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      throw this.enhanceError(error, { query, variables });
    }
  }

  /**
   * Execute a GraphQL mutation
   */
  async mutate(mutation, variables = {}, options = {}) {
    const startTime = performance.now();
    
    try {
      // Never cache mutations
      const result = await this.execute({
        query: mutation,
        variables,
        operationType: 'mutation'
      }, options);
      
      // Clear relevant caches
      this.invalidateCache(mutation);
      
      // Update metrics
      this.metrics.mutations++;
      this.updateLatency(performance.now() - startTime);
      
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      throw this.enhanceError(error, { mutation, variables });
    }
  }

  /**
   * Create a GraphQL subscription
   */
  async subscribe(subscription, variables = {}, handlers = {}) {
    if (!this.config.enableSubscriptions) {
      throw new Error('Subscriptions are not enabled');
    }
    
    const subscriptionId = this.generateSubscriptionId();
    
    try {
      // Create WebSocket connection if needed
      if (!this.ws) {
        await this.connectWebSocket();
      }
      
      // Send subscription
      const message = {
        id: subscriptionId,
        type: 'start',
        payload: {
          query: subscription,
          variables
        }
      };
      
      this.ws.send(JSON.stringify(message));
      
      // Store subscription handlers
      this.subscriptions.set(subscriptionId, {
        subscription,
        variables,
        handlers,
        startTime: Date.now()
      });
      
      // Update metrics
      this.metrics.subscriptions++;
      
      // Return unsubscribe function
      return () => this.unsubscribe(subscriptionId);
      
    } catch (error) {
      this.metrics.errors++;
      throw this.enhanceError(error, { subscription, variables });
    }
  }

  /**
   * Execute NRQL query via NerdGraph
   */
  async nrql(nrqlQuery, options = {}) {
    const query = `
      query NrqlQuery($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
              metadata {
                eventTypes
                eventType
                messages
                facets
                contents {
                  function
                  attribute
                  simple
                }
                timeSeries {
                  begin
                  end
                  interval
                }
              }
              embeddedChartUrl
              staticChartUrl
              nrql
            }
          }
        }
      }
    `;
    
    const variables = {
      accountId: options.accountId || this.config.accountId,
      nrql: nrqlQuery
    };
    
    const result = await this.query(query, variables, options);
    
    return this.extractNrqlResult(result);
  }

  /**
   * Get entity information
   */
  async getEntity(guid, options = {}) {
    const query = `
      query GetEntity($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            guid
            name
            type
            domain
            entityType
            reporting
            alertSeverity
            tags {
              key
              values
            }
            ... on ApmApplicationEntity {
              applicationId
              language
              settings {
                apdexTarget
                serverSideConfig
              }
              deployments {
                changelog
                description
                timestamp
                user
              }
            }
            ... on BrowserApplicationEntity {
              applicationId
              servingApdexTarget
            }
            ... on InfrastructureHostEntity {
              systemMemoryBytes
              cpuPercent
              diskUsedPercent
              networkReceiveBytesPerSecond
              networkTransmitBytesPerSecond
            }
          }
        }
      }
    `;
    
    return this.query(query, { guid }, options);
  }

  /**
   * Search entities
   */
  async searchEntities(searchQuery, options = {}) {
    const query = `
      query SearchEntities($query: String!) {
        actor {
          entitySearch(query: $query) {
            count
            results {
              entities {
                guid
                name
                type
                domain
                entityType
                reporting
                alertSeverity
                tags {
                  key
                  values
                }
              }
              nextCursor
            }
          }
        }
      }
    `;
    
    return this.query(query, { query: searchQuery }, options);
  }

  /**
   * Get dashboard by GUID
   */
  async getDashboard(guid, options = {}) {
    const query = `
      query GetDashboard($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            ... on DashboardEntity {
              guid
              name
              description
              createdAt
              updatedAt
              permissions
              pages {
                guid
                name
                description
                widgets {
                  id
                  title
                  layout {
                    column
                    row
                    width
                    height
                  }
                  visualization {
                    id
                  }
                  rawConfiguration
                }
              }
              owner {
                email
                userId
              }
            }
          }
        }
      }
    `;
    
    return this.query(query, { guid }, options);
  }

  /**
   * Create dashboard
   */
  async createDashboard(dashboard, options = {}) {
    const mutation = `
      mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
            description
          }
          errors {
            type
            description
          }
        }
      }
    `;
    
    const variables = {
      accountId: options.accountId || this.config.accountId,
      dashboard: this.formatDashboardInput(dashboard)
    };
    
    return this.mutate(mutation, variables, options);
  }

  /**
   * Update dashboard
   */
  async updateDashboard(guid, updates, options = {}) {
    const mutation = `
      mutation UpdateDashboard($guid: EntityGuid!, $dashboard: DashboardUpdateInput!) {
        dashboardUpdate(guid: $guid, dashboard: $dashboard) {
          entityResult {
            guid
            name
            description
          }
          errors {
            type
            description
          }
        }
      }
    `;
    
    const variables = {
      guid,
      dashboard: this.formatDashboardInput(updates)
    };
    
    return this.mutate(mutation, variables, options);
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(guid, options = {}) {
    const mutation = `
      mutation DeleteDashboard($guid: EntityGuid!) {
        dashboardDelete(guid: $guid) {
          status
          errors {
            type
            description
          }
        }
      }
    `;
    
    return this.mutate(mutation, { guid }, options);
  }

  /**
   * Get alert policies
   */
  async getAlertPolicies(options = {}) {
    const query = `
      query GetAlertPolicies($accountId: Int!, $cursor: String) {
        actor {
          account(id: $accountId) {
            alerts {
              policiesSearch(cursor: $cursor) {
                policies {
                  id
                  name
                  incidentPreference
                  conditions {
                    id
                    name
                    enabled
                    type
                    nrql {
                      query
                    }
                    signal {
                      aggregationWindow
                      evaluationOffset
                    }
                    terms {
                      threshold
                      thresholdDuration
                      thresholdOccurrences
                      operator
                      priority
                    }
                  }
                }
                nextCursor
              }
            }
          }
        }
      }
    `;
    
    const variables = {
      accountId: options.accountId || this.config.accountId,
      cursor: options.cursor
    };
    
    return this.query(query, variables, options);
  }

  /**
   * Execute GraphQL request
   */
  async execute(request, options = {}) {
    // Batch if enabled
    if (this.config.enableBatching && !options.immediate) {
      return this.addToBatch(request, options);
    }
    
    // Execute immediately
    return this.executeRequest(request, options);
  }

  /**
   * Execute single request
   */
  async executeRequest(request, options = {}, retryCount = 0) {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': this.config.apiKey,
          ...options.headers
        },
        body: JSON.stringify(request),
        signal: this.createAbortSignal(options.timeout)
      });
      
      if (!response.ok) {
        throw new NerdGraphError(`HTTP ${response.status}: ${response.statusText}`, {
          status: response.status,
          statusText: response.statusText
        });
      }
      
      const result = await response.json();
      
      // Check for GraphQL errors
      if (result.errors) {
        throw new NerdGraphError('GraphQL errors', {
          errors: result.errors
        });
      }
      
      return result;
      
    } catch (error) {
      // Retry logic
      if (retryCount < this.config.maxRetries && this.shouldRetry(error)) {
        await this.delay(this.config.retryDelay * Math.pow(2, retryCount));
        return this.executeRequest(request, options, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Batch requests
   */
  addToBatch(request, options) {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        request,
        options,
        resolve,
        reject
      });
      
      // Start batch timer if not running
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.executeBatch();
        }, this.config.batchInterval);
      }
      
      // Execute immediately if batch is full
      if (this.batchQueue.length >= this.config.maxBatchSize) {
        clearTimeout(this.batchTimer);
        this.executeBatch();
      }
    });
  }

  async executeBatch() {
    const batch = this.batchQueue.splice(0, this.config.maxBatchSize);
    this.batchTimer = null;
    
    if (batch.length === 0) return;
    
    try {
      // Create batched query
      const batchQuery = this.createBatchQuery(batch);
      
      // Execute batch
      const result = await this.executeRequest({
        query: batchQuery.query,
        variables: batchQuery.variables
      });
      
      // Resolve individual promises
      batch.forEach((item, index) => {
        const key = `query${index}`;
        if (result.data && result.data[key]) {
          item.resolve({ data: { actor: result.data[key] } });
        } else {
          item.reject(new Error(`Batch query ${key} failed`));
        }
      });
      
    } catch (error) {
      // Reject all promises in batch
      batch.forEach(item => item.reject(error));
    }
    
    // Continue with remaining items
    if (this.batchQueue.length > 0) {
      this.batchTimer = setTimeout(() => {
        this.executeBatch();
      }, this.config.batchInterval);
    }
  }

  createBatchQuery(batch) {
    const fragments = [];
    const variables = {};
    
    batch.forEach((item, index) => {
      const key = `query${index}`;
      const varPrefix = `${key}_`;
      
      // Extract query body
      const queryBody = item.request.query
        .replace(/query\s+\w*\s*\([^)]*\)\s*{/, '')
        .replace(/}\s*$/, '');
      
      // Create aliased fragment
      fragments.push(`${key}: ${queryBody}`);
      
      // Merge variables
      Object.entries(item.request.variables || {}).forEach(([varName, value]) => {
        variables[`${varPrefix}${varName}`] = value;
      });
    });
    
    return {
      query: `query BatchQuery { ${fragments.join('\n')} }`,
      variables
    };
  }

  /**
   * WebSocket connection for subscriptions
   */
  async connectWebSocket() {
    const wsUrl = this.config.endpoint.replace('https://', 'wss://').replace('http://', 'ws://');
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl, 'graphql-ws');
      
      this.ws.onopen = () => {
        // Send connection init
        this.ws.send(JSON.stringify({
          type: 'connection_init',
          payload: {
            headers: {
              'Api-Key': this.config.apiKey
            }
          }
        }));
      };
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'connection_ack':
            resolve();
            break;
            
          case 'data':
            this.handleSubscriptionData(message);
            break;
            
          case 'error':
            this.handleSubscriptionError(message);
            break;
            
          case 'complete':
            this.handleSubscriptionComplete(message);
            break;
        }
      };
      
      this.ws.onerror = (error) => {
        reject(error);
      };
      
      this.ws.onclose = () => {
        // Reconnect logic
        setTimeout(() => {
          this.connectWebSocket();
        }, 5000);
      };
    });
  }

  handleSubscriptionData(message) {
    const subscription = this.subscriptions.get(message.id);
    if (subscription && subscription.handlers.onData) {
      subscription.handlers.onData(message.payload);
    }
  }

  handleSubscriptionError(message) {
    const subscription = this.subscriptions.get(message.id);
    if (subscription && subscription.handlers.onError) {
      subscription.handlers.onError(message.payload);
    }
  }

  handleSubscriptionComplete(message) {
    const subscription = this.subscriptions.get(message.id);
    if (subscription && subscription.handlers.onComplete) {
      subscription.handlers.onComplete();
    }
    this.subscriptions.delete(message.id);
  }

  unsubscribe(subscriptionId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        id: subscriptionId,
        type: 'stop'
      }));
    }
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Schema introspection
   */
  async loadSchema() {
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
              args {
                name
                type {
                  name
                  kind
                }
              }
            }
          }
          queryType {
            name
          }
          mutationType {
            name
          }
          subscriptionType {
            name
          }
        }
      }
    `;
    
    try {
      const result = await this.query(introspectionQuery, {}, { noCache: true });
      this.schema = result.data.__schema;
      this.buildTypeMap();
    } catch (error) {
      console.warn('Schema introspection failed:', error);
    }
  }

  buildTypeMap() {
    if (!this.schema) return;
    
    this.schema.types.forEach(type => {
      this.typeMap.set(type.name, type);
    });
  }

  /**
   * Query builders
   */
  buildNRQLQuery(params) {
    const parts = ['SELECT'];
    
    // SELECT clause
    if (params.select) {
      parts.push(params.select.join(', '));
    } else {
      parts.push('*');
    }
    
    // FROM clause
    parts.push('FROM', params.from);
    
    // WHERE clause
    if (params.where) {
      parts.push('WHERE', params.where);
    }
    
    // FACET clause
    if (params.facet) {
      parts.push('FACET', params.facet);
    }
    
    // SINCE/UNTIL
    if (params.since) {
      parts.push('SINCE', params.since);
    }
    
    if (params.until) {
      parts.push('UNTIL', params.until);
    }
    
    // LIMIT
    if (params.limit) {
      parts.push('LIMIT', params.limit);
    }
    
    return parts.join(' ');
  }

  /**
   * Data formatting
   */
  formatDashboardInput(dashboard) {
    return {
      name: dashboard.name,
      description: dashboard.description,
      permissions: dashboard.permissions || 'PRIVATE',
      pages: dashboard.pages?.map(page => ({
        name: page.name,
        description: page.description,
        widgets: page.widgets?.map(widget => ({
          title: widget.title,
          layout: {
            column: widget.position?.x || widget.layout?.column || 1,
            row: widget.position?.y || widget.layout?.row || 1,
            width: widget.size?.width || widget.layout?.width || 4,
            height: widget.size?.height || widget.layout?.height || 3
          },
          visualization: {
            id: widget.visualization || widget.type || 'viz.line'
          },
          rawConfiguration: JSON.stringify(widget.configuration || {})
        }))
      }))
    };
  }

  extractNrqlResult(result) {
    const nrqlData = result.data?.actor?.account?.nrql;
    
    if (!nrqlData) {
      throw new Error('Invalid NRQL response structure');
    }
    
    return {
      results: nrqlData.results,
      metadata: nrqlData.metadata,
      chartUrls: {
        embedded: nrqlData.embeddedChartUrl,
        static: nrqlData.staticChartUrl
      },
      query: nrqlData.nrql
    };
  }

  /**
   * Utility methods
   */
  getCacheKey(type, query, variables) {
    return `${type}:${this.hashQuery(query)}:${JSON.stringify(variables)}`;
  }

  hashQuery(query) {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  invalidateCache(mutation) {
    // Clear relevant cache entries based on mutation
    if (mutation.includes('dashboard')) {
      this.queryCache.forEach((value, key) => {
        if (key.includes('dashboard')) {
          this.queryCache.delete(key);
        }
      });
    }
  }

  createAbortSignal(timeout) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout || this.config.timeout);
    return controller.signal;
  }

  shouldRetry(error) {
    // Retry on network errors and 5xx status codes
    return error.name === 'NetworkError' || 
           (error.status && error.status >= 500);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  updateLatency(duration) {
    const total = this.metrics.queries + this.metrics.mutations;
    this.metrics.avgLatency = 
      (this.metrics.avgLatency * (total - 1) + duration) / total;
  }

  enhanceError(error, context) {
    error.context = context;
    error.timestamp = Date.now();
    return error;
  }

  generateSubscriptionId() {
    return `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get client metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.queryCache.size,
      activeSubscriptions: this.subscriptions.size,
      cacheHitRate: this.metrics.cacheHits / (this.metrics.queries || 1)
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.queryCache.clear();
  }

  /**
   * Dispose client
   */
  dispose() {
    // Clear timers
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
    }
    
    // Clear subscriptions
    this.subscriptions.clear();
    
    // Clear cache
    this.clearCache();
  }
}

/**
 * NerdGraph Error
 */
class NerdGraphError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'NerdGraphError';
    this.details = details;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NerdGraphClient,
    NerdGraphError
  };
}