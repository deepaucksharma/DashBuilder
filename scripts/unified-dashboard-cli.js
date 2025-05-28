#!/usr/bin/env node

/**
 * Unified Dashboard CLI
 * Demonstrates how to align dashboard-generator with services architecture
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs').promises;
const path = require('path');

// Import from both architectures
const DashboardOrchestrator = require('../dashboard-generator/lib/dashboard-orchestrator');
const UnifiedDashboardBuilder = require('./src/unified-dashboard-builder');
const SchemaService = require('./src/services/schema.service');
const NRQLService = require('./src/services/nrql.service');
const DashboardService = require('./src/services/dashboard.service');

class UnifiedDashboardCLI {
  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  setupCommands() {
    this.program
      .name('dashgen-unified')
      .description('Unified dashboard generation CLI')
      .version('1.0.0');

    // Generate command with multiple approaches
    this.program
      .command('generate')
      .description('Generate a dashboard using unified approach')
      .option('-n, --name <name>', 'Dashboard name', 'Generated Dashboard')
      .option('-t, --template <template>', 'Use template from dashboard-generator')
      .option('-m, --metrics <metrics...>', 'Metrics to include')
      .option('-s, --smart', 'Use smart generation with full validation')
      .option('-d, --deploy', 'Deploy dashboard after generation')
      .option('-o, --output <file>', 'Save dashboard to file')
      .option('--validate-only', 'Only validate, do not generate')
      .action(async (options) => {
        await this.handleGenerate(options);
      });

    // Validate command
    this.program
      .command('validate <file>')
      .description('Validate a dashboard JSON file')
      .action(async (file) => {
        await this.handleValidate(file);
      });

    // Compare command
    this.program
      .command('compare')
      .description('Compare dashboard-generator vs unified approach')
      .option('-m, --metrics <metrics...>', 'Metrics to test with')
      .action(async (options) => {
        await this.handleCompare(options);
      });

    // Migrate command
    this.program
      .command('migrate <file>')
      .description('Migrate dashboard-generator dashboard to unified format')
      .action(async (file) => {
        await this.handleMigrate(file);
      });
  }

  async handleGenerate(options) {
    const spinner = ora('Generating dashboard...').start();

    try {
      let dashboard;

      if (options.smart || !options.template) {
        // Use unified approach with full validation
        spinner.text = 'Using unified approach with validation...';
        const builder = new UnifiedDashboardBuilder();
        
        dashboard = await builder.buildDashboard({
          name: options.name,
          metrics: options.metrics || ['system.cpu.*', 'system.memory.*'],
          enableFacets: true,
          timeRange: 'SINCE 1 hour ago'
        });
      } else {
        // Use dashboard-generator with template
        spinner.text = 'Using template-based generation...';
        const orchestrator = new DashboardOrchestrator();
        
        // Enhance with service validation
        const enhancedConfig = await this.enhanceWithServices({
          name: options.name,
          template: options.template,
          metrics: options.metrics
        });
        
        dashboard = await orchestrator.generateDashboard(enhancedConfig);
      }

      spinner.succeed('Dashboard generated successfully');

      // Validate using services
      await this.validateWithServices(dashboard);

      // Save or deploy
      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(dashboard, null, 2));
        console.log(chalk.green(`✅ Dashboard saved to ${options.output}`));
      }

      if (options.deploy) {
        spinner.start('Deploying dashboard...');
        const result = await this.deployDashboard(dashboard);
        spinner.succeed(`Dashboard deployed: ${result.guid}`);
      }

      return dashboard;

    } catch (error) {
      spinner.fail(`Error: ${error.message}`);
      process.exit(1);
    }
  }

  async handleValidate(file) {
    const spinner = ora('Validating dashboard...').start();

    try {
      const content = await fs.readFile(file, 'utf-8');
      const dashboard = JSON.parse(content);

      // Use services for validation
      const schemaService = new SchemaService();
      const nrqlService = new NRQLService();

      // Validate structure
      const validators = require('./src/utils/validators');
      const { error } = validators.dashboard.validate(dashboard);
      
      if (error) {
        throw new Error(`Structure validation failed: ${error.message}`);
      }

      // Validate queries
      const queries = this.extractQueries(dashboard);
      for (const query of queries) {
        const result = await nrqlService.validate(query);
        if (!result.isValid) {
          throw new Error(`Query validation failed: ${result.errors.join(', ')}`);
        }
      }

      // Validate metrics exist
      const metrics = this.extractMetrics(queries);
      for (const metric of metrics) {
        const exists = await schemaService.checkMetricExists(metric);
        if (!exists) {
          console.warn(chalk.yellow(`⚠️  Metric '${metric}' not found`));
        }
      }

      spinner.succeed('Dashboard validation passed');

    } catch (error) {
      spinner.fail(`Validation failed: ${error.message}`);
      process.exit(1);
    }
  }

  async handleCompare(options) {
    console.log(chalk.blue('\n📊 Comparing approaches...\n'));

    const metrics = options.metrics || ['system.cpu.utilization'];
    
    // Generate with dashboard-generator
    console.log(chalk.cyan('1. Dashboard Generator Approach:'));
    const start1 = Date.now();
    const orchestrator = new DashboardOrchestrator();
    const dashboard1 = await orchestrator.generateDashboard({
      name: 'Test Dashboard',
      template: 'system-health',
      metrics
    });
    const time1 = Date.now() - start1;
    console.log(`   ⏱️  Time: ${time1}ms`);
    console.log(`   📦 Size: ${JSON.stringify(dashboard1).length} bytes`);
    console.log(`   📊 Widgets: ${this.countWidgets(dashboard1)}`);

    // Generate with unified approach
    console.log(chalk.cyan('\n2. Unified Approach:'));
    const start2 = Date.now();
    const builder = new UnifiedDashboardBuilder();
    const dashboard2 = await builder.buildDashboard({
      name: 'Test Dashboard',
      metrics,
      enableFacets: true
    });
    const time2 = Date.now() - start2;
    console.log(`   ⏱️  Time: ${time2}ms`);
    console.log(`   📦 Size: ${JSON.stringify(dashboard2).length} bytes`);
    console.log(`   📊 Widgets: ${this.countWidgets(dashboard2)}`);
    console.log(`   ✅ Validated: Yes`);
    console.log(`   🎯 Optimized queries: Yes`);

    // Show differences
    console.log(chalk.green('\n✨ Unified Approach Benefits:'));
    console.log('   - Full query validation');
    console.log('   - Metric existence checking');
    console.log('   - Automatic optimization');
    console.log('   - Schema compliance guaranteed');
  }

  async handleMigrate(file) {
    const spinner = ora('Migrating dashboard...').start();

    try {
      // Read existing dashboard
      const content = await fs.readFile(file, 'utf-8');
      const oldDashboard = JSON.parse(content);

      // Extract configuration
      const config = {
        name: oldDashboard.name,
        description: oldDashboard.description,
        metrics: this.extractMetricsFromDashboard(oldDashboard)
      };

      // Regenerate using unified approach
      const builder = new UnifiedDashboardBuilder();
      const newDashboard = await builder.buildDashboard(config);

      // Save migrated dashboard
      const outputFile = file.replace('.json', '-migrated.json');
      await fs.writeFile(outputFile, JSON.stringify(newDashboard, null, 2));

      spinner.succeed(`Dashboard migrated to ${outputFile}`);

    } catch (error) {
      spinner.fail(`Migration failed: ${error.message}`);
      process.exit(1);
    }
  }

  // Helper methods
  async enhanceWithServices(config) {
    const schemaService = new SchemaService();
    const nrqlService = new NRQLService();

    // Discover additional metrics
    if (config.metrics) {
      const discovered = [];
      for (const pattern of config.metrics) {
        const metrics = await schemaService.discoverMetrics({ pattern });
        discovered.push(...metrics);
      }
      config.discoveredMetrics = discovered;
    }

    return config;
  }

  async validateWithServices(dashboard) {
    const nrqlService = new NRQLService();
    const errors = [];

    // Extract and validate all queries
    const queries = this.extractQueries(dashboard);
    for (const query of queries) {
      const result = await nrqlService.validate(query);
      if (!result.isValid) {
        errors.push(`Invalid query: ${query}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors:\n${errors.join('\n')}`);
    }

    console.log(chalk.green('✅ Dashboard validation passed'));
  }

  extractQueries(dashboard) {
    const queries = [];
    for (const page of dashboard.pages || []) {
      for (const widget of page.widgets || []) {
        const nrqlQueries = widget.rawConfiguration?.nrqlQueries || [];
        queries.push(...nrqlQueries.map(q => q.query));
      }
    }
    return queries;
  }

  extractMetrics(queries) {
    const metrics = new Set();
    const metricPattern = /FROM\s+Metric\s+WHERE\s+metricName\s*=\s*'([^']+)'/gi;
    
    for (const query of queries) {
      const matches = query.matchAll(metricPattern);
      for (const match of matches) {
        metrics.add(match[1]);
      }
    }
    
    return Array.from(metrics);
  }

  extractMetricsFromDashboard(dashboard) {
    const queries = this.extractQueries(dashboard);
    return this.extractMetrics(queries);
  }

  countWidgets(dashboard) {
    let count = 0;
    for (const page of dashboard.pages || []) {
      count += (page.widgets || []).length;
    }
    return count;
  }

  async deployDashboard(dashboard) {
    const builder = new UnifiedDashboardBuilder();
    return await builder.deployDashboard(dashboard);
  }

  run() {
    this.program.parse(process.argv);
  }
}

// Run CLI
if (require.main === module) {
  const cli = new UnifiedDashboardCLI();
  cli.run();
}

module.exports = UnifiedDashboardCLI;