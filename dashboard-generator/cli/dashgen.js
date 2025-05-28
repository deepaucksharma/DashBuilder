#!/usr/bin/env node

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { DashboardGenerator } = require('../index');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const program = new Command();

// Version and description
program
  .name('dashgen')
  .description('CLI tool for generating New Relic dashboards')
  .version('1.0.0');

// Helper to get generator instance
function getGenerator() {
  const apiKey = process.env.NEW_RELIC_API_KEY;
  const accountId = process.env.NEW_RELIC_ACCOUNT_ID;
  
  if (!apiKey || !accountId) {
    console.error(chalk.red('Error: Missing NEW_RELIC_API_KEY or NEW_RELIC_ACCOUNT_ID'));
    console.error(chalk.yellow('Please set these environment variables in your .env file'));
    process.exit(1);
  }
  
  return new DashboardGenerator({ apiKey, accountId });
}

// Generate command
program
  .command('generate')
  .description('Generate a new dashboard')
  .option('-n, --name <name>', 'Dashboard name')
  .option('-t, --template <template>', 'Template to use')
  .option('-m, --metrics <patterns...>', 'Metric patterns to include')
  .option('-e, --exclude <patterns...>', 'Metric patterns to exclude')
  .option('-l, --layout <preference>', 'Layout preference (compact|balanced|detailed)', 'balanced')
  .option('-o, --output <file>', 'Save dashboard to file')
  .option('-d, --deploy', 'Deploy dashboard immediately')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (options) => {
    const generator = getGenerator();
    
    let config = {};
    
    if (options.interactive || (!options.name && !options.template)) {
      // Interactive mode
      const templates = generator.getAvailableTemplates();
      
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Dashboard name:',
          default: 'Auto-Generated Dashboard',
          when: !options.name
        },
        {
          type: 'input',
          name: 'description',
          message: 'Dashboard description:',
          default: 'Dashboard generated via CLI'
        },
        {
          type: 'list',
          name: 'template',
          message: 'Select template:',
          choices: [...templates, 'auto'],
          default: 'auto',
          when: !options.template
        },
        {
          type: 'input',
          name: 'metrics',
          message: 'Metric patterns to include (comma-separated):',
          default: '*',
          filter: (input) => input.split(',').map(s => s.trim()).filter(s => s),
          when: !options.metrics
        },
        {
          type: 'input',
          name: 'exclude',
          message: 'Metric patterns to exclude (comma-separated):',
          default: '',
          filter: (input) => input.split(',').map(s => s.trim()).filter(s => s)
        },
        {
          type: 'list',
          name: 'layout',
          message: 'Layout preference:',
          choices: ['compact', 'balanced', 'detailed'],
          default: options.layout
        },
        {
          type: 'confirm',
          name: 'deploy',
          message: 'Deploy dashboard after generation?',
          default: options.deploy || false
        }
      ]);
      
      config = {
        name: options.name || answers.name,
        description: answers.description,
        template: options.template || answers.template,
        metrics: {
          include: options.metrics || answers.metrics,
          exclude: options.exclude || answers.exclude
        },
        layoutPreference: answers.layout
      };
      
      options.deploy = answers.deploy;
    } else {
      // Non-interactive mode
      config = {
        name: options.name || 'Auto-Generated Dashboard',
        template: options.template || 'auto',
        metrics: {
          include: options.metrics || ['*'],
          exclude: options.exclude || []
        },
        layoutPreference: options.layout
      };
    }
    
    const spinner = ora('Generating dashboard...').start();
    
    try {
      const result = await generator.generate(config);
      spinner.succeed('Dashboard generated successfully!');
      
      console.log(chalk.green(`\n✓ Dashboard: ${result.dashboard.name}`));
      console.log(chalk.blue(`  Metrics used: ${result.metadata.metricsUsed}`));
      console.log(chalk.blue(`  Widgets created: ${result.metadata.widgetsCreated}`));
      console.log(chalk.blue(`  Template: ${result.metadata.template}`));
      
      if (options.output) {
        const outputPath = path.resolve(options.output);
        fs.writeFileSync(outputPath, JSON.stringify(result.dashboard, null, 2));
        console.log(chalk.green(`\n✓ Dashboard saved to: ${outputPath}`));
      }
      
      if (options.deploy) {
        const deploySpinner = ora('Deploying dashboard...').start();
        try {
          const deployment = await generator.deploy(result.dashboard);
          deploySpinner.succeed('Dashboard deployed successfully!');
          console.log(chalk.green(`\n✓ Dashboard URL: ${deployment.permalink}`));
        } catch (error) {
          deploySpinner.fail('Failed to deploy dashboard');
          console.error(chalk.red(error.message));
        }
      }
    } catch (error) {
      spinner.fail('Failed to generate dashboard');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// List templates command
program
  .command('templates')
  .description('List available templates')
  .action(() => {
    const generator = getGenerator();
    const templates = generator.getAvailableTemplates();
    
    console.log(chalk.blue('\nAvailable Templates:'));
    templates.forEach(template => {
      console.log(`  - ${template}`);
    });
  });

// Discover metrics command
program
  .command('metrics')
  .description('Discover available metrics')
  .option('-p, --pattern <pattern>', 'Filter by pattern')
  .option('-n, --namespace <namespace>', 'Filter by namespace')
  .option('-l, --limit <limit>', 'Limit results', '50')
  .action(async (options) => {
    const generator = getGenerator();
    const spinner = ora('Discovering metrics...').start();
    
    try {
      const result = await generator.discoverMetrics({
        pattern: options.pattern,
        namespace: options.namespace,
        limit: parseInt(options.limit)
      });
      
      spinner.succeed(`Found ${result.count} metrics`);
      
      if (result.metrics.length > 0) {
        console.log(chalk.blue('\nMetrics:'));
        result.metrics.forEach(metric => {
          console.log(`  - ${metric.name} (${metric.namespace || 'custom'})`);
        });
      }
    } catch (error) {
      spinner.fail('Failed to discover metrics');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Search metrics command
program
  .command('search <term>')
  .description('Search for metrics by name')
  .option('-l, --limit <limit>', 'Limit results', '20')
  .action(async (term, options) => {
    const generator = getGenerator();
    const spinner = ora(`Searching for "${term}"...`).start();
    
    try {
      const result = await generator.searchMetrics(term, {
        limit: parseInt(options.limit)
      });
      
      spinner.succeed(`Found ${result.count} metrics`);
      
      if (result.metrics.length > 0) {
        console.log(chalk.blue('\nSearch Results:'));
        result.metrics.forEach(metric => {
          console.log(`  - ${metric.name}`);
        });
      }
    } catch (error) {
      spinner.fail('Search failed');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

// Deploy command
program
  .command('deploy <file>')
  .description('Deploy a dashboard from a JSON file')
  .action(async (file) => {
    const generator = getGenerator();
    
    try {
      const dashboardPath = path.resolve(file);
      const dashboardJson = fs.readFileSync(dashboardPath, 'utf8');
      const dashboard = JSON.parse(dashboardJson);
      
      const spinner = ora('Deploying dashboard...').start();
      
      const deployment = await generator.deploy(dashboard);
      spinner.succeed('Dashboard deployed successfully!');
      
      console.log(chalk.green(`\n✓ Dashboard: ${deployment.name}`));
      console.log(chalk.green(`✓ URL: ${deployment.permalink}`));
      console.log(chalk.green(`✓ GUID: ${deployment.guid}`));
    } catch (error) {
      console.error(chalk.red(`Failed to deploy: ${error.message}`));
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate <file>')
  .description('Validate a dashboard JSON file')
  .action(async (file) => {
    const generator = getGenerator();
    
    try {
      const dashboardPath = path.resolve(file);
      const dashboardJson = fs.readFileSync(dashboardPath, 'utf8');
      const dashboard = JSON.parse(dashboardJson);
      
      const spinner = ora('Validating dashboard...').start();
      
      const validation = await generator.orchestrator.validateDashboard(dashboard);
      
      if (validation.valid) {
        spinner.succeed('Dashboard is valid!');
      } else {
        spinner.fail('Dashboard validation failed');
        console.log(chalk.red('\nErrors:'));
        validation.errors.forEach(error => {
          console.log(chalk.red(`  - ${error}`));
        });
      }
    } catch (error) {
      console.error(chalk.red(`Failed to validate: ${error.message}`));
      process.exit(1);
    }
  });

// Quick generate commands for common dashboards
program
  .command('quick:system')
  .description('Quick generate system health dashboard')
  .option('-d, --deploy', 'Deploy immediately')
  .action(async (options) => {
    const generator = getGenerator();
    const spinner = ora('Generating system health dashboard...').start();
    
    try {
      const result = await generator.generate({
        name: 'System Health Overview',
        template: 'system-health',
        metrics: {
          include: ['system.*', 'host.*', 'cpu.*', 'memory.*', 'disk.*']
        }
      });
      
      spinner.succeed('Dashboard generated!');
      
      if (options.deploy) {
        const deploySpinner = ora('Deploying...').start();
        const deployment = await generator.deploy(result.dashboard);
        deploySpinner.succeed(`Deployed: ${deployment.permalink}`);
      }
    } catch (error) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

program
  .command('quick:app')
  .description('Quick generate application performance dashboard')
  .option('-d, --deploy', 'Deploy immediately')
  .action(async (options) => {
    const generator = getGenerator();
    const spinner = ora('Generating application dashboard...').start();
    
    try {
      const result = await generator.generate({
        name: 'Application Performance',
        template: 'application-performance',
        metrics: {
          include: ['app.*', 'application.*', 'request.*', 'response.*']
        }
      });
      
      spinner.succeed('Dashboard generated!');
      
      if (options.deploy) {
        const deploySpinner = ora('Deploying...').start();
        const deployment = await generator.deploy(result.dashboard);
        deploySpinner.succeed(`Deployed: ${deployment.permalink}`);
      }
    } catch (error) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}