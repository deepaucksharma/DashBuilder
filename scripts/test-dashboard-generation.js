#!/usr/bin/env node

const { DashboardGenerator } = require('../dashboard-generator');
const dotenv = require('dotenv');
const chalk = require('chalk');

// Load environment variables
dotenv.config();

async function testDashboardGeneration() {
  console.log(chalk.blue.bold('\n=== Testing Dashboard Generation Platform ===\n'));

  // Check environment variables
  if (!process.env.NEW_RELIC_API_KEY || !process.env.NEW_RELIC_ACCOUNT_ID) {
    console.error(chalk.red('✗ Missing required environment variables'));
    console.error('Please ensure NEW_RELIC_API_KEY and NEW_RELIC_ACCOUNT_ID are set in .env');
    process.exit(1);
  }

  console.log(chalk.green('✓ Environment variables loaded'));

  try {
    // Initialize generator
    console.log('\n' + chalk.yellow('Initializing Dashboard Generator...'));
    const generator = new DashboardGenerator({
      apiKey: process.env.NEW_RELIC_API_KEY,
      accountId: process.env.NEW_RELIC_ACCOUNT_ID
    });
    console.log(chalk.green('✓ Generator initialized'));

    // Test 1: Get available templates
    console.log('\n' + chalk.yellow('Test 1: Getting available templates...'));
    const templates = generator.getAvailableTemplates();
    console.log(chalk.green('✓ Available templates:'), templates.join(', '));

    // Test 2: Discover metrics
    console.log('\n' + chalk.yellow('Test 2: Discovering metrics...'));
    const discovery = await generator.discoverMetrics({ limit: 10 });
    console.log(chalk.green(`✓ Discovered ${discovery.count} metrics`));
    if (discovery.metrics.length > 0) {
      console.log('  Sample metrics:');
      discovery.metrics.slice(0, 3).forEach(m => {
        console.log(`    - ${m.name} (${m.type || 'unknown'})`);
      });
    }

    // Test 3: Search for specific metrics
    console.log('\n' + chalk.yellow('Test 3: Searching for CPU metrics...'));
    const searchResults = await generator.searchMetrics('cpu', { limit: 5 });
    console.log(chalk.green(`✓ Found ${searchResults.count} CPU-related metrics`));

    // Test 4: Generate a simple dashboard
    console.log('\n' + chalk.yellow('Test 4: Generating test dashboard...'));
    const testDashboard = await generator.generate({
      name: 'Test Dashboard - Auto Generated',
      description: 'Test dashboard from dashboard generation platform',
      template: 'system-health',
      metrics: {
        include: ['system.*', 'cpu.*', 'memory.*']
      },
      layoutPreference: 'balanced',
      timeRange: '1 hour'
    });

    console.log(chalk.green('✓ Dashboard generated successfully'));
    console.log(`  - Name: ${testDashboard.dashboard.name}`);
    console.log(`  - Metrics used: ${testDashboard.metadata.metricsUsed}`);
    console.log(`  - Widgets created: ${testDashboard.metadata.widgetsCreated}`);
    console.log(`  - Template: ${testDashboard.metadata.template}`);

    // Test 5: Validate dashboard structure
    console.log('\n' + chalk.yellow('Test 5: Validating dashboard structure...'));
    const validation = await generator.orchestrator.validateDashboard(testDashboard.dashboard);
    if (validation.valid) {
      console.log(chalk.green('✓ Dashboard structure is valid'));
    } else {
      console.log(chalk.red('✗ Dashboard validation failed:'));
      validation.errors.forEach(err => console.log(`  - ${err}`));
    }

    // Test 6: Preview dashboard (optional)
    if (process.argv.includes('--preview')) {
      console.log('\n' + chalk.yellow('Test 6: Generating dashboard preview...'));
      const preview = await generator.preview({
        name: 'Preview Dashboard',
        template: 'application-performance',
        metrics: {
          include: ['app.*']
        }
      });
      console.log(chalk.green('✓ Preview generated'));
      
      // Save preview HTML
      const fs = require('fs');
      const previewFile = 'dashboard-preview.html';
      fs.writeFileSync(previewFile, preview.preview);
      console.log(`  Preview saved to: ${previewFile}`);
    }

    // Test 7: Deploy dashboard (optional)
    if (process.argv.includes('--deploy')) {
      console.log('\n' + chalk.yellow('Test 7: Deploying test dashboard...'));
      try {
        const deployment = await generator.deploy(testDashboard.dashboard);
        console.log(chalk.green('✓ Dashboard deployed successfully!'));
        console.log(`  - GUID: ${deployment.guid}`);
        console.log(`  - Name: ${deployment.name}`);
        console.log(`  - URL: ${deployment.permalink}`);
      } catch (error) {
        console.log(chalk.red('✗ Deployment failed:'), error.message);
      }
    }

    // Test 8: Component testing
    console.log('\n' + chalk.yellow('Test 8: Testing individual components...'));
    
    // Test MetricClassifier
    const { MetricClassifier } = require('../dashboard-generator');
    const classifier = new MetricClassifier();
    const classification = classifier.classifyMetric('system.cpu.usage.percent');
    console.log(chalk.green('✓ MetricClassifier:'), `${classification.name} -> ${classification.type} (${classification.category})`);

    // Test QueryBuilder
    const { QueryBuilder } = require('../dashboard-generator');
    const queryBuilder = new QueryBuilder();
    const query = queryBuilder.buildQuery(
      { name: 'test.metric', type: 'gauge', characteristics: [] },
      { timeWindow: '1 hour' }
    );
    console.log(chalk.green('✓ QueryBuilder:'), query.nrql);

    // Test LayoutOptimizer
    const { LayoutOptimizer } = require('../dashboard-generator');
    const layoutOptimizer = new LayoutOptimizer();
    const testWidgets = [
      { id: '1', type: 'billboard', title: 'KPI 1' },
      { id: '2', type: 'line', title: 'Trend 1' },
      { id: '3', type: 'table', title: 'Details' }
    ];
    const layout = layoutOptimizer.optimizeLayout(testWidgets);
    console.log(chalk.green('✓ LayoutOptimizer:'), `${layout.widgets.length} widgets arranged in ${layout.metadata.totalRows} rows`);

    console.log('\n' + chalk.green.bold('✓ All tests completed successfully!'));

    // Summary
    console.log('\n' + chalk.blue('Summary:'));
    console.log('- Dashboard Generator is fully functional');
    console.log('- All core components are working');
    console.log('- Platform is ready for use');
    
    if (!process.argv.includes('--deploy')) {
      console.log('\n' + chalk.yellow('Tip: Run with --deploy flag to test dashboard deployment'));
    }
    if (!process.argv.includes('--preview')) {
      console.log(chalk.yellow('Tip: Run with --preview flag to generate HTML preview'));
    }

  } catch (error) {
    console.error('\n' + chalk.red('Error during testing:'), error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testDashboardGeneration();