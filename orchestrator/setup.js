#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigManager } from './lib/config-manager.js';
import { ValidationService } from './lib/validation-service.js';
import { logger } from './lib/logger.js';

const execAsync = promisify(exec);
const program = new Command();

program
  .name('dashbuilder-setup')
  .description('Complete setup wizard for DashBuilder solution')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize DashBuilder with interactive setup')
  .option('--skip-browser', 'Skip browser automation setup')
  .option('--config <file>', 'Use configuration file')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🚀 DashBuilder Setup Wizard\n'));
    
    try {
      const config = new ConfigManager();
      
      if (options.config) {
        await config.loadFromFile(options.config);
      } else {
        await interactiveSetup(config, options);
      }
      
      await executeSetup(config, options);
      
    } catch (error) {
      logger.error('Setup failed:', error);
      process.exit(1);
    }
  });

async function interactiveSetup(config, options) {
  console.log(chalk.cyan('This wizard will help you set up:\n'));
  console.log('  📊 New Relic API credentials');
  console.log('  🔧 CLI configuration');
  console.log('  🌐 Browser automation');
  console.log('  📱 NR1 application');
  console.log('  📈 Monitoring and validation\n');
  
  const { proceed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'proceed',
    message: 'Ready to begin setup?',
    default: true
  }]);
  
  if (!proceed) {
    console.log(chalk.yellow('\nSetup cancelled'));
    process.exit(0);
  }
  
  // Step 1: New Relic Credentials
  console.log(chalk.cyan('\n📝 Step 1: New Relic Configuration\n'));
  
  const nrConfig = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'New Relic email:',
      validate: input => input.includes('@') || 'Please enter a valid email'
    },
    {
      type: 'password',
      name: 'password',
      message: 'New Relic password:',
      mask: '*',
      when: !options.skipBrowser
    },
    {
      type: 'input',
      name: 'accountId',
      message: 'New Relic Account ID:',
      validate: input => /^\d+$/.test(input) || 'Account ID must be numeric'
    },
    {
      type: 'list',
      name: 'region',
      message: 'New Relic Region:',
      choices: ['US', 'EU'],
      default: 'US'
    }
  ]);
  
  config.set('newrelic', nrConfig);
  
  // Step 2: API Keys Strategy
  console.log(chalk.cyan('\n🔑 Step 2: API Keys Configuration\n'));
  
  const keyStrategy = await inquirer.prompt([
    {
      type: 'list',
      name: 'strategy',
      message: 'How would you like to manage API keys?',
      choices: [
        { name: 'Create new keys automatically (requires browser)', value: 'auto' },
        { name: 'Enter existing API keys manually', value: 'manual' },
        { name: 'Import from file', value: 'import' }
      ],
      default: options.skipBrowser ? 'manual' : 'auto'
    }
  ]);
  
  if (keyStrategy.strategy === 'manual') {
    const apiKeys = await inquirer.prompt([
      {
        type: 'password',
        name: 'userKey',
        message: 'User API Key:',
        mask: '*'
      },
      {
        type: 'password',
        name: 'ingestKey',
        message: 'Ingest API Key (optional):',
        mask: '*'
      }
    ]);
    config.set('apiKeys', apiKeys);
  }
  
  config.set('keyStrategy', keyStrategy.strategy);
  
  // Step 3: Application Configuration
  console.log(chalk.cyan('\n📱 Step 3: Application Configuration\n'));
  
  const appConfig = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'components',
      message: 'Which components would you like to set up?',
      choices: [
        { name: 'CLI Tool (scripts/)', value: 'cli', checked: true },
        { name: 'Browser Automation (automation/)', value: 'automation', checked: !options.skipBrowser },
        { name: 'NR1 Application (nrdot-nr1-app/)', value: 'nr1', checked: true },
        { name: 'Monitoring & Alerts', value: 'monitoring', checked: true }
      ]
    },
    {
      type: 'confirm',
      name: 'createSampleDashboard',
      message: 'Create sample dashboard after setup?',
      default: true
    }
  ]);
  
  config.set('components', appConfig.components);
  config.set('createSample', appConfig.createSampleDashboard);
}

async function executeSetup(config, options) {
  const spinner = ora();
  const validator = new ValidationService();
  
  try {
    // Install dependencies
    spinner.start('Installing dependencies...');
    await execAsync('npm run install:all');
    spinner.succeed('Dependencies installed');
    
    // Create API keys if needed
    if (config.get('keyStrategy') === 'auto' && !options.skipBrowser) {
      spinner.start('Creating API keys via browser automation...');
      
      const { stdout } = await execAsync('cd automation && node src/examples/create-api-keys.js', {
        env: {
          ...process.env,
          NEW_RELIC_EMAIL: config.get('newrelic.email'),
          NEW_RELIC_PASSWORD: config.get('newrelic.password')
        }
      });
      
      // Parse API keys from output
      const keyMatch = stdout.match(/Value: ([A-Za-z0-9-]+)/);
      if (keyMatch) {
        config.set('apiKeys.userKey', keyMatch[1]);
      }
      
      spinner.succeed('API keys created');
    }
    
    // Configure components
    const components = config.get('components') || [];
    
    if (components.includes('cli')) {
      spinner.start('Configuring CLI tool...');
      await configureCLI(config);
      spinner.succeed('CLI configured');
    }
    
    if (components.includes('automation')) {
      spinner.start('Configuring browser automation...');
      await configureAutomation(config);
      spinner.succeed('Browser automation configured');
    }
    
    if (components.includes('nr1')) {
      spinner.start('Configuring NR1 application...');
      await configureNR1(config);
      spinner.succeed('NR1 application configured');
    }
    
    if (components.includes('monitoring')) {
      spinner.start('Setting up monitoring...');
      await configureMonitoring(config);
      spinner.succeed('Monitoring configured');
    }
    
    // Validate setup
    spinner.start('Validating configuration...');
    const validation = await validator.validateAll(config);
    
    if (validation.isValid) {
      spinner.succeed('Configuration validated');
    } else {
      spinner.warn('Configuration has warnings');
      validation.warnings.forEach(w => console.log(chalk.yellow(`  ⚠️  ${w}`)));
    }
    
    // Create sample dashboard
    if (config.get('createSample')) {
      spinner.start('Creating sample dashboard...');
      await createSampleDashboard(config);
      spinner.succeed('Sample dashboard created');
    }
    
    // Save configuration
    await config.save();
    
    // Display summary
    displaySetupSummary(config);
    
  } catch (error) {
    spinner.fail('Setup failed');
    throw error;
  }
}

async function configureCLI(config) {
  const envContent = `# Generated by DashBuilder Setup
NEW_RELIC_API_KEY=${config.get('apiKeys.userKey')}
NEW_RELIC_ACCOUNT_ID=${config.get('newrelic.accountId')}
NEW_RELIC_REGION=${config.get('newrelic.region')}
NEW_RELIC_INGEST_KEY=${config.get('apiKeys.ingestKey') || ''}
`;
  
  await fs.writeFile('./scripts/.env', envContent);
}

async function configureAutomation(config) {
  const envContent = `# Generated by DashBuilder Setup
NEW_RELIC_EMAIL=${config.get('newrelic.email')}
NEW_RELIC_PASSWORD=${config.get('newrelic.password') || ''}
NEW_RELIC_LOGIN_URL=https://login.newrelic.com/login
NEW_RELIC_API_KEYS_URL=https://one.newrelic.com/api-keys
NEW_RELIC_DASHBOARDS_URL=https://one.newrelic.com/dashboards
HEADLESS=false
TIMEOUT=30000
SCREENSHOT_DIR=./screenshots
`;
  
  await fs.writeFile('./automation/.env', envContent);
}

async function configureNR1(config) {
  const nr1Config = {
    accountId: config.get('newrelic.accountId'),
    region: config.get('newrelic.region'),
    apiKey: config.get('apiKeys.userKey')
  };
  
  await fs.writeFile(
    './nrdot-nr1-app/config.json',
    JSON.stringify(nr1Config, null, 2)
  );
}

async function configureMonitoring(config) {
  const monitoringConfig = {
    enabled: true,
    interval: '*/5 * * * *', // Every 5 minutes
    alerts: {
      email: config.get('newrelic.email'),
      slack: config.get('monitoring.slack') || null
    },
    healthChecks: [
      'api_connectivity',
      'dashboard_validation',
      'quota_usage'
    ]
  };
  
  await fs.writeFile(
    './orchestrator/config/monitoring.json',
    JSON.stringify(monitoringConfig, null, 2)
  );
}

async function createSampleDashboard(config) {
  try {
    await execAsync('cd scripts && npm run dashboard:create -- --file examples/sample-dashboard.json');
  } catch (error) {
    logger.warn('Could not create sample dashboard automatically');
  }
}

function displaySetupSummary(config) {
  console.log(chalk.green.bold('\n✨ Setup Complete!\n'));
  console.log(chalk.white('Configuration Summary:'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(`Account ID: ${chalk.cyan(config.get('newrelic.accountId'))}`);
  console.log(`Region: ${chalk.cyan(config.get('newrelic.region'))}`);
  console.log(`Components: ${chalk.cyan(config.get('components').join(', '))}`);
  console.log(chalk.gray('─'.repeat(60)));
  
  console.log(chalk.white('\nNext Steps:'));
  console.log(chalk.cyan('1. Test the CLI:'));
  console.log('   npm run cli -- dashboard list');
  
  if (config.get('components').includes('automation')) {
    console.log(chalk.cyan('\n2. Verify dashboards:'));
    console.log('   npm run automation verify-dashboard');
  }
  
  if (config.get('components').includes('nr1')) {
    console.log(chalk.cyan('\n3. Deploy NR1 app:'));
    console.log('   npm run nr1 -- deploy');
  }
  
  console.log(chalk.cyan('\n4. Start monitoring:'));
  console.log('   npm run monitor');
  
  console.log(chalk.gray('\n─'.repeat(60)));
  console.log(chalk.green('🎉 Happy dashboard building!\n'));
}

program.parse(process.argv);