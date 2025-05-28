#!/usr/bin/env node
/**
 * Consolidated Control Loop for NRDOT v2
 * 
 * This is a unified control loop implementation that can work with
 * multiple backends: local, docker, and New Relic One NerdGraph
 * 
 * Usage: node control-loop.js [mode] [profile] [interval]
 * - mode: local, docker, nr1 (default: local)
 * - profile: baseline, conservative, balanced, aggressive (default: balanced)
 * - interval: seconds between control loop iterations (default: 60)
 */

// Standard library imports
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load common utilities
const { createNRClient } = require('../lib/common/nr-api');
const { info, warn, error } = require('../lib/common/logging');

// Constants
const PROFILES = {
  baseline: {
    targetCoverage: 100,
    costReductionTarget: 0,
    filterAggressiveness: 0,
    samplingRate: 1.0
  },
  conservative: {
    targetCoverage: 95,
    costReductionTarget: 30,
    filterAggressiveness: 0.3,
    samplingRate: 0.8
  },
  balanced: {
    targetCoverage: 90,
    costReductionTarget: 50,
    filterAggressiveness: 0.6,
    samplingRate: 0.5
  },
  aggressive: {
    targetCoverage: 80,
    costReductionTarget: 70,
    filterAggressiveness: 0.9,
    samplingRate: 0.2
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0] || 'local';
const profileName = args[1] || 'balanced';
const interval = parseInt(args[2] || '60', 10);

// Validate inputs
if (!Object.keys(PROFILES).includes(profileName)) {
  error(`Invalid profile: ${profileName}. Must be one of: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(1);
}

// Get profile configuration
const profile = PROFILES[profileName];
info(`Starting control loop in ${mode} mode with ${profileName} profile (${interval}s interval)`);
info(`Profile config: coverage=${profile.targetCoverage}%, cost reduction=${profile.costReductionTarget}%, sampling=${profile.samplingRate}`);

// Initialize client based on mode
let client;
try {
  switch (mode) {
    case 'nr1':
      client = require('./backends/nr1-backend')(profile);
      break;
    case 'docker':
      client = require('./backends/docker-backend')(profile);
      break;
    case 'local':
    default:
      client = require('./backends/local-backend')(profile);
      break;
  }
} catch (err) {
  error(`Failed to initialize ${mode} backend: ${err.message}`);
  process.exit(1);
}

// Main control loop function
async function runControlLoop() {
  try {
    // 1. Collect metrics data
    info('Collecting metrics data...');
    const metricsData = await client.collectMetrics();
    
    // 2. Analyze current state
    info('Analyzing current state...');
    const analysisResult = await client.analyzeState(metricsData);
    
    // 3. Calculate adjustments
    info('Calculating adjustments...');
    const adjustments = await client.calculateAdjustments(analysisResult);
    
    // 4. Apply adjustments
    info('Applying adjustments...');
    await client.applyAdjustments(adjustments);
    
    // 5. Report status
    info('Reporting status...');
    await client.reportStatus();
    
    info(`Control loop iteration complete. Next run in ${interval} seconds.`);
  } catch (err) {
    error(`Control loop iteration failed: ${err.message}`);
  }
}

// Start the control loop
runControlLoop();
setInterval(runControlLoop, interval * 1000);

// Handle clean shutdown
process.on('SIGINT', async () => {
  info('Control loop shutting down...');
  if (client && client.cleanup) {
    await client.cleanup();
  }
  process.exit(0);
});
