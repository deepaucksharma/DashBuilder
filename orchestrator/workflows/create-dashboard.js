#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { ConfigManager } from '../lib/config-manager.js';
import { ValidationService } from '../lib/validation-service.js';
import { logger } from '../lib/logger.js';
import { createDashboard as createDashboardDirect } from '../../lib/shared/index.js';

const execAsync = promisify(exec);

export class CreateDashboardWorkflow {
  constructor() {
    this.config = new ConfigManager();
    this.validator = new ValidationService();
  }

  async run(options = {}) {
    console.log(chalk.blue.bold('\n📊 Create Dashboard Workflow\n'));

    try {
      await this.config.loadFromFile('.dashbuilder/config.json');
      
      const dashboardConfig = await this.gatherDashboardConfig(options);
      const dashboard = await this.createDashboard(dashboardConfig);
      
      if (options.verify) {
        await this.verifyDashboard(dashboard);
      }
      
      if (options.deploy) {
        await this.deployToNR1(dashboard);
      }
      
      await this.saveWorkflowResults(dashboard);
      
      console.log(chalk.green.bold('\n✨ Dashboard created successfully!\n'));
      return dashboard;
      
    } catch (error) {
      logger.error('Workflow failed:', error);
      throw error;
    }
  }

  async gatherDashboardConfig(options) {
    if (options.template) {
      return await this.loadTemplate(options.template);
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Dashboard name:',
        default: `Dashboard ${new Date().toISOString().split('T')[0]}`
      },
      {
        type: 'list',
        name: 'type',
        message: 'Dashboard type:',
        choices: [
          { name: 'Application Performance', value: 'apm' },
          { name: 'Infrastructure', value: 'infra' },
          { name: 'Browser Performance', value: 'browser' },
          { name: 'Custom Metrics', value: 'custom' },
          { name: 'Multi-purpose', value: 'multi' }
        ]
      },
      {
        type: 'checkbox',
        name: 'widgets',
        message: 'Select widgets to include:',
        choices: (answers) => this.getWidgetChoices(answers.type)
      },
      {
        type: 'input',
        name: 'appName',
        message: 'Application name (for filtering):',
        when: answers => ['apm', 'browser'].includes(answers.type)
      }
    ]);

    return this.buildDashboardConfig(answers);
  }

  getWidgetChoices(type) {
    const widgetSets = {
      apm: [
        { name: 'Response Time', value: 'responseTime' },
        { name: 'Throughput', value: 'throughput' },
        { name: 'Error Rate', value: 'errorRate' },
        { name: 'Database Performance', value: 'database' },
        { name: 'External Services', value: 'external' }
      ],
      infra: [
        { name: 'CPU Usage', value: 'cpu' },
        { name: 'Memory Usage', value: 'memory' },
        { name: 'Disk I/O', value: 'diskio' },
        { name: 'Network Traffic', value: 'network' },
        { name: 'Process List', value: 'processes' }
      ],
      browser: [
        { name: 'Page Load Time', value: 'pageLoad' },
        { name: 'JS Errors', value: 'jsErrors' },
        { name: 'Ajax Performance', value: 'ajax' },
        { name: 'Session Timeline', value: 'sessions' }
      ],
      custom: [
        { name: 'Custom NRQL Query', value: 'customQuery' },
        { name: 'Custom Chart', value: 'customChart' },
        { name: 'Markdown Note', value: 'markdown' }
      ]
    };

    return widgetSets[type] || [...widgetSets.apm, ...widgetSets.infra];
  }

  async buildDashboardConfig(answers) {
    const config = {
      name: answers.name,
      description: `Created by DashBuilder on ${new Date().toISOString()}`,
      permissions: 'PUBLIC_READ_WRITE',
      pages: [{
        name: 'Overview',
        description: '',
        widgets: []
      }]
    };

    // Add widgets based on selections
    for (const widgetType of answers.widgets) {
      const widget = await this.createWidget(widgetType, answers);
      config.pages[0].widgets.push(widget);
    }

    return config;
  }

  async createWidget(type, context) {
    const widgetTemplates = {
      responseTime: {
        title: 'Response Time',
        configuration: {
          area: {
            queries: [{
              accountId: this.config.get('newrelic.accountId'),
              query: `SELECT average(duration) FROM Transaction WHERE appName = '${context.appName}' TIMESERIES`
            }]
          }
        },
        layout: { column: 1, row: 1, width: 4, height: 3 }
      },
      throughput: {
        title: 'Throughput',
        configuration: {
          line: {
            queries: [{
              accountId: this.config.get('newrelic.accountId'),
              query: `SELECT rate(count(*), 1 minute) FROM Transaction WHERE appName = '${context.appName}' TIMESERIES`
            }]
          }
        },
        layout: { column: 5, row: 1, width: 4, height: 3 }
      },
      errorRate: {
        title: 'Error Rate',
        configuration: {
          billboard: {
            queries: [{
              accountId: this.config.get('newrelic.accountId'),
              query: `SELECT percentage(count(*), WHERE error IS true) FROM Transaction WHERE appName = '${context.appName}'`
            }]
          }
        },
        layout: { column: 9, row: 1, width: 4, height: 3 }
      },
      cpu: {
        title: 'CPU Usage',
        configuration: {
          line: {
            queries: [{
              accountId: this.config.get('newrelic.accountId'),
              query: `SELECT average(cpuPercent) FROM SystemSample TIMESERIES`
            }]
          }
        },
        layout: { column: 1, row: 1, width: 6, height: 3 }
      },
      memory: {
        title: 'Memory Usage',
        configuration: {
          area: {
            queries: [{
              accountId: this.config.get('newrelic.accountId'),
              query: `SELECT average(memoryUsedPercent) FROM SystemSample TIMESERIES`
            }]
          }
        },
        layout: { column: 7, row: 1, width: 6, height: 3 }
      }
    };

    return widgetTemplates[type] || widgetTemplates.responseTime;
  }

  async createDashboard(config) {
    const spinner = ora('Creating dashboard...').start();

    try {
      // Set environment variables for the shared library
      process.env.NEW_RELIC_API_KEY = this.config.get('apiKeys.userKey');
      process.env.NEW_RELIC_ACCOUNT_ID = this.config.get('newrelic.accountId');

      // Create dashboard using direct function call
      const result = await createDashboardDirect(config);

      spinner.succeed('Dashboard created');

      return {
        ...config,
        id: result.id,
        url: result.url,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      spinner.fail('Failed to create dashboard');
      throw error;
    }
  }

  async verifyDashboard(dashboard) {
    if (!dashboard.id) {
      logger.warn('Cannot verify dashboard without ID');
      return;
    }

    const spinner = ora('Verifying dashboard...').start();

    try {
      // Use browser automation to verify
      const { stdout } = await execAsync(
        `cd automation && node src/examples/verify-dashboard.js`,
        {
          input: dashboard.name,
          env: {
            ...process.env,
            DASHBOARD_NAME: dashboard.name
          }
        }
      );

      spinner.succeed('Dashboard verified');
      logger.info('Verification complete', { dashboardId: dashboard.id });

    } catch (error) {
      spinner.warn('Dashboard verification failed');
      logger.error('Verification error:', error);
    }
  }

  async deployToNR1(dashboard) {
    const spinner = ora('Deploying to NR1 app...').start();

    try {
      // Update NR1 app configuration
      const nr1Config = {
        dashboards: [{
          id: dashboard.id,
          name: dashboard.name,
          url: dashboard.url
        }]
      };

      await fs.writeFile(
        './nrdot-nr1-app/dashboards.json',
        JSON.stringify(nr1Config, null, 2)
      );

      // Deploy NR1 app
      const { stdout } = await execAsync('cd nrdot-nr1-app && npm run deploy');

      spinner.succeed('Deployed to NR1 app');

    } catch (error) {
      spinner.warn('NR1 deployment failed');
      logger.error('Deployment error:', error);
    }
  }

  async saveWorkflowResults(dashboard) {
    const workflowDir = path.join(process.cwd(), '.dashbuilder', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });

    const resultFile = path.join(
      workflowDir,
      `create-dashboard-${Date.now()}.json`
    );

    await fs.writeFile(resultFile, JSON.stringify({
      workflow: 'create-dashboard',
      timestamp: new Date().toISOString(),
      result: dashboard,
      config: {
        accountId: this.config.get('newrelic.accountId'),
        region: this.config.get('newrelic.region')
      }
    }, null, 2));

    logger.info(`Workflow results saved to ${resultFile}`);
  }

  async loadTemplate(templatePath) {
    try {
      const content = await fs.readFile(templatePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Failed to load template: ${templatePath}`, error);
      throw error;
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const workflow = new CreateDashboardWorkflow();
  
  const options = {
    verify: process.argv.includes('--verify'),
    deploy: process.argv.includes('--deploy'),
    template: process.argv.find(arg => arg.startsWith('--template='))?.split('=')[1]
  };

  workflow.run(options).catch(error => {
    console.error(chalk.red('\n❌ Workflow failed:'), error.message);
    process.exit(1);
  });
}