const { NerdGraphClient } = require('../core/api-client.js');
const { Cache } = require('../utils/cache.js');
const { logger } = require('../utils/logger.js');
const { suggestCorrection, calculateQueryComplexity } = require('../utils/validators.js');
const { SchemaError } = require('../utils/errors.js');

class SchemaService {
  constructor(config) {
    this.config = config;
    this.client = new NerdGraphClient(config);
    this.cache = new Cache({ 
      enabled: config.enableCache, 
      ttl: config.cacheTTL 
    });
    
    // NRDOT v2: Process intelligence patterns
    this.processPatterns = this.loadProcessPatterns();
  }

  // NRDOT v2: Load process classification patterns
  loadProcessPatterns() {
    return {
      database: {
        patterns: [/mysql/i, /postgres/i, /mongo/i, /redis/i, /cassandra/i, /elastic/i],
        priority: 'high',
        category: 'database'
      },
      webserver: {
        patterns: [/nginx/i, /apache/i, /httpd/i, /tomcat/i, /iis/i],
        priority: 'high',
        category: 'webserver'
      },
      application: {
        patterns: [/java/i, /python/i, /node/i, /ruby/i, /dotnet/i, /php/i],
        priority: 'medium',
        category: 'application'
      },
      monitoring: {
        patterns: [/newrelic/i, /datadog/i, /prometheus/i, /grafana/i, /collector/i],
        priority: 'low',
        category: 'monitoring'
      },
      system: {
        patterns: [/systemd/i, /init/i, /kernel/i, /cron/i, /sshd/i],
        priority: 'low',
        category: 'system'
      }
    };
  }

  async discoverEventTypes(since = '1 day ago') {
    const accountId = this.config.requireAccountId();
    const cacheKey = this.cache.generateKey('event-types', accountId, since);
    
    return await this.cache.get(cacheKey, async () => {
      const eventTypes = await this.client.getEventTypes(accountId, since);
      
      // Enrich with additional metadata and complexity analysis
      const enriched = await Promise.all(
        eventTypes.map(async (eventType) => {
          try {
            const attributes = await this.client.getEventAttributes(accountId, eventType, since);
            const sampleQuery = `SELECT count(*) FROM ${eventType} SINCE ${since}`;
            const complexity = calculateQueryComplexity(sampleQuery);
            
            return {
              name: eventType,
              attributeCount: attributes.length,
              complexity: complexity.level,
              category: this.categorizeEventType(eventType),
              lastSeen: new Date().toISOString(),
              estimatedCardinality: await this.estimateEventCardinality(accountId, eventType, since)
            };
          } catch (error) {
            logger.debug(`Failed to enrich ${eventType}: ${error.message}`);
            return {
              name: eventType,
              attributeCount: 0,
              complexity: 'Unknown',
              category: 'other',
              lastSeen: new Date().toISOString(),
              error: 'Failed to fetch attributes'
            };
          }
        })
      );
      
      return enriched.sort((a, b) => {
        // Sort by category priority, then by name
        const categoryOrder = { 'application': 1, 'database': 2, 'infrastructure': 3, 'custom': 4, 'other': 5 };
        const aOrder = categoryOrder[a.category] || 999;
        const bOrder = categoryOrder[b.category] || 999;
        return aOrder - bOrder || a.name.localeCompare(b.name);
      });
    });
  }

  // NRDOT v2: Categorize event types based on patterns
  categorizeEventType(eventType) {
    const lower = eventType.toLowerCase();
    
    if (lower.includes('transaction') || lower.includes('pageview')) return 'application';
    if (lower.includes('infra') || lower.includes('system') || lower.includes('process')) return 'infrastructure';
    if (lower.includes('log') || lower.includes('span')) return 'observability';
    if (lower.includes('custom') || lower.includes('metric')) return 'custom';
    if (lower.includes('synthetic') || lower.includes('browser')) return 'frontend';
    
    return 'other';
  }

  async describeEventType(eventType, since = '1 day ago', options = {}) {
    const accountId = this.config.requireAccountId();
    const cacheKey = this.cache.generateKey('event-type-desc', accountId, eventType, since, options);
    
    return await this.cache.get(cacheKey, async () => {
      const attributes = await this.client.getEventAttributes(accountId, eventType, since);
      
      if (attributes.length === 0) {
        throw new SchemaError(`Event type '${eventType}' not found or has no data in the specified time range`);
      }

      const description = {
        eventType,
        attributeCount: attributes.length,
        attributes: attributes.sort(),
        since,
        category: this.categorizeEventType(eventType)
      };

      // Get data types if requested
      if (options.includeDataTypes) {
        description.dataTypes = {};
        description.attributeMetadata = {};
        
        // Sample query to determine data types
        const batchSize = 50;
        for (let i = 0; i < attributes.length; i += batchSize) {
          const batch = attributes.slice(i, i + batchSize);
          const query = `SELECT ${batch.join(', ')} FROM ${eventType} SINCE ${since} LIMIT 1`;
          
          try {
            const result = await this.client.nrql(accountId, query);
            if (result.results.length > 0) {
              const sample = result.results[0];
              batch.forEach(attr => {
                if (sample[attr] !== undefined) {
                  const dataType = this.inferDataType(sample[attr]);
                  description.dataTypes[attr] = dataType;
                  
                  // NRDOT v2: Enhanced metadata for process intelligence
                  description.attributeMetadata[attr] = {
                    type: dataType,
                    nullable: sample[attr] === null,
                    category: this.categorizeAttribute(attr),
                    importance: this.assessAttributeImportance(attr, eventType)
                  };
                }
              });
            }
          } catch (error) {
            logger.debug(`Failed to get data types for batch: ${error.message}`);
          }
        }
      }

      // Get cardinality estimates if requested
      if (options.includeCardinality) {
        description.cardinality = {};
        description.highCardinalityWarnings = [];
        description.cardinalityAnalysis = {
          totalUniqueValues: 0,
          recommendedForFacet: [],
          notRecommendedForFacet: []
        };
        
        // Check cardinality for a sample of attributes
        const sampleAttrs = this.selectAttributesForCardinalityCheck(attributes, eventType);
        
        await Promise.all(
          sampleAttrs.map(async (attr) => {
            try {
              const query = `SELECT uniqueCount(${attr}) as count FROM ${eventType} SINCE ${since}`;
              const result = await this.client.nrql(accountId, query);
              if (result.results.length > 0) {
                const count = result.results[0].count || 0;
                description.cardinality[attr] = count;
                description.cardinalityAnalysis.totalUniqueValues += count;
                
                // NRDOT v2: Enhanced cardinality thresholds based on attribute type
                const threshold = this.getCardinalityThreshold(attr, eventType);
                
                if (count > threshold.critical) {
                  description.highCardinalityWarnings.push({
                    attribute: attr,
                    cardinality: count,
                    threshold: threshold.critical,
                    impact: 'critical',
                    warning: `Extremely high cardinality (>${threshold.critical}) will severely impact query performance`,
                    recommendation: `Consider using sampling or aggregation for ${attr}`
                  });
                  description.cardinalityAnalysis.notRecommendedForFacet.push(attr);
                } else if (count > threshold.warning) {
                  description.highCardinalityWarnings.push({
                    attribute: attr,
                    cardinality: count,
                    threshold: threshold.warning,
                    impact: 'warning',
                    warning: `High cardinality (>${threshold.warning}) may impact query performance`,
                    recommendation: `Use ${attr} in FACET with caution and consider LIMIT`
                  });
                  description.cardinalityAnalysis.notRecommendedForFacet.push(attr);
                } else {
                  description.cardinalityAnalysis.recommendedForFacet.push(attr);
                }
              }
            } catch (error) {
              logger.debug(`Failed to get cardinality for ${attr}: ${error.message}`);
            }
          })
        );
      }

      // NRDOT v2: Add process intelligence if applicable
      if (eventType.toLowerCase().includes('process') || eventType === 'SystemSample') {
        description.processIntelligence = await this.getProcessIntelligence(accountId, eventType, since);
      }

      return description;
    });
  }

  // NRDOT v2: Get dynamic cardinality thresholds based on context
  getCardinalityThreshold(attribute, eventType) {
    const attrLower = attribute.toLowerCase();
    
    // ID-like attributes have higher thresholds
    if (attrLower.includes('id') || attrLower.includes('guid') || attrLower.includes('uuid')) {
      return { warning: 10000, critical: 50000 };
    }
    
    // Process attributes
    if (attrLower.includes('process') || attrLower.includes('command')) {
      return { warning: 500, critical: 2000 };
    }
    
    // User/session attributes
    if (attrLower.includes('user') || attrLower.includes('session')) {
      return { warning: 5000, critical: 20000 };
    }
    
    // Default thresholds
    return { warning: 1000, critical: 5000 };
  }

  // NRDOT v2: Intelligently select attributes for cardinality check
  selectAttributesForCardinalityCheck(attributes, eventType) {
    const priorityAttributes = [];
    const normalAttributes = [];
    
    attributes.forEach(attr => {
      const attrLower = attr.toLowerCase();
      
      // High priority attributes for cardinality check
      if (attrLower.includes('id') || 
          attrLower.includes('name') || 
          attrLower.includes('user') ||
          attrLower.includes('host') ||
          attrLower.includes('service') ||
          attrLower.includes('process')) {
        priorityAttributes.push(attr);
      } else {
        normalAttributes.push(attr);
      }
    });
    
    // Take all priority attributes and sample of normal ones
    const selectedAttrs = [
      ...priorityAttributes.slice(0, 15),
      ...normalAttributes.slice(0, Math.max(5, 20 - priorityAttributes.length))
    ];
    
    return selectedAttrs;
  }

  // NRDOT v2: Process intelligence analysis
  async getProcessIntelligence(accountId, eventType, since) {
    const intelligence = {
      totalProcesses: 0,
      criticalProcesses: [],
      resourceIntensiveProcesses: [],
      processCategories: {},
      recommendations: []
    };
    
    try {
      // Get process count
      const countQuery = `SELECT uniqueCount(processDisplayName) as count FROM ${eventType} WHERE processDisplayName IS NOT NULL SINCE ${since}`;
      const countResult = await this.client.nrql(accountId, countQuery);
      if (countResult.results.length > 0) {
        intelligence.totalProcesses = countResult.results[0].count || 0;
      }
      
      // Get top processes by CPU
      const cpuQuery = `SELECT average(cpuPercent) as avgCpu, max(cpuPercent) as maxCpu FROM ${eventType} WHERE processDisplayName IS NOT NULL FACET processDisplayName SINCE ${since} LIMIT 20`;
      const cpuResult = await this.client.nrql(accountId, cpuQuery);
      
      cpuResult.results.forEach(proc => {
        const processName = proc.facet[0];
        const category = this.classifyProcess(processName);
        
        // Track by category
        if (!intelligence.processCategories[category.category]) {
          intelligence.processCategories[category.category] = [];
        }
        intelligence.processCategories[category.category].push(processName);
        
        // Identify critical and resource-intensive processes
        if (category.priority === 'high') {
          intelligence.criticalProcesses.push({
            name: processName,
            category: category.category,
            avgCpu: proc.avgCpu,
            maxCpu: proc.maxCpu
          });
        }
        
        if (proc.avgCpu > 10 || proc.maxCpu > 50) {
          intelligence.resourceIntensiveProcesses.push({
            name: processName,
            avgCpu: proc.avgCpu,
            maxCpu: proc.maxCpu,
            category: category.category
          });
        }
      });
      
      // Generate recommendations
      if (intelligence.totalProcesses > 100) {
        intelligence.recommendations.push({
          type: 'high_process_count',
          message: `High number of unique processes (${intelligence.totalProcesses}) detected`,
          suggestion: 'Consider implementing process filtering to reduce data volume'
        });
      }
      
      if (intelligence.resourceIntensiveProcesses.length > 5) {
        intelligence.recommendations.push({
          type: 'resource_intensive',
          message: `${intelligence.resourceIntensiveProcesses.length} processes with high resource usage detected`,
          suggestion: 'Focus monitoring on these processes for cost optimization'
        });
      }
      
    } catch (error) {
      logger.debug(`Failed to get process intelligence: ${error.message}`);
    }
    
    return intelligence;
  }

  // NRDOT v2: Classify process based on patterns
  classifyProcess(processName) {
    const nameLower = processName.toLowerCase();
    
    for (const [key, config] of Object.entries(this.processPatterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(nameLower)) {
          return {
            category: config.category,
            priority: config.priority,
            matched: key
          };
        }
      }
    }
    
    return {
      category: 'other',
      priority: 'low',
      matched: null
    };
  }

  // NRDOT v2: Categorize attributes for importance assessment
  categorizeAttribute(attribute) {
    const attrLower = attribute.toLowerCase();
    
    if (attrLower.includes('error') || attrLower.includes('exception')) return 'error';
    if (attrLower.includes('duration') || attrLower.includes('time')) return 'performance';
    if (attrLower.includes('count') || attrLower.includes('rate')) return 'metric';
    if (attrLower.includes('user') || attrLower.includes('customer')) return 'business';
    if (attrLower.includes('host') || attrLower.includes('container')) return 'infrastructure';
    if (attrLower.includes('trace') || attrLower.includes('span')) return 'tracing';
    
    return 'general';
  }

  // NRDOT v2: Assess attribute importance for monitoring
  assessAttributeImportance(attribute, eventType) {
    const category = this.categorizeAttribute(attribute);
    const eventCategory = this.categorizeEventType(eventType);
    
    // Error attributes are always high importance
    if (category === 'error') return 'high';
    
    // Performance attributes are high for application events
    if (category === 'performance' && eventCategory === 'application') return 'high';
    
    // Business attributes are high importance
    if (category === 'business') return 'high';
    
    // Infrastructure attributes are high for infra events
    if (category === 'infrastructure' && eventCategory === 'infrastructure') return 'high';
    
    // Default to medium
    return 'medium';
  }

  async compareSchemas(eventType, accountIdA, accountIdB, since = '1 day ago') {
    const [schemaA, schemaB] = await Promise.all([
      this.getEventAttributes(accountIdA, eventType, since),
      this.getEventAttributes(accountIdB, eventType, since)
    ]);

    const setA = new Set(schemaA);
    const setB = new Set(schemaB);

    const comparison = {
      eventType,
      accountA: accountIdA,
      accountB: accountIdB,
      onlyInA: schemaA.filter(attr => !setB.has(attr)),
      onlyInB: schemaB.filter(attr => !setA.has(attr)),
      common: schemaA.filter(attr => setB.has(attr)),
      similarity: (setA.size + setB.size - Math.abs(setA.size - setB.size)) / (setA.size + setB.size),
      recommendations: []
    };
    
    // NRDOT v2: Add recommendations for schema differences
    if (comparison.onlyInA.length > 0) {
      const criticalMissing = comparison.onlyInA.filter(attr => 
        this.assessAttributeImportance(attr, eventType) === 'high'
      );
      
      if (criticalMissing.length > 0) {
        comparison.recommendations.push({
          type: 'critical_attributes_missing',
          message: `Account ${accountIdB} is missing ${criticalMissing.length} critical attributes`,
          attributes: criticalMissing,
          impact: 'May affect monitoring completeness'
        });
      }
    }
    
    if (comparison.similarity < 0.8) {
      comparison.recommendations.push({
        type: 'low_similarity',
        message: `Schema similarity is only ${(comparison.similarity * 100).toFixed(1)}%`,
        suggestion: 'Review instrumentation consistency across accounts'
      });
    }

    return comparison;
  }

  async validateAttributes(eventType, expectedAttributes, options = {}) {
    const accountId = this.config.requireAccountId();
    const actualAttributes = await this.getEventAttributes(
      accountId, 
      eventType, 
      options.since || '1 day ago'
    );

    const actualSet = new Set(actualAttributes);
    const missing = expectedAttributes.filter(attr => !actualSet.has(attr));
    const extra = options.allowExtra ? [] : actualAttributes.filter(attr => !expectedAttributes.includes(attr));

    const valid = missing.length === 0 && (options.allowExtra || extra.length === 0);
    const suggestions = [];
    const autoFixable = [];

    // NRDOT v2: Enhanced suggestions with context
    missing.forEach(missingAttr => {
      const possibleMatches = suggestCorrection(missingAttr, actualAttributes, 3, { type: 'attribute' });
      if (possibleMatches.length > 0) {
        suggestions.push(`Attribute '${missingAttr}' not found. Did you mean: ${possibleMatches.join(', ')}?`);
        
        // Check if it's a simple case mismatch
        const exactMatch = actualAttributes.find(attr => attr.toLowerCase() === missingAttr.toLowerCase());
        if (exactMatch) {
          autoFixable.push({
            original: missingAttr,
            corrected: exactMatch,
            type: 'case_mismatch'
          });
        }
      } else {
        // No close matches, provide context-aware suggestion
        const category = this.categorizeAttribute(missingAttr);
        const similarCategoryAttrs = actualAttributes.filter(attr => 
          this.categorizeAttribute(attr) === category
        ).slice(0, 3);
        
        if (similarCategoryAttrs.length > 0) {
          suggestions.push(`Attribute '${missingAttr}' not found. Similar ${category} attributes: ${similarCategoryAttrs.join(', ')}`);
        }
      }
    });

    return {
      valid,
      eventType,
      expectedCount: expectedAttributes.length,
      actualCount: actualAttributes.length,
      missing,
      extra,
      suggestions,
      autoFixable,
      coverage: ((expectedAttributes.length - missing.length) / expectedAttributes.length * 100).toFixed(1) + '%'
    };
  }

  async findAttribute(attributeName, options = {}) {
    const accountId = this.config.requireAccountId();
    const eventTypes = await this.discoverEventTypes(options.since || '1 day ago');
    
    const results = [];
    const searchLower = attributeName.toLowerCase();
    
    // NRDOT v2: Parallel search with batching
    const batchSize = 10;
    for (let i = 0; i < eventTypes.length; i += batchSize) {
      const batch = eventTypes.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (eventTypeInfo) => {
        // Apply event type pattern filter if provided
        if (options.eventTypePattern && !eventTypeInfo.name.match(new RegExp(options.eventTypePattern, 'i'))) {
          return;
        }

        try {
          const attributes = await this.getEventAttributes(
            accountId, 
            eventTypeInfo.name, 
            options.since || '1 day ago'
          );
          
          // NRDOT v2: Fuzzy matching support
          const matches = attributes.filter(attr => {
            const attrLower = attr.toLowerCase();
            if (options.exactMatch) {
              return attrLower === searchLower;
            }
            return attrLower.includes(searchLower) || 
                   (options.fuzzy && this.fuzzyMatch(searchLower, attrLower));
          });
          
          for (const matchedAttr of matches) {
            // Get sample value and data type
            const query = `SELECT ${matchedAttr} FROM ${eventTypeInfo.name} WHERE ${matchedAttr} IS NOT NULL SINCE ${options.since || '1 day ago'} LIMIT 1`;
            let sampleValue = null;
            let dataType = 'unknown';
            
            try {
              const result = await this.client.nrql(accountId, query);
              if (result.results.length > 0) {
                sampleValue = result.results[0][matchedAttr];
                dataType = this.inferDataType(sampleValue);
              }
            } catch (error) {
              logger.debug(`Failed to get sample for ${matchedAttr} in ${eventTypeInfo.name}`);
            }
            
            results.push({
              eventType: eventTypeInfo.name,
              eventCategory: eventTypeInfo.category,
              attribute: matchedAttr,
              dataType,
              sampleValue: sampleValue !== null ? String(sampleValue).substring(0, 50) : null,
              matchType: matchedAttr.toLowerCase() === searchLower ? 'exact' : 'partial',
              importance: this.assessAttributeImportance(matchedAttr, eventTypeInfo.name)
            });
          }
        } catch (error) {
          logger.debug(`Failed to check ${eventTypeInfo.name}: ${error.message}`);
        }
      }));
    }
    
    // Sort by importance and match type
    results.sort((a, b) => {
      const importanceOrder = { high: 1, medium: 2, low: 3 };
      const matchOrder = { exact: 1, partial: 2 };
      
      return (importanceOrder[a.importance] || 99) - (importanceOrder[b.importance] || 99) ||
             (matchOrder[a.matchType] || 99) - (matchOrder[b.matchType] || 99);
    });
    
    return results;
  }

  // NRDOT v2: Simple fuzzy matching
  fuzzyMatch(search, target) {
    // Remove common prefixes/suffixes
    const cleanSearch = search.replace(/^(get|set|is)|Time$|Date$|Id$/gi, '');
    const cleanTarget = target.replace(/^(get|set|is)|Time$|Date$|Id$/gi, '');
    
    // Check if core parts match
    return cleanTarget.includes(cleanSearch) || cleanSearch.includes(cleanTarget);
  }

  async getAttributeType(eventType, attributeName, since = '1 day ago') {
    const accountId = this.config.requireAccountId();
    const attributes = await this.getEventAttributes(accountId, eventType, since);
    
    if (!attributes.includes(attributeName)) {
      const suggestions = suggestCorrection(attributeName, attributes, 3, { type: 'attribute' });
      throw new SchemaError(
        `Attribute '${attributeName}' not found in event type '${eventType}'`,
        { suggestions }
      );
    }

    // Get sample values to determine type
    const query = `SELECT ${attributeName} FROM ${eventType} WHERE ${attributeName} IS NOT NULL SINCE ${since} LIMIT 100`;
    const result = await this.client.nrql(accountId, query);
    
    if (result.results.length === 0) {
      return {
        eventType,
        attribute: attributeName,
        dataType: 'unknown',
        nullable: true,
        sampleValues: [],
        statistics: {}
      };
    }

    const values = result.results.map(r => r[attributeName]).filter(v => v !== null);
    const dataType = this.inferDataType(values[0]);
    const uniqueValues = [...new Set(values)];
    
    const typeInfo = {
      eventType,
      attribute: attributeName,
      dataType,
      nullable: result.results.some(r => r[attributeName] === null),
      cardinality: uniqueValues.length,
      sampleValues: uniqueValues.slice(0, 10),
      category: this.categorizeAttribute(attributeName),
      importance: this.assessAttributeImportance(attributeName, eventType)
    };
    
    // NRDOT v2: Add statistics for numeric types
    if (dataType === 'numeric' && values.length > 0) {
      const numbers = values.map(v => parseFloat(v)).filter(n => !isNaN(n));
      if (numbers.length > 0) {
        typeInfo.statistics = {
          min: Math.min(...numbers),
          max: Math.max(...numbers),
          avg: numbers.reduce((a, b) => a + b, 0) / numbers.length,
          p50: this.percentile(numbers, 0.5),
          p95: this.percentile(numbers, 0.95),
          p99: this.percentile(numbers, 0.99)
        };
      }
    }
    
    return typeInfo;
  }

  // NRDOT v2: Estimate event cardinality
  async estimateEventCardinality(accountId, eventType, since) {
    try {
      const query = `SELECT count(*) as count FROM ${eventType} SINCE ${since}`;
      const result = await this.client.nrql(accountId, query);
      return result.results[0]?.count || 0;
    } catch (error) {
      logger.debug(`Failed to estimate cardinality for ${eventType}: ${error.message}`);
      return 0;
    }
  }

  // Helper methods
  async getEventAttributes(accountId, eventType, since) {
    const cacheKey = this.cache.generateKey('attributes', accountId, eventType, since);
    
    return await this.cache.get(cacheKey, async () => {
      return await this.client.getEventAttributes(accountId, eventType, since);
    });
  }

  inferDataType(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return 'numeric';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') {
      // Try to detect if it's a timestamp
      if (/^\d{10,13}$/.test(value) || !isNaN(Date.parse(value))) {
        return 'timestamp';
      }
      // Check if it's a numeric string
      if (/^-?\d+\.?\d*$/.test(value)) {
        return 'numeric';
      }
      // Check for JSON
      try {
        JSON.parse(value);
        return 'json';
      } catch (e) {
        // Not JSON
      }
      return 'string';
    }
    if (Array.isArray(value)) return 'array';
    return 'object';
  }

  percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

module.exports = {
  SchemaService
};