#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log(`
==============================================
NRDOT Configuration Experiment Runner
==============================================
`);

// Since we can't query New Relic API directly, we'll focus on 
// what we CAN measure: local metrics collection differences

class NRDOTExperiment {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      baseline: {},
      profiles: {}
    };
  }

  async runProfile(profileName, configFile, duration = 300) {
    console.log(`\n🔬 Testing profile: ${profileName}`);
    console.log(`   Duration: ${duration} seconds`);
    
    try {
      // Stop current collector
      execSync('docker-compose stop otel-collector', { stdio: 'inherit' });
      
      // Update docker-compose to use new config
      const dockerCompose = fs.readFileSync('docker-compose.yml', 'utf8');
      const updated = dockerCompose.replace(
        /collector-[a-z-]+\.yaml/,
        configFile
      );
      fs.writeFileSync('docker-compose.yml', updated);
      
      // Start collector with new config
      execSync('docker-compose up -d otel-collector', { stdio: 'inherit' });
      
      // Wait for startup
      console.log('   Waiting for collector to stabilize...');
      await this.sleep(30000);
      
      // Collect metrics for duration
      const metrics = await this.collectMetrics(profileName, duration);
      
      return metrics;
    } catch (error) {
      console.error(`   ❌ Error testing ${profileName}:`, error.message);
      return null;
    }
  }

  async collectMetrics(profileName, duration) {
    const startTime = Date.now();
    const samples = [];
    
    console.log(`   📊 Collecting metrics for ${duration} seconds...`);
    
    while (Date.now() - startTime < duration * 1000) {
      try {
        // Collect from Prometheus endpoint
        const metricsOutput = execSync('curl -s http://localhost:8889/metrics', { encoding: 'utf8' });
        
        // Parse key metrics
        const sample = {
          timestamp: new Date().toISOString(),
          metrics: this.parseMetrics(metricsOutput)
        };
        
        samples.push(sample);
        
        // Show progress
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        process.stdout.write(`\r   Progress: ${elapsed}/${duration}s`);
        
        // Wait 30 seconds between samples
        await this.sleep(30000);
      } catch (error) {
        console.error(`\n   ⚠️  Failed to collect sample: ${error.message}`);
      }
    }
    
    console.log('\n   ✅ Collection complete!');
    
    return this.analyzeMetrics(samples);
  }

  parseMetrics(metricsText) {
    const metrics = {};
    
    // Count unique metric series
    const systemMetrics = metricsText.match(/^system_[a-z_]+/gm) || [];
    metrics.uniqueMetrics = new Set(systemMetrics.map(m => m.split('{')[0])).size;
    
    // Count total data points
    metrics.totalDataPoints = (metricsText.match(/^system_/gm) || []).length;
    
    // Extract specific values
    const cpuMatch = metricsText.match(/system_cpu_load_average_1m[^}]*}\s+(\d+\.?\d*)/);
    metrics.cpuLoad1m = cpuMatch ? parseFloat(cpuMatch[1]) : 0;
    
    // Count by metric type
    metrics.cpuMetrics = (metricsText.match(/^system_cpu_/gm) || []).length;
    metrics.memoryMetrics = (metricsText.match(/^system_memory_/gm) || []).length;
    metrics.diskMetrics = (metricsText.match(/^system_disk_/gm) || []).length;
    metrics.networkMetrics = (metricsText.match(/^system_network_/gm) || []).length;
    metrics.filesystemMetrics = (metricsText.match(/^system_filesystem_/gm) || []).length;
    
    return metrics;
  }

  analyzeMetrics(samples) {
    if (samples.length === 0) return null;
    
    const analysis = {
      sampleCount: samples.length,
      duration: samples.length * 30, // seconds
      metrics: {}
    };
    
    // Calculate averages
    const metricKeys = Object.keys(samples[0].metrics);
    metricKeys.forEach(key => {
      const values = samples.map(s => s.metrics[key]);
      analysis.metrics[key] = {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values)
      };
    });
    
    // Estimate data volume (rough calculation)
    analysis.estimatedDataPointsPerHour = analysis.metrics.totalDataPoints.avg * 120;
    analysis.estimatedDataPointsPerMonth = analysis.estimatedDataPointsPerHour * 24 * 30;
    
    return analysis;
  }

  async runExperiment() {
    console.log('Starting NRDOT Configuration Experiment...\n');
    
    // Test configurations
    const profiles = [
      {
        name: 'baseline',
        config: 'collector-baseline.yaml',
        description: 'Standard collection without optimization'
      },
      {
        name: 'balanced',
        config: 'collector-nrdot.yaml', 
        description: 'Balanced optimization'
      },
      {
        name: 'conservative',
        config: 'collector-profiles/conservative.yaml',
        description: 'Conservative optimization (light filtering)'
      },
      {
        name: 'aggressive',
        config: 'collector-profiles/aggressive.yaml',
        description: 'Aggressive optimization (heavy filtering)'
      }
    ];
    
    // Run each profile
    for (const profile of profiles) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Profile: ${profile.name}`);
      console.log(`Description: ${profile.description}`);
      console.log(`${'='.repeat(50)}`);
      
      const results = await this.runProfile(
        profile.name,
        profile.config,
        180 // 3 minutes per profile for quick test
      );
      
      if (results) {
        this.results.profiles[profile.name] = results;
      }
    }
    
    // Generate report
    this.generateReport();
  }

  generateReport() {
    const reportPath = path.join(__dirname, '..', 'experiment-results', `nrdot-experiment-${Date.now()}.json`);
    
    // Ensure directory exists
    const dir = path.dirname(reportPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Save raw results
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    
    console.log(`\n${'='.repeat(50)}`);
    console.log('EXPERIMENT RESULTS SUMMARY');
    console.log(`${'='.repeat(50)}\n`);
    
    // Display comparison
    const profiles = Object.keys(this.results.profiles);
    const baseline = this.results.profiles.baseline;
    
    profiles.forEach(profile => {
      const data = this.results.profiles[profile];
      console.log(`\n📊 ${profile.toUpperCase()}`);
      console.log(`   Total Data Points: ${data.metrics.totalDataPoints.avg.toFixed(0)}`);
      console.log(`   Unique Metrics: ${data.metrics.uniqueMetrics.avg.toFixed(0)}`);
      console.log(`   Est. Monthly Data Points: ${(data.estimatedDataPointsPerMonth / 1e6).toFixed(2)}M`);
      
      if (baseline && profile !== 'baseline') {
        const reduction = ((baseline.estimatedDataPointsPerMonth - data.estimatedDataPointsPerMonth) / baseline.estimatedDataPointsPerMonth * 100);
        console.log(`   Data Reduction vs Baseline: ${reduction.toFixed(1)}%`);
      }
      
      console.log(`   CPU Metrics: ${data.metrics.cpuMetrics.avg.toFixed(0)}`);
      console.log(`   Memory Metrics: ${data.metrics.memoryMetrics.avg.toFixed(0)}`);
      console.log(`   Disk Metrics: ${data.metrics.diskMetrics.avg.toFixed(0)}`);
      console.log(`   Network Metrics: ${data.metrics.networkMetrics.avg.toFixed(0)}`);
    });
    
    console.log(`\n\n✅ Full results saved to: ${reportPath}\n`);
    
    // Create markdown summary
    this.createMarkdownSummary();
  }

  createMarkdownSummary() {
    const summaryPath = path.join(__dirname, '..', 'experiment-results', 'latest-experiment-summary.md');
    
    let markdown = `# NRDOT Configuration Experiment Results

**Date**: ${this.results.timestamp}

## Summary

This experiment compared different NRDOT configuration profiles to measure their impact on metric collection volume and coverage.

## Results by Profile

`;

    const profiles = Object.keys(this.results.profiles);
    const baseline = this.results.profiles.baseline;
    
    profiles.forEach(profile => {
      const data = this.results.profiles[profile];
      markdown += `### ${profile.charAt(0).toUpperCase() + profile.slice(1)} Profile

- **Total Data Points**: ${data.metrics.totalDataPoints.avg.toFixed(0)}
- **Unique Metrics**: ${data.metrics.uniqueMetrics.avg.toFixed(0)}
- **Estimated Monthly Volume**: ${(data.estimatedDataPointsPerMonth / 1e6).toFixed(2)}M data points
`;

      if (baseline && profile !== 'baseline') {
        const reduction = ((baseline.estimatedDataPointsPerMonth - data.estimatedDataPointsPerMonth) / baseline.estimatedDataPointsPerMonth * 100);
        markdown += `- **Data Reduction**: ${reduction.toFixed(1)}% vs baseline\n`;
      }

      markdown += `
**Metric Breakdown**:
- CPU Metrics: ${data.metrics.cpuMetrics.avg.toFixed(0)}
- Memory Metrics: ${data.metrics.memoryMetrics.avg.toFixed(0)}
- Disk Metrics: ${data.metrics.diskMetrics.avg.toFixed(0)}
- Network Metrics: ${data.metrics.networkMetrics.avg.toFixed(0)}
- Filesystem Metrics: ${data.metrics.filesystemMetrics.avg.toFixed(0)}

`;
    });

    markdown += `## Recommendations

Based on these results, consider:
1. **Balanced Profile**: Good compromise between coverage and volume
2. **Conservative Profile**: Minimal impact while reducing some redundancy
3. **Aggressive Profile**: Maximum savings but verify critical metrics aren't lost

## Next Steps

1. Verify critical metrics are still collected in optimized profiles
2. Calculate actual cost savings based on New Relic pricing
3. Deploy chosen profile to production
`;

    fs.writeFileSync(summaryPath, markdown);
    console.log(`📄 Markdown summary saved to: ${summaryPath}`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Check if configs exist
function checkConfigs() {
  const configsToCheck = [
    'configs/collector-baseline.yaml',
    'configs/collector-nrdot.yaml',
    'configs/collector-profiles/conservative.yaml',
    'configs/collector-profiles/aggressive.yaml'
  ];
  
  const missing = configsToCheck.filter(config => !fs.existsSync(config));
  
  if (missing.length > 0) {
    console.error('❌ Missing configuration files:');
    missing.forEach(file => console.error(`   - ${file}`));
    console.error('\nPlease create these configurations first.');
    process.exit(1);
  }
}

// Main execution
async function main() {
  checkConfigs();
  
  const experiment = new NRDOTExperiment();
  await experiment.runExperiment();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Experiment failed:', error);
    process.exit(1);
  });
}

module.exports = { NRDOTExperiment };