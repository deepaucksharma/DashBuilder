const { Command } = require('commander');
const fs = require('fs/promises');
const path = require('path');
const { DashboardService } = require('../services/dashboard.service.js');
const { Config } = require('../core/config.js');
const { Output } = require('../utils/output.js');
const { validateEntityGuid, validateDashboard } = require('../utils/validators.js');
const { logger } = require('../utils/logger.js');
const { CLIError, ValidationError, APIError, withCLIErrorHandler } = require('../utils/cli-error-handler.js');

class DashboardCommand {
  getCommand() {
    const dashboard = new Command('dashboard')
      .description('Dashboard validation, management, and optimization');

    dashboard
      .command('list')
      .description('List all dashboards in account')
      .option('--account-id <id>', 'Override default account ID')
      .option('--limit <n>', 'Maximum number of dashboards', parseInt, 100)
      .action(withCLIErrorHandler(async (options) => {
        await this.listDashboards(options, dashboard.parent.opts());
      }));

    dashboard
      .command('export <guid>')
      .description('Export dashboard to JSON file')
      .option('-o, --output <file>', 'Output file path')
      .action(withCLIErrorHandler(async (guid, options) => {
        await this.exportDashboard(guid, options, dashboard.parent.opts());
      }));

    dashboard
      .command('import <filePath>')
      .description('Import dashboard from JSON file')
      .option('--account-id <id>', 'Override default account ID')
      .option('--update-existing <guid>', 'Update existing dashboard instead of creating new')
      .option('--dry-run', 'Validate without importing')
      .action(withCLIErrorHandler(async (filePath, options) => {
        await this.importDashboard(filePath, options, dashboard.parent.opts());
      }));

    dashboard
      .command('validate-json <filePath>')
      .description('Validate dashboard JSON structure')
      .action(withCLIErrorHandler(async (filePath, options) => {
        await this.validateJSON(filePath, options, dashboard.parent.opts());
      }));

    dashboard
      .command('validate-widgets <guidOrFile>')
      .description('Validate all queries in dashboard widgets')
      .option('--account-id <id>', 'Override default account ID')
      .option('--fix-suggestions', 'Include fix suggestions for invalid queries')
      .action(withCLIErrorHandler(async (guidOrFile, options) => {
        await this.validateWidgets(guidOrFile, options, dashboard.parent.opts());
      }));

    dashboard
      .command('find-broken-widgets <guidOrFile>')
      .description('Find widgets with errors or no data')
      .option('--account-id <id>', 'Override default account ID')
      .action(withCLIErrorHandler(async (guidOrFile, options) => {
        await this.findBrokenWidgets(guidOrFile, options, dashboard.parent.opts());
      }));

    dashboard
      .command('analyze-performance <guidOrFile>')
      .description('Analyze dashboard performance and load time')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (guidOrFile, options) => {
        await this.analyzePerformance(guidOrFile, options, dashboard.parent.opts());
      });

    dashboard
      .command('check-attribute-usage <guidOrFile>')
      .description('Verify attributes used in dashboard exist')
      .requiredOption('--event-type <type>', 'Event type to check against')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (guidOrFile, options) => {
        await this.checkAttributeUsage(guidOrFile, options, dashboard.parent.opts());
      });

    dashboard
      .command('replicate <guid>')
      .description('Replicate dashboard to other accounts')
      .requiredOption('--targets <ids>', 'Comma-separated target account IDs')
      .option('--update-queries', 'Update account IDs in queries')
      .action(async (guid, options) => {
        await this.replicateDashboard(guid, options, dashboard.parent.opts());
      });

    dashboard
      .command('delete <guid>')
      .description('Delete a dashboard')
      .option('--confirm', 'Skip confirmation prompt')
      .action(async (guid, options) => {
        await this.deleteDashboard(guid, options, dashboard.parent.opts());
      });

    return dashboard;
  }

  async listDashboards(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Fetching dashboards...');
      const dashboards = await service.listDashboards(options.limit || 100);
      output.stopSpinner(true, `Found ${dashboards.length} dashboards`);

      output.print(dashboards, {
        title: 'Dashboards',
        table: true,
        columns: ['name', 'guid', 'pages', 'widgets', 'updatedAt']
      });
    } catch (error) {
      output.stopSpinner(false, 'Failed to list dashboards');
      throw new APIError(`Failed to list dashboards: ${error.message}`, error);
    }
  }

  async exportDashboard(guid, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      validateEntityGuid(guid);
      
      output.startSpinner('Exporting dashboard...');
      const dashboard = await service.exportDashboard(guid);
      output.stopSpinner(true);

      const outputPath = options.output || `dashboard-${guid}.json`;
      await fs.writeFile(outputPath, JSON.stringify(dashboard, null, 2));

      output.success(`Dashboard exported to ${outputPath}`);
      output.info(`Dashboard: ${dashboard.name}`);
      output.info(`Pages: ${dashboard.pages.length}`);
      output.info(`Total widgets: ${dashboard.pages.reduce((sum, p) => sum + p.widgets.length, 0)}`);
    } catch (error) {
      output.stopSpinner(false, 'Failed to export dashboard');
      throw new APIError(`Failed to export dashboard: ${error.message}`, error);
    }
  }

  async importDashboard(filePath, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      config.requireAccountId();
      
      const content = await fs.readFile(filePath, 'utf-8');
      const dashboard = JSON.parse(content);

      output.startSpinner('Validating dashboard...');
      const validation = await service.validateDashboard(dashboard);
      
      if (!validation.valid) {
        output.stopSpinner(false, 'Dashboard validation failed');
        const errorDetails = validation.errors.map(e => `• ${e}`).join('\n');
        throw new ValidationError(`Dashboard validation failed:\n${errorDetails}`, validation.errors);
      }

      if (options.dryRun) {
        output.stopSpinner(true, 'Dashboard is valid');
        output.success('Dry run complete - dashboard would be imported successfully');
        return;
      }

      output.updateSpinner('Importing dashboard...');
      
      let result;
      if (options.updateExisting) {
        validateEntityGuid(options.updateExisting);
        result = await service.updateDashboard(options.updateExisting, dashboard);
      } else {
        result = await service.importDashboard(dashboard);
      }

      output.stopSpinner(true, 'Dashboard imported successfully');
      output.success(`Dashboard: ${result.name}`);
      output.success(`GUID: ${result.guid}`);
    } catch (error) {
      output.stopSpinner(false, 'Failed to import dashboard');
      throw error instanceof CLIError ? error : new APIError(`Failed to import dashboard: ${error.message}`, error);
    }
  }

  async validateJSON(filePath, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const dashboard = JSON.parse(content);

      output.startSpinner('Validating dashboard structure...');
      const validation = await service.validateDashboard(dashboard);
      output.stopSpinner(validation.valid);

      output.print(validation);

      if (!validation.valid) {
        output.error('Validation failed');
        throw new CLIError("Operation failed");
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to validate dashboard');
      output.error(error.message, error);
      throw new CLIError("Operation failed");
    }
  }

  async validateWidgets(guidOrFile, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      output.startSpinner('Loading dashboard...');
      const dashboard = await this.loadDashboard(guidOrFile, service);
      
      output.updateSpinner('Validating widgets...');
      const validation = await service.validateWidgets(dashboard, {
        includeSuggestions: options.fixSuggestions
      });
      
      output.stopSpinner(validation.allValid);

      output.print(validation, {
        title: `Widget Validation: ${dashboard.name}`
      });

      if (!validation.allValid) {
        output.error(`${validation.invalidCount} widgets have issues`);
        
        if (validation.suggestions && Object.keys(validation.suggestions).length > 0) {
          output.info('\nSuggested Fixes:');
          Object.entries(validation.suggestions).forEach(([widgetId, suggestions]) => {
            output.info(`\nWidget: ${widgetId}`);
            suggestions.forEach(suggestion => {
              output.info(`  • ${suggestion}`);
            });
          });
        }
        
        throw new CLIError("Operation failed");
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to validate widgets');
      output.error(error.message, error);
      throw new CLIError("Operation failed");
    }
  }

  async findBrokenWidgets(guidOrFile, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      output.startSpinner('Loading dashboard...');
      const dashboard = await this.loadDashboard(guidOrFile, service);
      
      output.updateSpinner('Checking for broken widgets...');
      const brokenWidgets = await service.findBrokenWidgets(dashboard);
      
      output.stopSpinner(brokenWidgets.length === 0);

      if (brokenWidgets.length === 0) {
        output.success('No broken widgets found!');
      } else {
        output.error(`Found ${brokenWidgets.length} broken widgets`);
        output.print(brokenWidgets, {
          title: 'Broken Widgets',
          table: true,
          columns: ['page', 'widget', 'error', 'suggestion']
        });
        throw new ValidationError(`Found ${brokenWidgets.length} broken widgets`, brokenWidgets);
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to check widgets');
      output.error(error.message, error);
      throw error instanceof CLIError ? error : new APIError(`Failed to check widgets: ${error.message}`, error);
    }
  }

  async analyzePerformance(guidOrFile, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      output.startSpinner('Loading dashboard...');
      const dashboard = await this.loadDashboard(guidOrFile, service);
      
      output.updateSpinner('Analyzing performance...');
      const analysis = await service.analyzePerformance(dashboard);
      
      output.stopSpinner(true);

      output.print(analysis, {
        title: `Performance Analysis: ${dashboard.name}`
      });

      // Print recommendations
      if (analysis.recommendations?.length > 0) {
        output.warning('\nPerformance Recommendations:');
        analysis.recommendations.forEach((rec, index) => {
          output.warning(`\n${index + 1}. ${rec.issue}`);
          output.info(`   Impact: ${rec.impact}`);
          output.info(`   Solution: ${rec.solution}`);
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to analyze performance');
      output.error(error.message, error);
      throw new CLIError("Operation failed");
    }
  }

  async checkAttributeUsage(guidOrFile, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      output.startSpinner('Loading dashboard...');
      const dashboard = await this.loadDashboard(guidOrFile, service);
      
      output.updateSpinner('Checking attribute usage...');
      const usage = await service.checkAttributeUsage(dashboard, options.eventType);
      
      output.stopSpinner(usage.allValid);

      output.print(usage, {
        title: `Attribute Usage Check: ${dashboard.name}`
      });

      if (!usage.allValid) {
        output.error('Some attributes are not available in the specified event type');
        throw new CLIError("Operation failed");
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to check attribute usage');
      output.error(error.message, error);
      throw new CLIError("Operation failed");
    }
  }

  async replicateDashboard(guid, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      validateEntityGuid(guid);
      const targetAccountIds = options.targets.split(',').map(id => id.trim());
      
      output.startSpinner('Exporting source dashboard...');
      const dashboard = await service.exportDashboard(guid);
      
      const results = [];
      
      for (const targetId of targetAccountIds) {
        output.updateSpinner(`Replicating to account ${targetId}...`);
        
        try {
          const result = await service.replicateDashboard(
            dashboard,
            targetId,
            { updateQueries: options.updateQueries }
          );
          
          results.push({
            accountId: targetId,
            success: true,
            guid: result.guid,
            name: result.name
          });
        } catch (error) {
          results.push({
            accountId: targetId,
            success: false,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      output.stopSpinner(successCount === targetAccountIds.length);

      output.print(results, {
        title: 'Replication Results',
        table: true,
        columns: ['accountId', 'success', 'guid', 'error']
      });

      if (successCount < targetAccountIds.length) {
        output.error(`Failed to replicate to ${targetAccountIds.length - successCount} accounts`);
        throw new CLIError("Operation failed");
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to replicate dashboard');
      output.error(error.message, error);
      throw new CLIError("Operation failed");
    }
  }

  async deleteDashboard(guid, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new DashboardService(config);

    try {
      validateEntityGuid(guid);
      
      if (!options.confirm && !config.quiet) {
        output.warning(`This will permanently delete dashboard ${guid}`);
        output.warning('This action cannot be undone!');
        
        // In a real implementation, we'd prompt for confirmation here
        // For now, we'll require --confirm flag
        output.error('Use --confirm flag to delete without prompt');
        throw new CLIError("Operation failed");
      }
      
      output.startSpinner('Deleting dashboard...');
      const success = await service.deleteDashboard(guid);
      
      if (success) {
        output.stopSpinner(true, 'Dashboard deleted successfully');
      } else {
        output.stopSpinner(false, 'Failed to delete dashboard');
        throw new CLIError("Operation failed");
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to delete dashboard');
      output.error(error.message, error);
      throw new CLIError("Operation failed");
    }
  }

  async loadDashboard(guidOrFile, service) {
    if (guidOrFile.endsWith('.json')) {
      const content = await fs.readFile(guidOrFile, 'utf-8');
      return JSON.parse(content);
    } else {
      validateEntityGuid(guidOrFile);
      return await service.exportDashboard(guidOrFile);
    }
  }
}

module.exports = {
  DashboardCommand
};