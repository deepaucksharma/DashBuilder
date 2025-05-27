#!/usr/bin/env node

import chalk from 'chalk';
import ora from 'ora';
import cron from 'node-cron';
import { ConfigManager } from './lib/config-manager.js';
import { ValidationService } from './lib/validation-service.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './lib/error-handler.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

class DashBuilderMonitor {
  constructor() {
    this.config = new ConfigManager();
    this.validator = new ValidationService();
    this.metrics = {
      apiCalls: 0,
      dashboardsCreated: 0,
      errors: 0,
      lastCheck: null
    };
    this.alerts = [];
  }

  async start() {
    console.log(chalk.blue.bold('\n📊 DashBuilder Monitor\n'));

    try {
      await this.config.loadFromFile('.dashbuilder/config.json');
      await this.loadMonitoringConfig();
      
      // Initial health check
      await this.performHealthCheck();
      
      // Setup scheduled tasks
      this.setupScheduledTasks();
      
      // Start real-time monitoring
      this.startRealTimeMonitoring();
      
      console.log(chalk.green('✅ Monitoring started successfully'));
      console.log(chalk.gray('Press Ctrl+C to stop\n'));
      
    } catch (error) {
      logger.error('Failed to start monitoring:', error);
      await errorHandler.handle(error, { component: 'monitor' });
      process.exit(1);
    }
  }

  async loadMonitoringConfig() {
    try {
      const configPath = './orchestrator/config/monitoring.json';
      const content = await fs.readFile(configPath, 'utf8');
      this.monitoringConfig = JSON.parse(content);
    } catch (error) {
      logger.warn('Using default monitoring configuration');
      this.monitoringConfig = {
        enabled: true,
        interval: '*/5 * * * *',
        healthChecks: ['api_connectivity', 'dashboard_validation', 'quota_usage'],
        alerts: { email: null, slack: null }
      };
    }
  }

  setupScheduledTasks() {
    // Health check every 5 minutes
    cron.schedule(this.monitoringConfig.interval, async () => {
      logger.info('Running scheduled health check');
      await this.performHealthCheck();
    });

    // Metrics collection every minute
    cron.schedule('* * * * *', async () => {
      await this.collectMetrics();
    });

    // Daily report
    cron.schedule('0 9 * * *', async () => {
      await this.generateDailyReport();
    });

    logger.info('Scheduled tasks configured');
  }

  async performHealthCheck() {
    const spinner = ora('Performing health check...').start();
    const results = [];

    try {
      // API Connectivity
      if (this.monitoringConfig.healthChecks.includes('api_connectivity')) {
        const apiCheck = await this.checkApiConnectivity();
        results.push(apiCheck);
      }

      // Dashboard Validation
      if (this.monitoringConfig.healthChecks.includes('dashboard_validation')) {
        const dashboardCheck = await this.checkDashboards();
        results.push(dashboardCheck);
      }

      // Quota Usage
      if (this.monitoringConfig.healthChecks.includes('quota_usage')) {
        const quotaCheck = await this.checkQuotaUsage();
        results.push(quotaCheck);
      }

      // Component Status
      const componentCheck = await this.checkComponents();
      results.push(componentCheck);

      // Analyze results
      const failed = results.filter(r => r.status === 'failed');
      const warnings = results.filter(r => r.status === 'warning');

      if (failed.length > 0) {
        spinner.fail(`Health check failed: ${failed.length} issues`);
        await this.sendAlert('Health Check Failed', failed);
      } else if (warnings.length > 0) {
        spinner.warn(`Health check completed with ${warnings.length} warnings`);
      } else {
        spinner.succeed('Health check passed');
      }

      await this.saveHealthCheckResults(results);
      
    } catch (error) {
      spinner.fail('Health check error');
      logger.error('Health check failed:', error);
      await errorHandler.handle(error, { component: 'health-check' });
    }
  }

  async checkApiConnectivity() {
    try {
      const { stdout } = await execAsync(
        'cd scripts && node src/cli.js nrql query --query "SELECT 1"',
        {
          timeout: 10000,
          env: {
            ...process.env,
            NEW_RELIC_API_KEY: this.config.get('apiKeys.userKey'),
            NEW_RELIC_ACCOUNT_ID: this.config.get('newrelic.accountId')
          }
        }
      );

      return {
        name: 'API Connectivity',
        status: 'passed',
        message: 'API is accessible'
      };

    } catch (error) {
      return {
        name: 'API Connectivity',
        status: 'failed',
        message: 'Cannot connect to New Relic API',
        error: error.message
      };
    }
  }

  async checkDashboards() {
    try {
      const { stdout } = await execAsync(
        'cd scripts && node src/cli.js dashboard list --json',
        {
          env: {
            ...process.env,
            NEW_RELIC_API_KEY: this.config.get('apiKeys.userKey'),
            NEW_RELIC_ACCOUNT_ID: this.config.get('newrelic.accountId')
          }
        }
      );

      const dashboards = JSON.parse(stdout);
      const recentDashboards = dashboards.filter(d => {
        const created = new Date(d.createdAt);
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return created > dayAgo;
      });

      return {
        name: 'Dashboard Status',
        status: 'passed',
        message: `${dashboards.length} total dashboards, ${recentDashboards.length} created recently`,
        metrics: {
          total: dashboards.length,
          recent: recentDashboards.length
        }
      };

    } catch (error) {
      return {
        name: 'Dashboard Status',
        status: 'warning',
        message: 'Could not retrieve dashboard list',
        error: error.message
      };
    }
  }

  async checkQuotaUsage() {
    try {
      // Check API rate limits
      const { stdout } = await execAsync(
        'cd scripts && node src/cli.js account get --json',
        {
          env: {
            ...process.env,
            NEW_RELIC_API_KEY: this.config.get('apiKeys.userKey'),
            NEW_RELIC_ACCOUNT_ID: this.config.get('newrelic.accountId')
          }
        }
      );

      const account = JSON.parse(stdout);
      
      // Mock quota check (would need actual API endpoint)
      const quotaUsage = {
        apiCalls: this.metrics.apiCalls,
        dashboards: account.dashboardCount || 0,
        widgets: account.widgetCount || 0
      };

      const quotaPercent = (quotaUsage.apiCalls / 10000) * 100; // Assuming 10k limit

      return {
        name: 'Quota Usage',
        status: quotaPercent > 90 ? 'warning' : 'passed',
        message: `API usage at ${quotaPercent.toFixed(1)}%`,
        metrics: quotaUsage
      };

    } catch (error) {
      return {
        name: 'Quota Usage',
        status: 'warning',
        message: 'Could not check quota usage',
        error: error.message
      };
    }
  }

  async checkComponents() {
    const components = this.config.get('components') || [];
    const results = [];

    for (const component of components) {
      let status = 'passed';
      let message = `${component} is configured`;

      try {
        switch (component) {
          case 'cli':
            await fs.access('./scripts/node_modules');
            break;
          case 'automation':
            await fs.access('./automation/node_modules');
            break;
          case 'nr1':
            await fs.access('./nrdot-nr1-app/node_modules');
            break;
        }
      } catch (error) {
        status = 'warning';
        message = `${component} may need setup`;
      }

      results.push({ component, status, message });
    }

    return {
      name: 'Component Status',
      status: results.every(r => r.status === 'passed') ? 'passed' : 'warning',
      message: `${results.filter(r => r.status === 'passed').length}/${components.length} components healthy`,
      components: results
    };
  }

  async collectMetrics() {
    try {
      // Update metrics from various sources
      const logsDir = path.join(process.cwd(), 'logs');
      const files = await fs.readdir(logsDir).catch(() => []);
      
      const todayLogs = files.filter(f => 
        f.includes(new Date().toISOString().split('T')[0])
      );

      // Count API calls from logs
      for (const logFile of todayLogs) {
        const content = await fs.readFile(path.join(logsDir, logFile), 'utf8');
        const apiCalls = (content.match(/API call/gi) || []).length;
        this.metrics.apiCalls += apiCalls;
      }

      this.metrics.lastCheck = new Date().toISOString();
      
    } catch (error) {
      logger.error('Failed to collect metrics:', error);
    }
  }

  async generateDailyReport() {
    console.log(chalk.cyan('\n📈 Generating daily report...\n'));

    const report = {
      date: new Date().toISOString().split('T')[0],
      metrics: this.metrics,
      health: await this.performHealthCheck(),
      alerts: this.alerts.filter(a => {
        const alertTime = new Date(a.timestamp);
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return alertTime > yesterday;
      })
    };

    const reportPath = path.join(
      process.cwd(),
      'reports',
      `daily-${report.date}.json`
    );

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(chalk.green(`✅ Daily report saved to ${reportPath}`));

    // Send email if configured
    if (this.monitoringConfig.alerts.email) {
      await this.sendEmailReport(report);
    }
  }

  async sendAlert(title, issues) {
    const alert = {
      timestamp: new Date().toISOString(),
      title,
      issues,
      severity: issues.some(i => i.status === 'failed') ? 'critical' : 'warning'
    };

    this.alerts.push(alert);

    // Console alert
    console.log(chalk.red.bold(`\n🚨 ALERT: ${title}`));
    issues.forEach(issue => {
      console.log(chalk.yellow(`  - ${issue.name}: ${issue.message}`));
    });

    // Save alert
    const alertPath = path.join(
      process.cwd(),
      'alerts',
      `alert-${Date.now()}.json`
    );

    await fs.mkdir(path.dirname(alertPath), { recursive: true });
    await fs.writeFile(alertPath, JSON.stringify(alert, null, 2));

    // Send notifications
    if (this.monitoringConfig.alerts.slack) {
      await this.sendSlackAlert(alert);
    }
  }

  async sendSlackAlert(alert) {
    // Implement Slack webhook integration
    logger.info('Slack alert would be sent here', alert);
  }

  async sendEmailReport(report) {
    // Implement email sending
    logger.info('Email report would be sent here', report);
  }

  startRealTimeMonitoring() {
    // Monitor file changes
    const watchDirs = [
      './scripts',
      './automation',
      './nrdot-nr1-app'
    ];

    console.log(chalk.gray('Monitoring for changes in:'));
    watchDirs.forEach(dir => console.log(chalk.gray(`  - ${dir}`)));
    
    // In production, would use chokidar or similar for file watching
  }

  async saveHealthCheckResults(results) {
    const healthDir = path.join(process.cwd(), 'monitoring', 'health-checks');
    await fs.mkdir(healthDir, { recursive: true });

    const resultFile = path.join(
      healthDir,
      `health-${Date.now()}.json`
    );

    await fs.writeFile(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        warnings: results.filter(r => r.status === 'warning').length,
        failed: results.filter(r => r.status === 'failed').length
      }
    }, null, 2));
  }

  async stop() {
    console.log(chalk.yellow('\n⏹️  Stopping monitor...'));
    
    // Save final metrics
    const metricsPath = path.join(
      process.cwd(),
      'monitoring',
      'metrics-final.json'
    );

    await fs.mkdir(path.dirname(metricsPath), { recursive: true });
    await fs.writeFile(metricsPath, JSON.stringify(this.metrics, null, 2));

    console.log(chalk.green('✅ Monitor stopped'));
  }
}

// Run monitor
const monitor = new DashBuilderMonitor();

monitor.start().catch(error => {
  console.error(chalk.red('Failed to start monitor:'), error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await monitor.stop();
  process.exit(0);
});