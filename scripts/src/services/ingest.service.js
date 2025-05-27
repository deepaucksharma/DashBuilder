import { NerdGraphClient } from '../core/api-client.js';
import { Cache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { extractEventTypeFromQuery, extractAttributesFromQuery } from '../utils/validators.js';
import { ValidationError } from '../utils/errors.js';

export class IngestService {
  constructor(config) {
    this.config = config;
    this.client = new NerdGraphClient(config);
    this.cache = new Cache({ 
      enabled: config.enableCache, 
      ttl: 300 // 5 minute cache for ingest metrics
    });
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
}