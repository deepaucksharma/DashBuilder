#!/usr/bin/env node

require('dotenv').config();
const { program } = require('commander');
const { NerdGraphClient } = require('./src/core/api-client');
const { output } = require('./src/utils/output');

// Unified metric finder tool
// Combines find-otel-metrics.js, find-system-metrics.js, and list-metrics.js

class MetricFinder {
  constructor() {
    this.client = new NerdGraphClient({
      apiKey: process.env.NEW_RELIC_USER_API_KEY,
      accountId: process.env.NEW_RELIC_ACCOUNT_ID,
      region: process.env.NEW_RELIC_REGION || 'US'
    });
  }

  async findMetrics(pattern = '%', limit = 100) {
    const query = `{
      actor {
        account(id: ${process.env.NEW_RELIC_ACCOUNT_ID}) {
          nrql(query: "SELECT uniques(metricName) FROM Metric WHERE metricName LIKE '${pattern}' SINCE 1 hour ago LIMIT ${limit}") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.client.query(query);
      const metrics = result.data.actor.account.nrql.results[0]['uniques.metricName'] || [];
      return metrics;
    } catch (error) {
      output.error('Failed to find metrics:', error.message);
      return [];
    }
  }

  async findMetricsWithAttributes(pattern = '%', attributes = []) {
    let whereClause = `metricName LIKE '${pattern}'`;
    
    // Add attribute filters
    attributes.forEach(attr => {
      if (attr.includes('=')) {
        const [key, value] = attr.split('=');
        whereClause += ` AND ${key} = '${value}'`;
      } else {
        whereClause += ` AND ${attr} IS NOT NULL`;
      }
    });

    const query = `{
      actor {
        account(id: ${process.env.NEW_RELIC_ACCOUNT_ID}) {
          nrql(query: "SELECT uniques(metricName), count(*) FROM Metric WHERE ${whereClause} SINCE 1 hour ago FACET metricName LIMIT 100") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.client.query(query);
      return result.data.actor.account.nrql.results || [];
    } catch (error) {
      output.error('Failed to find metrics with attributes:', error.message);
      return [];
    }
  }

  async getMetricDetails(metricName) {
    const query = `{
      actor {
        account(id: ${process.env.NEW_RELIC_ACCOUNT_ID}) {
          latest: nrql(query: "SELECT latest(value) FROM Metric WHERE metricName = '${metricName}' SINCE 5 minutes ago") {
            results
          }
          attributes: nrql(query: "SELECT keyset() FROM Metric WHERE metricName = '${metricName}' SINCE 1 hour ago LIMIT 1") {
            results
          }
          stats: nrql(query: "SELECT count(*), min(value), max(value), average(value) FROM Metric WHERE metricName = '${metricName}' SINCE 1 hour ago") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.client.query(query);
      return {
        latest: result.data.actor.latest.results[0],
        attributes: result.data.actor.attributes.results[0],
        stats: result.data.actor.stats.results[0]
      };
    } catch (error) {
      output.error('Failed to get metric details:', error.message);
      return null;
    }
  }

  async findSystemMetrics() {
    const systemPatterns = [
      'system.cpu%',
      'system.memory%',
      'system.disk%',
      'system.network%',
      'system.filesystem%',
      'system.load%'
    ];

    output.header('System Metrics');
    
    for (const pattern of systemPatterns) {
      const metrics = await this.findMetrics(pattern);
      if (metrics.length > 0) {
        output.info(`\n${pattern}:`);
        metrics.forEach(metric => {
          output.info(`  - ${metric}`);
        });
      }
    }
  }

  async findOTelCollectorMetrics() {
    const collectorPatterns = [
      'otelcol_%',
      'up{job="otel-collector"}',
      'otlp_%'
    ];

    output.header('OpenTelemetry Collector Metrics');
    
    for (const pattern of collectorPatterns) {
      const metrics = await this.findMetrics(pattern);
      if (metrics.length > 0) {
        output.info(`\n${pattern}:`);
        metrics.forEach(metric => {
          output.info(`  - ${metric}`);
        });
      }
    }
  }

  async findProcessMetrics(serviceName) {
    const whereClause = serviceName 
      ? `service.name = '${serviceName}'`
      : 'service.name IS NOT NULL';

    output.header(serviceName ? `Process Metrics for ${serviceName}` : 'All Process Metrics');
    
    const processPatterns = [
      'process.cpu%',
      'process.memory%',
      'process.runtime%',
      'process.threads%'
    ];

    for (const pattern of processPatterns) {
      const metrics = await this.findMetricsWithAttributes(pattern, [whereClause]);
      if (metrics.length > 0) {
        output.info(`\n${pattern}:`);
        metrics.forEach(result => {
          output.info(`  - ${result.metricName}: ${result.count} data points`);
        });
      }
    }
  }
}

program
  .name('find-metrics')
  .description('Find and explore metrics in New Relic')
  .version('1.0.0');

program
  .command('search [pattern]')
  .description('Search for metrics by pattern (use % as wildcard)')
  .option('-l, --limit <number>', 'Limit number of results', '100')
  .option('-a, --attributes <attrs...>', 'Filter by attributes (key=value or key)')
  .action(async (pattern = '%', options) => {
    const finder = new MetricFinder();
    
    if (options.attributes) {
      const results = await finder.findMetricsWithAttributes(pattern, options.attributes);
      if (results.length > 0) {
        output.success(`Found ${results.length} metrics:`);
        results.forEach(result => {
          output.info(`  ${result.metricName}: ${result.count} data points`);
        });
      } else {
        output.warn('No metrics found');
      }
    } else {
      const metrics = await finder.findMetrics(pattern, parseInt(options.limit));
      if (metrics.length > 0) {
        output.success(`Found ${metrics.length} metrics:`);
        metrics.forEach(metric => {
          output.info(`  - ${metric}`);
        });
      } else {
        output.warn('No metrics found');
      }
    }
  });

program
  .command('details <metricName>')
  .description('Get detailed information about a specific metric')
  .action(async (metricName) => {
    const finder = new MetricFinder();
    const details = await finder.getMetricDetails(metricName);
    
    if (details) {
      output.header(`Details for ${metricName}`);
      
      if (details.latest) {
        output.info('\nLatest Value:');
        output.json(details.latest);
      }
      
      if (details.attributes) {
        output.info('\nAttributes:');
        const keys = details.attributes.keyset || [];
        keys.forEach(key => {
          output.info(`  - ${key}`);
        });
      }
      
      if (details.stats) {
        output.info('\nStatistics (last hour):');
        output.json(details.stats);
      }
    }
  });

program
  .command('system')
  .description('Find all system metrics')
  .action(async () => {
    const finder = new MetricFinder();
    await finder.findSystemMetrics();
  });

program
  .command('otel')
  .description('Find OpenTelemetry collector metrics')
  .action(async () => {
    const finder = new MetricFinder();
    await finder.findOTelCollectorMetrics();
  });

program
  .command('process [serviceName]')
  .description('Find process metrics (optionally filtered by service name)')
  .action(async (serviceName) => {
    const finder = new MetricFinder();
    await finder.findProcessMetrics(serviceName);
  });

program.parse(process.argv);

// Show help if no command specified
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
