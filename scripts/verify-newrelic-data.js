#!/usr/bin/env node

/**
 * New Relic Data Verification Script
 * Verifies that metrics, traces, and logs are being received by New Relic
 */

const https = require('https');
const chalk = require('chalk');

// Configuration
const config = {
  accountId: process.env.NEW_RELIC_ACCOUNT_ID || '33',
  apiKey: process.env.NEW_RELIC_API_KEY,
  region: process.env.NEW_RELIC_REGION || 'US',
  services: ['nrdot-collector', 'dashbuilder', 'control-loop']
};

// API endpoints
const endpoints = {
  US: {
    graphql: 'https://api.newrelic.com/graphql'
  },
  EU: {
    graphql: 'https://api.eu.newrelic.com/graphql'
  }
};

// Verification checks
const checks = {
  // Check if OTEL collector is sending metrics
  otelCollectorMetrics: {
    name: 'OTEL Collector Metrics',
    query: `SELECT count(*) FROM Metric WHERE metricName LIKE 'otelcol_%' SINCE 5 minutes ago`,
    validate: (result) => result > 0
  },
  
  // Check if host metrics are being collected
  hostMetrics: {
    name: 'Host Metrics',
    query: `SELECT count(*) FROM Metric WHERE metricName IN ('system.cpu.utilization', 'system.memory.utilization', 'system.disk.io') SINCE 5 minutes ago`,
    validate: (result) => result > 0
  },
  
  // Check if process metrics are being collected
  processMetrics: {
    name: 'Process Metrics',
    query: `SELECT count(*) FROM ProcessSample SINCE 5 minutes ago`,
    validate: (result) => result > 0
  },
  
  // Check if container metrics are being collected
  containerMetrics: {
    name: 'Container Metrics',
    query: `SELECT count(*) FROM ContainerSample SINCE 5 minutes ago`,
    validate: (result) => result > 0
  },
  
  // Check if custom NRDOT metrics exist
  nrdotMetrics: {
    name: 'NRDOT Custom Metrics',
    query: `SELECT count(*) FROM Metric WHERE metricName LIKE 'nrdot.%' SINCE 5 minutes ago`,
    validate: (result) => result > 0
  },
  
  // Check distributed traces
  traces: {
    name: 'Distributed Traces',
    query: `SELECT count(*) FROM Span WHERE service.name IN ('nrdot-collector', 'dashbuilder', 'control-loop') SINCE 5 minutes ago`,
    validate: (result) => result > 0
  },
  
  // Check logs
  logs: {
    name: 'Log Ingestion',
    query: `SELECT count(*) FROM Log WHERE service IN ('nrdot-collector', 'dashbuilder', 'control-loop') SINCE 5 minutes ago`,
    validate: (result) => result > 0
  },
  
  // Check specific NRDOT optimization metrics
  optimizationMetrics: {
    name: 'NRDOT Optimization Metrics',
    query: `SELECT latest(nrdot.cost.reduction) as costReduction, latest(nrdot.process.coverage) as coverage FROM Metric WHERE metricName IN ('nrdot.cost.reduction', 'nrdot.process.coverage') SINCE 5 minutes ago`,
    validate: (result) => result !== null
  }
};

// Helper to make NRQL queries via GraphQL
async function queryNewRelic(nrql) {
  const query = `{
    actor {
      account(id: ${config.accountId}) {
        nrql(query: "${nrql.replace(/"/g, '\\"')}") {
          results
        }
      }
    }
  }`;
  
  return queryGraphQL(query).then(response => {
    if (response.errors) {
      throw new Error(response.errors[0].message);
    }
    return {
      results: response.data?.actor?.account?.nrql?.results || []
    };
  });
}

// GraphQL query for service health
async function queryGraphQL(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    
    const url = new URL(endpoints[config.region].graphql);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': config.apiKey,
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Run verification checks
async function runVerification() {
  console.log(chalk.blue.bold('\n🔍 New Relic Data Verification\n'));
  console.log(chalk.gray(`Account ID: ${config.accountId}`));
  console.log(chalk.gray(`Region: ${config.region}\n`));
  
  const results = {
    passed: 0,
    failed: 0,
    details: {}
  };
  
  // Check each metric type
  for (const [key, check] of Object.entries(checks)) {
    process.stdout.write(`Checking ${check.name}... `);
    
    try {
      const response = await queryNewRelic(check.query);
      
      if (response.results && response.results[0]) {
        const result = response.results[0];
        // Extract the numeric value from various result formats
        let value = result.count || result.latest || result.results || result;
        
        // If it's still an object, try to extract the first numeric value
        if (typeof value === 'object' && !Array.isArray(value)) {
          const keys = Object.keys(value);
          if (keys.length > 0) {
            value = value[keys[0]];
          }
        }
        
        if (check.validate(value)) {
          console.log(chalk.green('✓ PASS'));
          results.passed++;
          results.details[key] = { status: 'pass', value };
        } else {
          console.log(chalk.red('✗ FAIL'));
          results.failed++;
          results.details[key] = { status: 'fail', value };
        }
      } else {
        console.log(chalk.yellow('⚠ NO DATA'));
        results.failed++;
        results.details[key] = { status: 'no_data' };
      }
    } catch (error) {
      console.log(chalk.red('✗ ERROR'));
      results.failed++;
      results.details[key] = { status: 'error', error: error.message };
    }
  }
  
  // Check service health via GraphQL
  console.log(chalk.blue('\n📊 Service Health Check\n'));
  
  const serviceQuery = `
    {
      actor {
        entities(guids: []) {
          search(query: "name IN ('${config.services.join("', '")}')") {
            results {
              entities {
                name
                type
                reporting
                alertSeverity
                ... on ApmApplicationEntity {
                  apmSummary {
                    responseTimeAverage
                    throughput
                    errorRate
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  
  try {
    const serviceHealth = await queryGraphQL(serviceQuery);
    if (serviceHealth.data?.actor?.entities?.search?.results?.entities) {
      const entities = serviceHealth.data.actor.entities.search.results.entities;
      
      entities.forEach(entity => {
        console.log(`${entity.name}: ${entity.reporting ? chalk.green('✓ Reporting') : chalk.red('✗ Not Reporting')}`);
        if (entity.apmSummary) {
          console.log(chalk.gray(`  Response Time: ${entity.apmSummary.responseTimeAverage}ms`));
          console.log(chalk.gray(`  Throughput: ${entity.apmSummary.throughput} rpm`));
          console.log(chalk.gray(`  Error Rate: ${entity.apmSummary.errorRate}%`));
        }
      });
    }
  } catch (error) {
    console.log(chalk.red('Failed to check service health:', error.message));
  }
  
  // Summary
  console.log(chalk.blue('\n📈 Verification Summary\n'));
  console.log(`Total Checks: ${results.passed + results.failed}`);
  console.log(`Passed: ${chalk.green(results.passed)}`);
  console.log(`Failed: ${chalk.red(results.failed)}`);
  
  if (results.failed > 0) {
    console.log(chalk.yellow('\n⚠️  Some checks failed. Details:'));
    
    Object.entries(results.details).forEach(([key, detail]) => {
      if (detail.status === 'fail' || detail.status === 'no_data') {
        console.log(`  - ${checks[key].name}: ${detail.status === 'no_data' ? 'No data found' : `Value: ${detail.value}`}`);
      }
    });
    
    console.log(chalk.yellow('\nTroubleshooting tips:'));
    console.log('1. Ensure services are running: docker-compose ps');
    console.log('2. Check OTEL collector logs: docker-compose logs otel-collector');
    console.log('3. Verify API key permissions in New Relic');
    console.log('4. Wait 2-3 minutes for data to appear after starting services');
  } else {
    console.log(chalk.green('\n✅ All verification checks passed!'));
    
    // Show optimization metrics if available
    if (results.details.optimizationMetrics?.value) {
      const metrics = results.details.optimizationMetrics.value;
      console.log(chalk.blue('\n📊 NRDOT Optimization Metrics:'));
      console.log(`Cost Reduction: ${metrics.costReduction || 0}%`);
      console.log(`Process Coverage: ${metrics.coverage || 0}%`);
    }
  }
  
  return results;
}

// Configuration comparison
async function compareConfigurations(profiles = ['baseline', 'conservative', 'balanced', 'aggressive']) {
  console.log(chalk.blue.bold('\n🔄 Configuration Comparison\n'));
  
  const comparison = {};
  
  for (const profile of profiles) {
    const query = `
      SELECT 
        count(*) as dataPoints,
        uniqueCount(metricName) as uniqueMetrics,
        uniqueCount(processDisplayName) as processes
      FROM Metric 
      WHERE nrdot.profile = '${profile}' 
      SINCE 10 minutes ago
    `;
    
    try {
      const response = await queryNewRelic(query);
      if (response.results && response.results[0]) {
        comparison[profile] = response.results[0];
      }
    } catch (error) {
      comparison[profile] = { error: error.message };
    }
  }
  
  // Display comparison table
  console.log('Profile       | Data Points | Unique Metrics | Processes');
  console.log('--------------|-------------|----------------|----------');
  
  Object.entries(comparison).forEach(([profile, data]) => {
    if (data.error) {
      console.log(`${profile.padEnd(13)} | ${chalk.red('Error')}`.padEnd(50));
    } else {
      console.log(
        `${profile.padEnd(13)} | ${(data.dataPoints || 0).toString().padEnd(11)} | ` +
        `${(data.uniqueMetrics || 0).toString().padEnd(14)} | ${data.processes || 0}`
      );
    }
  });
}

// Main execution
async function main() {
  // Check required environment variables
  if (!config.apiKey) {
    console.error(chalk.red('ERROR: NEW_RELIC_API_KEY environment variable is required'));
    process.exit(1);
  }
  
  // Run verification
  const results = await runVerification();
  
  // If running multiple configurations, compare them
  if (process.argv.includes('--compare')) {
    await compareConfigurations();
  }
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\nError:', error.message));
  process.exit(1);
});

// Run main function
main();