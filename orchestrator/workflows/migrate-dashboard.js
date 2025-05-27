#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { ConfigManager } from '../lib/config-manager.js';
import { logger } from '../lib/logger.js';

const execAsync = promisify(exec);

export class MigrateDashboardWorkflow {
  constructor() {
    this.config = new ConfigManager();
  }

  async run(options = {}) {
    console.log(chalk.blue.bold('\n🔄 Migrate Dashboard Workflow\n'));

    try {
      await this.config.loadFromFile('.dashbuilder/config.json');
      
      const migration = await this.configureMigration(options);
      const dashboards = await this.fetchSourceDashboards(migration);
      const selected = await this.selectDashboards(dashboards);
      const migrated = await this.migrateDashboards(selected, migration);
      
      await this.saveResults(migrated);
      
      console.log(chalk.green.bold('\n✨ Migration completed successfully!\n'));
      return migrated;
      
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  async configureMigration(options) {
    if (options.source && options.target) {
      return {
        source: { accountId: options.source },
        target: { accountId: options.target }
      };
    }

    console.log(chalk.cyan('Configure migration settings:\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'sourceAccount',
        message: 'Source account ID:',
        default: this.config.get('newrelic.accountId'),
        validate: input => /^\d+$/.test(input) || 'Must be numeric'
      },
      {
        type: 'input',
        name: 'sourceApiKey',
        message: 'Source account API key:',
        default: this.config.get('apiKeys.userKey')
      },
      {
        type: 'input',
        name: 'targetAccount',
        message: 'Target account ID:',
        validate: input => /^\d+$/.test(input) || 'Must be numeric'
      },
      {
        type: 'input',
        name: 'targetApiKey',
        message: 'Target account API key:'
      },
      {
        type: 'checkbox',
        name: 'options',
        message: 'Migration options:',
        choices: [
          { name: 'Update entity references', value: 'updateRefs', checked: true },
          { name: 'Preserve permissions', value: 'preservePerms', checked: true },
          { name: 'Create backup', value: 'backup', checked: true },
          { name: 'Verify after migration', value: 'verify', checked: true }
        ]
      }
    ]);

    return {
      source: {
        accountId: answers.sourceAccount,
        apiKey: answers.sourceApiKey
      },
      target: {
        accountId: answers.targetAccount,
        apiKey: answers.targetApiKey
      },
      options: answers.options
    };
  }

  async fetchSourceDashboards(migration) {
    const spinner = ora('Fetching source dashboards...').start();

    try {
      const { stdout } = await execAsync(
        'cd scripts && node src/cli.js dashboard list --json',
        {
          env: {
            ...process.env,
            NEW_RELIC_API_KEY: migration.source.apiKey,
            NEW_RELIC_ACCOUNT_ID: migration.source.accountId
          }
        }
      );

      const dashboards = JSON.parse(stdout);
      spinner.succeed(`Found ${dashboards.length} dashboards`);
      
      return dashboards;

    } catch (error) {
      spinner.fail('Failed to fetch dashboards');
      throw error;
    }
  }

  async selectDashboards(dashboards) {
    const choices = dashboards.map(d => ({
      name: `${d.name} (${d.widgets?.length || 0} widgets)`,
      value: d,
      checked: true
    }));

    const { selected } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: 'Select dashboards to migrate:',
        choices,
        validate: input => input.length > 0 || 'Select at least one dashboard'
      }
    ]);

    return selected;
  }

  async migrateDashboards(dashboards, migration) {
    const results = [];
    
    for (const dashboard of dashboards) {
      const spinner = ora(`Migrating ${dashboard.name}...`).start();
      
      try {
        // Export dashboard
        const exported = await this.exportDashboard(dashboard, migration.source);
        
        // Transform for target account
        const transformed = await this.transformDashboard(exported, migration);
        
        // Create backup if requested
        if (migration.options.includes('backup')) {
          await this.backupDashboard(dashboard, exported);
        }
        
        // Import to target
        const imported = await this.importDashboard(transformed, migration.target);
        
        // Verify if requested
        if (migration.options.includes('verify')) {
          await this.verifyMigration(imported, migration.target);
        }
        
        results.push({
          source: dashboard,
          target: imported,
          status: 'success'
        });
        
        spinner.succeed(`Migrated ${dashboard.name}`);
        
      } catch (error) {
        spinner.fail(`Failed to migrate ${dashboard.name}`);
        logger.error(`Migration error for ${dashboard.name}:`, error);
        
        results.push({
          source: dashboard,
          error: error.message,
          status: 'failed'
        });
      }
    }
    
    return results;
  }

  async exportDashboard(dashboard, source) {
    const { stdout } = await execAsync(
      `cd scripts && node src/cli.js dashboard get --id ${dashboard.id} --json`,
      {
        env: {
          ...process.env,
          NEW_RELIC_API_KEY: source.apiKey,
          NEW_RELIC_ACCOUNT_ID: source.accountId
        }
      }
    );

    return JSON.parse(stdout);
  }

  async transformDashboard(dashboard, migration) {
    const transformed = JSON.parse(JSON.stringify(dashboard));
    
    // Update account IDs in queries
    if (migration.options.includes('updateRefs')) {
      this.updateAccountReferences(transformed, migration);
    }
    
    // Update permissions if not preserving
    if (!migration.options.includes('preservePerms')) {
      transformed.permissions = 'PUBLIC_READ_WRITE';
    }
    
    // Add migration metadata
    transformed.description = `${transformed.description || ''}\nMigrated from account ${migration.source.accountId} on ${new Date().toISOString()}`;
    
    return transformed;
  }

  updateAccountReferences(dashboard, migration) {
    // Recursively update account IDs in widget queries
    const updateQueries = (obj) => {
      if (typeof obj !== 'object' || obj === null) return;
      
      if (obj.accountId === migration.source.accountId) {
        obj.accountId = migration.target.accountId;
      }
      
      if (obj.query && typeof obj.query === 'string') {
        obj.query = obj.query.replace(
          new RegExp(`account\\s*=\\s*${migration.source.accountId}`, 'gi'),
          `account = ${migration.target.accountId}`
        );
      }
      
      Object.values(obj).forEach(updateQueries);
    };
    
    updateQueries(dashboard);
  }

  async backupDashboard(dashboard, exported) {
    const backupDir = path.join(process.cwd(), 'backups', 'dashboards');
    await fs.mkdir(backupDir, { recursive: true });
    
    const backupFile = path.join(
      backupDir,
      `${dashboard.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`
    );
    
    await fs.writeFile(backupFile, JSON.stringify(exported, null, 2));
    logger.info(`Backup saved to ${backupFile}`);
  }

  async importDashboard(dashboard, target) {
    const tempFile = path.join(process.cwd(), 'temp-import.json');
    await fs.writeFile(tempFile, JSON.stringify(dashboard, null, 2));

    try {
      const { stdout } = await execAsync(
        `cd scripts && node src/cli.js dashboard create --file ${tempFile} --json`,
        {
          env: {
            ...process.env,
            NEW_RELIC_API_KEY: target.apiKey,
            NEW_RELIC_ACCOUNT_ID: target.accountId
          }
        }
      );

      await fs.unlink(tempFile);
      return JSON.parse(stdout);

    } catch (error) {
      await fs.unlink(tempFile).catch(() => {});
      throw error;
    }
  }

  async verifyMigration(dashboard, target) {
    try {
      const { stdout } = await execAsync(
        `cd scripts && node src/cli.js dashboard get --id ${dashboard.id} --json`,
        {
          env: {
            ...process.env,
            NEW_RELIC_API_KEY: target.apiKey,
            NEW_RELIC_ACCOUNT_ID: target.accountId
          }
        }
      );

      const verified = JSON.parse(stdout);
      logger.info(`Verified dashboard ${verified.name} in target account`);

    } catch (error) {
      logger.warn(`Could not verify dashboard ${dashboard.id}:`, error.message);
    }
  }

  async saveResults(results) {
    const resultsDir = path.join(process.cwd(), '.dashbuilder', 'migrations');
    await fs.mkdir(resultsDir, { recursive: true });

    const resultFile = path.join(
      resultsDir,
      `migration-${Date.now()}.json`
    );

    const summary = {
      timestamp: new Date().toISOString(),
      total: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    };

    await fs.writeFile(resultFile, JSON.stringify(summary, null, 2));

    console.log(chalk.white('\nMigration Summary:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Total dashboards: ${chalk.cyan(summary.total)}`);
    console.log(`Successful: ${chalk.green(summary.successful)}`);
    console.log(`Failed: ${chalk.red(summary.failed)}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`\nResults saved to: ${chalk.cyan(resultFile)}`);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const workflow = new MigrateDashboardWorkflow();
  
  const sourceIndex = process.argv.indexOf('--source');
  const targetIndex = process.argv.indexOf('--target');
  
  const options = {
    source: sourceIndex !== -1 ? process.argv[sourceIndex + 1] : null,
    target: targetIndex !== -1 ? process.argv[targetIndex + 1] : null
  };

  workflow.run(options).catch(error => {
    console.error(chalk.red('\n❌ Migration failed:'), error.message);
    process.exit(1);
  });
}