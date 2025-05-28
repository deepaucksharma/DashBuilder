#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs').promises;

// Module imports
const { SchemaCommand } = require('./commands/schema.js');
const { NRQLCommand } = require('./commands/nrql.js');
const { DashboardCommand } = require('./commands/dashboard.js');
const { EntityCommand } = require('./commands/entity.js');
const { IngestCommand } = require('./commands/ingest.js');
const { LLMCommand } = require('./commands/llm.js');
const { ExperimentCommand } = require('./commands/experiment.js');

// Load environment variables
dotenv.config();

async function getVersion() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageContent = await fs.readFile(packagePath, 'utf-8');
  const packageJson = JSON.parse(packageContent);
  return packageJson.version;
}

async function main() {
  const program = new Command();
  const version = await getVersion();

  program
    .name('nr-guardian')
    .description(chalk.cyan('New Relic Validation & Self-Correction Engine'))
    .version(version)
    .option('-j, --json', 'Output results in JSON format')
    .option('-v, --verbose', 'Enable verbose output')
    .option('-q, --quiet', 'Suppress non-error output')
    .option('--no-cache', 'Disable caching')
    .option('--api-key <key>', 'New Relic API key (overrides environment)')
    .option('--account-id <id>', 'New Relic account ID (overrides environment)')
    .option('--region <region>', 'New Relic region: US or EU (overrides environment)');

  // Add module commands
  program.addCommand(new SchemaCommand().getCommand());
  program.addCommand(new NRQLCommand().getCommand());
  program.addCommand(new DashboardCommand().getCommand());
  program.addCommand(new EntityCommand().getCommand());
  program.addCommand(new IngestCommand().getCommand());
  program.addCommand(new LLMCommand().getCommand());
  program.addCommand(new ExperimentCommand().getCommand());

  // Top-level commands
  program
    .command('validate')
    .description('Validate New Relic configuration and queries')
    .action(async (options) => {
      console.log(chalk.green('✓ New Relic Guardian is ready!'));
      console.log(chalk.gray('Use "nr-guardian --help" to see available commands'));
    });

  program
    .command('test-connection')
    .description('Test connection to New Relic API')
    .action(async (options) => {
      const opts = program.opts();
      const { Config } = require('./core/config.js');
      const { NerdGraphClient } = require('./core/api-client.js');
      
      try {
        const config = new Config(opts);
        const client = new NerdGraphClient(config);
        const result = await client.testConnection();
        
        if (opts.json) {
          console.log(JSON.stringify({ success: true, ...result }, null, 2));
        } else {
          console.log(chalk.green('✓ Successfully connected to New Relic API'));
          console.log(chalk.gray(`Region: ${config.region}`));
          console.log(chalk.gray(`Account ID: ${config.accountId}`));
        }
      } catch (error) {
        if (opts.json) {
          console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
        } else {
          console.error(chalk.red(`✗ Connection failed: ${error.message}`));
        }
        process.exit(1);
      }
    });

  // Parse command line arguments
  program.parse(process.argv);

  // Show help if no command provided
  if (program.args.length === 0) {
    program.outputHelp();
  }
}

// Run CLI
main().catch(error => {
  console.error(chalk.red(`\nFatal error: ${error.message}`));
  process.exit(1);
});