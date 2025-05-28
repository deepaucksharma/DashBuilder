/**
 * Local Backend for NRDOT Control Loop
 * Implements control loop functionality using local file system
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const { info, warn, error } = require('../../lib/common/logging');

/**
 * Initialize Local Backend
 * @param {Object} profile - The profile configuration
 * @returns {Object} - The backend client
 */
function createLocalBackend(profile) {
  // Base paths
  const configPath = process.env.CONFIG_PATH || path.resolve(__dirname, '../../configs');
  const statePath = process.env.STATE_PATH || path.resolve(__dirname, '../../data/state');
  
  // Ensure state directory exists
  if (!fs.existsSync(statePath)) {
    fs.mkdirSync(statePath, { recursive: true });
    info(`Created state directory: ${statePath}`);
  }
  
  return {
    /**
     * Collect metrics data from local files
     */
    async collectMetrics() {
      info('Collecting metrics from local files...');
      
      try {
        // Read metrics from filesystem or local storage
        const metricFiles = fs.readdirSync(statePath)
          .filter(file => file.endsWith('.json'))
          .map(file => path.join(statePath, file));
        
        if (metricFiles.length === 0) {
          warn('No metric files found in state directory');
          return [];
        }
        
        // Process metrics files
        const metrics = [];
        for (const file of metricFiles) {
          try {
            const content = fs.readFileSync(file, 'utf-8');
            const data = JSON.parse(content);
            metrics.push(...data);
          } catch (err) {
            warn(`Failed to parse metrics file ${file}: ${err.message}`);
          }
        }
        
        info(`Collected ${metrics.length} metrics from ${metricFiles.length} files`);
        return metrics;
      } catch (err) {
        error(`Failed to collect metrics: ${err.message}`);
        return [];
      }
    },
    
    /**
     * Analyze the current state
     * @param {Array} metrics - Collected metrics
     */
    async analyzeState(metrics) {
      info('Analyzing current state...');
      
      // Calculate current metrics coverage
      const uniqueMetrics = new Set(metrics.map(m => m.name));
      const coverage = metrics.length > 0 ? uniqueMetrics.size / metrics.length * 100 : 0;
      
      // Calculate cost factors
      const costFactor = metrics.length / 1000; // Simplified cost calculation
      
      return {
        metricsCount: metrics.length,
        uniqueMetricsCount: uniqueMetrics.size,
        currentCoverage: coverage,
        costFactor,
        timestamp: new Date().toISOString(),
        profile: {
          name: profile.name || 'unknown',
          targetCoverage: profile.targetCoverage,
          costReductionTarget: profile.costReductionTarget,
          filterAggressiveness: profile.filterAggressiveness,
          samplingRate: profile.samplingRate
        }
      };
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
     * Apply adjustments to the system
     * @param {Object} adjustments - Calculated adjustments
     */
    async applyAdjustments(adjustments) {
      info('Applying adjustments...');
      
      const { 
        suggestedSamplingRate, 
        suggestedFilterAggressiveness, 
        recommendations 
      } = adjustments;
      
      // Create updated configuration
      const updatedConfig = {
        samplingRate: suggestedSamplingRate,
        filterAggressiveness: suggestedFilterAggressiveness,
        timestamp: new Date().toISOString()
      };
      
      // Save updated configuration
      const configFile = path.join(statePath, 'control-loop-config.json');
      fs.writeFileSync(configFile, JSON.stringify(updatedConfig, null, 2));
      
      info(`Applied adjustments: sampling=${suggestedSamplingRate.toFixed(2)}, filtering=${suggestedFilterAggressiveness.toFixed(2)}`);
      
      return true;
    },
    
    /**
     * Report status of control loop
     */
    async reportStatus() {
      info('Reporting status...');
      
      try {
        // Read current configuration
        const configFile = path.join(statePath, 'control-loop-config.json');
        let config = {};
        
        if (fs.existsSync(configFile)) {
          config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        }
        
        // Create status report
        const statusReport = {
          timestamp: new Date().toISOString(),
          version: '2.0.0',
          mode: 'local',
          profile: profile.name || 'unknown',
          configuration: config,
          healthStatus: 'healthy'
        };
        
        // Save status report
        const statusFile = path.join(statePath, 'status-report.json');
        fs.writeFileSync(statusFile, JSON.stringify(statusReport, null, 2));
        
        info('Status report generated successfully');
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
      info('Cleaning up local backend resources...');
      // No special cleanup needed for local backend
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

module.exports = createLocalBackend;
