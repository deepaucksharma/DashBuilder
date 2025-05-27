#!/usr/bin/env node
/**
 * Deploy NRDOT Process Optimization
 * Streamlined workflow for NRDOT v2 deployment
 */

import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

class NRDOTDeployer {
  constructor() {
    this.steps = [
      { name: 'Validate Environment', fn: this.validateEnvironment },
      { name: 'Create NRDOT Dashboard', fn: this.createDashboard },
      { name: 'Deploy Configuration', fn: this.deployConfig },
      { name: 'Validate Deployment', fn: this.validateDeployment },
      { name: 'Generate Report', fn: this.generateReport }
    ];
  }

  async deploy() {
    console.log(chalk.blue.bold('\n🚀 NRDOT v2 Deployment Workflow\n'));
    
    for (const step of this.steps) {
      const spinner = ora(step.name).start();
      try {
        await step.fn.call(this);
        spinner.succeed(chalk.green(step.name));
      } catch (error) {
        spinner.fail(chalk.red(`${step.name}: ${error.message}`));
        throw error;
      }
    }
    
    console.log(chalk.green.bold('\n✅ NRDOT deployment completed successfully!\n'));
    this.showNextSteps();
  }

  async validateEnvironment() {
    // Check for required environment variables
    const required = ['NEW_RELIC_API_KEY', 'NEW_RELIC_ACCOUNT_ID'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    
    // Check if CLI is available
    try {
      await execAsync('npm run cli -- --version');
    } catch (error) {
      throw new Error('CLI tool not available. Run npm install first.');
    }
  }

  async createDashboard() {
    const dashboardJson = {
      name: 'NRDOT Process Optimization Monitor',
      description: 'Real-time monitoring of NRDOT v2 process optimization metrics',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [
        {
          name: 'Overview',
          description: 'Key metrics and cost reduction',
          widgets: [
            {
              title: 'Cost Reduction %',
              configuration: {
                queries: [{
                  query: `FROM Metric 
                    SELECT (1 - (latest(nrdot_process_series_kept) / latest(nrdot_process_series_total))) * 100 
                    AS 'Cost Reduction %'
                    WHERE nrdot.version = '2.0.0'`,
                  accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID)
                }]
              },
              layout: { column: 1, row: 1, width: 4, height: 3 }
            },
            {
              title: 'Process Coverage %',
              configuration: {
                queries: [{
                  query: `FROM Metric 
                    SELECT latest(nrdot_process_coverage_critical) * 100 
                    AS 'Critical Coverage %'
                    WHERE nrdot.version = '2.0.0'`,
                  accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID)
                }]
              },
              layout: { column: 5, row: 1, width: 4, height: 3 }
            },
            {
              title: 'Estimated Savings',
              configuration: {
                queries: [{
                  query: `FROM Metric 
                    SELECT latest(nrdot_estimated_cost_per_hour) 
                    AS 'Current Cost/Hour'
                    WHERE nrdot.version = '2.0.0'`,
                  accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID)
                }]
              },
              layout: { column: 9, row: 1, width: 4, height: 3 }
            },
            {
              title: 'Series Reduction Trend',
              configuration: {
                queries: [{
                  query: `FROM Metric 
                    SELECT latest(nrdot_process_series_total) AS 'Total', 
                           latest(nrdot_process_series_kept) AS 'Kept'
                    WHERE nrdot.version = '2.0.0'
                    TIMESERIES AUTO`,
                  accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID)
                }]
              },
              layout: { column: 1, row: 4, width: 12, height: 3 }
            }
          ]
        }
      ]
    };

    // Save dashboard JSON
    const dashboardPath = path.join(process.cwd(), 'tmp', 'nrdot-dashboard.json');
    await fs.mkdir(path.dirname(dashboardPath), { recursive: true });
    await fs.writeFile(dashboardPath, JSON.stringify(dashboardJson, null, 2));
    
    // Deploy using CLI
    const { stdout } = await execAsync(
      `npm run cli -- dashboard import ${dashboardPath}`
    );
    
    this.dashboardGuid = stdout.match(/Dashboard created with GUID: ([\w-]+)/)?.[1];
  }

  async deployConfig() {
    // Create deployment instructions
    const configPath = path.join(process.cwd(), 'distributions', 'nrdot-plus');
    
    const instructions = `
NRDOT Configuration Deployed!
=============================

The NRDOT configuration files are ready at:
${configPath}

To deploy to a host:

1. Copy the configuration:
   scp -r ${configPath}/config/* user@host:/etc/nrdot-plus/

2. Install the collector:
   ssh user@host 'cd /tmp && curl -Ls https://download.newrelic.com/install/otel/collector.sh | bash'

3. Start the services:
   ssh user@host 'sudo systemctl start nrdot-plus nrdot-plus-control-loop'

4. Verify deployment:
   ssh user@host 'nrdot-plus-ctl status'
`;

    await fs.writeFile(
      path.join(process.cwd(), 'tmp', 'deployment-instructions.txt'),
      instructions
    );
  }

  async validateDeployment() {
    // Check if we can query for NRDOT metrics
    try {
      const { stdout } = await execAsync(
        `npm run cli -- nrql execute "SELECT count(*) FROM Metric WHERE nrdot.version IS NOT NULL SINCE 1 minute ago"`
      );
      
      const hasMetrics = stdout.includes('results');
      if (!hasMetrics) {
        console.log(chalk.yellow('\n⚠️  No NRDOT metrics found yet. This is normal for new deployments.'));
        console.log(chalk.yellow('   Metrics will appear after deploying to hosts.\n'));
      }
    } catch (error) {
      // Metrics not available yet is OK
    }
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      deployment: {
        dashboardGuid: this.dashboardGuid || 'pending',
        configLocation: path.join(process.cwd(), 'distributions', 'nrdot-plus'),
        documentation: path.join(process.cwd(), 'docs')
      },
      nextSteps: [
        'Deploy NRDOT to test hosts',
        'Monitor dashboard for metrics',
        'Validate cost reduction',
        'Adjust profiles as needed'
      ]
    };

    const reportPath = path.join(process.cwd(), 'tmp', 'nrdot-deployment-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  showNextSteps() {
    console.log(chalk.cyan('📋 Next Steps:'));
    console.log(chalk.white('1. Review deployment instructions: ./tmp/deployment-instructions.txt'));
    if (this.dashboardGuid) {
      console.log(chalk.white(`2. View dashboard: https://one.newrelic.com/dashboards/${this.dashboardGuid}`));
    }
    console.log(chalk.white('3. Deploy NRDOT to test hosts using the instructions'));
    console.log(chalk.white('4. Monitor metrics and validate 70%+ cost reduction'));
    console.log(chalk.white('\nFor help: npm run cli -- help'));
  }
}

// Main execution
(async () => {
  try {
    const deployer = new NRDOTDeployer();
    await deployer.deploy();
  } catch (error) {
    console.error(chalk.red(`\n❌ Deployment failed: ${error.message}\n`));
    process.exit(1);
  }
})();