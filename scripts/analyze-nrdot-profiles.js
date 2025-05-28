#!/usr/bin/env node

const fs = require('fs');
const yaml = require('js-yaml');

console.log(`
==============================================
NRDOT Profile Analysis
==============================================
`);

// Analyze configuration differences
const profiles = {
  baseline: {
    file: 'configs/collector-baseline.yaml',
    description: 'No optimization - collect everything'
  },
  conservative: {
    file: 'configs/collector-profiles/conservative.yaml', 
    description: 'Light optimization - 60s interval'
  },
  aggressive: {
    file: 'configs/collector-profiles/aggressive.yaml',
    description: 'Heavy optimization - 120s interval, minimal metrics'
  }
};

// Current metrics from our running collector
const CURRENT_METRICS = {
  total_data_points: 245,
  collection_interval: 30,
  metric_types: {
    cpu: 80,
    memory: 6,
    disk: 6,
    network: 22,
    filesystem: 9,
    paging: 4,
    load: 3
  }
};

function analyzeProfile(name, configFile) {
  console.log(`\n📊 ${name.toUpperCase()} PROFILE`);
  console.log(`File: ${configFile}`);
  
  try {
    const config = yaml.load(fs.readFileSync(configFile, 'utf8'));
    
    // Extract key settings
    const interval = config.receivers?.hostmetrics?.collection_interval || '30s';
    const intervalSeconds = parseInt(interval);
    
    // Get enabled scrapers
    const scrapers = config.receivers?.hostmetrics?.scrapers || {};
    const enabledScrapers = Object.keys(scrapers).filter(s => scrapers[s] !== false);
    
    // Calculate estimated metrics
    const estimates = calculateEstimates(name, intervalSeconds, enabledScrapers);
    
    console.log(`\nSettings:`);
    console.log(`  Collection Interval: ${interval}`);
    console.log(`  Enabled Scrapers: ${enabledScrapers.join(', ')}`);
    console.log(`  Batch Timeout: ${config.processors?.batch?.timeout || 'default'}`);
    console.log(`  Batch Size: ${config.processors?.batch?.send_batch_size || 'default'}`);
    
    console.log(`\nEstimated Metrics:`);
    console.log(`  Data Points per Collection: ${estimates.dataPointsPerCollection}`);
    console.log(`  Collections per Hour: ${estimates.collectionsPerHour}`);
    console.log(`  Data Points per Hour: ${estimates.dataPointsPerHour.toLocaleString()}`);
    console.log(`  Data Points per Month: ${(estimates.dataPointsPerMonth / 1e6).toFixed(2)}M`);
    
    console.log(`\nVs Baseline:`);
    console.log(`  Data Reduction: ${estimates.reduction.toFixed(1)}%`);
    console.log(`  Collection Frequency: ${estimates.frequencyChange}`);
    
    return estimates;
  } catch (error) {
    console.error(`  ❌ Error analyzing ${name}: ${error.message}`);
    return null;
  }
}

function calculateEstimates(profile, intervalSeconds, enabledScrapers) {
  // Base calculations on current observed metrics
  const scraperMetrics = {
    cpu: 80,
    memory: 6,
    disk: 6,
    network: 22,
    filesystem: 9,
    paging: 4,
    load: 3
  };
  
  // Calculate data points based on enabled scrapers
  let dataPointsPerCollection = 0;
  enabledScrapers.forEach(scraper => {
    dataPointsPerCollection += scraperMetrics[scraper] || 0;
  });
  
  // Add base OTLP metrics
  dataPointsPerCollection += 10;
  
  // Calculate rates
  const collectionsPerHour = 3600 / intervalSeconds;
  const dataPointsPerHour = dataPointsPerCollection * collectionsPerHour;
  const dataPointsPerMonth = dataPointsPerHour * 24 * 30;
  
  // Compare to baseline (30s interval, all metrics)
  const baselinePerMonth = CURRENT_METRICS.total_data_points * 120 * 24 * 30;
  const reduction = ((baselinePerMonth - dataPointsPerMonth) / baselinePerMonth) * 100;
  
  const frequencyChange = intervalSeconds > 30 ? 
    `${intervalSeconds/30}x slower` : 
    intervalSeconds < 30 ? `${30/intervalSeconds}x faster` : 'same';
  
  return {
    dataPointsPerCollection,
    collectionsPerHour,
    dataPointsPerHour,
    dataPointsPerMonth,
    reduction,
    frequencyChange
  };
}

// Analyze each profile
const results = {};
Object.entries(profiles).forEach(([name, profile]) => {
  results[name] = analyzeProfile(name, profile.file);
});

// Summary comparison
console.log(`\n${'='.repeat(50)}`);
console.log('COMPARISON SUMMARY');
console.log(`${'='.repeat(50)}\n`);

console.log('Monthly Data Volume:');
Object.entries(results).forEach(([name, data]) => {
  if (data) {
    console.log(`  ${name}: ${(data.dataPointsPerMonth / 1e6).toFixed(2)}M data points`);
  }
});

console.log('\nCost Reduction Potential:');
Object.entries(results).forEach(([name, data]) => {
  if (data && name !== 'baseline') {
    console.log(`  ${name}: ${data.reduction.toFixed(1)}% reduction`);
  }
});

console.log('\nRecommendations:');
console.log('  1. Conservative: Good for production - maintains visibility');
console.log('  2. Aggressive: Maximum savings but limited visibility');
console.log('  3. Consider custom profile based on your specific needs');

// Save analysis
const analysisPath = 'experiment-results/profile-analysis.json';
fs.mkdirSync('experiment-results', { recursive: true });
fs.writeFileSync(analysisPath, JSON.stringify(results, null, 2));
console.log(`\n✅ Analysis saved to: ${analysisPath}`);

// Create New Relic queries to validate
console.log(`\n${'='.repeat(50)}`);
console.log('NEW RELIC VALIDATION QUERIES');
console.log(`${'='.repeat(50)}\n`);

console.log('Run these queries to verify actual data reduction:\n');

console.log(`-- Current baseline metrics
SELECT rate(count(*), 1 hour) as 'Hourly Data Points'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
AND service.name = 'nrdot-collector'
SINCE 1 hour ago

-- After switching to conservative
SELECT rate(count(*), 1 hour) as 'Hourly Data Points'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
AND service.name = 'nrdot-collector-conservative'
SINCE 1 hour ago

-- Cost estimation
SELECT rate(count(*), 1 month) / 1e9 as 'Billion Data Points/Month',
       rate(count(*), 1 month) / 1e9 * 0.30 as 'Estimated Cost (USD)'
FROM Metric 
WHERE host.id = 'dashbuilder-host'
SINCE 1 hour ago
`);