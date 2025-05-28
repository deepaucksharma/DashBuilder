#!/usr/bin/env node

require('dotenv').config();
const { program } = require('commander');
const { NerdGraphClient } = require('./src/core/api-client');
const { logger } = require('./src/utils/logger');
const { output } = require('./src/utils/output');

// Unified diagnostics tool for NRDOT
// Combines functionality from check-*.js scripts

class NRDOTDiagnostics {
  constructor() {
    this.client = new NerdGraphClient({
      apiKey: process.env.NEW_RELIC_USER_API_KEY,
      accountId: process.env.NEW_RELIC_ACCOUNT_ID,
      region: process.env.NEW_RELIC_REGION || 'US'
    });
  }

  async checkAccountInfo() {
    const query = `{
      actor {
        user {
          name
          email
        }
        account(id: ${process.env.NEW_RELIC_ACCOUNT_ID}) {
          name
          id
          licenseKey
        }
      }
    }`;

    try {
      const result = await this.client.query(query);
      if (result.data.actor.account) {
        output.success('Account Information:');
        output.json(result.data.actor);
        return true;
      } else {
        output.error('Account not found or access denied');
        return false;
      }
    } catch (error) {
      output.error('Failed to fetch account info:', error.message);
      return false;
    }
  }

  async checkHostEntity() {
    const query = `{
      actor {
        entitySearch(query: "type = 'HOST' AND reporting = 'true'") {
          results {
            entities {
              guid
              name
              type
              reporting
              ... on HostEntityOutline {
                osName
                cpuPercent
                memoryPercent
                diskPercent
              }
            }
          }
        }
      }
    }`;

    try {
      const result = await this.client.query(query);
      const hosts = result.data.actor.entitySearch.results.entities;
      
      if (hosts.length > 0) {
        output.success(`Found ${hosts.length} host(s):`);
        hosts.forEach(host => {
          output.info(`  - ${host.name} (${host.osName || 'Unknown OS'})`);
          if (host.cpuPercent !== undefined) {
            output.info(`    CPU: ${host.cpuPercent.toFixed(1)}%, Memory: ${host.memoryPercent.toFixed(1)}%, Disk: ${host.diskPercent.toFixed(1)}%`);
          }
        });
        return true;
      } else {
        output.warn('No host entities found');
        return false;
      }
    } catch (error) {
      output.error('Failed to check host entities:', error.message);
      return false;
    }
  }

  async checkRecentMetrics(metricPattern = 'system.%') {
    const query = `{
      actor {
        account(id: ${process.env.NEW_RELIC_ACCOUNT_ID}) {
          nrql(query: "SELECT count(*) FROM Metric WHERE metricName LIKE '${metricPattern}' SINCE 5 minutes ago FACET metricName LIMIT 50") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.client.query(query);
      const metrics = result.data.actor.account.nrql.results;
      
      if (metrics.length > 0) {
        output.success(`Found ${metrics.length} metric types matching '${metricPattern}':`);
        metrics.forEach(metric => {
          output.info(`  - ${metric.facet}: ${metric.count} data points`);
        });
        return true;
      } else {
        output.warn(`No metrics found matching pattern '${metricPattern}'`);
        return false;
      }
    } catch (error) {
      output.error('Failed to check recent metrics:', error.message);
      return false;
    }
  }

  async checkCollectorMetrics() {
    const collectorMetrics = [
      'otelcol_process_uptime',
      'otelcol_processor_accepted_metric_points',
      'otelcol_processor_dropped_metric_points',
      'otelcol_exporter_sent_metric_points',
      'otelcol_exporter_send_failed_metric_points'
    ];

    const query = `{
      actor {
        account(id: ${process.env.NEW_RELIC_ACCOUNT_ID}) {
          nrql(query: "SELECT latest(value) FROM Metric WHERE metricName IN (${collectorMetrics.map(m => `'${m}'`).join(',')}) SINCE 5 minutes ago FACET metricName") {
            results
          }
        }
      }
    }`;

    try {
      const result = await this.client.query(query);
      const metrics = result.data.actor.account.nrql.results;
      
      if (metrics.length > 0) {
        output.success('OpenTelemetry Collector Metrics:');
        metrics.forEach(metric => {
          output.info(`  - ${metric.facet}: ${metric['latest.value']}`);
        });
        return true;
      } else {
        output.warn('No collector metrics found - collector may not be running');
        return false;
      }
    } catch (error) {
      output.error('Failed to check collector metrics:', error.message);
      return false;
    }
  }

  async checkAllMetrics() {
    const categories = [
      { name: 'System Metrics', pattern: 'system.%' },
      { name: 'Process Metrics', pattern: 'process.%' },
      { name: 'Container Metrics', pattern: 'container.%' },
      { name: 'Custom Metrics', pattern: 'custom.%' },
      { name: 'NRDOT Metrics', pattern: 'nrdot.%' }
    ];

    let totalMetrics = 0;

    for (const category of categories) {
      const query = `{
        actor {
          account(id: ${process.env.NEW_RELIC_ACCOUNT_ID}) {
            nrql(query: "SELECT uniqueCount(metricName) FROM Metric WHERE metricName LIKE '${category.pattern}' SINCE 1 hour ago") {
              results
            }
          }
        }
      }`;

      try {
        const result = await this.client.query(query);
        const count = result.data.actor.account.nrql.results[0]['uniqueCount.metricName'] || 0;
        
        if (count > 0) {
          output.info(`${category.name}: ${count} unique metrics`);
          totalMetrics += count;
        }
      } catch (error) {
        output.warn(`Failed to check ${category.name}: ${error.message}`);
      }
    }

    output.success(`\nTotal unique metrics: ${totalMetrics}`);
    return totalMetrics > 0;
  }

  async runFullDiagnostics() {
    output.header('NRDOT Diagnostics Report');
    output.info(`Timestamp: ${new Date().toISOString()}`);
    output.info(`Account ID: ${process.env.NEW_RELIC_ACCOUNT_ID}`);
    output.info(`Region: ${process.env.NEW_RELIC_REGION || 'US'}\n`);

    const checks = [
      { name: 'Account Access', fn: () => this.checkAccountInfo() },
      { name: 'Host Entities', fn: () => this.checkHostEntity() },
      { name: 'Collector Metrics', fn: () => this.checkCollectorMetrics() },
      { name: 'All Metrics', fn: () => this.checkAllMetrics() },
      { name: 'Recent System Metrics', fn: () => this.checkRecentMetrics('system.%') }
    ];

    let passed = 0;
    let failed = 0;

    for (const check of checks) {
      output.header(`\nChecking ${check.name}...`);
      const result = await check.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    }

    output.header('\nDiagnostics Summary');
    output.success(`Passed: ${passed}`);
    if (failed > 0) {
      output.error(`Failed: ${failed}`);
    }
    output.info(`Total: ${passed + failed}`);

    return failed === 0;
  }
}

program
  .name('nrdot-diagnostics')
  .description('Comprehensive diagnostics tool for NRDOT')
  .version('1.0.0');

program
  .command('account')
  .description('Check account information and access')
  .action(async () => {
    const diagnostics = new NRDOTDiagnostics();
    await diagnostics.checkAccountInfo();
  });

program
  .command('hosts')
  .description('Check host entities')
  .action(async () => {
    const diagnostics = new NRDOTDiagnostics();
    await diagnostics.checkHostEntity();
  });

program
  .command('metrics [pattern]')
  .description('Check metrics by pattern')
  .action(async (pattern = 'system.%') => {
    const diagnostics = new NRDOTDiagnostics();
    await diagnostics.checkRecentMetrics(pattern);
  });

program
  .command('collector')
  .description('Check OpenTelemetry collector metrics')
  .action(async () => {
    const diagnostics = new NRDOTDiagnostics();
    await diagnostics.checkCollectorMetrics();
  });

program
  .command('all')
  .description('Run all diagnostics checks')
  .action(async () => {
    const diagnostics = new NRDOTDiagnostics();
    const success = await diagnostics.runFullDiagnostics();
    process.exit(success ? 0 : 1);
  });

program.parse(process.argv);

// Default to full diagnostics if no command specified
if (!process.argv.slice(2).length) {
  const diagnostics = new NRDOTDiagnostics();
  diagnostics.runFullDiagnostics().then(success => {
    process.exit(success ? 0 : 1);
  });
}
