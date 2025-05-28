/**
 * NRQL Smart Auto-completion System
 * Provides intelligent, context-aware suggestions for NRQL queries
 */

class NRQLAutoComplete {
  constructor() {
    this.parser = new NRQLParser();
    this.suggester = new IntelligentSuggester();
    this.learningEngine = new PatternLearner();
    
    // Pre-loaded knowledge base
    this.knowledge = {
      functions: [
        { name: 'average', alias: 'avg', description: 'Average of values', usage: 'average(metric)' },
        { name: 'sum', description: 'Sum of values', usage: 'sum(metric)' },
        { name: 'min', description: 'Minimum value', usage: 'min(metric)' },
        { name: 'max', description: 'Maximum value', usage: 'max(metric)' },
        { name: 'count', description: 'Count of events', usage: 'count(*)' },
        { name: 'uniqueCount', description: 'Count of unique values', usage: 'uniqueCount(attribute)' },
        { name: 'percentile', description: 'Percentile calculation', usage: 'percentile(metric, 50, 90, 95, 99)' },
        { name: 'rate', description: 'Rate of change', usage: 'rate(metric, interval)' },
        { name: 'derivative', description: 'Rate of change over time', usage: 'derivative(metric)' },
        { name: 'latest', description: 'Most recent value', usage: 'latest(metric)' },
        { name: 'stddev', description: 'Standard deviation', usage: 'stddev(metric)' },
        { name: 'histogram', description: 'Create histogram', usage: 'histogram(metric, buckets)' },
        { name: 'filter', description: 'Conditional counting', usage: 'filter(count(*), WHERE condition)' },
        { name: 'funnel', description: 'Conversion funnel', usage: 'funnel(event1, event2, event3)' },
        { name: 'aparse', description: 'Advanced parsing', usage: 'aparse(string, pattern)' },
        { name: 'PREDICT', description: 'Predictive analytics', usage: 'PREDICT(metric, duration)', isNew: true },
        { name: 'anomaly', description: 'Anomaly detection', usage: 'anomaly(metric)', isNew: true }
      ],
      
      clauses: [
        { name: 'SELECT', description: 'Choose data to retrieve' },
        { name: 'FROM', description: 'Specify data source' },
        { name: 'WHERE', description: 'Filter conditions' },
        { name: 'FACET', description: 'Group by dimensions' },
        { name: 'SINCE', description: 'Time range start' },
        { name: 'UNTIL', description: 'Time range end' },
        { name: 'LIMIT', description: 'Limit results' },
        { name: 'TIMESERIES', description: 'Time series data' },
        { name: 'COMPARE WITH', description: 'Compare time periods' },
        { name: 'AS', description: 'Alias results' },
        { name: 'WITH', description: 'Additional options' }
      ],
      
      sources: [
        { name: 'Metric', description: 'OpenTelemetry metrics' },
        { name: 'SystemSample', description: 'System metrics' },
        { name: 'ProcessSample', description: 'Process metrics' },
        { name: 'NetworkSample', description: 'Network metrics' },
        { name: 'StorageSample', description: 'Storage metrics' },
        { name: 'Transaction', description: 'APM transactions' },
        { name: 'TransactionError', description: 'APM errors' },
        { name: 'Log', description: 'Log events' },
        { name: 'PageView', description: 'Browser page views' },
        { name: 'PageAction', description: 'Browser actions' },
        { name: 'MobileSession', description: 'Mobile app sessions' },
        { name: 'SyntheticCheck', description: 'Synthetic monitoring' },
        { name: 'NrDailyUsage', description: 'Usage data' }
      ],
      
      timeRanges: [
        '1 minute ago', '5 minutes ago', '15 minutes ago', '30 minutes ago',
        '1 hour ago', '3 hours ago', '6 hours ago', '12 hours ago',
        '1 day ago', '2 days ago', '3 days ago', '7 days ago',
        '2 weeks ago', '1 month ago', '3 months ago', '6 months ago'
      ],
      
      operators: [
        '=', '!=', '>', '<', '>=', '<=',
        'LIKE', 'NOT LIKE', 'IN', 'NOT IN',
        'IS NULL', 'IS NOT NULL', 'BETWEEN'
      ]
    };
    
    // Common patterns learned from usage
    this.commonPatterns = [
      'SELECT average(cpuPercent) FROM SystemSample SINCE 1 hour ago',
      'SELECT count(*) FROM Transaction WHERE appName = \'{app}\' SINCE 1 day ago',
      'SELECT percentile(duration, 50, 90, 95, 99) FROM Transaction FACET appName SINCE 1 hour ago',
      'SELECT rate(count(*), 1 minute) FROM Transaction TIMESERIES SINCE 1 hour ago',
      'SELECT uniqueCount(user) FROM PageView FACET pageUrl SINCE 1 day ago'
    ];
  }

  /**
   * Get suggestions based on current query and cursor position
   */
  async getSuggestions(query, cursorPosition) {
    const context = this.parser.getContext(query, cursorPosition);
    let suggestions = [];
    
    switch (context.expecting) {
      case 'function':
        suggestions = this.suggestFunctions(context);
        break;
      
      case 'metric':
        suggestions = await this.suggestMetrics(context);
        break;
      
      case 'source':
        suggestions = this.suggestSources(context);
        break;
      
      case 'clause':
        suggestions = this.suggestClauses(context);
        break;
      
      case 'operator':
        suggestions = this.suggestOperators(context);
        break;
      
      case 'timeRange':
        suggestions = this.suggestTimeRanges(context);
        break;
      
      case 'attribute':
        suggestions = await this.suggestAttributes(context);
        break;
      
      default:
        suggestions = this.suggestGeneral(context);
    }
    
    // Learn from selection
    this.trackSuggestion(query, context, suggestions);
    
    return suggestions;
  }

  suggestFunctions(context) {
    const { partial, previousToken } = context;
    
    let functions = this.knowledge.functions;
    
    // Filter by partial match
    if (partial) {
      functions = functions.filter(f => 
        f.name.toLowerCase().startsWith(partial.toLowerCase()) ||
        (f.alias && f.alias.toLowerCase().startsWith(partial.toLowerCase()))
      );
    }
    
    // Sort by relevance
    functions = this.rankByRelevance(functions, context);
    
    return functions.map(f => ({
      type: 'function',
      value: f.name,
      label: f.name,
      description: f.description,
      usage: f.usage,
      isNew: f.isNew,
      score: this.calculateScore(f, context)
    }));
  }

  async suggestMetrics(context) {
    const { partial, source } = context;
    
    // Get available metrics based on source
    let metrics = await this.fetchAvailableMetrics(source);
    
    // Filter by partial match
    if (partial) {
      metrics = metrics.filter(m => 
        m.toLowerCase().includes(partial.toLowerCase())
      );
    }
    
    // Add commonly used metrics
    const commonMetrics = this.learningEngine.getCommonMetrics(source);
    metrics = [...new Set([...commonMetrics, ...metrics])];
    
    return metrics.map(m => ({
      type: 'metric',
      value: m,
      label: m,
      description: this.getMetricDescription(m),
      usage: `average(${m})`,
      score: this.calculateMetricScore(m, context)
    }));
  }

  suggestSources(context) {
    const { partial } = context;
    
    let sources = this.knowledge.sources;
    
    if (partial) {
      sources = sources.filter(s => 
        s.name.toLowerCase().startsWith(partial.toLowerCase())
      );
    }
    
    return sources.map(s => ({
      type: 'source',
      value: s.name,
      label: s.name,
      description: s.description,
      score: this.calculateSourceScore(s, context)
    }));
  }

  suggestClauses(context) {
    const { query, partial } = context;
    const usedClauses = this.parser.getUsedClauses(query);
    
    let clauses = this.knowledge.clauses.filter(c => 
      !usedClauses.includes(c.name) || c.name === 'WHERE'
    );
    
    if (partial) {
      clauses = clauses.filter(c => 
        c.name.toLowerCase().startsWith(partial.toLowerCase())
      );
    }
    
    // Order by typical usage
    const clauseOrder = ['SELECT', 'FROM', 'WHERE', 'FACET', 'SINCE', 'TIMESERIES', 'LIMIT'];
    clauses.sort((a, b) => {
      const aIndex = clauseOrder.indexOf(a.name);
      const bIndex = clauseOrder.indexOf(b.name);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
    
    return clauses.map(c => ({
      type: 'clause',
      value: c.name,
      label: c.name,
      description: c.description
    }));
  }

  suggestOperators(context) {
    const { attribute } = context;
    
    let operators = this.knowledge.operators;
    
    // Filter operators based on attribute type
    if (attribute) {
      const attrType = this.getAttributeType(attribute);
      if (attrType === 'string') {
        operators = operators.filter(op => 
          ['=', '!=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL'].includes(op)
        );
      } else if (attrType === 'number') {
        operators = operators.filter(op => 
          ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN', 'IS NULL', 'IS NOT NULL'].includes(op)
        );
      }
    }
    
    return operators.map(op => ({
      type: 'operator',
      value: op,
      label: op
    }));
  }

  suggestTimeRanges(context) {
    const { partial } = context;
    
    let timeRanges = this.knowledge.timeRanges;
    
    // Add custom patterns
    const customPatterns = this.learningEngine.getCustomTimeRanges();
    timeRanges = [...timeRanges, ...customPatterns];
    
    if (partial) {
      timeRanges = timeRanges.filter(t => 
        t.toLowerCase().includes(partial.toLowerCase())
      );
    }
    
    return timeRanges.map(t => ({
      type: 'timeRange',
      value: t,
      label: t,
      description: this.getTimeRangeDescription(t)
    }));
  }

  async suggestAttributes(context) {
    const { source, partial } = context;
    
    // Get available attributes for the source
    let attributes = await this.fetchAvailableAttributes(source);
    
    if (partial) {
      attributes = attributes.filter(a => 
        a.toLowerCase().includes(partial.toLowerCase())
      );
    }
    
    return attributes.map(a => ({
      type: 'attribute',
      value: a,
      label: a,
      description: this.getAttributeDescription(a, source),
      dataType: this.getAttributeType(a)
    }));
  }

  suggestGeneral(context) {
    const suggestions = [];
    
    // Suggest complete query templates
    if (context.query.trim() === '') {
      this.commonPatterns.forEach(pattern => {
        suggestions.push({
          type: 'template',
          value: pattern,
          label: this.getPatternLabel(pattern),
          description: 'Common query pattern'
        });
      });
    }
    
    // Context-aware suggestions
    if (context.lastClause === 'SELECT' && !context.partial) {
      suggestions.push({
        type: 'hint',
        value: 'count(*)',
        label: 'count(*) - Count all events',
        description: 'Most common aggregation'
      });
    }
    
    return suggestions;
  }

  /**
   * Ranking and scoring methods
   */
  rankByRelevance(items, context) {
    const scores = new Map();
    
    items.forEach(item => {
      let score = 0;
      
      // Boost recently used
      if (this.learningEngine.isRecentlyUsed(item.name)) {
        score += 10;
      }
      
      // Boost frequently used
      score += this.learningEngine.getUsageFrequency(item.name) * 5;
      
      // Boost contextually relevant
      if (this.isContextuallyRelevant(item, context)) {
        score += 15;
      }
      
      // Boost new features
      if (item.isNew) {
        score += 5;
      }
      
      scores.set(item, score);
    });
    
    return items.sort((a, b) => scores.get(b) - scores.get(a));
  }

  calculateScore(item, context) {
    let score = 0;
    
    // Exact match
    if (item.name.toLowerCase() === context.partial?.toLowerCase()) {
      score += 100;
    }
    
    // Starts with
    if (item.name.toLowerCase().startsWith(context.partial?.toLowerCase() || '')) {
      score += 50;
    }
    
    // Usage patterns
    score += this.learningEngine.getContextualScore(item.name, context);
    
    return score;
  }

  calculateMetricScore(metric, context) {
    let score = 0;
    
    // Commonly used with current function
    if (context.function) {
      score += this.learningEngine.getMetricFunctionScore(metric, context.function);
    }
    
    // Recently used
    if (this.learningEngine.isRecentlyUsedMetric(metric)) {
      score += 20;
    }
    
    return score;
  }

  calculateSourceScore(source, context) {
    return this.learningEngine.getSourceUsageScore(source.name);
  }

  /**
   * Learning and pattern tracking
   */
  trackSuggestion(query, context, suggestions) {
    this.learningEngine.track({
      query,
      context,
      suggestions,
      timestamp: Date.now()
    });
  }

  onSuggestionSelected(suggestion, query, context) {
    this.learningEngine.recordSelection({
      suggestion,
      query,
      context,
      timestamp: Date.now()
    });
  }

  /**
   * Helper methods
   */
  isContextuallyRelevant(item, context) {
    // Check if function is relevant to current source
    if (context.source === 'SystemSample' && 
        ['average', 'max', 'min', 'rate'].includes(item.name)) {
      return true;
    }
    
    if (context.source === 'Transaction' && 
        ['percentile', 'histogram', 'count'].includes(item.name)) {
      return true;
    }
    
    return false;
  }

  getMetricDescription(metric) {
    const descriptions = {
      'cpuPercent': 'CPU usage percentage',
      'memoryUsedPercent': 'Memory usage percentage',
      'diskUsedPercent': 'Disk usage percentage',
      'networkReceiveBytesPerSecond': 'Network receive rate',
      'duration': 'Transaction duration in ms',
      'errorRate': 'Error rate percentage'
    };
    
    return descriptions[metric] || metric;
  }

  getTimeRangeDescription(timeRange) {
    const match = timeRange.match(/(\d+)\s+(\w+)/);
    if (match) {
      const [, num, unit] = match;
      return `Last ${num} ${unit}`;
    }
    return timeRange;
  }

  getAttributeDescription(attribute, source) {
    const descriptions = {
      'appName': 'Application name',
      'host': 'Host name',
      'entityGuid': 'Entity unique identifier',
      'errorMessage': 'Error message text',
      'userAgent': 'Browser user agent',
      'pageUrl': 'Page URL'
    };
    
    return descriptions[attribute] || attribute;
  }

  getAttributeType(attribute) {
    const stringAttrs = ['appName', 'host', 'errorMessage', 'userAgent', 'pageUrl'];
    const numberAttrs = ['duration', 'cpuPercent', 'memoryUsedPercent'];
    
    if (stringAttrs.includes(attribute)) return 'string';
    if (numberAttrs.includes(attribute)) return 'number';
    
    // Guess based on name
    if (attribute.includes('Percent') || attribute.includes('Count') || 
        attribute.includes('Size') || attribute.includes('Duration')) {
      return 'number';
    }
    
    return 'string';
  }

  getPatternLabel(pattern) {
    if (pattern.includes('cpuPercent')) return 'CPU Usage Query';
    if (pattern.includes('Transaction')) return 'Transaction Performance';
    if (pattern.includes('PageView')) return 'Page View Analytics';
    return 'Query Template';
  }

  async fetchAvailableMetrics(source) {
    // In real implementation, this would query NerdGraph
    // For now, return common metrics based on source
    const metricsBySource = {
      'SystemSample': [
        'cpuPercent', 'memoryUsedPercent', 'diskUsedPercent',
        'networkReceiveBytesPerSecond', 'networkTransmitBytesPerSecond'
      ],
      'ProcessSample': [
        'cpuPercent', 'memoryResidentSizeBytes', 'ioReadBytesPerSecond',
        'ioWriteBytesPerSecond', 'threadCount'
      ],
      'Transaction': [
        'duration', 'databaseDuration', 'externalDuration',
        'queueDuration', 'webDuration'
      ],
      'Metric': [
        'system.cpu.usage', 'system.memory.usage', 'system.disk.usage',
        'application.response.time', 'application.error.rate'
      ]
    };
    
    return metricsBySource[source] || [];
  }

  async fetchAvailableAttributes(source) {
    // In real implementation, this would query NerdGraph
    const attributesBySource = {
      'SystemSample': ['entityGuid', 'hostname', 'agentName'],
      'Transaction': ['appName', 'name', 'host', 'request.uri'],
      'PageView': ['pageUrl', 'userAgentName', 'userAgentOS', 'city'],
      'Log': ['message', 'level', 'service.name', 'hostname']
    };
    
    return attributesBySource[source] || ['entityGuid', 'timestamp'];
  }
}

/**
 * NRQL Parser for context analysis
 */
class NRQLParser {
  getContext(query, cursorPosition) {
    const beforeCursor = query.substring(0, cursorPosition);
    const afterCursor = query.substring(cursorPosition);
    
    // Tokenize query
    const tokens = this.tokenize(beforeCursor);
    const lastToken = tokens[tokens.length - 1] || '';
    const previousToken = tokens[tokens.length - 2] || '';
    
    // Determine what we're expecting
    const context = {
      query,
      beforeCursor,
      afterCursor,
      tokens,
      lastToken,
      previousToken,
      partial: this.getPartialToken(beforeCursor),
      expecting: this.determineExpectation(tokens, lastToken, previousToken),
      source: this.extractSource(tokens),
      function: this.extractFunction(tokens),
      lastClause: this.getLastClause(tokens)
    };
    
    return context;
  }

  tokenize(query) {
    // Simple tokenization - in production, use proper lexer
    return query.match(/\S+/g) || [];
  }

  getPartialToken(beforeCursor) {
    const match = beforeCursor.match(/(\S+)$/);
    return match ? match[1] : '';
  }

  determineExpectation(tokens, lastToken, previousToken) {
    const upperLast = lastToken.toUpperCase();
    const upperPrev = previousToken.toUpperCase();
    
    if (upperPrev === 'SELECT' || upperPrev === ',') {
      return 'function';
    }
    
    if (upperPrev === 'FROM') {
      return 'source';
    }
    
    if (upperPrev === 'WHERE' || upperPrev === 'AND' || upperPrev === 'OR') {
      return 'attribute';
    }
    
    if (upperPrev === 'SINCE' || upperPrev === 'UNTIL') {
      return 'timeRange';
    }
    
    if (upperPrev === 'FACET') {
      return 'attribute';
    }
    
    if (this.isAfterAttribute(tokens)) {
      return 'operator';
    }
    
    if (this.isStartOfClause(tokens)) {
      return 'clause';
    }
    
    return 'general';
  }

  extractSource(tokens) {
    const fromIndex = tokens.findIndex(t => t.toUpperCase() === 'FROM');
    if (fromIndex !== -1 && fromIndex < tokens.length - 1) {
      return tokens[fromIndex + 1];
    }
    return null;
  }

  extractFunction(tokens) {
    const selectIndex = tokens.findIndex(t => t.toUpperCase() === 'SELECT');
    if (selectIndex !== -1 && selectIndex < tokens.length - 1) {
      const nextToken = tokens[selectIndex + 1];
      const match = nextToken.match(/^(\w+)\(/);
      return match ? match[1] : null;
    }
    return null;
  }

  getLastClause(tokens) {
    const clauses = ['SELECT', 'FROM', 'WHERE', 'FACET', 'SINCE', 'UNTIL', 'LIMIT'];
    
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (clauses.includes(tokens[i].toUpperCase())) {
        return tokens[i].toUpperCase();
      }
    }
    
    return null;
  }

  getUsedClauses(query) {
    const clauses = ['SELECT', 'FROM', 'WHERE', 'FACET', 'SINCE', 'UNTIL', 
                     'LIMIT', 'TIMESERIES', 'COMPARE WITH'];
    const used = [];
    
    clauses.forEach(clause => {
      if (query.toUpperCase().includes(clause)) {
        used.push(clause);
      }
    });
    
    return used;
  }

  isAfterAttribute(tokens) {
    // Check if we're after an attribute name in WHERE clause
    // This is simplified - real implementation would be more robust
    return false;
  }

  isStartOfClause(tokens) {
    const lastToken = tokens[tokens.length - 1];
    if (!lastToken) return true;
    
    // Check if last token ends a clause
    return lastToken.match(/^\d+$/) || // number
           lastToken.match(/^'[^']*'$/) || // string
           lastToken.match(/ago$/i); // time range
  }
}

/**
 * Intelligent Suggester with learning capabilities
 */
class IntelligentSuggester {
  constructor() {
    this.patterns = new Map();
  }

  addPattern(query, usage) {
    if (!this.patterns.has(query)) {
      this.patterns.set(query, {
        count: 0,
        lastUsed: null,
        contexts: []
      });
    }
    
    const pattern = this.patterns.get(query);
    pattern.count++;
    pattern.lastUsed = Date.now();
    pattern.contexts.push(usage);
  }
}

/**
 * Pattern Learning Engine
 */
class PatternLearner {
  constructor() {
    this.usage = this.loadUsageData();
  }

  loadUsageData() {
    // Load from localStorage in browser
    if (typeof window !== 'undefined' && window.localStorage) {
      const data = localStorage.getItem('nrql-usage-patterns');
      return data ? JSON.parse(data) : this.getDefaultData();
    }
    return this.getDefaultData();
  }

  getDefaultData() {
    return {
      functions: new Map(),
      metrics: new Map(),
      sources: new Map(),
      patterns: [],
      sessions: []
    };
  }

  track(data) {
    this.usage.sessions.push(data);
    this.saveUsageData();
  }

  recordSelection(data) {
    const { suggestion, context } = data;
    
    // Track function usage
    if (suggestion.type === 'function') {
      this.incrementUsage('functions', suggestion.value);
    }
    
    // Track metric usage
    if (suggestion.type === 'metric') {
      this.incrementUsage('metrics', suggestion.value);
      
      // Track metric-function pairs
      if (context.function) {
        this.trackPair('metric-function', suggestion.value, context.function);
      }
    }
    
    // Track source usage
    if (suggestion.type === 'source') {
      this.incrementUsage('sources', suggestion.value);
    }
    
    this.saveUsageData();
  }

  incrementUsage(category, item) {
    if (!this.usage[category].has(item)) {
      this.usage[category].set(item, { count: 0, lastUsed: null });
    }
    
    const data = this.usage[category].get(item);
    data.count++;
    data.lastUsed = Date.now();
  }

  trackPair(category, item1, item2) {
    const key = `${item1}:${item2}`;
    this.incrementUsage(category, key);
  }

  isRecentlyUsed(item) {
    const data = this.usage.functions.get(item);
    if (!data) return false;
    
    const hourAgo = Date.now() - (60 * 60 * 1000);
    return data.lastUsed > hourAgo;
  }

  isRecentlyUsedMetric(metric) {
    const data = this.usage.metrics.get(metric);
    if (!data) return false;
    
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    return data.lastUsed > dayAgo;
  }

  getUsageFrequency(item) {
    const data = this.usage.functions.get(item);
    return data ? data.count : 0;
  }

  getContextualScore(item, context) {
    // Calculate score based on context
    let score = 0;
    
    // Check if commonly used with current source
    if (context.source) {
      const pairKey = `${item}:${context.source}`;
      const pairData = this.usage['function-source']?.get(pairKey);
      if (pairData) {
        score += pairData.count * 2;
      }
    }
    
    return score;
  }

  getMetricFunctionScore(metric, func) {
    const pairKey = `${metric}:${func}`;
    const data = this.usage['metric-function']?.get(pairKey);
    return data ? data.count * 3 : 0;
  }

  getSourceUsageScore(source) {
    const data = this.usage.sources.get(source);
    return data ? data.count : 0;
  }

  getCommonMetrics(source) {
    // Return commonly used metrics for this source
    const metrics = [];
    
    this.usage.metrics.forEach((data, metric) => {
      if (data.count > 5) {
        metrics.push({ metric, score: data.count });
      }
    });
    
    return metrics
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(m => m.metric);
  }

  getCustomTimeRanges() {
    // Extract custom time ranges from patterns
    const customRanges = new Set();
    
    this.usage.sessions.forEach(session => {
      const match = session.query.match(/SINCE\s+([^A-Z]+?)(?:\s+(?:UNTIL|LIMIT|TIMESERIES|$))/i);
      if (match && match[1]) {
        customRanges.add(match[1].trim());
      }
    });
    
    return Array.from(customRanges);
  }

  saveUsageData() {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Convert Maps to arrays for serialization
      const serializable = {
        functions: Array.from(this.usage.functions.entries()),
        metrics: Array.from(this.usage.metrics.entries()),
        sources: Array.from(this.usage.sources.entries()),
        patterns: this.usage.patterns,
        sessions: this.usage.sessions.slice(-100) // Keep last 100 sessions
      };
      
      localStorage.setItem('nrql-usage-patterns', JSON.stringify(serializable));
    }
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NRQLAutoComplete;
}