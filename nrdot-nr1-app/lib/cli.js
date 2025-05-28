#!/usr/bin/env node
/**
 * DashBuilder CLI
 * Unified command-line interface for all DashBuilder operations
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { configManager } = require('./lib/config');
const { logger } = require('./lib/utils/error-handler');
const package = require('./package.json');

// Initialize configuration
async function initConfig() {
    await configManager.initialize();
}

// Create main program
const program = new Command();

program
    .name('dashbuilder')
    .description('DashBuilder - New Relic Dashboard Management & NRDOT Process Optimization')
    .version(package.version)
    .option('-v, --verbose', 'enable verbose logging')
    .option('--config <path>', 'path to config file', 'config.yaml')
    .hook('preAction', async (thisCommand) => {
        if (thisCommand.opts().verbose) {
            process.env.LOG_LEVEL = 'debug';
        }
        await initConfig();
    });

// NRDOT commands
const nrdot = program
    .command('nrdot')
    .description('NRDOT process optimization commands');

nrdot
    .command('status')
    .description('Check NRDOT status and current metrics')
    .action(async () => {
        const spinner = ora('Checking NRDOT status...').start();
        try {
            const { NRDOTControlLoop } = require('./scripts/control-loop');
            const controlLoop = new NRDOTControlLoop();
            await controlLoop.initialize();
            
            const metrics = await controlLoop.checkMetrics();
            spinner.succeed('NRDOT Status Retrieved');
            
            console.log(chalk.blue('\n📊 Current Metrics:'));
            console.log(`  Cost: ${chalk.green('$' + metrics.cost.toFixed(2) + '/month')}`);
            console.log(`  Coverage: ${chalk.yellow((metrics.coverage * 100).toFixed(1) + '%')}`);
            console.log(`  Performance: ${chalk.cyan((metrics.performance * 100).toFixed(1) + '%')}`);
            console.log(`  Profile: ${chalk.magenta(process.env.OPTIMIZATION_PROFILE || 'balanced')}`);
        } catch (error) {
            spinner.fail('Failed to get NRDOT status');
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

nrdot
    .command('set-profile <profile>')
    .description('Set optimization profile (baseline, conservative, balanced, aggressive)')
    .action(async (profile) => {
        const validProfiles = ['baseline', 'conservative', 'balanced', 'aggressive'];
        if (!validProfiles.includes(profile)) {
            console.error(chalk.red(`Invalid profile. Choose from: ${validProfiles.join(', ')}`));
            process.exit(1);
        }
        
        console.log(chalk.green(`✅ Optimization profile set to: ${profile}`));
        console.log(chalk.yellow('Note: Restart the control loop for changes to take effect'));
    });

// Dashboard commands
const dashboard = program
    .command('dashboard')
    .description('Dashboard management commands');

dashboard
    .command('list')
    .description('List all dashboards')
    .option('-l, --limit <number>', 'limit results', '100')
    .action(async (options) => {
        const spinner = ora('Fetching dashboards...').start();
        try {
            const { listDashboards } = require('./lib/shared');
            const result = await listDashboards({ limit: parseInt(options.limit) });
            spinner.succeed(`Found ${result.count} dashboards`);
            
            result.dashboards.forEach(dash => {
                console.log(`${chalk.blue(dash.id)} - ${dash.name}`);
            });
        } catch (error) {
            spinner.fail('Failed to list dashboards');
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

dashboard
    .command('create <file>')
    .description('Create dashboard from JSON file')
    .action(async (file) => {
        const spinner = ora('Creating dashboard...').start();
        try {
            const fs = require('fs').promises;
            const config = JSON.parse(await fs.readFile(file, 'utf8'));
            
            const { createDashboard } = require('./lib/shared');
            const result = await createDashboard(config);
            
            spinner.succeed('Dashboard created successfully');
            console.log(chalk.green(`Dashboard ID: ${result.id}`));
            console.log(chalk.blue(`URL: ${result.url}`));
        } catch (error) {
            spinner.fail('Failed to create dashboard');
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

// Experiment commands
const experiment = program
    .command('experiment')
    .description('Run NRDOT experiments');

experiment
    .command('run <profile>')
    .description('Run experiment with specified profile')
    .option('-d, --duration <minutes>', 'test duration per phase', '5')
    .action(async (profile, options) => {
        console.log(chalk.blue('🧪 Starting NRDOT Experiment'));
        console.log(`Profile: ${profile}`);
        console.log(`Duration: ${options.duration} minutes per phase`);
        
        const { spawn } = require('child_process');
        const child = spawn('./run-experiment.sh', [
            '-p', profile,
            '-d', (parseInt(options.duration) * 60).toString()
        ], { stdio: 'inherit' });
        
        child.on('exit', (code) => {
            if (code === 0) {
                console.log(chalk.green('\n✅ Experiment completed successfully'));
            } else {
                console.log(chalk.red('\n❌ Experiment failed'));
                process.exit(code);
            }
        });
    });

experiment
    .command('list')
    .description('List available experiment profiles')
    .action(async () => {
        const fs = require('fs').promises;
        const path = require('path');
        
        try {
            const profileDir = path.join(__dirname, 'experiments/profiles');
            const files = await fs.readdir(profileDir);
            
            console.log(chalk.blue('\n📋 Available Experiment Profiles:\n'));
            
            for (const file of files) {
                if (file.endsWith('.yaml')) {
                    const name = file.replace('.yaml', '');
                    const content = await fs.readFile(path.join(profileDir, file), 'utf8');
                    const yaml = require('js-yaml');
                    const config = yaml.load(content);
                    
                    console.log(`  ${chalk.green(name)}`);
                    console.log(`    ${config.experiment.description}`);
                    console.log('');
                }
            }
        } catch (error) {
            console.error(chalk.red('Failed to list profiles:', error.message));
            process.exit(1);
        }
    });

// Setup command
program
    .command('setup')
    .description('Interactive setup wizard')
    .action(async () => {
        console.log(chalk.blue('🚀 DashBuilder Setup Wizard\n'));
        
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'accountId',
                message: 'New Relic Account ID:',
                validate: input => input.length > 0
            },
            {
                type: 'password',
                name: 'apiKey',
                message: 'New Relic API Key:',
                validate: input => input.length > 0
            },
            {
                type: 'password',
                name: 'licenseKey',
                message: 'New Relic License Key:',
                validate: input => input.length > 0
            },
            {
                type: 'list',
                name: 'region',
                message: 'New Relic Region:',
                choices: ['US', 'EU'],
                default: 'US'
            },
            {
                type: 'list',
                name: 'profile',
                message: 'Default Optimization Profile:',
                choices: [
                    { name: 'Baseline - No optimization', value: 'baseline' },
                    { name: 'Conservative - Light optimization', value: 'conservative' },
                    { name: 'Balanced - Recommended', value: 'balanced' },
                    { name: 'Aggressive - Maximum savings', value: 'aggressive' }
                ],
                default: 'balanced'
            }
        ]);
        
        // Create .env file
        const envContent = `
# New Relic Configuration
NEW_RELIC_ACCOUNT_ID=${answers.accountId}
NEW_RELIC_API_KEY=${answers.apiKey}
NEW_RELIC_LICENSE_KEY=${answers.licenseKey}
NEW_RELIC_REGION=${answers.region}

# NRDOT Configuration
OPTIMIZATION_PROFILE=${answers.profile}
CONTROL_LOOP_INTERVAL=300000

# Application Configuration
NODE_ENV=production
LOG_LEVEL=info
`.trim();
        
        const fs = require('fs').promises;
        await fs.writeFile('.env', envContent);
        
        console.log(chalk.green('\n✅ Setup complete!'));
        console.log('\nNext steps:');
        console.log('  1. Run ' + chalk.cyan('npm install') + ' to install dependencies');
        console.log('  2. Run ' + chalk.cyan('docker-compose up -d') + ' to start services');
        console.log('  3. Run ' + chalk.cyan('dashbuilder nrdot status') + ' to check status');
    });

// Health check command
program
    .command('health')
    .description('Check system health')
    .action(async () => {
        const spinner = ora('Checking system health...').start();
        
        const checks = {
            'Database': async () => {
                const { Client } = require('pg');
                const client = new Client({ connectionString: process.env.DATABASE_URL });
                await client.connect();
                await client.query('SELECT 1');
                await client.end();
                return true;
            },
            'Redis': async () => {
                const redis = require('redis');
                const client = redis.createClient({ url: process.env.REDIS_URL });
                await client.connect();
                await client.ping();
                await client.quit();
                return true;
            },
            'New Relic API': async () => {
                const { testConnection } = require('./lib/shared');
                const result = await testConnection();
                return result.connected;
            }
        };
        
        spinner.stop();
        console.log(chalk.blue('\n🏥 System Health Check\n'));
        
        for (const [service, check] of Object.entries(checks)) {
            try {
                await check();
                console.log(`${chalk.green('✓')} ${service}`);
            } catch (error) {
                console.log(`${chalk.red('✗')} ${service}: ${error.message}`);
            }
        }
    });

// Version info command
program
    .command('info')
    .description('Display system information')
    .action(() => {
        console.log(chalk.blue('\n📊 DashBuilder Information\n'));
        console.log(`Version: ${chalk.green(package.version)}`);
        console.log(`Node.js: ${chalk.green(process.version)}`);
        console.log(`Platform: ${chalk.green(process.platform)}`);
        console.log(`Environment: ${chalk.green(process.env.NODE_ENV || 'development')}`);
        console.log(`Config File: ${chalk.green(program.opts().config)}`);
        
        if (configManager.config.nrdot) {
            console.log(chalk.blue('\n🎯 NRDOT Configuration\n'));
            console.log(`Profile: ${chalk.green(configManager.config.nrdot.profile)}`);
            console.log(`Control Loop: ${chalk.green(configManager.config.nrdot.controlLoop.enabled ? 'Enabled' : 'Disabled')}`);
            console.log(`Interval: ${chalk.green(configManager.config.nrdot.controlLoop.interval + 'ms')}`);
        }
    });

// Error handling
program.exitOverride();

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}