const { NerdGraphClient } = require('../core/api-client.js');
const { SchemaService } = require('./schema.service.js');
const { Cache } = require('../utils/cache.js');
const { logger } = require('../utils/logger.js');
const { extractEventTypeFromQuery, extractAttributesFromQuery, calculateQueryComplexity } = require('../utils/validators.js');
const { ValidationError } = require('../utils/errors.js');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

class IngestService {
  constructor(config) {
    this.config = config;
    this.client = new NerdGraphClient(config);
    this.schemaService = new SchemaService(config);
    this.cache = new Cache({ 
      enabled: config.enableCache, 
      ttl: 300 // 5 minute cache for ingest metrics
    });
    
    // Load thresholds from configuration file
    this.loadThresholdsConfig();
  }

  loadThresholdsConfig() {
    try {
      const configPath = path.join(process.cwd(), 'configs', 'nrdot-thresholds.yaml');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const thresholdsConfig = yaml.load(configContent);
      
      // NRDOT v2: Cost estimation models from config
      this.costModels = {
        processMetrics: {
          baseIngestionCostPerGB: thresholdsConfig.cost_model.base_ingestion_cost_per_gb,
          queryExecutionMultiplier: thresholdsConfig.cost_model.query_execution_multiplier,
          storageRetentionMultiplier: thresholdsConfig.cost_model.storage_retention_multiplier
        },
        queryOptimization: {
          complexityFactors: thresholdsConfig.cost_model.complexity_factors,
          cardinalityImpact: thresholdsConfig.cost_model.cardinality_impact
        }
      };
      
      // Store threshold values for later use
      this.thresholds = thresholdsConfig;
      
    } catch (error) {
      logger.warn('Failed to load thresholds config, using defaults:', error.message);
      
      // Fallback to hard-coded defaults if config file is not available
      this.costModels = {
        processMetrics: {
          baseIngestionCostPerGB: 0.25,
          queryExecutionMultiplier: 0.1,
          storageRetentionMultiplier: 0.05
        },
        queryOptimization: {
          complexityFactors: {
            simple: 1.0,
            moderate: 1.2,
            complex: 1.5
          },
          cardinalityImpact: {
            low: 1.0,
            medium: 1.2,
            high: 1.5
          }
        }
      };
      
      // Default thresholds
      this.thresholds = {
        process_optimization: {
          max_processes_per_host: 50,
          processes_to_keep: 25,
          high_frequency_threshold_seconds: 15,
          large_process_memory_bytes: 1073741824,
          min_event_count_threshold: 1000
        },
        query_limits: {
          default_limit: 1000,
          max_limit: 2000,
          process_discovery_limit: 100,
          top_processes_limit: 50
        }
      };
    }
    
    // NRDOT v2: Process metrics cost optimization thresholds
    this.optimizationThresholds = {
      highVolumeEventTypes: 1000000,  // Events per day
      highCardinalityAttributes: 10000,  // Unique values
      expensiveQueryComplexity: 'high'
    };
  }

  async getDataVolume(options = {}) {
    const accountId = this.config.requireAccountId();
    const since = options.since || '24 hours ago';
    const volumes = [];

    if (options.eventType) {
      // Get volume for specific event type
      const volume = await this.getEventTypeVolume(accountId, options.eventType, since);
      volumes.push(volume);
    } else {
      // Get volume for all event types
      const eventTypes = await this.client.getEventTypes(accountId, since);
      
      // Get volumes in parallel (batch of 10 to avoid rate limits)
      for (let i = 0; i < eventTypes.length; i += 10) {
        const batch = eventTypes.slice(i, i + 10);
        const batchVolumes = await Promise.all(
          batch.map(eventType => this.getEventTypeVolume(accountId, eventType, since))
        );
        volumes.push(...batchVolumes);
      }
    }

    // Calculate total and percentages
    const totalEvents = volumes.reduce((sum, v) => sum + v.eventCount, 0);
    const totalBytes = volumes.reduce((sum, v) => sum + v.estimatedBytes, 0);

    // Sort by volume and add percentages
    volumes.sort((a, b) => b.estimatedBytes - a.estimatedBytes);
    volumes.forEach(v => {
      v.percentOfTotal = totalBytes > 0 ? Math.round((v.estimatedBytes / totalBytes) * 100) : 0;
      v.estimatedSize = this.formatBytes(v.estimatedBytes);
    });

    return volumes;
  }

  async getCardinality(eventType, attribute, since = '24 hours ago') {
    const accountId = this.config.requireAccountId();
    const cacheKey = this.cache.generateKey('cardinality', accountId, eventType, attribute, since);
    
    return await this.cache.get(cacheKey, async () => {
      const query = `SELECT uniqueCount(${attribute}) as count FROM ${eventType} SINCE ${since}`;
      
      try {
        const result = await this.client.nrql(accountId, query);
        const uniqueCount = result.results[0]?.count || 0;

        const cardinality = {
          eventType,
          attribute,
          uniqueCount,
          timeRange: since,
          impact: this.assessCardinalityImpact(uniqueCount),
          suggestions: []
        };

        // Add suggestions for high cardinality
        if (uniqueCount > 10000) {
          cardinality.suggestions.push('Consider bucketing or hashing this attribute to reduce cardinality');
          cardinality.suggestions.push('Avoid using this attribute in FACET clauses for performance reasons');
          cardinality.suggestions.push('This attribute may significantly increase data storage costs');
        } else if (uniqueCount > 1000) {
          cardinality.suggestions.push('Monitor query performance when using this attribute in FACET operations');
          cardinality.suggestions.push('Consider if all unique values are necessary for your use case');
        }

        // Get sample values for context
        try {
          const sampleQuery = `SELECT uniques(${attribute}, 10) FROM ${eventType} SINCE ${since}`;
          const sampleResult = await this.client.nrql(accountId, sampleQuery);
          if (sampleResult.results.length > 0) {
            cardinality.sampleValues = sampleResult.results[0][`uniques.${attribute}`] || [];
          }
        } catch (error) {
          logger.debug(`Failed to get sample values: ${error.message}`);
        }

        return cardinality;
      } catch (error) {
        throw new ValidationError(`Failed to calculate cardinality: ${error.message}`);
      }
    });
  }

  async estimateQueryCost(query) {
    const accountId = this.config.requireAccountId();
    const estimate = {
      query,
      complexity: 'Low',
      estimatedCost: 'Low',
      costFactors: [],
      optimizations: []
    };

    try {
      // Extract query components
      const eventType = extractEventTypeFromQuery(query);
      const attributes = extractAttributesFromQuery(query);
      
      // Factor 1: Time range
      const timeMatch = query.match(/SINCE\s+(.+?)(?:\s+UNTIL|\s+FACET|\s+LIMIT|\s*$)/i);
      if (!timeMatch) {
        estimate.costFactors.push({
          factor: 'No time range',
          impact: 'high',
          description: 'Query will scan all available data'
        });
        estimate.complexity = 'High';
        estimate.optimizations.push({
          suggestion: 'Add a SINCE clause to limit data scanned',
          example: `${query} SINCE 1 hour ago`
        });
      } else {
        const timeRange = timeMatch[1];
        const days = this.parseTimeRangeToDays(timeRange);
        if (days > 7) {
          estimate.costFactors.push({
            factor: 'Large time range',
            impact: 'medium',
            description: `Scanning ${days} days of data`
          });
          estimate.complexity = 'Medium';
        }
      }

      // Factor 2: Event volume
      try {
        const volumeQuery = `SELECT count(*) FROM ${eventType} SINCE 1 hour ago`;
        const volumeResult = await this.client.nrql(accountId, volumeQuery);
        const hourlyVolume = volumeResult.results[0]?.count || 0;
        
        if (hourlyVolume > 100000) {
          estimate.costFactors.push({
            factor: 'High volume event type',
            impact: 'high',
            description: `${this.formatNumber(hourlyVolume)} events/hour`
          });
          estimate.complexity = 'High';
          estimate.estimatedCost = 'High';
        } else if (hourlyVolume > 10000) {
          estimate.costFactors.push({
            factor: 'Moderate volume event type',
            impact: 'medium',
            description: `${this.formatNumber(hourlyVolume)} events/hour`
          });
        }
      } catch (error) {
        logger.debug(`Failed to estimate volume: ${error.message}`);
      }

      // Factor 3: FACET cardinality
      const facetMatch = query.match(/FACET\s+(.+?)(?:\s+SINCE|\s+UNTIL|\s+LIMIT|\s*$)/i);
      if (facetMatch) {
        const facets = facetMatch[1].split(/\s*,\s*/);
        for (const facet of facets) {
          try {
            const cardinality = await this.getCardinality(eventType, facet.trim(), '1 hour ago');
            if (cardinality.uniqueCount > 1000) {
              estimate.costFactors.push({
                factor: `High cardinality FACET: ${facet}`,
                impact: cardinality.uniqueCount > 10000 ? 'high' : 'medium',
                description: `${this.formatNumber(cardinality.uniqueCount)} unique values`
              });
              estimate.complexity = 'High';
              estimate.optimizations.push({
                suggestion: `Consider using FACET cases() to bucket ${facet} values`,
                example: `FACET cases(WHERE ${facet} < 100 as 'low', WHERE ${facet} < 1000 as 'medium', WHERE ${facet} >= 1000 as 'high')`
              });
            }
          } catch (error) {
            logger.debug(`Failed to check facet cardinality: ${error.message}`);
          }
        }
      }

      // Factor 4: SELECT * usage
      if (query.includes('SELECT *')) {
        estimate.costFactors.push({
          factor: 'SELECT * usage',
          impact: 'medium',
          description: 'Retrieving all attributes increases data transfer'
        });
        estimate.optimizations.push({
          suggestion: 'Select only required attributes',
          example: 'SELECT attribute1, attribute2, attribute3 FROM ...'
        });
      }

      // Factor 5: Missing LIMIT on raw queries
      if (!query.match(/LIMIT/i) && !this.isAggregateQuery(query)) {
        estimate.costFactors.push({
          factor: 'No LIMIT clause',
          impact: 'medium',
          description: 'Query may return excessive results'
        });
        estimate.optimizations.push({
          suggestion: 'Add LIMIT to control result size',
          example: `${query} LIMIT 1000`
        });
      }

      // Calculate final cost estimate
      const highImpactCount = estimate.costFactors.filter(f => f.impact === 'high').length;
      const mediumImpactCount = estimate.costFactors.filter(f => f.impact === 'medium').length;
      
      if (highImpactCount >= 2 || (highImpactCount === 1 && mediumImpactCount >= 2)) {
        estimate.estimatedCost = 'Very High';
      } else if (highImpactCount === 1 || mediumImpactCount >= 2) {
        estimate.estimatedCost = 'High';
      } else if (mediumImpactCount === 1) {
        estimate.estimatedCost = 'Medium';
      }

    } catch (error) {
      estimate.error = `Failed to estimate cost: ${error.message}`;
    }

    return estimate;
  }

  async listHighCardinalityAttributes(options = {}) {
    const accountId = this.config.requireAccountId();
    const threshold = options.threshold || 1000;
    const since = options.since || '24 hours ago';
    const highCardinalityAttrs = [];

    // Get event types to check
    let eventTypes;
    if (options.eventType) {
      eventTypes = [options.eventType];
    } else {
      eventTypes = await this.client.getEventTypes(accountId, since);
      // Limit to top 10 event types by volume for performance
      const volumes = await Promise.all(
        eventTypes.slice(0, 20).map(et => this.getEventTypeVolume(accountId, et, '1 hour ago'))
      );
      volumes.sort((a, b) => b.eventCount - a.eventCount);
      eventTypes = volumes.slice(0, 10).map(v => v.eventType);
    }

    // Check attributes for each event type
    for (const eventType of eventTypes) {
      try {
        const attributes = await this.client.getEventAttributes(accountId, eventType, since);
        
        // Sample attributes to check cardinality (limit to avoid too many queries)
        const sampled = this.sampleAttributes(attributes, 20);
        
        for (const attribute of sampled) {
          try {
            const cardinality = await this.getCardinality(eventType, attribute, since);
            
            if (cardinality.uniqueCount >= threshold) {
              highCardinalityAttrs.push({
                eventType,
                attribute,
                cardinality: cardinality.uniqueCount,
                impact: cardinality.impact,
                suggestion: this.getCardinalitySuggestion(attribute, cardinality.uniqueCount)
              });
            }
          } catch (error) {
            logger.debug(`Failed to check cardinality for ${eventType}.${attribute}: ${error.message}`);
          }
        }
      } catch (error) {
        logger.debug(`Failed to process event type ${eventType}: ${error.message}`);
      }
    }

    // Sort by cardinality
    highCardinalityAttrs.sort((a, b) => b.cardinality - a.cardinality);

    return highCardinalityAttrs;
  }

  async checkOtelExport(options) {
    const accountId = this.config.requireAccountId();
    const result = {
      success: false,
      endpoint: options.endpoint,
      dataFound: false,
      latencyMs: 0,
      troubleshooting: []
    };

    try {
      // Send OTLP payload
      const startTime = Date.now();
      const response = await fetch(options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': options.licenseKey
        },
        body: JSON.stringify(options.payload)
      });

      result.httpStatus = response.status;
      result.latencyMs = Date.now() - startTime;

      if (response.ok) {
        result.success = true;
        
        // Wait a bit for data to be processed
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if data appeared in New Relic
        // This is a simplified check - in reality, you'd need to know the expected event type
        const checkQuery = `SELECT count(*) FROM Log, Metric, Span WHERE instrumentation.provider = 'opentelemetry' SINCE 1 minute ago`;
        
        try {
          const queryResult = await this.client.nrql(accountId, checkQuery);
          const count = queryResult.results[0]?.count || 0;
          
          if (count > 0) {
            result.dataFound = true;
            result.recordCount = count;
            
            // Get more details about what was ingested
            const detailQuery = `SELECT count(*) FROM Log, Metric, Span WHERE instrumentation.provider = 'opentelemetry' FACET eventType() SINCE 1 minute ago`;
            const detailResult = await this.client.nrql(accountId, detailQuery);
            
            if (detailResult.results.length > 0) {
              result.eventType = detailResult.results[0].facet;
              result.breakdown = detailResult.results.map(r => ({
                eventType: r.facet,
                count: r.count
              }));
            }
          } else {
            result.troubleshooting.push({
              check: 'Data not found in New Relic',
              solution: 'Wait a few more minutes for processing, or check if the correct account is being used'
            });
          }
        } catch (error) {
          logger.debug(`Failed to verify data ingestion: ${error.message}`);
          result.troubleshooting.push({
            check: 'Could not verify data ingestion',
            solution: 'Check query permissions and try manually querying for your data'
          });
        }
      } else {
        result.error = `HTTP ${response.status}: ${response.statusText}`;
        
        // Add troubleshooting based on status code
        if (response.status === 401) {
          result.troubleshooting.push({
            check: 'Authentication failed',
            solution: 'Verify the API key is correct and has the right permissions'
          });
        } else if (response.status === 400) {
          result.troubleshooting.push({
            check: 'Invalid payload format',
            solution: 'Ensure the payload follows OTLP JSON format specifications'
          });
        } else if (response.status === 413) {
          result.troubleshooting.push({
            check: 'Payload too large',
            solution: 'Reduce the size of the payload or split into smaller batches'
          });
        }
      }

      // General troubleshooting suggestions
      if (!result.dataFound) {
        result.troubleshooting.push({
          check: 'Verify endpoint URL',
          solution: `For US: https://otlp.nr-data.net:4318/v1/[metrics|traces|logs], For EU: https://otlp.eu01.nr-data.net:4318/v1/[metrics|traces|logs]`
        });
        
        result.troubleshooting.push({
          check: 'Check OTLP payload format',
          solution: 'Ensure resourceLogs/resourceMetrics/resourceSpans structure is correct'
        });
        
        result.troubleshooting.push({
          check: 'Verify data appears with correct attributes',
          solution: `Query: FROM Log, Metric, Span SELECT * WHERE instrumentation.provider = 'opentelemetry' SINCE 5 minutes ago`
        });
      }

    } catch (error) {
      result.error = error.message;
      result.troubleshooting.push({
        check: 'Network connectivity',
        solution: 'Ensure the endpoint is reachable from your network'
      });
    }

    return result;
  }

  // Helper methods
  async getEventTypeVolume(accountId, eventType, since) {
    const cacheKey = this.cache.generateKey('volume', accountId, eventType, since);
    
    return await this.cache.get(cacheKey, async () => {
      try {
        const query = `SELECT count(*) as eventCount, sum(bytecountestimate()) as bytes FROM ${eventType} SINCE ${since}`;
        const result = await this.client.nrql(accountId, query);
        
        if (result.results.length > 0) {
          const data = result.results[0];
          return {
            eventType,
            eventCount: data.eventCount || 0,
            estimatedBytes: data.bytes || (data.eventCount * 500), // Fallback estimate
            timeRange: since
          };
        }
      } catch (error) {
        // Fallback for event types that don't support bytecountestimate()
        try {
          const countQuery = `SELECT count(*) as eventCount FROM ${eventType} SINCE ${since}`;
          const countResult = await this.client.nrql(accountId, countQuery);
          
          if (countResult.results.length > 0) {
            const eventCount = countResult.results[0].eventCount || 0;
            return {
              eventType,
              eventCount,
              estimatedBytes: eventCount * 500, // Rough estimate: 500 bytes per event
              timeRange: since
            };
          }
        } catch (fallbackError) {
          logger.debug(`Failed to get volume for ${eventType}: ${fallbackError.message}`);
        }
      }
      
      return {
        eventType,
        eventCount: 0,
        estimatedBytes: 0,
        timeRange: since
      };
    }, 300); // Cache for 5 minutes
  }

  isAggregateQuery(query) {
    const aggregateFunctions = ['count', 'sum', 'average', 'max', 'min', 'uniqueCount', 'percentile'];
    return aggregateFunctions.some(func => 
      query.toLowerCase().includes(func.toLowerCase() + '(')
    );
  }

  parseTimeRangeToDays(timeRange) {
    const match = timeRange.match(/(\d+)\s*(hour|day|week|month)/i);
    if (!match) return 1;
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
      case 'hour': return value / 24;
      case 'day': return value;
      case 'week': return value * 7;
      case 'month': return value * 30;
      default: return value;
    }
  }

  assessCardinalityImpact(cardinality) {
    if (cardinality > 100000) return 'Critical';
    if (cardinality > 10000) return 'High';
    if (cardinality > 1000) return 'Medium';
    return 'Low';
  }

  sampleAttributes(attributes, maxSample) {
    if (attributes.length <= maxSample) return attributes;
    
    // Sample evenly across the array
    const sampled = [];
    const step = Math.floor(attributes.length / maxSample);
    
    for (let i = 0; i < attributes.length && sampled.length < maxSample; i += step) {
      sampled.push(attributes[i]);
    }
    
    return sampled;
  }

  getCardinalitySuggestion(attribute, cardinality) {
    if (cardinality > 100000) {
      return `Critical: Consider removing ${attribute} from data or using a hash function`;
    } else if (cardinality > 10000) {
      return `High: Avoid using ${attribute} in FACET clauses, consider bucketing`;
    } else if (cardinality > 1000) {
      return `Medium: Monitor performance when using ${attribute} in queries`;
    }
    return 'Low impact';
  }

  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  formatNumber(num) {
    return new Intl.NumberFormat().format(num);
  }

  // NRDOT v2: Process metrics cost analysis
  async analyzeProcessMetricsCost(options = {}) {
    const accountId = this.config.requireAccountId();
    const since = options.since || '24 hours ago';
    
    const analysis = {
      totalProcessEvents: 0,
      estimatedDailyCost: 0,
      estimatedMonthlyCost: 0,
      costBreakdown: {
        ingestion: 0,
        storage: 0,
        queryExecution: 0
      },
      optimizationOpportunities: [],
      recommendations: []
    };

    try {
      // Get ProcessSample volume
      const processVolume = await this.getEventTypeVolume(accountId, 'ProcessSample', since);
      analysis.totalProcessEvents = processVolume.eventCount;
      
      // Calculate daily rate
      const timeRangeDays = this.parseTimeRangeToDays(since);
      const dailyEvents = analysis.totalProcessEvents / timeRangeDays;
      const dailyGB = (processVolume.estimatedBytes / timeRangeDays) / (1024 * 1024 * 1024);
      
      // Calculate cost components
      analysis.costBreakdown.ingestion = dailyGB * this.costModels.processMetrics.baseIngestionCostPerGB;
      analysis.costBreakdown.storage = dailyGB * this.costModels.processMetrics.storageRetentionMultiplier * 30; // Monthly
      
      // Estimate query execution costs based on typical query patterns
      const avgQueriesPerDay = 100; // Estimate based on typical dashboard usage
      analysis.costBreakdown.queryExecution = avgQueriesPerDay * this.costModels.processMetrics.queryExecutionMultiplier;
      
      analysis.estimatedDailyCost = analysis.costBreakdown.ingestion + 
                                   (analysis.costBreakdown.storage / 30) + 
                                   analysis.costBreakdown.queryExecution;
      
      analysis.estimatedMonthlyCost = analysis.estimatedDailyCost * 30;

      // Analyze high-volume processes
      await this.analyzeHighVolumeProcesses(accountId, since, analysis);
      
      // Check for optimization opportunities
      await this.identifyProcessOptimizations(accountId, since, analysis);
      
      // Generate cost reduction recommendations
      analysis.recommendations = this.generateCostRecommendations(analysis);

    } catch (error) {
      analysis.error = `Failed to analyze process metrics cost: ${error.message}`;
      logger.debug(`Process cost analysis failed: ${error.message}`);
    }

    return analysis;
  }

  // NRDOT v2: Analyze high-volume processes
  async analyzeHighVolumeProcesses(accountId, since, analysis) {
    try {
      const query = `
        SELECT count(*) as eventCount, 
               average(timestamp - lag(timestamp)) as avgInterval
        FROM ProcessSample 
        FACET processDisplayName, hostname 
        SINCE ${since} 
        LIMIT ${this.thresholds.query_limits.top_processes_limit}
      `;
      
      const result = await this.client.nrql(accountId, query);
      const highVolumeProcesses = [];
      
      for (const item of result.results) {
        const eventCount = item.eventCount || 0;
        const processName = item.facet ? item.facet[0] : 'Unknown';
        const hostname = item.facet ? item.facet[1] : 'Unknown';
        
        if (eventCount > this.optimizationThresholds.highVolumeEventTypes / 10) { // Adjust for time period
          highVolumeProcesses.push({
            processName,
            hostname,
            eventCount,
            estimatedDailyCost: (eventCount * 500) / (1024 * 1024 * 1024) * this.costModels.processMetrics.baseIngestionCostPerGB
          });
        }
      }
      
      if (highVolumeProcesses.length > 0) {
        analysis.optimizationOpportunities.push({
          type: 'High Volume Processes',
          count: highVolumeProcesses.length,
          processes: highVolumeProcesses.slice(0, 10), // Top 10
          potentialSavings: highVolumeProcesses.reduce((sum, p) => sum + p.estimatedDailyCost, 0) * 0.3 // 30% potential reduction
        });
      }
      
    } catch (error) {
      logger.debug(`Failed to analyze high-volume processes: ${error.message}`);
    }
  }

  // NRDOT v2: Identify process optimization opportunities
  async identifyProcessOptimizations(accountId, since, analysis) {
    const optimizations = [];
    
    try {
      // Check for redundant process monitoring
      const redundancyQuery = `
        SELECT count(*) as processCount
        FROM ProcessSample 
        WHERE processDisplayName IN ('java', 'python', 'node', 'nginx', 'mysql', 'postgres')
        FACET hostname 
        SINCE ${since}
      `;
      
      const redundancyResult = await this.client.nrql(accountId, redundancyQuery);
      let totalRedundantProcesses = 0;
      
      for (const item of redundancyResult.results) {
        const processCount = item.processCount || 0;
        if (processCount > this.thresholds.process_optimization.max_processes_per_host) {
          totalRedundantProcesses += processCount - this.thresholds.process_optimization.processes_to_keep;
        }
      }
      
      if (totalRedundantProcesses > 0) {
        optimizations.push({
          type: 'Excessive Process Monitoring',
          description: 'Some hosts are monitoring too many processes',
          impact: `${totalRedundantProcesses} potentially redundant process samples`,
          potentialSavings: (totalRedundantProcesses * 500 * 24) / (1024 * 1024 * 1024) * this.costModels.processMetrics.baseIngestionCostPerGB * 30
        });
      }
      
      // Check for high-frequency sampling
      const samplingQuery = `
        SELECT count(*) as samples, 
               (max(timestamp) - min(timestamp)) / 1000 as durationSeconds
        FROM ProcessSample 
        FACET processDisplayName, hostname
        SINCE ${since}
        LIMIT ${this.thresholds.query_limits.process_discovery_limit}
      `;
      
      const samplingResult = await this.client.nrql(accountId, samplingQuery);
      let highFrequencyProcesses = 0;
      
      for (const item of samplingResult.results) {
        const samples = item.samples || 0;
        const duration = item.durationSeconds || 1;
        const frequency = samples / duration;
        
        if (frequency > 1/this.thresholds.process_optimization.high_frequency_threshold_seconds) {
          highFrequencyProcesses++;
        }
      }
      
      if (highFrequencyProcesses > 0) {
        optimizations.push({
          type: 'High Frequency Sampling',
          description: 'Some processes are sampled too frequently',
          impact: `${highFrequencyProcesses} processes with high-frequency sampling`,
          potentialSavings: highFrequencyProcesses * 0.1 * analysis.estimatedDailyCost
        });
      }
      
      analysis.optimizationOpportunities.push(...optimizations);
      
    } catch (error) {
      logger.debug(`Failed to identify process optimizations: ${error.message}`);
    }
  }

  // NRDOT v2: Generate cost reduction recommendations
  generateCostRecommendations(analysis) {
    const recommendations = [];
    
    // High volume recommendations
    const highVolumeOpp = analysis.optimizationOpportunities.find(o => o.type === 'High Volume Processes');
    if (highVolumeOpp) {
      recommendations.push({
        category: 'Volume Reduction',
        priority: 'high',
        title: 'Reduce high-volume process monitoring',
        description: `${highVolumeOpp.count} processes are generating high data volume`,
        action: 'Configure process filters to reduce monitoring scope',
        potentialSavings: `$${highVolumeOpp.potentialSavings.toFixed(2)}/day`,
        implementation: [
          'Use infrastructure agent process filters',
          'Focus on critical processes only',
          'Increase sampling intervals for non-critical processes'
        ]
      });
    }
    
    // Sampling frequency recommendations
    const samplingOpp = analysis.optimizationOpportunities.find(o => o.type === 'High Frequency Sampling');
    if (samplingOpp) {
      recommendations.push({
        category: 'Sampling Optimization',
        priority: 'medium',
        title: 'Optimize process sampling frequency',
        description: 'Some processes are sampled more frequently than necessary',
        action: 'Adjust process_sample_rate configuration',
        potentialSavings: `$${samplingOpp.potentialSavings.toFixed(2)}/day`,
        implementation: [
          'Set process_sample_rate to 60 seconds for most processes',
          'Use 30 seconds only for critical processes',
          'Consider 120 seconds for stable, non-critical processes'
        ]
      });
    }
    
    // General cost optimization
    if (analysis.estimatedDailyCost > 10) { // If daily cost exceeds $10
      recommendations.push({
        category: 'General Optimization',
        priority: 'medium',
        title: 'Implement NRDOT v2 filtering patterns',
        description: 'Apply intelligent filtering to reduce overall process metrics volume',
        action: 'Deploy process intelligence filters',
        potentialSavings: `$${(analysis.estimatedDailyCost * 0.4).toFixed(2)}/day (40% reduction)`,
        implementation: [
          'Use Process DNA patterns to identify critical processes',
          'Apply Conservative profile for stable environments',
          'Implement dynamic filtering based on process categories',
          'Enable process count thresholds and hysteresis'
        ]
      });
    }
    
    // Query optimization recommendations
    recommendations.push({
      category: 'Query Optimization',
      priority: 'low',
      title: 'Optimize process metrics queries',
      description: 'Improve dashboard and alert query efficiency',
      action: 'Apply query best practices for process metrics',
      potentialSavings: `$${(analysis.costBreakdown.queryExecution * 0.3).toFixed(2)}/day`,
      implementation: [
        'Add LIMIT clauses to process queries',
        'Use process categories in WHERE clauses',
        'Avoid high-cardinality FACETs like processId',
        'Implement query result caching'
      ]
    });
    
    return recommendations;
  }

  // NRDOT v2: Process-specific cost estimation for queries
  async estimateProcessQueryCost(query, options = {}) {
    const baseEstimate = await this.estimateQueryCost(query);
    
    // Enhance with process-specific analysis
    if (query.includes('ProcessSample')) {
      const processAnalysis = {
        ...baseEstimate,
        processSpecific: {
          isProcessQuery: true,
          estimatedProcessCount: 0,
          processingComplexity: 'low',
          costMultiplier: 1.0
        }
      };
      
      try {
        // Estimate number of processes the query will touch
        const whereClause = query.match(/WHERE\s+(.+?)(?:FACET|SINCE|LIMIT|$)/i);
        if (whereClause) {
          const conditions = whereClause[1].toLowerCase();
          
          if (conditions.includes('processDisplayName')) {
            processAnalysis.processSpecific.estimatedProcessCount = 10; // Specific process
          } else if (conditions.includes('hostname')) {
            processAnalysis.processSpecific.estimatedProcessCount = 50; // Host processes
          } else {
            processAnalysis.processSpecific.estimatedProcessCount = 500; // All processes
          }
        } else {
          processAnalysis.processSpecific.estimatedProcessCount = 1000; // No WHERE clause
        }
        
        // Calculate complexity based on query patterns
        const complexity = calculateQueryComplexity(query);
        processAnalysis.processSpecific.processingComplexity = complexity.level.toLowerCase();
        
        // Apply cost multiplier based on process count and complexity
        const processCountFactor = Math.min(processAnalysis.processSpecific.estimatedProcessCount / 100, 5.0);
        const complexityFactor = this.costModels.queryOptimization.complexityFactors[processAnalysis.processSpecific.processingComplexity];
        
        processAnalysis.processSpecific.costMultiplier = processCountFactor * complexityFactor;
        
        // Update cost estimate
        if (processAnalysis.processSpecific.costMultiplier > 2.0) {
          processAnalysis.estimatedCost = 'Very High';
          processAnalysis.optimizations.unshift({
            suggestion: 'Add process filters to reduce scope',
            example: `${query.includes('WHERE') ? query.replace('WHERE', 'WHERE hostname = "specific-host" AND') : query.replace('FROM ProcessSample', 'FROM ProcessSample WHERE hostname = "specific-host"')}`
          });
        }
        
      } catch (error) {
        logger.debug(`Failed to analyze process query cost: ${error.message}`);
      }
      
      return processAnalysis;
    }
    
    return baseEstimate;
  }
}

module.exports = {
  IngestService
};