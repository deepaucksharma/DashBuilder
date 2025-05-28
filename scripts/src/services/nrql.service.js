const { NerdGraphClient } = require('../core/api-client.js');
const { Cache } = require('../utils/cache.js');
const { logger } = require('../utils/logger.js');
const { 
  validateNRQLQuery, 
  extractEventTypeFromQuery, 
  extractAttributesFromQuery,
  isValidNRQLFunction,
  suggestCorrection,
  calculateQueryComplexity
} = require('../utils/validators.js');
const { NRQLError } = require('../utils/errors.js');
const { SchemaService } = require('./schema.service.js');

class NRQLService {
  constructor(config) {
    this.config = config;
    this.client = new NerdGraphClient(config);
    this.schemaService = new SchemaService(config);
    this.cache = new Cache({ 
      enabled: config.enableCache, 
      ttl: 300 // 5 minute cache for NRQL validation
    });
    
    // NRDOT v2: Performance optimization patterns
    this.optimizationPatterns = this.loadOptimizationPatterns();
  }

  // NRDOT v2: Load query optimization patterns
  loadOptimizationPatterns() {
    return {
      timeWindow: {
        pattern: /SINCE\s+(\d+)\s+(month|week)s?\s+ago/i,
        suggestion: 'Large time windows impact performance. Consider using shorter ranges or TIMESERIES with appropriate buckets.',
        severity: 'high'
      },
      highCardinalityFacet: {
        attributes: ['userId', 'sessionId', 'requestId', 'traceId', 'spanId'],
        suggestion: 'FACET on high-cardinality attributes can be expensive. Consider using LIMIT or aggregating data differently.',
        severity: 'high'
      },
      selectStar: {
        pattern: /SELECT\s+\*/i,
        suggestion: 'SELECT * retrieves all attributes. Select only required fields to reduce data transfer.',
        severity: 'medium'
      },
      missingLimit: {
        check: (query) => !query.match(/LIMIT/i) && !this.isAggregateQuery(query) && !query.match(/TIMESERIES/i),
        suggestion: 'Add LIMIT to non-aggregated queries to control result size.',
        severity: 'medium'
      },
      inefficientTimeseries: {
        pattern: /TIMESERIES\s+(\d+)\s+(second|minute)s?\s+.*SINCE\s+(\d+)\s+(day|week|month)s?\s+ago/i,
        check: (query, matches) => {
          if (!matches) return false;
          const bucketValue = parseInt(matches[1]);
          const bucketUnit = matches[2];
          const rangeValue = parseInt(matches[3]);
          const rangeUnit = matches[4];
          
          // Calculate approximate data points
          const bucketMinutes = bucketUnit === 'second' ? bucketValue / 60 : bucketValue;
          const rangeMinutes = rangeUnit === 'day' ? rangeValue * 1440 : 
                               rangeUnit === 'week' ? rangeValue * 10080 : 
                               rangeValue * 43200;
          
          return (rangeMinutes / bucketMinutes) > 1000; // More than 1000 data points
        },
        suggestion: 'Fine-grained TIMESERIES over long periods creates many data points. Use coarser buckets.',
        severity: 'high'
      }
    };
  }

  async validateQuery(query, options = {}) {
    const accountId = this.config.requireAccountId();
    
    try {
      validateNRQLQuery(query);
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        syntaxValid: false,
        suggestions: this.getSyntaxSuggestions(query),
        complexity: calculateQueryComplexity(query)
      };
    }

    const startTime = Date.now();
    
    try {
      const result = await this.client.nrql(accountId, query);
      const executionTime = Date.now() - startTime;
      
      const validation = {
        valid: true,
        syntaxValid: true,
        executionTime,
        resultCount: result.results.length,
        hasErrors: false,
        metadata: result.metadata,
        complexity: calculateQueryComplexity(query),
        performanceWarnings: this.checkPerformancePatterns(query)
      };

      // Check result count constraints
      if (options.minResults !== undefined && result.results.length < options.minResults) {
        validation.valid = false;
        validation.error = `Expected at least ${options.minResults} results, got ${result.results.length}`;
      }

      if (options.maxResults !== undefined && result.results.length > options.maxResults) {
        validation.valid = false;
        validation.error = `Expected at most ${options.maxResults} results, got ${result.results.length}`;
      }

      // Check for query warnings
      if (result.metadata?.messages?.length > 0) {
        validation.warnings = result.metadata.messages;
      }

      // NRDOT v2: Check execution time thresholds
      if (executionTime > 5000) {
        validation.performanceWarnings.push({
          type: 'slow_query',
          message: `Query took ${executionTime}ms to execute`,
          suggestion: 'Consider optimizing the query or reducing the time range'
        });
      }

      return validation;
    } catch (error) {
      const suggestions = await this.getQuerySuggestions(query, error);
      
      return {
        valid: false,
        syntaxValid: true, // Syntax was valid, execution failed
        error: error.message,
        hasErrors: true,
        suggestions,
        complexity: calculateQueryComplexity(query)
      };
    }
  }

  // NRDOT v2: Check for performance anti-patterns
  checkPerformancePatterns(query) {
    const warnings = [];
    
    Object.entries(this.optimizationPatterns).forEach(([key, pattern]) => {
      if (pattern.pattern) {
        const matches = query.match(pattern.pattern);
        if (matches && (!pattern.check || pattern.check(query, matches))) {
          warnings.push({
            type: key,
            severity: pattern.severity,
            message: pattern.suggestion
          });
        }
      } else if (pattern.check && pattern.check(query)) {
        warnings.push({
          type: key,
          severity: pattern.severity,
          message: pattern.suggestion
        });
      }
      
      // Check for high cardinality facets
      if (key === 'highCardinalityFacet') {
        const facetMatch = query.match(/FACET\s+(.+?)(?:\s+SINCE|\s+UNTIL|\s+LIMIT|\s*$)/i);
        if (facetMatch) {
          const facets = facetMatch[1].split(',').map(f => f.trim());
          const highCardFacets = facets.filter(f => 
            pattern.attributes.some(attr => f.toLowerCase().includes(attr.toLowerCase()))
          );
          
          if (highCardFacets.length > 0) {
            warnings.push({
              type: key,
              severity: pattern.severity,
              message: `${pattern.suggestion} Found: ${highCardFacets.join(', ')}`
            });
          }
        }
      }
    });
    
    return warnings;
  }

  async optimizeQuery(query) {
    const analysis = await this.analyzeQuery(query);
    const suggestions = [];
    let optimizedQuery = query;
    const performanceWarnings = this.checkPerformancePatterns(query);

    // NRDOT v2: Cost-aware optimizations
    const complexity = calculateQueryComplexity(query);
    
    // Add performance warnings as suggestions
    performanceWarnings.forEach(warning => {
      suggestions.push({
        type: 'performance',
        description: warning.message,
        impact: warning.severity === 'high' ? 'High performance improvement' : 'Moderate performance improvement',
        severity: warning.severity
      });
    });

    // Check for missing time window
    if (!query.match(/SINCE|UNTIL/i)) {
      suggestions.push({
        type: 'performance',
        description: 'Add a time window to limit data scanned',
        impact: 'High performance improvement',
        example: `${query} SINCE 1 hour ago`
      });
      optimizedQuery = `${optimizedQuery} SINCE 1 hour ago`;
    }

    // NRDOT v2: Process-specific optimizations
    if (analysis.eventType && analysis.eventType.toLowerCase().includes('process')) {
      // Check if querying all processes
      if (!query.match(/WHERE/i) || !query.match(/processDisplayName|processName/i)) {
        suggestions.push({
          type: 'cost',
          description: 'Consider filtering specific processes to reduce data volume',
          impact: 'Significant cost reduction',
          example: `${optimizedQuery} WHERE processDisplayName IN ('nginx', 'mysql', 'java')`
        });
      }
    }

    // Check for high cardinality facets
    if (analysis.facets?.length > 0) {
      for (const facet of analysis.facets) {
        try {
          const cardinality = await this.estimateAttributeCardinality(
            analysis.eventType, 
            facet
          );
          
          if (cardinality > 1000) {
            suggestions.push({
              type: 'performance',
              description: `FACET on '${facet}' has high cardinality (${cardinality}+ values)`,
              impact: 'Can cause slow queries and memory issues',
              example: `Consider using FACET cases() to bucket ${facet} values or add LIMIT`,
              severity: 'high'
            });
          }
        } catch (error) {
          logger.debug(`Failed to check cardinality for ${facet}: ${error.message}`);
        }
      }
    }

    // NRDOT v2: Suggest sampling for very large datasets
    if (complexity.score > 7 && !query.match(/LIMIT/i)) {
      const sampleRate = complexity.score > 10 ? 0.01 : 0.1;
      suggestions.push({
        type: 'performance',
        description: 'Query complexity is high. Consider sampling data',
        impact: 'Major performance improvement',
        example: `${query} WHERE sample(${sampleRate})`,
        severity: 'high'
      });
    }

    // Check for missing LIMIT on non-aggregated queries
    if (!query.match(/LIMIT/i) && !this.isAggregateQuery(query) && !query.match(/TIMESERIES/i)) {
      suggestions.push({
        type: 'performance',
        description: 'Add LIMIT to non-aggregated queries',
        impact: 'Prevents returning excessive results',
        example: `${query} LIMIT 100`
      });
      optimizedQuery = `${optimizedQuery} LIMIT 100`;
    }

    // NRDOT v2: Optimize SELECT * queries
    if (query.match(/SELECT\s+\*/i) && analysis.eventType) {
      try {
        const importantAttrs = await this.getImportantAttributes(analysis.eventType);
        if (importantAttrs.length > 0) {
          suggestions.push({
            type: 'performance',
            description: 'SELECT * retrieves all attributes. Consider selecting only important fields',
            impact: 'Reduces data transfer and processing',
            example: `SELECT ${importantAttrs.slice(0, 5).join(', ')} FROM ${analysis.eventType}`,
            severity: 'medium'
          });
        }
      } catch (error) {
        logger.debug(`Failed to get important attributes: ${error.message}`);
      }
    }

    return {
      originalQuery: query,
      optimizedQuery: optimizedQuery !== query ? optimizedQuery : null,
      suggestions,
      complexity,
      estimatedImprovement: this.estimateImprovement(suggestions),
      costImpact: this.estimateCostImpact(complexity, suggestions)
    };
  }

  // NRDOT v2: Estimate performance improvement
  estimateImprovement(suggestions) {
    const scores = {
      high: 3,
      medium: 2,
      low: 1
    };
    
    const totalScore = suggestions.reduce((sum, s) => 
      sum + (scores[s.severity] || 1), 0
    );
    
    if (totalScore >= 6) return 'Major improvement expected (50%+ faster)';
    if (totalScore >= 3) return 'Moderate improvement expected (20-50% faster)';
    if (totalScore > 0) return 'Minor improvement expected (5-20% faster)';
    return 'Query is already optimized';
  }

  // NRDOT v2: Estimate cost impact
  estimateCostImpact(complexity, suggestions) {
    const hasHighCardinalityFacet = suggestions.some(s => 
      s.description.includes('high cardinality')
    );
    
    const hasLargeTimeWindow = suggestions.some(s => 
      s.description.includes('Large time windows')
    );
    
    if (complexity.score > 10 || hasHighCardinalityFacet || hasLargeTimeWindow) {
      return {
        level: 'high',
        description: 'Query may consume significant resources',
        recommendation: 'Consider the suggested optimizations to reduce costs'
      };
    }
    
    if (complexity.score > 5) {
      return {
        level: 'medium',
        description: 'Query has moderate resource consumption',
        recommendation: 'Optimizations available but not critical'
      };
    }
    
    return {
      level: 'low',
      description: 'Query is cost-efficient',
      recommendation: 'No significant cost concerns'
    };
  }

  // NRDOT v2: Get important attributes for an event type
  async getImportantAttributes(eventType) {
    try {
      const schema = await this.schemaService.describeEventType(
        eventType, 
        '1 hour ago', 
        { includeDataTypes: true }
      );
      
      if (schema.attributeMetadata) {
        // Filter high importance attributes
        return Object.entries(schema.attributeMetadata)
          .filter(([_, meta]) => meta.importance === 'high')
          .map(([attr, _]) => attr)
          .slice(0, 10); // Limit to top 10
      }
      
      // Fallback to common important attributes
      return schema.attributes
        .filter(attr => {
          const lower = attr.toLowerCase();
          return lower.includes('error') || 
                 lower.includes('duration') ||
                 lower.includes('count') ||
                 lower.includes('name');
        })
        .slice(0, 10);
    } catch (error) {
      logger.debug(`Failed to get important attributes: ${error.message}`);
      return [];
    }
  }

  async explainQuery(query) {
    const analysis = await this.analyzeQuery(query);
    const complexity = calculateQueryComplexity(query);
    
    const explanation = {
      query,
      components: {
        action: analysis.action,
        eventType: analysis.eventType,
        attributes: analysis.attributes,
        conditions: analysis.conditions,
        facets: analysis.facets,
        timeWindow: analysis.timeWindow,
        limit: analysis.limit,
        orderBy: analysis.orderBy
      },
      complexity,
      warnings: [],
      executionPlan: await this.generateExecutionPlan(analysis),
      estimatedCost: this.estimateCostImpact(complexity, [])
    };

    // Performance warnings
    const perfWarnings = this.checkPerformancePatterns(query);
    explanation.warnings.push(...perfWarnings.map(w => w.message));

    // NRDOT v2: Additional warnings based on analysis
    if (analysis.facets?.length > 3) {
      explanation.warnings.push('Multiple FACETs increase query complexity exponentially');
    }

    if (!analysis.timeWindow) {
      explanation.warnings.push('No time window specified - will scan all available data');
    }

    if (analysis.attributes?.includes('*')) {
      explanation.warnings.push('SELECT * retrieves all attributes - consider selecting specific fields');
    }

    // Estimate data scan
    try {
      const dataVolume = await this.estimateDataScan(analysis);
      explanation.estimatedDataScan = dataVolume;
    } catch (error) {
      logger.debug(`Failed to estimate data scan: ${error.message}`);
    }

    return explanation;
  }

  // NRDOT v2: Generate execution plan
  async generateExecutionPlan(analysis) {
    const plan = {
      steps: [],
      estimatedTime: 0
    };
    
    // Step 1: Time range filtering
    if (analysis.timeWindow) {
      plan.steps.push({
        step: 'Time range filter',
        description: `Filter data to ${analysis.timeWindow}`,
        impact: 'Primary data reduction'
      });
    }
    
    // Step 2: WHERE clause filtering
    if (analysis.conditions.length > 0) {
      plan.steps.push({
        step: 'Condition filters',
        description: `Apply ${analysis.conditions.length} WHERE conditions`,
        impact: 'Secondary data reduction'
      });
    }
    
    // Step 3: Aggregation
    if (this.isAggregateQuery(analysis.query)) {
      plan.steps.push({
        step: 'Aggregation',
        description: 'Calculate aggregate functions',
        impact: 'Data summarization'
      });
    }
    
    // Step 4: Grouping
    if (analysis.facets.length > 0) {
      plan.steps.push({
        step: 'Group by FACET',
        description: `Group results by ${analysis.facets.join(', ')}`,
        impact: 'Result multiplication by cardinality'
      });
    }
    
    // Step 5: Sorting
    if (analysis.orderBy) {
      plan.steps.push({
        step: 'Sort results',
        description: `Order by ${analysis.orderBy}`,
        impact: 'Additional processing time'
      });
    }
    
    // Step 6: Limit
    if (analysis.limit) {
      plan.steps.push({
        step: 'Apply LIMIT',
        description: `Return top ${analysis.limit} results`,
        impact: 'Result size reduction'
      });
    }
    
    // Estimate time based on complexity
    plan.estimatedTime = Math.round(100 + (analysis.complexity?.score || 1) * 50);
    
    return plan;
  }

  async checkFunctionSupport(functionName, eventType = null) {
    const lowerFunc = functionName.toLowerCase();
    const isValid = isValidNRQLFunction(lowerFunc);
    
    const result = {
      function: functionName,
      supported: isValid,
      description: this.getFunctionDescription(lowerFunc),
      category: this.categorizeFunction(lowerFunc)
    };

    if (!isValid) {
      result.suggestions = suggestCorrection(
        lowerFunc, 
        Array.from(this.getAllFunctions()),
        5,
        { type: 'function' }
      );
    }

    // Check compatibility with event type if provided
    if (eventType && isValid) {
      try {
        const attributes = await this.schemaService.getEventAttributes(
          this.config.requireAccountId(),
          eventType,
          '1 hour ago'
        );
        
        // NRDOT v2: Enhanced compatibility check
        const compatibility = await this.checkFunctionCompatibility(
          lowerFunc, 
          eventType, 
          attributes
        );
        
        result.eventTypeCompatibility = compatibility;
      } catch (error) {
        result.eventTypeCompatibility = {
          eventType,
          compatible: false,
          error: error.message
        };
      }
    }

    return result;
  }

  // NRDOT v2: Check function compatibility with event type
  async checkFunctionCompatibility(functionName, eventType, attributes) {
    const compatibility = {
      eventType,
      compatible: true,
      recommendedAttributes: [],
      sampleUsage: null,
      warnings: []
    };
    
    // Function-specific compatibility checks
    switch (functionName) {
      case 'percentile':
      case 'average':
      case 'sum':
      case 'stddev':
        // These require numeric attributes
        const numericAttrs = [];
        for (const attr of attributes.slice(0, 20)) { // Check sample
          try {
            const typeInfo = await this.schemaService.getAttributeType(eventType, attr, '1 hour ago');
            if (typeInfo.dataType === 'numeric') {
              numericAttrs.push(attr);
            }
          } catch (e) {
            // Skip
          }
        }
        
        if (numericAttrs.length === 0) {
          compatibility.compatible = false;
          compatibility.warnings.push('No numeric attributes found for this function');
        } else {
          compatibility.recommendedAttributes = numericAttrs.slice(0, 5);
          compatibility.sampleUsage = `SELECT ${functionName}(${numericAttrs[0]}) FROM ${eventType}`;
        }
        break;
        
      case 'uniquecount':
      case 'count':
        // Works with any attribute
        compatibility.recommendedAttributes = attributes.slice(0, 5);
        compatibility.sampleUsage = `SELECT ${functionName}(*) FROM ${eventType}`;
        break;
        
      case 'latest':
      case 'earliest':
        // Best with timestamp attributes
        const timeAttrs = attributes.filter(attr => {
          const lower = attr.toLowerCase();
          return lower.includes('time') || lower.includes('timestamp') || lower.includes('date');
        });
        
        compatibility.recommendedAttributes = timeAttrs.length > 0 ? timeAttrs : attributes.slice(0, 5);
        compatibility.sampleUsage = `SELECT ${functionName}(${compatibility.recommendedAttributes[0] || 'timestamp'}) FROM ${eventType}`;
        break;
    }
    
    return compatibility;
  }

  async autofixQuery(query) {
    const fixes = {
      originalQuery: query,
      issues: [],
      fixes: [],
      fixedQuery: query,
      hasFixableIssues: false,
      confidence: 'high'
    };

    // Check syntax first
    try {
      validateNRQLQuery(query);
    } catch (error) {
      // Try to fix common syntax errors
      let fixedQuery = query;
      
      // Fix missing FROM
      if (!query.match(/FROM/i)) {
        fixes.issues.push('Missing FROM clause');
        fixes.confidence = 'low';
        return fixes; // Can't auto-fix without knowing event type
      }

      // NRDOT v2: Enhanced typo corrections
      const typoMap = {
        'FORM': 'FROM',
        'WEHRE': 'WHERE',
        'FCAET': 'FACET',
        'FACTES': 'FACET',
        'SEELCT': 'SELECT',
        'SELCT': 'SELECT',
        'AVERGE': 'AVERAGE',
        'COUTN': 'COUNT',
        'UNIQUCOUNT': 'UNIQUECOUNT',
        'PERCENTIL': 'PERCENTILE'
      };
      
      let hadTypos = false;
      Object.entries(typoMap).forEach(([typo, correct]) => {
        const regex = new RegExp(`\\b${typo}\\b`, 'gi');
        if (fixedQuery.match(regex)) {
          fixedQuery = fixedQuery.replace(regex, correct);
          hadTypos = true;
          fixes.fixes.push(`Fixed typo: ${typo} → ${correct}`);
        }
      });

      if (hadTypos) {
        fixes.fixedQuery = fixedQuery;
        fixes.hasFixableIssues = true;
      }
    }

    // Validate the query to find execution errors
    const validation = await this.validateQuery(fixes.fixedQuery);
    
    if (!validation.valid && validation.suggestions?.length > 0) {
      // NRDOT v2: Smart correction based on suggestions
      for (const suggestion of validation.suggestions) {
        if (suggestion.includes('Did you mean:')) {
          const match = suggestion.match(/Did you mean: (.+)\?/);
          if (match) {
            const corrections = match[1].split(', ');
            const original = suggestion.match(/'([^']+)'/)?.[1];
            
            if (original && corrections.length > 0) {
              // Use the first correction with highest confidence
              fixes.fixedQuery = fixes.fixedQuery.replace(
                new RegExp(`\\b${original}\\b`, 'gi'), 
                corrections[0]
              );
              fixes.fixes.push(`Replaced '${original}' with '${corrections[0]}'`);
              fixes.hasFixableIssues = true;
            }
          }
        }
      }
    }

    // NRDOT v2: Apply automatic optimizations
    const autoOptimizations = await this.applyAutoOptimizations(fixes.fixedQuery);
    if (autoOptimizations.applied) {
      fixes.fixedQuery = autoOptimizations.query;
      fixes.fixes.push(...autoOptimizations.fixes);
      fixes.hasFixableIssues = true;
    }

    // Add performance warnings as issues
    const perfWarnings = this.checkPerformancePatterns(fixes.fixedQuery);
    if (perfWarnings.length > 0) {
      fixes.issues.push(...perfWarnings.filter(w => w.severity === 'high').map(w => w.message));
    }

    return fixes;
  }

  // NRDOT v2: Apply safe automatic optimizations
  async applyAutoOptimizations(query) {
    const result = {
      query: query,
      applied: false,
      fixes: []
    };
    
    // Add SINCE clause if missing
    if (!query.match(/SINCE/i) && !query.match(/SHOW EVENT TYPES/i)) {
      result.query += ' SINCE 1 hour ago';
      result.fixes.push('Added default time window (SINCE 1 hour ago)');
      result.applied = true;
    }
    
    // Add LIMIT to non-aggregated queries
    if (!query.match(/LIMIT/i) && 
        !this.isAggregateQuery(query) &&
        !query.match(/TIMESERIES/i)) {
      result.query += ' LIMIT 100';
      result.fixes.push('Added LIMIT 100 to prevent excessive results');
      result.applied = true;
    }
    
    // Fix function names
    const functionCorrections = {
      'avg\\(': 'average(',
      'cnt\\(': 'count(',
      'pct\\(': 'percentile(',
      'uniq\\(': 'uniqueCount('
    };
    
    Object.entries(functionCorrections).forEach(([wrong, correct]) => {
      const regex = new RegExp(wrong, 'gi');
      if (result.query.match(regex)) {
        result.query = result.query.replace(regex, correct);
        result.fixes.push(`Corrected function: ${wrong} → ${correct}`);
        result.applied = true;
      }
    });
    
    return result;
  }

  // Helper methods
  async analyzeQuery(query) {
    const analysis = {
      query: query,
      action: query.match(/^(\w+)/i)?.[1]?.toUpperCase(),
      eventType: null,
      attributes: [],
      conditions: [],
      facets: [],
      timeWindow: null,
      limit: null,
      orderBy: null,
      complexity: calculateQueryComplexity(query)
    };

    try {
      analysis.eventType = extractEventTypeFromQuery(query);
      analysis.attributes = extractAttributesFromQuery(query);
    } catch (error) {
      logger.debug(`Failed to extract query components: ${error.message}`);
    }

    // Extract WHERE conditions
    const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+FACET|\s+SINCE|\s+UNTIL|\s+LIMIT|\s+ORDER\s+BY|\s*$)/is);
    if (whereMatch) {
      analysis.conditions = this.parseConditions(whereMatch[1]);
    }

    // Extract FACET
    const facetMatch = query.match(/FACET\s+(.+?)(?:\s+SINCE|\s+UNTIL|\s+LIMIT|\s+ORDER\s+BY|\s*$)/is);
    if (facetMatch) {
      analysis.facets = facetMatch[1].split(/\s*,\s*/).map(f => f.trim());
    }

    // Extract ORDER BY
    const orderMatch = query.match(/ORDER\s+BY\s+(.+?)(?:\s+ASC|\s+DESC|\s+SINCE|\s+UNTIL|\s+LIMIT|\s*$)/is);
    if (orderMatch) {
      analysis.orderBy = orderMatch[1].trim();
    }

    // Extract time window
    const sinceMatch = query.match(/SINCE\s+(.+?)(?:\s+UNTIL|\s+LIMIT|\s+ORDER\s+BY|\s*$)/is);
    if (sinceMatch) {
      analysis.timeWindow = sinceMatch[1].trim();
    }

    // Extract LIMIT
    const limitMatch = query.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      analysis.limit = parseInt(limitMatch[1]);
    }

    return analysis;
  }

  // NRDOT v2: Parse WHERE conditions
  parseConditions(whereClause) {
    const conditions = [];
    
    // Simple parser for conditions (doesn't handle all cases but covers common ones)
    const parts = whereClause.split(/\s+(AND|OR)\s+/i);
    
    for (let i = 0; i < parts.length; i += 2) {
      const condition = parts[i].trim();
      if (condition) {
        conditions.push({
          text: condition,
          operator: parts[i + 1] || null
        });
      }
    }
    
    return conditions;
  }

  async getQuerySuggestions(query, error) {
    const suggestions = [];
    const errorMessage = error.message.toLowerCase();

    // Attribute not found errors
    if (errorMessage.includes('attribute') && errorMessage.includes('not found')) {
      const attributeMatch = error.message.match(/'([^']+)'/);
      if (attributeMatch) {
        const missingAttr = attributeMatch[1];
        try {
          const eventType = extractEventTypeFromQuery(query);
          const attributes = await this.schemaService.getEventAttributes(
            this.config.requireAccountId(),
            eventType,
            '1 hour ago'
          );
          const corrections = suggestCorrection(missingAttr, attributes, 5, { type: 'attribute' });
          if (corrections.length > 0) {
            suggestions.push(`Attribute '${missingAttr}' not found. Did you mean: ${corrections.join(', ')}?`);
          }
          
          // NRDOT v2: Context-aware suggestions
          const category = this.schemaService.categorizeAttribute(missingAttr);
          const similarAttrs = attributes.filter(attr => 
            this.schemaService.categorizeAttribute(attr) === category
          ).slice(0, 3);
          
          if (similarAttrs.length > 0) {
            suggestions.push(`Similar ${category} attributes available: ${similarAttrs.join(', ')}`);
          }
        } catch (e) {
          logger.debug(`Failed to get attribute suggestions: ${e.message}`);
        }
      }
    }

    // Function errors
    if (errorMessage.includes('function') || errorMessage.includes('invalid')) {
      suggestions.push('Check that all functions are valid NRQL functions');
      suggestions.push('Common functions: count(), sum(), average(), max(), min(), percentile()');
      
      // Try to extract the invalid function
      const funcMatch = error.message.match(/function\s+'?(\w+)'?/i);
      if (funcMatch) {
        const invalidFunc = funcMatch[1];
        const validFuncs = Array.from(this.getAllFunctions());
        const funcSuggestions = suggestCorrection(invalidFunc, validFuncs, 3, { type: 'function' });
        if (funcSuggestions.length > 0) {
          suggestions.push(`Did you mean: ${funcSuggestions.join(', ')}?`);
        }
      }
    }

    // Time window errors
    if (errorMessage.includes('time') || errorMessage.includes('since')) {
      suggestions.push('Ensure time window format is correct: SINCE <number> <unit> ago');
      suggestions.push('Valid units: second(s), minute(s), hour(s), day(s), week(s), month(s)');
    }

    // NRDOT v2: Process-specific suggestions
    if (query.toLowerCase().includes('process')) {
      suggestions.push('For process metrics, ensure processDisplayName or processName attributes exist');
      suggestions.push('Consider filtering by specific processes to reduce data volume');
    }

    return suggestions;
  }

  getSyntaxSuggestions(query) {
    const suggestions = [];
    const upperQuery = query.toUpperCase();
    
    if (!upperQuery.match(/^(SELECT|SHOW|WITH)/)) {
      suggestions.push('Query must start with SELECT, SHOW, or WITH');
    }
    
    if (upperQuery.startsWith('SELECT') && !upperQuery.includes('FROM')) {
      suggestions.push('SELECT queries must include FROM <EventType>');
    }
    
    // NRDOT v2: Enhanced syntax suggestions
    if (upperQuery.includes('FACET') && !upperQuery.includes('SELECT')) {
      suggestions.push('FACET requires a SELECT statement');
    }
    
    if (upperQuery.includes('TIMESERIES') && !upperQuery.includes('SINCE')) {
      suggestions.push('TIMESERIES requires a SINCE clause');
    }
    
    return suggestions;
  }

  isAggregateQuery(query) {
    const aggregateFunctions = [
      'count', 'sum', 'average', 'max', 'min', 'latest', 'earliest',
      'uniqueCount', 'percentile', 'histogram', 'rate', 'funnel',
      'stddev', 'variance', 'median', 'apdex', 'percentage'
    ];
    
    return aggregateFunctions.some(func => 
      query.toLowerCase().includes(func.toLowerCase() + '(')
    );
  }

  async estimateAttributeCardinality(eventType, attribute) {
    if (!eventType || !attribute) return 0;
    
    try {
      const cacheKey = this.cache.generateKey('cardinality', eventType, attribute);
      
      return await this.cache.get(cacheKey, async () => {
        const query = `SELECT uniqueCount(${attribute}) as count FROM ${eventType} SINCE 1 hour ago`;
        const result = await this.client.nrql(this.config.requireAccountId(), query);
        if (result.results.length > 0) {
          return result.results[0].count || 0;
        }
        return 0;
      });
    } catch (error) {
      logger.debug(`Failed to estimate cardinality: ${error.message}`);
      return 0;
    }
  }

  async estimateDataScan(analysis) {
    if (!analysis.eventType) return null;
    
    try {
      const timeWindow = analysis.timeWindow || '7 days ago';
      const query = `SELECT count(*) as count, bytecountestimate() as bytes FROM ${analysis.eventType} SINCE ${timeWindow}`;
      const result = await this.client.nrql(this.config.requireAccountId(), query);
      
      if (result.results.length > 0) {
        const count = result.results[0].count || 0;
        const bytes = result.results[0].bytes || count * 500; // Fallback estimate
        
        return {
          eventCount: count,
          timeWindow,
          estimatedSize: this.formatBytes(bytes),
          rawBytes: bytes
        };
      }
    } catch (error) {
      logger.debug(`Failed to estimate data scan: ${error.message}`);
    }
    
    return null;
  }

  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  getFunctionDescription(functionName) {
    const descriptions = {
      // Aggregation functions
      'count': 'Counts the number of results',
      'sum': 'Calculates the sum of numeric attribute values',
      'average': 'Calculates the average of numeric attribute values',
      'max': 'Returns the maximum value',
      'min': 'Returns the minimum value',
      'latest': 'Returns the most recent value based on timestamp',
      'earliest': 'Returns the oldest value based on timestamp',
      'uniquecount': 'Counts unique/distinct values',
      'percentile': 'Calculates percentile values (e.g., percentile(duration, 95))',
      'histogram': 'Creates a histogram distribution',
      'rate': 'Calculates the rate of change over time',
      'stddev': 'Calculates standard deviation',
      'variance': 'Calculates variance',
      'median': 'Calculates the median value',
      'mode': 'Returns the most frequent value',
      // Math functions
      'abs': 'Returns absolute value',
      'ceil': 'Rounds up to nearest integer',
      'floor': 'Rounds down to nearest integer',
      'round': 'Rounds to nearest integer',
      'sqrt': 'Calculates square root',
      'pow': 'Raises to power (e.g., pow(value, 2))',
      'exp': 'Calculates exponential',
      'log': 'Calculates natural logarithm',
      // String functions
      'concat': 'Concatenates strings',
      'substring': 'Extracts substring',
      'lower': 'Converts to lowercase',
      'upper': 'Converts to uppercase',
      'trim': 'Removes whitespace',
      'length': 'Returns string length',
      // Conditional functions
      'if': 'Conditional expression',
      'cases': 'Multiple condition expression',
      'filter': 'Filters results within aggregation',
      // Special functions
      'apdex': 'Calculates application performance index',
      'percentage': 'Calculates percentage (e.g., percentage(count(*), WHERE error IS true))',
      'bytecountestimate': 'Estimates data size in bytes'
    };
    
    return descriptions[functionName] || 'NRQL function';
  }

  categorizeFunction(functionName) {
    const categories = {
      aggregation: ['count', 'sum', 'average', 'max', 'min', 'uniquecount', 'stddev', 'variance', 'median', 'mode'],
      time: ['latest', 'earliest', 'rate', 'derivative'],
      math: ['abs', 'ceil', 'floor', 'round', 'sqrt', 'pow', 'exp', 'log'],
      string: ['concat', 'substring', 'lower', 'upper', 'trim', 'length'],
      conditional: ['if', 'cases', 'filter'],
      percentile: ['percentile', 'histogram'],
      special: ['apdex', 'percentage', 'bytecountestimate', 'keyset', 'uniques']
    };
    
    for (const [category, functions] of Object.entries(categories)) {
      if (functions.includes(functionName)) {
        return category;
      }
    }
    
    return 'other';
  }

  getAllFunctions() {
    return new Set([
      // Aggregation
      'count', 'sum', 'average', 'max', 'min', 'latest', 'earliest',
      'uniqueCount', 'percentile', 'histogram', 'rate', 'funnel',
      'stddev', 'variance', 'median', 'mode',
      // Math
      'abs', 'ceil', 'floor', 'round', 'sqrt', 'pow', 'exp', 'log',
      // String
      'concat', 'substring', 'lower', 'upper', 'trim', 'length',
      // Time
      'since', 'until', 'timeAgo', 'now', 'timestamp',
      // Conditional
      'if', 'cases', 'filter',
      // Window
      'derivative', 'predictLinear', 'sliding',
      // Special
      'keyset', 'uniques', 'percentage', 'apdex', 'bytecountestimate'
    ]);
  }

  getFunctionExample(functionName, attributeName = 'value', eventType = 'Transaction') {
    const examples = {
      'count': `SELECT count(*) FROM ${eventType}`,
      'sum': `SELECT sum(${attributeName}) FROM ${eventType}`,
      'average': `SELECT average(${attributeName}) FROM ${eventType}`,
      'max': `SELECT max(${attributeName}) FROM ${eventType}`,
      'min': `SELECT min(${attributeName}) FROM ${eventType}`,
      'latest': `SELECT latest(${attributeName}) FROM ${eventType}`,
      'uniquecount': `SELECT uniqueCount(${attributeName}) FROM ${eventType}`,
      'percentile': `SELECT percentile(${attributeName}, 95) FROM ${eventType}`,
      'histogram': `SELECT histogram(${attributeName}, 10) FROM ${eventType}`,
      'rate': `SELECT rate(count(*), 1 minute) FROM ${eventType}`,
      'stddev': `SELECT stddev(${attributeName}) FROM ${eventType}`,
      'apdex': `SELECT apdex(${attributeName}, 0.5) FROM ${eventType}`,
      'percentage': `SELECT percentage(count(*), WHERE ${attributeName} > 100) FROM ${eventType}`,
      'filter': `SELECT count(*), filter(count(*), WHERE ${attributeName} > 100) FROM ${eventType}`,
      'cases': `SELECT cases(WHERE ${attributeName} < 100 AS 'low', WHERE ${attributeName} < 1000 AS 'medium', WHERE ${attributeName} >= 1000 AS 'high') FROM ${eventType}`,
      'if': `SELECT if(${attributeName} > 100, 'high', 'low') FROM ${eventType}`
    };
    
    return examples[functionName] || `SELECT ${functionName}(${attributeName}) FROM ${eventType}`;
  }
}

module.exports = {
  NRQLService
};