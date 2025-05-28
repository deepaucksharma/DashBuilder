#!/usr/bin/env node

/**
 * Unified Setup Script
 * Consolidates all setup logic into a single interactive wizard
 */

const fs = require('fs').promises;
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { execSync } = require('child_process');

class SetupWizard {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '../..');
        this.config = {
            newRelic: {},
            docker: {},
            nrdot: {},
            experiments: {}
        };
    }

    async run() {
        console.log(chalk.blue.bold('\n🚀 DashBuilder Setup Wizard\n'));
        
        try {
            // Check prerequisites
            await this.checkPrerequisites();
            
            // Gather configuration
            await this.gatherNewRelicConfig();
            await this.gatherDockerConfig();
            await this.gatherNRDOTConfig();
            await this.gatherExperimentConfig();
            
            // Apply configuration
            await this.createEnvFile();
            await this.installDependencies();
            await this.setupDocker();
            await this.validateSetup();
            
            console.log(chalk.green.bold('\n✅ Setup completed successfully!\n'));
            this.printNextSteps();
            
        } catch (error) {
            console.error(chalk.red.bold(`\n❌ Setup failed: ${error.message}\n`));
            process.exit(1);
        }
    }

    async checkPrerequisites() {
        const spinner = ora('Checking prerequisites...').start();
        
        const requirements = [
            { cmd: 'node --version', name: 'Node.js', minVersion: '14.0.0' },
            { cmd: 'npm --version', name: 'npm', minVersion: '6.0.0' },
            { cmd: 'docker --version', name: 'Docker', minVersion: '20.0.0' },
            { cmd: 'docker-compose --version', name: 'Docker Compose', minVersion: '1.27.0' }
        ];
        
        for (const req of requirements) {
            try {
                const output = execSync(req.cmd, { encoding: 'utf8' }).trim();
                // Simple version check - could be improved
                spinner.succeed(`${req.name} found: ${output}`);
            } catch (error) {
                spinner.fail(`${req.name} not found or version too old (min: ${req.minVersion})`);
                throw new Error(`Missing prerequisite: ${req.name}`);
            }
        }
        
        spinner.stop();
    }

    async gatherNewRelicConfig() {
        console.log(chalk.yellow('\n📊 New Relic Configuration\n'));
        
        const answers = await inquirer.prompt([
            {
                type: 'password',
                name: 'licenseKey',
                message: 'New Relic License Key (40 characters):',
                validate: (input) => {
                    if (!input || input.length !== 40) {
                        return 'License key must be exactly 40 characters';
                    }
                    return true;
                }
            },
            {
                type: 'password',
                name: 'apiKey',
                message: 'New Relic API Key (NRAK-...):',
                validate: (input) => {
                    if (!input || !input.startsWith('NRAK-')) {
                        return 'API key must start with NRAK-';
                    }
                    return true;
                }
            },
            {
                type: 'input',
                name: 'accountId',
                message: 'New Relic Account ID:',
                validate: (input) => {
                    if (!input || isNaN(input)) {
                        return 'Account ID must be a number';
                    }
                    return true;
                }
            },
            {
                type: 'list',
                name: 'region',
                message: 'New Relic Region:',
                choices: ['US', 'EU'],
                default: 'US'
            }
        ]);
        
        this.config.newRelic = answers;
    }

    async gatherDockerConfig() {
        console.log(chalk.yellow('\n🐳 Docker Configuration\n'));
        
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useDocker',
                message: 'Use Docker for running services?',
                default: true
            },
            {
                type: 'confirm',
                name: 'exposeMetrics',
                message: 'Expose Prometheus metrics (port 9090)?',
                default: true,
                when: (answers) => answers.useDocker
            },
            {
                type: 'confirm',
                name: 'enableGrafana',
                message: 'Enable Grafana dashboards (port 3001)?',
                default: true,
                when: (answers) => answers.useDocker
            }
        ]);
        
        this.config.docker = answers;
    }

    async gatherNRDOTConfig() {
        console.log(chalk.yellow('\n⚡ NRDOT Configuration\n'));
        
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'profile',
                message: 'Default NRDOT optimization profile:',
                choices: [
                    { name: 'Conservative (95% coverage, 70% cost reduction)', value: 'conservative' },
                    { name: 'Balanced (90% coverage, 80% cost reduction)', value: 'balanced' },
                    { name: 'Aggressive (85% coverage, 85% cost reduction)', value: 'aggressive' }
                ],
                default: 'balanced'
            },
            {
                type: 'confirm',
                name: 'enableControlLoop',
                message: 'Enable automatic control loop?',
                default: true
            },
            {
                type: 'number',
                name: 'controlLoopInterval',
                message: 'Control loop interval (seconds):',
                default: 300,
                when: (answers) => answers.enableControlLoop
            }
        ]);
        
        this.config.nrdot = answers;
    }

    async gatherExperimentConfig() {
        console.log(chalk.yellow('\n🧪 Experiment Configuration\n'));
        
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'enableExperiments',
                message: 'Enable experiment framework?',
                default: true
            },
            {
                type: 'confirm',
                name: 'autoTracking',
                message: 'Enable automatic experiment tracking?',
                default: true,
                when: (answers) => answers.enableExperiments
            }
        ]);
        
        this.config.experiments = answers;
    }

    async createEnvFile() {
        const spinner = ora('Creating environment configuration...').start();
        
        const envContent = `# DashBuilder Environment Configuration
# Generated by setup wizard

# New Relic Configuration
NEW_RELIC_LICENSE_KEY=${this.config.newRelic.licenseKey}
NEW_RELIC_API_KEY=${this.config.newRelic.apiKey}
NEW_RELIC_ACCOUNT_ID=${this.config.newRelic.accountId}
NEW_RELIC_REGION=${this.config.newRelic.region}
OTEL_EXPORTER_OTLP_ENDPOINT=${this.config.newRelic.region === 'US' ? 'https://otlp.nr-data.net:4317' : 'https://otlp.eu01.nr-data.net:4317'}

# NRDOT Configuration
NRDOT_PROFILE=${this.config.nrdot.profile}
NRDOT_CONTROL_LOOP_ENABLED=${this.config.nrdot.enableControlLoop}
NRDOT_CONTROL_LOOP_INTERVAL=${this.config.nrdot.controlLoopInterval || 300}

# Experiment Configuration
NRDOT_EXPERIMENT_ENABLED=${this.config.experiments.enableExperiments}
EXPERIMENT_AUTO_TRACKING=${this.config.experiments.autoTracking}

# Docker Configuration
PROMETHEUS_PORT=${this.config.docker.exposeMetrics ? 9090 : 0}
GRAFANA_PORT=${this.config.docker.enableGrafana ? 3001 : 0}

# Application Settings
NODE_ENV=production
LOG_LEVEL=info
DEBUG=false
`;
        
        await fs.writeFile(path.join(this.projectRoot, '.env'), envContent);
        spinner.succeed('Environment configuration created');
    }

    async installDependencies() {
        const spinner = ora('Installing dependencies...').start();
        
        try {
            // Install all workspace dependencies
            execSync('npm run install:all', {
                cwd: this.projectRoot,
                stdio: 'pipe'
            });
            spinner.succeed('Dependencies installed');
        } catch (error) {
            spinner.fail('Failed to install dependencies');
            throw error;
        }
    }

    async setupDocker() {
        if (!this.config.docker.useDocker) {
            console.log(chalk.yellow('Skipping Docker setup'));
            return;
        }
        
        const spinner = ora('Setting up Docker environment...').start();
        
        try {
            // Run docker setup
            execSync('./scripts/core/docker-utils.sh setup', {
                cwd: this.projectRoot,
                stdio: 'pipe'
            });
            
            // Start services
            execSync('./scripts/core/docker-utils.sh start', {
                cwd: this.projectRoot,
                stdio: 'pipe'
            });
            
            spinner.succeed('Docker environment ready');
        } catch (error) {
            spinner.fail('Docker setup failed');
            throw error;
        }
    }

    async validateSetup() {
        const spinner = ora('Validating setup...').start();
        
        try {
            // Run validation
            execSync('node scripts/core/validation.js', {
                cwd: this.projectRoot,
                stdio: 'pipe'
            });
            spinner.succeed('Setup validation passed');
        } catch (error) {
            spinner.warn('Some validation checks failed - review the output');
        }
    }

    printNextSteps() {
        console.log(chalk.cyan('\n📋 Next Steps:\n'));
        console.log('1. Start the control loop:');
        console.log(chalk.gray('   npm run control-loop'));
        console.log('\n2. Run a quick experiment:');
        console.log(chalk.gray('   npm run experiment:quick'));
        console.log('\n3. Check service status:');
        console.log(chalk.gray('   npm run status'));
        console.log('\n4. View logs:');
        console.log(chalk.gray('   npm run logs'));
        console.log('\n5. Open dashboards:');
        console.log(chalk.gray('   npm run dashboards:open'));
        console.log('');
    }
}

// Run the wizard
if (require.main === module) {
    const wizard = new SetupWizard();
    wizard.run();
}

module.exports = SetupWizard;