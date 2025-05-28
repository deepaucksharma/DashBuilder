/**
 * NerdGraph Native Client
 * Advanced GraphQL client that exploits all NerdGraph capabilities
 */

const { GraphQLClient } = require('graphql-request');
const { SubscriptionClient } = require('subscriptions-transport-ws');
const WebSocket = require('ws');
const { print } = require('graphql');
const { parse, visit, buildSchema, introspectionFromSchema } = require('graphql');
const EventEmitter = require('events');

class NerdGraphClient extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.apiKey = config.apiKey || process.env.NEW_RELIC_API_KEY;
    this.accountId = config.accountId || process.env.NEW_RELIC_ACCOUNT_ID;
    this.region = config.region || process.env.NEW_RELIC_REGION || 'US';
    
    // Endpoints
    this.httpEndpoint = this.region === 'EU' 
      ? 'https://api.eu.newrelic.com/graphql'
      : 'https://api.newrelic.com/graphql';
      
    this.wsEndpoint = this.region === 'EU'
      ? 'wss://api.eu.newrelic.com/graphql-ws'
      : 'wss://api.newrelic.com/graphql-ws';
    
    // HTTP client for queries/mutations
    this.httpClient = new GraphQLClient(this.httpEndpoint, {
      headers: {
        'API-Key': this.apiKey,
        'Content-Type': 'application/json',
        'NewRelic-Requesting-Services': 'dashbuilder-platform'
      },
      timeout: 120000, // 2 minutes for complex queries
      retries: 3,
      retryDelay: 1000
    });
    
    // WebSocket client for subscriptions
    this.wsClient = null;
    
    // Connection management
    this.concurrentRequests = 0;
    this.maxConcurrent = 25;
    this.requestQueue = [];
    
    // Schema cache
    this.schema = null;
    this.typeMap = new Map();
    
    // Fragment registry
    this.fragments = new Map();
    
    // Performance tracking
    this.metrics = {
      totalRequests: 0,
      totalTime: 0,
      errors: 0,
      cacheHits: 0
    };
  }

  /**
   * Initialize the client and introspect schema
   */
  async initialize() {
    console.log('🚀 Initializing NerdGraph Native Client...');
    
    // Introspect schema
    await this.introspectSchema();
    
    // Initialize WebSocket if needed
    if (this.config?.enableSubscriptions) {
      await this.initializeWebSocket();
    }
    
    console.log('✅ NerdGraph client initialized');
    return this;
  }

  /**
   * Introspect GraphQL schema for type safety and discovery
   */
  async introspectSchema() {
    const introspectionQuery = `
      {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
          types {
            ...FullType
          }
          directives {
            name
            description
            locations
            args {
              ...InputValue
            }
          }
        }
      }
      
      fragment FullType on __Type {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          args {
            ...InputValue
          }
          type {
            ...TypeRef
          }
          isDeprecated
          deprecationReason
        }
        inputFields {
          ...InputValue
        }
        interfaces {
          ...TypeRef
        }
        enumValues(includeDeprecated: true) {
          name
          description
          isDeprecated
          deprecationReason
        }
        possibleTypes {
          ...TypeRef
        }
      }
      
      fragment InputValue on __InputValue {
        name
        description
        type { ...TypeRef }
        defaultValue
      }
      
      fragment TypeRef on __Type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    try {
      const result = await this.execute(introspectionQuery);
      this.schema = buildSchema(result.__schema);
      
      // Build type map for quick lookups
      result.__schema.types.forEach(type => {
        this.typeMap.set(type.name, type);
      });
      
      // Discover capabilities
      this.discoverCapabilities();
      
      return this.schema;
    } catch (error) {
      console.error('Failed to introspect schema:', error);
      throw error;
    }
  }

  /**
   * Discover new capabilities from schema
   */
  discoverCapabilities() {
    const queries = this.typeMap.get('Query')?.fields || [];
    const mutations = this.typeMap.get('Mutation')?.fields || [];
    const subscriptions = this.typeMap.get('Subscription')?.fields || [];
    
    console.log(`📊 Discovered capabilities:`);
    console.log(`   Queries: ${queries.length}`);
    console.log(`   Mutations: ${mutations.length}`);
    console.log(`   Subscriptions: ${subscriptions.length}`);
    
    // Check for new or interesting capabilities
    const interesting = [
      ...queries.filter(q => q.description?.includes('beta') || q.description?.includes('new')),
      ...mutations.filter(m => m.description?.includes('beta') || m.description?.includes('new'))
    ];
    
    if (interesting.length > 0) {
      console.log(`🆕 New/Beta features discovered:`);
      interesting.forEach(feature => {
        console.log(`   - ${feature.name}: ${feature.description}`);
      });
    }
  }

  /**
   * Execute query/mutation with advanced features
   */
  async execute(query, variables = {}, options = {}) {
    // Wait for available slot
    await this.waitForSlot();
    
    const startTime = Date.now();
    this.concurrentRequests++;
    this.metrics.totalRequests++;
    
    try {
      // Parse query to extract information
      const ast = typeof query === 'string' ? parse(query) : query;
      
      // Apply optimizations
      const optimizedQuery = this.optimizeQuery(ast, options);
      
      // Add fragments if any
      const queryWithFragments = this.includeFragments(optimizedQuery);
      
      // Execute with retry logic
      const result = await this.executeWithRetry(
        print(queryWithFragments),
        variables,
        options.retries || 3
      );
      
      // Track metrics
      this.metrics.totalTime += Date.now() - startTime;
      
      // Process result
      return this.processResult(result, ast);
      
    } catch (error) {
      this.metrics.errors++;
      this.handleError(error);
      throw error;
    } finally {
      this.concurrentRequests--;
      this.processQueue();
    }
  }

  /**
   * Execute multiple operations in parallel
   */
  async executeParallel(operations) {
    const results = await Promise.all(
      operations.map(({ query, variables, options }) => 
        this.execute(query, variables, options)
      )
    );
    
    return results;
  }

  /**
   * Execute batch operations in a single request
   */
  async executeBatch(operations) {
    // Combine multiple operations into a single query
    const batchQuery = this.combineBatchOperations(operations);
    
    return await this.execute(batchQuery.query, batchQuery.variables);
  }

  /**
   * Subscribe to real-time data
   */
  async subscribe(subscription, variables = {}, options = {}) {
    if (!this.wsClient) {
      await this.initializeWebSocket();
    }
    
    const ast = typeof subscription === 'string' ? parse(subscription) : subscription;
    
    return new Promise((resolve, reject) => {
      const sub = this.wsClient.request({
        query: print(ast),
        variables,
        ...options
      }).subscribe({
        next: (data) => {
          this.emit('subscription-data', { subscription: ast, data });
          if (options.onData) options.onData(data);
        },
        error: (error) => {
          this.emit('subscription-error', { subscription: ast, error });
          if (options.onError) options.onError(error);
          reject(error);
        },
        complete: () => {
          this.emit('subscription-complete', { subscription: ast });
          if (options.onComplete) options.onComplete();
        }
      });
      
      resolve(sub);
    });
  }

  /**
   * Stream large result sets
   */
  async *stream(query, variables = {}, options = {}) {
    const pageSize = options.pageSize || 1000;
    let cursor = null;
    let hasMore = true;
    
    while (hasMore) {
      // Add pagination to query
      const paginatedQuery = this.addPagination(query, cursor, pageSize);
      
      const result = await this.execute(paginatedQuery, variables);
      
      // Extract data and cursor
      const { data, nextCursor } = this.extractPageData(result);
      
      yield data;
      
      cursor = nextCursor;
      hasMore = !!cursor;
    }
  }

  /**
   * Register reusable fragments
   */
  registerFragment(name, fragment) {
    const ast = typeof fragment === 'string' ? parse(fragment) : fragment;
    this.fragments.set(name, ast);
  }

  /**
   * Build type-safe query
   */
  buildQuery() {
    return new QueryBuilder(this.schema, this);
  }

  /**
   * Optimize query based on schema knowledge
   */
  optimizeQuery(ast, options = {}) {
    return visit(ast, {
      Field(node) {
        // Remove deprecated fields unless explicitly requested
        if (!options.includeDeprecated) {
          const type = this.getFieldType(node);
          if (type?.isDeprecated) {
            return null;
          }
        }
        
        // Add field aliases for better organization
        if (options.autoAlias && node.name.value.includes('_')) {
          return {
            ...node,
            alias: {
              kind: 'Name',
              value: this.camelCase(node.name.value)
            }
          };
        }
        
        return node;
      },
      
      SelectionSet(node) {
        // Remove duplicate selections
        const seen = new Set();
        const selections = node.selections.filter(selection => {
          const key = this.getSelectionKey(selection);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        return { ...node, selections };
      }
    });
  }

  /**
   * Initialize WebSocket connection for subscriptions
   */
  async initializeWebSocket() {
    this.wsClient = new SubscriptionClient(
      this.wsEndpoint,
      {
        reconnect: true,
        reconnectionAttempts: 10,
        connectionParams: {
          'API-Key': this.apiKey
        },
        connectionCallback: (error) => {
          if (error) {
            console.error('WebSocket connection error:', error);
            this.emit('ws-error', error);
          } else {
            console.log('✅ WebSocket connected');
            this.emit('ws-connected');
          }
        }
      },
      WebSocket
    );
    
    // Set up event handlers
    this.wsClient.on('connected', () => this.emit('ws-connected'));
    this.wsClient.on('reconnected', () => this.emit('ws-reconnected'));
    this.wsClient.on('disconnected', () => this.emit('ws-disconnected'));
    this.wsClient.on('error', (error) => this.emit('ws-error', error));
  }

  /**
   * Advanced error handling
   */
  handleError(error) {
    // Extract GraphQL errors
    if (error.response?.errors) {
      const errors = error.response.errors;
      
      // Check for specific error types
      errors.forEach(err => {
        if (err.message?.includes('rate limit')) {
          this.emit('rate-limit', err);
        } else if (err.message?.includes('timeout')) {
          this.emit('timeout', err);
        } else if (err.extensions?.code === 'UNAUTHENTICATED') {
          this.emit('auth-error', err);
        }
      });
      
      // Create detailed error
      const detailedError = new Error(
        `GraphQL Error: ${errors.map(e => e.message).join(', ')}`
      );
      detailedError.graphQLErrors = errors;
      detailedError.requestId = error.response.headers?.['x-request-id'];
      
      throw detailedError;
    }
    
    // Network or other errors
    throw error;
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(query, variables, retries = 3) {
    let lastError;
    
    for (let i = 0; i <= retries; i++) {
      try {
        return await this.httpClient.request(query, variables);
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }
        
        // Exponential backoff
        if (i < retries) {
          const delay = Math.min(1000 * Math.pow(2, i), 10000);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Helper methods
   */
  
  async waitForSlot() {
    while (this.concurrentRequests >= this.maxConcurrent) {
      await this.delay(100);
    }
  }
  
  processQueue() {
    if (this.requestQueue.length > 0 && this.concurrentRequests < this.maxConcurrent) {
      const next = this.requestQueue.shift();
      next();
    }
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  includeFragments(ast) {
    // Include registered fragments in query
    const fragmentDefinitions = Array.from(this.fragments.values());
    
    return {
      kind: 'Document',
      definitions: [...ast.definitions, ...fragmentDefinitions]
    };
  }
  
  processResult(result, ast) {
    // Add metadata
    const processed = {
      data: result,
      metadata: {
        requestId: result.__requestId,
        timestamp: new Date().toISOString(),
        query: print(ast)
      }
    };
    
    return processed;
  }
  
  combineBatchOperations(operations) {
    // Combine multiple operations into a single document
    const combinedQuery = {
      kind: 'Document',
      definitions: []
    };
    
    const combinedVariables = {};
    
    operations.forEach((op, index) => {
      const ast = parse(op.query);
      
      // Rename operation to avoid conflicts
      ast.definitions.forEach(def => {
        if (def.kind === 'OperationDefinition') {
          def.name = { kind: 'Name', value: `op${index}` };
          
          // Prefix variable names
          def.variableDefinitions?.forEach(varDef => {
            const oldName = varDef.variable.name.value;
            const newName = `op${index}_${oldName}`;
            varDef.variable.name.value = newName;
            
            // Update variable references
            this.renameVariableReferences(def, oldName, newName);
            
            // Update variables object
            if (op.variables?.[oldName] !== undefined) {
              combinedVariables[newName] = op.variables[oldName];
            }
          });
        }
      });
      
      combinedQuery.definitions.push(...ast.definitions);
    });
    
    return {
      query: combinedQuery,
      variables: combinedVariables
    };
  }
  
  renameVariableReferences(node, oldName, newName) {
    visit(node, {
      Variable(varNode) {
        if (varNode.name.value === oldName) {
          varNode.name.value = newName;
        }
      }
    });
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      averageTime: this.metrics.totalTime / this.metrics.totalRequests || 0,
      errorRate: this.metrics.errors / this.metrics.totalRequests || 0,
      cacheHitRate: this.metrics.cacheHits / this.metrics.totalRequests || 0
    };
  }
}

/**
 * Type-safe query builder
 */
class QueryBuilder {
  constructor(schema, client) {
    this.schema = schema;
    this.client = client;
    this.selections = [];
    this.variables = {};
    this.fragments = [];
  }
  
  select(fields) {
    this.selections.push(...fields);
    return this;
  }
  
  where(conditions) {
    // Convert conditions to GraphQL arguments
    this.arguments = conditions;
    return this;
  }
  
  withFragment(name) {
    this.fragments.push(name);
    return this;
  }
  
  build() {
    // Build type-safe query
    return {
      query: this.constructQuery(),
      variables: this.variables
    };
  }
  
  execute() {
    const { query, variables } = this.build();
    return this.client.execute(query, variables);
  }
}

module.exports = NerdGraphClient;