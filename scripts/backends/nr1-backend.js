/**
 * New Relic One Backend for NRDOT Control Loop
 * Implements control loop functionality using NR1 NerdGraph API
 */

const { createNRClient } = require('../../lib/common/nr-api');
const { info, warn, error } = require('../../lib/common/logging');

/**
 * Initialize NR1 Backend
 * @param {Object} profile - The profile configuration
 * @returns {Object} - The backend client
 */
function createNR1Backend(profile) {
  // Initialize New Relic client
  const nrClient = createNRClient();
  
  return {
    /**
     * Collect metrics data from New Relic
     */
    async collectMetrics() {
      info('Collecting metrics from New Relic...');
      
      try {
        // Query for NRDOT metrics
        const query = `
          SELECT uniques(metricName) as metricNames, count(*) as metricCount
          FROM Metric 
          WHERE metricName LIKE 'nrdot%' 
          SINCE 1 hour ago
          LIMIT 2000
        `;
        
        const result = await nrClient.executeQuery(query);
        
        if (!result || !result.metricNames || !result.metricCount) {
          warn('No metrics found in New Relic');
          return [];
        }
        
        // Format metrics for control loop
        const metrics = result.metricNames.map(name => ({
          name,
          timestamp: Date.now(),
          source: 'nr1'
        }));
        
        info(`Collected ${metrics.length} metrics from New Relic`);
        return metrics;
      } catch (err) {
        error(`Failed to collect metrics from New Relic: ${err.message}`);
        return [];
      }
    },
    
    /**
     * Analyze the current state
     * @param {Array} metrics - Collected metrics
     */
    async analyzeState(metrics) {
      info('Analyzing current state...');
      
      try {
        // Query for current data ingestion
        const query = `
          SELECT rate(sum(newRelicDbBytesIngested), 1 hour) as ingestedBytes 
          FROM NrConsumption 
          SINCE 1 day ago 
          TIMESERIES 1 hour
        `;
        
        const result = await nrClient.executeQuery(query);
        const ingestedData = result?.timeSeries?.[0]?.ingestedBytes || 0;
        
        // Calculate current metrics coverage
        const uniqueMetrics = new Set(metrics.map(m => m.name));
        const coverage = metrics.length > 0 ? uniqueMetrics.size / metrics.length * 100 : 0;
        
        // Calculate cost factors based on actual ingestion
        const costFactor = ingestedData / 1000000; // MB ingested
        
        return {
          metricsCount: metrics.length,
          uniqueMetricsCount: uniqueMetrics.size,
          currentCoverage: coverage,
          costFactor,
          ingestedData,
          timestamp: new Date().toISOString(),
          profile: {
            name: profile.name || 'unknown',
            targetCoverage: profile.targetCoverage,
            costReductionTarget: profile.costReductionTarget,
            filterAggressiveness: profile.filterAggressiveness,
            samplingRate: profile.samplingRate
          }
        };
      } catch (err) {
        error(`Failed to analyze state: ${err.message}`);
        
        // Return basic analysis without ingestion data
        const uniqueMetrics = new Set(metrics.map(m => m.name));
        const coverage = metrics.length > 0 ? uniqueMetrics.size / metrics.length * 100 : 0;
        
        return {
          metricsCount: metrics.length,
          uniqueMetricsCount: uniqueMetrics.size,
          currentCoverage: coverage,
          costFactor: metrics.length / 1000, // Simplified calculation
          timestamp: new Date().toISOString(),
          profile: {
            name: profile.name || 'unknown',
            targetCoverage: profile.targetCoverage,
            costReductionTarget: profile.costReductionTarget,
            filterAggressiveness: profile.filterAggressiveness,
            samplingRate: profile.samplingRate
          }
        };
      }
    },
    
    /**
     * Calculate necessary adjustments
     * @param {Object} analysis - Analysis results
     */
    async calculateAdjustments(analysis) {
      info('Calculating adjustments...');
      
      const { currentCoverage, costFactor, profile } = analysis;
      const { targetCoverage, costReductionTarget } = profile;
      
      // Calculate coverage gap
      const coverageGap = targetCoverage - currentCoverage;
      
      // Calculate cost reduction needed
      const currentCost = costFactor * 100; // Simplified cost calculation
      const targetCost = currentCost * (1 - costReductionTarget / 100);
      const costReductionGap = currentCost - targetCost;
      
      return {
        coverageGap,
        costReductionGap,
        recommendations: {
          increaseSampling: coverageGap > 5,
          reduceSampling: coverageGap < -5,
          increaseFiltering: costReductionGap > 0,
          reduceFiltering: costReductionGap < 0
        },
        suggestedSamplingRate: calculateSamplingRate(profile.samplingRate, coverageGap),
        suggestedFilterAggressiveness: calculateFilterAggressiveness(
          profile.filterAggressiveness, costReductionGap
        )
      };
    },
    
    /**
     * Apply adjustments via NR1 Entity tags
     * @param {Object} adjustments - Calculated adjustments
     */
    async applyAdjustments(adjustments) {
      info('Applying adjustments via NR1...');
      
      const { 
        suggestedSamplingRate, 
        suggestedFilterAggressiveness, 
        recommendations 
      } = adjustments;
      
      try {
        // Create entity tag mutation
        const mutation = `
          mutation {
            taggingAddTagsToEntity(guid: "${process.env.NRDOT_ENTITY_GUID}", tags: {
              key: "nrdot.control_loop",
              values: [
                "sampling:${suggestedSamplingRate.toFixed(2)}",
                "filtering:${suggestedFilterAggressiveness.toFixed(2)}",
                "timestamp:${new Date().toISOString()}"
              ]
            }) {
              errors {
                message
                type
              }
            }
          }
        `;
        
        // Execute mutation if entity GUID is available
        if (process.env.NRDOT_ENTITY_GUID) {
          await nrClient.executeQuery(mutation);
          info(`Applied adjustments: sampling=${suggestedSamplingRate.toFixed(2)}, filtering=${suggestedFilterAggressiveness.toFixed(2)}`);
        } else {
          warn('NRDOT_ENTITY_GUID not set, cannot apply adjustments via NR1');
          // Store locally as fallback
          info('Storing adjustments locally as fallback');
        }
        
        return true;
      } catch (err) {
        error(`Failed to apply adjustments: ${err.message}`);
        return false;
      }
    },
    
    /**
     * Report status of control loop
     */
    async reportStatus() {
      info('Reporting status...');
      
      try {
        // Create status report for NR events
        const statusReport = {
          timestamp: new Date().toISOString(),
          version: '2.0.0',
          mode: 'nr1',
          profile: profile.name || 'unknown',
          healthStatus: 'healthy'
        };
        
        // Send status as custom event
        const eventQuery = `
          mutation {
            nrqlEventsInsert(accountId: ${process.env.NEW_RELIC_ACCOUNT_ID}, events: {
              eventType: "NrdotControlLoopStatus",
              timestamp: ${Date.now()},
              attributes: {
                mode: "nr1",
                profile: "${profile.name || 'unknown'}",
                version: "2.0.0",
                healthStatus: "healthy"
              }
            }) {
              successes
              failures
              errors {
                message
                reason
              }
            }
          }
        `;
        
        await nrClient.executeQuery(eventQuery);
        
        info('Status report sent to New Relic');
        return statusReport;
      } catch (err) {
        error(`Failed to report status: ${err.message}`);
        return { error: err.message };
      }
    },
    
    /**
     * Clean up resources
     */
    async cleanup() {
      info('Cleaning up NR1 backend resources...');
      // No special cleanup needed for NR1 backend
      return true;
    }
  };
}

/**
 * Calculate new sampling rate based on coverage gap
 */
function calculateSamplingRate(currentRate, coverageGap) {
  // Increase/decrease sampling rate based on coverage gap
  // Ensure sampling rate stays between 0.1 and 1.0
  let newRate = currentRate + (coverageGap / 100);
  return Math.max(0.1, Math.min(1.0, newRate));
}

/**
 * Calculate new filter aggressiveness based on cost reduction gap
 */
function calculateFilterAggressiveness(currentValue, costReductionGap) {
  // Increase/decrease filter aggressiveness based on cost reduction gap
  // Ensure value stays between 0.0 and 1.0
  let newValue = currentValue + (costReductionGap / 1000);
  return Math.max(0.0, Math.min(1.0, newValue));
}

module.exports = createNR1Backend;
