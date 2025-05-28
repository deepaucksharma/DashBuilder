/**
 * Predictive Data Fetcher
 * Intelligently prefetches data based on user patterns
 */

class PredictiveFetcher {
  constructor(nerdGraphClient) {
    this.client = nerdGraphClient;
    this.patterns = new UserPatternAnalyzer();
    this.prefetchQueue = new PriorityQueue();
    this.cache = new PrefetchCache();
    this.activeRequests = new Map();
    
    // Configuration
    this.config = {
      maxConcurrent: 3,
      prefetchThreshold: 0.7,
      cacheSize: 50,
      analysisWindow: 1000, // Last 1000 actions
      batchDelay: 100
    };
    
    // Start prefetch worker
    this.startPrefetchWorker();
  }

  /**
   * Track user action and predict next needs
   */
  async trackAction(action) {
    // Record the action
    this.patterns.recordAction(action);
    
    // Get predictions based on current context
    const predictions = this.patterns.predict(action.context);
    
    // Queue high-probability predictions
    predictions.forEach(prediction => {
      if (prediction.probability > this.config.prefetchThreshold) {
        this.queuePrefetch(prediction);
      }
    });
    
    // Learn from the action
    this.patterns.learn(action);
  }

  /**
   * Queue a prediction for prefetching
   */
  queuePrefetch(prediction) {
    // Check if already cached
    if (this.cache.has(prediction.query)) {
      return;
    }
    
    // Check if already being fetched
    if (this.activeRequests.has(prediction.query)) {
      return;
    }
    
    // Add to priority queue
    this.prefetchQueue.enqueue({
      query: prediction.query,
      priority: prediction.probability,
      context: prediction.context,
      timestamp: Date.now()
    });
  }

  /**
   * Start the prefetch worker
   */
  startPrefetchWorker() {
    setInterval(() => {
      this.processPrefetchQueue();
    }, this.config.batchDelay);
  }

  /**
   * Process prefetch queue
   */
  async processPrefetchQueue() {
    const concurrent = this.activeRequests.size;
    
    if (concurrent >= this.config.maxConcurrent) {
      return; // Already at max concurrency
    }
    
    const toFetch = Math.min(
      this.config.maxConcurrent - concurrent,
      this.prefetchQueue.size()
    );
    
    const batch = [];
    for (let i = 0; i < toFetch; i++) {
      const item = this.prefetchQueue.dequeue();
      if (item) {
        batch.push(item);
      }
    }
    
    // Execute batch
    batch.forEach(item => {
      this.executePrefetch(item);
    });
  }

  /**
   * Execute a prefetch request
   */
  async executePrefetch(item) {
    const { query, context } = item;
    
    // Mark as active
    this.activeRequests.set(query, {
      startTime: Date.now(),
      context
    });
    
    try {
      // Execute query
      const result = await this.client.query(query);
      
      // Cache result
      this.cache.set(query, result);
      
      // Emit event for UI update
      this.emitPrefetchComplete(query, result);
      
    } catch (error) {
      console.error('Prefetch error:', error);
    } finally {
      // Remove from active
      this.activeRequests.delete(query);
    }
  }

  /**
   * Get data (from cache or fetch)
   */
  async getData(query, options = {}) {
    // Check cache first
    const cached = this.cache.get(query);
    if (cached && !options.fresh) {
      return cached;
    }
    
    // Check if being prefetched
    if (this.activeRequests.has(query)) {
      // Wait for prefetch to complete
      return this.waitForPrefetch(query);
    }
    
    // Fetch directly
    return this.client.query(query);
  }

  /**
   * Wait for an active prefetch to complete
   */
  async waitForPrefetch(query) {
    const maxWait = 5000; // 5 seconds
    const checkInterval = 100;
    let waited = 0;
    
    while (this.activeRequests.has(query) && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    
    // Check cache
    const cached = this.cache.get(query);
    if (cached) {
      return cached;
    }
    
    // If still not ready, fetch directly
    return this.client.query(query);
  }

  /**
   * Emit prefetch complete event
   */
  emitPrefetchComplete(query, result) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('prefetch:complete', {
        detail: { query, result }
      }));
    }
  }

  /**
   * Get prefetch statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size(),
      cacheHitRate: this.cache.getHitRate(),
      queueSize: this.prefetchQueue.size(),
      activeRequests: this.activeRequests.size,
      patterns: this.patterns.getStats()
    };
  }
}

/**
 * User Pattern Analyzer
 */
class UserPatternAnalyzer {
  constructor() {
    this.sequences = [];
    this.transitions = new Map();
    this.contextPatterns = new Map();
    this.timePatterns = new TimePatternAnalyzer();
    
    // Load saved patterns
    this.loadPatterns();
  }

  /**
   * Record a user action
   */
  recordAction(action) {
    const record = {
      type: action.type,
      target: action.target,
      context: action.context,
      timestamp: Date.now(),
      dayOfWeek: new Date().getDay(),
      hourOfDay: new Date().getHours()
    };
    
    // Add to sequences
    this.sequences.push(record);
    
    // Keep only recent actions
    if (this.sequences.length > 1000) {
      this.sequences.shift();
    }
    
    // Update transition matrix
    if (this.sequences.length > 1) {
      const prev = this.sequences[this.sequences.length - 2];
      this.updateTransitions(prev, record);
    }
    
    // Update context patterns
    this.updateContextPatterns(record);
    
    // Update time patterns
    this.timePatterns.record(record);
    
    // Save periodically
    if (this.sequences.length % 10 === 0) {
      this.savePatterns();
    }
  }

  /**
   * Predict next actions based on context
   */
  predict(context) {
    const predictions = [];
    
    // Get transition-based predictions
    const lastAction = this.sequences[this.sequences.length - 1];
    if (lastAction) {
      const transitionPredictions = this.getTransitionPredictions(lastAction);
      predictions.push(...transitionPredictions);
    }
    
    // Get context-based predictions
    const contextPredictions = this.getContextPredictions(context);
    predictions.push(...contextPredictions);
    
    // Get time-based predictions
    const timePredictions = this.timePatterns.predict();
    predictions.push(...timePredictions);
    
    // Combine and rank predictions
    return this.combinePredictions(predictions);
  }

  /**
   * Learn from user action
   */
  learn(action) {
    // Reinforce successful patterns
    if (action.success) {
      this.reinforcePattern(action);
    }
  }

  /**
   * Update transition matrix
   */
  updateTransitions(from, to) {
    const key = this.getTransitionKey(from);
    
    if (!this.transitions.has(key)) {
      this.transitions.set(key, new Map());
    }
    
    const destinations = this.transitions.get(key);
    const destKey = this.getTransitionKey(to);
    
    destinations.set(destKey, (destinations.get(destKey) || 0) + 1);
  }

  /**
   * Update context patterns
   */
  updateContextPatterns(action) {
    const contextKey = this.getContextKey(action.context);
    
    if (!this.contextPatterns.has(contextKey)) {
      this.contextPatterns.set(contextKey, new Map());
    }
    
    const actions = this.contextPatterns.get(contextKey);
    const actionKey = `${action.type}:${action.target}`;
    
    actions.set(actionKey, (actions.get(actionKey) || 0) + 1);
  }

  /**
   * Get transition-based predictions
   */
  getTransitionPredictions(lastAction) {
    const key = this.getTransitionKey(lastAction);
    const destinations = this.transitions.get(key);
    
    if (!destinations) return [];
    
    const total = Array.from(destinations.values()).reduce((a, b) => a + b, 0);
    
    return Array.from(destinations.entries())
      .map(([dest, count]) => ({
        query: this.reconstructQuery(dest),
        probability: count / total,
        type: 'transition',
        context: lastAction.context
      }))
      .filter(p => p.query)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5);
  }

  /**
   * Get context-based predictions
   */
  getContextPredictions(context) {
    const contextKey = this.getContextKey(context);
    const actions = this.contextPatterns.get(contextKey);
    
    if (!actions) return [];
    
    const total = Array.from(actions.values()).reduce((a, b) => a + b, 0);
    
    return Array.from(actions.entries())
      .map(([action, count]) => ({
        query: this.actionToQuery(action, context),
        probability: count / total * 0.8, // Slightly lower weight than transitions
        type: 'context',
        context
      }))
      .filter(p => p.query)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 3);
  }

  /**
   * Combine predictions from different sources
   */
  combinePredictions(predictions) {
    const combined = new Map();
    
    predictions.forEach(pred => {
      const existing = combined.get(pred.query);
      
      if (existing) {
        // Combine probabilities (weighted average)
        existing.probability = (existing.probability + pred.probability) / 2;
      } else {
        combined.set(pred.query, pred);
      }
    });
    
    return Array.from(combined.values())
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 10);
  }

  /**
   * Reinforce successful pattern
   */
  reinforcePattern(action) {
    // Find the pattern that led to this action
    const pattern = this.findPattern(action);
    
    if (pattern) {
      // Increase weight of this pattern
      pattern.weight = (pattern.weight || 1) * 1.1;
    }
  }

  /**
   * Helper methods
   */
  getTransitionKey(action) {
    return `${action.type}:${action.target}`;
  }

  getContextKey(context) {
    return `${context.dashboard}:${context.widget}:${context.view}`;
  }

  reconstructQuery(key) {
    // Reconstruct NRQL query from action key
    const [type, target] = key.split(':');
    
    if (type === 'metric') {
      return `SELECT average(${target}) FROM Metric SINCE 1 hour ago`;
    }
    
    if (type === 'dashboard') {
      return `{dashboard: "${target}"}`;
    }
    
    return null;
  }

  actionToQuery(actionKey, context) {
    const [type, target] = actionKey.split(':');
    
    if (type === 'metric') {
      return `SELECT average(${target}) FROM Metric WHERE ${context.filter || 'true'} SINCE ${context.timeRange || '1 hour ago'}`;
    }
    
    return null;
  }

  findPattern(action) {
    // Find matching pattern in recent sequences
    // Simplified implementation
    return null;
  }

  /**
   * Persistence
   */
  loadPatterns() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const saved = localStorage.getItem('user-patterns');
      if (saved) {
        const data = JSON.parse(saved);
        
        // Restore transitions
        if (data.transitions) {
          this.transitions = new Map(
            data.transitions.map(([k, v]) => [k, new Map(v)])
          );
        }
        
        // Restore context patterns
        if (data.contextPatterns) {
          this.contextPatterns = new Map(
            data.contextPatterns.map(([k, v]) => [k, new Map(v)])
          );
        }
      }
    } catch (error) {
      console.error('Error loading patterns:', error);
    }
  }

  savePatterns() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const data = {
        transitions: Array.from(this.transitions.entries()).map(([k, v]) => 
          [k, Array.from(v.entries())]
        ),
        contextPatterns: Array.from(this.contextPatterns.entries()).map(([k, v]) => 
          [k, Array.from(v.entries())]
        ),
        timestamp: Date.now()
      };
      
      localStorage.setItem('user-patterns', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving patterns:', error);
    }
  }

  getStats() {
    return {
      sequences: this.sequences.length,
      transitions: this.transitions.size,
      contexts: this.contextPatterns.size,
      timePatterns: this.timePatterns.getStats()
    };
  }
}

/**
 * Time Pattern Analyzer
 */
class TimePatternAnalyzer {
  constructor() {
    this.hourlyPatterns = new Array(24).fill(null).map(() => new Map());
    this.dailyPatterns = new Array(7).fill(null).map(() => new Map());
    this.records = [];
  }

  record(action) {
    const hour = action.hourOfDay;
    const day = action.dayOfWeek;
    const key = `${action.type}:${action.target}`;
    
    // Update hourly pattern
    this.hourlyPatterns[hour].set(key, 
      (this.hourlyPatterns[hour].get(key) || 0) + 1
    );
    
    // Update daily pattern
    this.dailyPatterns[day].set(key,
      (this.dailyPatterns[day].get(key) || 0) + 1
    );
    
    this.records.push(action);
    
    // Keep only recent records
    if (this.records.length > 1000) {
      this.records.shift();
    }
  }

  predict() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    const predictions = [];
    
    // Get hourly predictions
    const hourlyActions = this.hourlyPatterns[hour];
    if (hourlyActions.size > 0) {
      const total = Array.from(hourlyActions.values()).reduce((a, b) => a + b, 0);
      
      Array.from(hourlyActions.entries()).forEach(([action, count]) => {
        predictions.push({
          query: this.actionToQuery(action),
          probability: (count / total) * 0.6, // Time patterns have lower weight
          type: 'time-hourly',
          context: { hour, day }
        });
      });
    }
    
    // Get daily predictions
    const dailyActions = this.dailyPatterns[day];
    if (dailyActions.size > 0) {
      const total = Array.from(dailyActions.values()).reduce((a, b) => a + b, 0);
      
      Array.from(dailyActions.entries()).forEach(([action, count]) => {
        predictions.push({
          query: this.actionToQuery(action),
          probability: (count / total) * 0.4,
          type: 'time-daily',
          context: { hour, day }
        });
      });
    }
    
    return predictions;
  }

  actionToQuery(actionKey) {
    const [type, target] = actionKey.split(':');
    
    if (type === 'metric') {
      return `SELECT average(${target}) FROM Metric SINCE 1 hour ago`;
    }
    
    return null;
  }

  getStats() {
    return {
      records: this.records.length,
      hourlyPatterns: this.hourlyPatterns.filter(h => h.size > 0).length,
      dailyPatterns: this.dailyPatterns.filter(d => d.size > 0).length
    };
  }
}

/**
 * Priority Queue for prefetch requests
 */
class PriorityQueue {
  constructor() {
    this.items = [];
  }

  enqueue(item) {
    let added = false;
    
    for (let i = 0; i < this.items.length; i++) {
      if (item.priority > this.items[i].priority) {
        this.items.splice(i, 0, item);
        added = true;
        break;
      }
    }
    
    if (!added) {
      this.items.push(item);
    }
  }

  dequeue() {
    return this.items.shift();
  }

  size() {
    return this.items.length;
  }

  peek() {
    return this.items[0];
  }

  clear() {
    this.items = [];
  }
}

/**
 * Prefetch Cache
 */
class PrefetchCache {
  constructor(maxSize = 50, ttl = 300000) { // 5 minutes TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.hits = 0;
    this.misses = 0;
  }

  has(key) {
    if (this.cache.has(key)) {
      const item = this.cache.get(key);
      if (Date.now() - item.timestamp < this.ttl) {
        return true;
      }
      this.cache.delete(key);
    }
    return false;
  }

  get(key) {
    if (this.has(key)) {
      this.hits++;
      return this.cache.get(key).value;
    }
    
    this.misses++;
    return null;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  size() {
    return this.cache.size;
  }

  getHitRate() {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PredictiveFetcher;
}