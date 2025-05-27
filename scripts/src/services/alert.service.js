import { NerdGraphClient } from '../core/api-client.js';
import { NRQLService } from './nrql.service.js';
import { Cache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

export class AlertService {
  constructor(config) {
    this.config = config;
    this.client = new NerdGraphClient(config);
    this.nrqlService = new NRQLService(config);
    this.cache = new Cache({ 
      enabled: config.enableCache, 
      ttl: config.cacheTTL 
    });
  }

  async listPolicies(namePattern = null) {
    const accountId = this.config.requireAccountId();
    const cacheKey = this.cache.generateKey('alert-policies', accountId);
    
    const policies = await this.cache.get(cacheKey, async () => {
      return await this.client.getAlertPolicies(accountId);
    });

    // Filter by name pattern if provided
    let filtered = policies;
    if (namePattern) {
      const regex = new RegExp(namePattern, 'i');
      filtered = policies.filter(policy => regex.test(policy.name));
    }

    // Enrich with condition count
    const enriched = await Promise.all(
      filtered.map(async (policy) => {
        try {
          const conditions = await this.client.getAlertConditions(accountId, policy.id);
          return {
            ...policy,
            conditionCount: conditions.length
          };
        } catch (error) {
          logger.debug(`Failed to get conditions for policy ${policy.id}: ${error.message}`);
          return {
            ...policy,
            conditionCount: 0
          };
        }
      })
    );

    return enriched;
  }

  async describePolicy(policyIdOrName) {
    const accountId = this.config.requireAccountId();
    const policies = await this.listPolicies();
    
    // Find policy by ID or name
    let policy = policies.find(p => 
      p.id === policyIdOrName || 
      p.name === policyIdOrName ||
      p.name.toLowerCase() === policyIdOrName.toLowerCase()
    );

    if (!policy) {
      throw new ValidationError(`Policy '${policyIdOrName}' not found`);
    }

    // Get conditions
    const conditions = await this.client.getAlertConditions(accountId, policy.id);
    
    return {
      ...policy,
      conditions
    };
  }

  async validateCondition(policyIdOrName, conditionIdOrName) {
    const policy = await this.describePolicy(policyIdOrName);
    
    // Find condition
    const condition = policy.conditions.find(c => 
      c.id === conditionIdOrName || 
      c.name === conditionIdOrName ||
      c.name.toLowerCase() === conditionIdOrName.toLowerCase()
    );

    if (!condition) {
      throw new ValidationError(`Condition '${conditionIdOrName}' not found in policy '${policy.name}'`);
    }

    // Validate NRQL query
    const validation = await this.nrqlService.validateQuery(condition.nrql.query);
    
    const result = {
      policyName: policy.name,
      conditionName: condition.name,
      enabled: condition.enabled,
      query: condition.nrql.query,
      valid: validation.valid,
      queryValidation: validation
    };

    // Add specific alert condition checks
    if (validation.valid) {
      // Check if query returns numeric value for threshold comparison
      if (validation.resultCount > 0 && validation.metadata) {
        const isNumeric = await this.checkNumericResult(condition.nrql.query);
        if (!isNumeric) {
          result.valid = false;
          result.error = 'Alert query must return a numeric value for threshold comparison';
        }
      }

      // Check for appropriate aggregation
      if (!this.hasAggregation(condition.nrql.query)) {
        result.warning = 'Query should use an aggregation function (sum, average, count, etc.) for alert conditions';
      }
    }

    // Get suggestions if invalid
    if (!result.valid && validation.suggestions) {
      result.suggestions = validation.suggestions;
    }

    return result;
  }

  async checkThresholdViability(policyIdOrName, conditionIdOrName, lookback = '7 days ago') {
    const policy = await this.describePolicy(policyIdOrName);
    const condition = policy.conditions.find(c => 
      c.id === conditionIdOrName || 
      c.name === conditionIdOrName ||
      c.name.toLowerCase() === conditionIdOrName.toLowerCase()
    );

    if (!condition) {
      throw new ValidationError(`Condition '${conditionIdOrName}' not found`);
    }

    const accountId = this.config.requireAccountId();
    const analysis = {
      policyName: policy.name,
      conditionName: condition.name,
      threshold: condition.terms[0].threshold,
      operator: condition.terms[0].operator,
      query: condition.nrql.query,
      lookbackPeriod: lookback,
      historicalData: {},
      viability: {},
      recommendations: []
    };

    try {
      // Modify query to get historical data
      let historicalQuery = condition.nrql.query;
      
      // Remove existing SINCE clause and add lookback
      historicalQuery = historicalQuery.replace(/SINCE\s+[^)]+?(?=\s|$)/gi, '');
      historicalQuery += ` SINCE ${lookback}`;
      
      // If it has TIMESERIES, we can analyze trends
      if (historicalQuery.includes('TIMESERIES')) {
        const result = await this.client.nrql(accountId, historicalQuery);
        
        if (result.results.length > 0) {
          const values = result.results.map(r => {
            // Find the numeric value in the result
            const numericValue = Object.values(r).find(v => typeof v === 'number');
            return numericValue || 0;
          });

          analysis.historicalData = {
            min: Math.min(...values),
            max: Math.max(...values),
            average: values.reduce((a, b) => a + b, 0) / values.length,
            stdDev: this.calculateStdDev(values),
            dataPoints: values.length
          };

          // Analyze threshold viability
          const threshold = condition.terms[0].threshold;
          const operator = condition.terms[0].operator;
          
          let breachCount = 0;
          values.forEach(value => {
            if (this.checkThresholdBreach(value, threshold, operator)) {
              breachCount++;
            }
          });

          analysis.viability = {
            breachCount,
            breachPercentage: (breachCount / values.length) * 100,
            wouldTrigger: breachCount > 0
          };

          // Generate recommendations
          if (breachCount === 0) {
            analysis.recommendations.push({
              issue: 'Threshold never breached in historical data',
              current: `${operator} ${threshold}`,
              suggested: this.suggestThreshold(values, operator, 0.05), // 5% breach rate
              reason: 'Alert will never trigger with current threshold'
            });
          } else if (breachCount > values.length * 0.5) {
            analysis.recommendations.push({
              issue: 'Threshold breached too frequently',
              current: `${operator} ${threshold}`,
              suggested: this.suggestThreshold(values, operator, 0.01), // 1% breach rate
              reason: 'Alert will be too noisy and cause alert fatigue'
            });
          } else if (analysis.historicalData.stdDev > analysis.historicalData.average * 0.5) {
            analysis.recommendations.push({
              issue: 'High variance in metric values',
              current: 'Static threshold',
              suggested: 'Consider using baseline alerts or anomaly detection',
              reason: 'Metric has high variability that static thresholds may not handle well'
            });
          }
        }
      } else {
        // For non-timeseries queries, get statistical summary
        const statsQuery = `SELECT min(value), max(value), average(value), stddev(value) FROM (${condition.nrql.query}) SINCE ${lookback}`;
        
        try {
          const result = await this.client.nrql(accountId, statsQuery);
          if (result.results.length > 0) {
            analysis.historicalData = result.results[0];
          }
        } catch (error) {
          // Fallback to simple execution
          const result = await this.client.nrql(accountId, historicalQuery);
          if (result.results.length > 0) {
            const value = Object.values(result.results[0]).find(v => typeof v === 'number') || 0;
            analysis.historicalData = { currentValue: value };
          }
        }
      }
    } catch (error) {
      analysis.error = `Failed to analyze historical data: ${error.message}`;
    }

    return analysis;
  }

  async findUnstableAlerts(options = {}) {
    const accountId = this.config.requireAccountId();
    const lookback = options.lookback || '24 hours ago';
    const flapThreshold = options.flapThreshold || 5;
    
    // Query for alert state changes
    const query = `
      SELECT count(*) 
      FROM NrAiIncident 
      WHERE event = 'open' OR event = 'close' 
      FACET policyName, conditionName 
      SINCE ${lookback}
    `;

    const unstableAlerts = [];

    try {
      const result = await this.client.nrql(accountId, query);
      
      for (const item of result.results) {
        const stateChanges = item['count'] || 0;
        
        if (stateChanges >= flapThreshold) {
          const policyName = item['facet'][0] || 'Unknown';
          const conditionName = item['facet'][1] || 'Unknown';
          
          unstableAlerts.push({
            policy: policyName,
            condition: conditionName,
            stateChanges,
            avgChangesPerHour: stateChanges / 24, // Assuming 24 hour lookback
            recommendation: this.getStabilityRecommendation(stateChanges)
          });
        }
      }
      
      // Sort by most unstable
      unstableAlerts.sort((a, b) => b.stateChanges - a.stateChanges);
      
    } catch (error) {
      logger.error(`Failed to find unstable alerts: ${error.message}`);
    }

    return unstableAlerts;
  }

  // Helper methods
  hasAggregation(query) {
    const aggregations = ['count', 'sum', 'average', 'max', 'min', 'latest', 'uniqueCount', 'percentile'];
    return aggregations.some(agg => 
      query.toLowerCase().includes(agg.toLowerCase() + '(')
    );
  }

  async checkNumericResult(query) {
    const accountId = this.config.requireAccountId();
    
    try {
      const result = await this.client.nrql(accountId, `${query} LIMIT 1`);
      if (result.results.length > 0) {
        const firstResult = result.results[0];
        // Check if at least one value is numeric
        return Object.values(firstResult).some(v => typeof v === 'number');
      }
    } catch (error) {
      logger.debug(`Failed to check numeric result: ${error.message}`);
    }
    
    return false;
  }

  checkThresholdBreach(value, threshold, operator) {
    switch (operator.toUpperCase()) {
      case 'ABOVE':
      case 'GREATER_THAN':
        return value > threshold;
      case 'BELOW':
      case 'LESS_THAN':
        return value < threshold;
      case 'EQUALS':
        return value === threshold;
      default:
        return false;
    }
  }

  calculateStdDev(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  }

  suggestThreshold(values, operator, targetBreachRate) {
    const sorted = [...values].sort((a, b) => a - b);
    const targetIndex = Math.floor(values.length * targetBreachRate);
    
    if (operator.toUpperCase() === 'ABOVE' || operator.toUpperCase() === 'GREATER_THAN') {
      // For ABOVE, we want the value at the top targetBreachRate percentile
      const index = values.length - targetIndex - 1;
      return sorted[Math.max(0, index)];
    } else {
      // For BELOW, we want the value at the bottom targetBreachRate percentile
      return sorted[Math.min(targetIndex, values.length - 1)];
    }
  }

  getStabilityRecommendation(stateChanges) {
    if (stateChanges > 20) {
      return 'Increase evaluation window or adjust threshold significantly';
    } else if (stateChanges > 10) {
      return 'Add loss of signal handling or increase threshold margins';
    } else {
      return 'Fine-tune threshold or add evaluation offset';
    }
  }
}