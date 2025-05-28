#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

// Module imports
import { SchemaCommand } from './commands/schema.js';
import { NRQLCommand } from './commands/nrql.js';
import { DashboardCommand } from './commands/dashboard.js';
import { EntityCommand } from './commands/entity.js';
import { IngestCommand } from './commands/ingest.js';
import { LLMCommand } from './commands/llm.js';
import { ExperimentCommand } from './commands/experiment.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getVersion() {
  const packagePath = join(__dirname, '..', 'package.json');
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

  // Global error handling
  program.exitOverride();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error.code === 'commander.missingArgument') {
      console.error(chalk.red('Error:'), error.message);
    } else if (error.code === 'commander.unknownOption') {
      console.error(chalk.red('Error:'), error.message);
    } else {
      console.error(chalk.red('Error:'), error.message || error);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
});

main();