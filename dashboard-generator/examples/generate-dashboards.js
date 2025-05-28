#!/usr/bin/env node

const { DashboardGenerator } = require('../index');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const generator = new DashboardGenerator({
  apiKey: process.env.NEW_RELIC_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID,
  layoutOptions: {
    gridColumns: 12,
    minWidgetWidth: 3,
    defaultRowHeight: 3
  }
});

async function generateSystemHealthDashboard() {
  console.log('\n=== Generating System Health Dashboard ===');
  
  try {
    const result = await generator.generate({
      name: 'System Health Overview',
      description: 'Comprehensive system health monitoring dashboard',
      template: 'system-health',
      metrics: {
        include: [
          'system.cpu.*',
          'system.memory.*',
          'system.disk.*',
          'system.network.*'
        ]
      },
      layoutPreference: 'balanced',
      timeRange: '1 hour'
    });
    
    console.log('✓ Dashboard generated successfully');
    console.log(`  - Metrics used: ${result.metadata.metricsUsed}`);
    console.log(`  - Widgets created: ${result.metadata.widgetsCreated}`);
    
    return result;
  } catch (error) {
    console.error('✗ Failed to generate system health dashboard:', error.message);
    return null;
  }
}

async function generateApplicationPerformanceDashboard() {
  console.log('\n=== Generating Application Performance Dashboard ===');
  
  try {
    const result = await generator.generate({
      name: 'Application Performance',
      description: 'Application performance and error tracking',
      template: 'application-performance',
      metrics: {
        include: [
          'app.request.*',
          'app.response.*',
          'app.error.*',
          'app.transaction.*'
        ],
        exclude: ['*.internal.*']
      },
      layoutPreference: 'detailed',
      timeRange: '30 minutes'
    });
    
    console.log('✓ Dashboard generated successfully');
    console.log(`  - Metrics used: ${result.metadata.metricsUsed}`);
    console.log(`  - Widgets created: ${result.metadata.widgetsCreated}`);
    
    return result;
  } catch (error) {
    console.error('✗ Failed to generate application dashboard:', error.message);
    return null;
  }
}

async function generateCostOptimizationDashboard() {
  console.log('\n=== Generating Cost Optimization Dashboard ===');
  
  try {
    const result = await generator.generate({
      name: 'Cost Optimization Analysis',
      description: 'Resource usage and cost optimization insights',
      template: 'cost-optimization',
      metrics: {
        include: [
          'aws.billing.*',
          'aws.usage.*',
          'resource.utilization.*',
          'cost.*'
        ]
      },
      layoutPreference: 'compact',
      timeRange: '7 days'
    });
    
    console.log('✓ Dashboard generated successfully');
    console.log(`  - Metrics used: ${result.metadata.metricsUsed}`);
    console.log(`  - Widgets created: ${result.metadata.widgetsCreated}`);
    
    return result;
  } catch (error) {
    console.error('✗ Failed to generate cost dashboard:', error.message);
    return null;
  }
}

async function generateAutoDashboard() {
  console.log('\n=== Auto-Generating Dashboard Based on Available Metrics ===');
  
  try {
    // First, discover available metrics
    console.log('Discovering metrics...');
    const discovery = await generator.discoverMetrics({ limit: 500 });
    console.log(`Found ${discovery.count} metrics`);
    
    // Generate dashboard automatically
    const result = await generator.generate({
      name: 'Auto-Generated Dashboard',
      description: 'Automatically generated based on discovered metrics',
      template: 'auto', // Will select best template based on metrics
      metrics: {
        include: ['*'] // Include all discovered metrics
      },
      layoutPreference: 'balanced'
    });
    
    console.log('✓ Dashboard generated successfully');
    console.log(`  - Template selected: ${result.metadata.template}`);
    console.log(`  - Metrics used: ${result.metadata.metricsUsed}`);
    console.log(`  - Widgets created: ${result.metadata.widgetsCreated}`);
    
    return result;
  } catch (error) {
    console.error('✗ Failed to auto-generate dashboard:', error.message);
    return null;
  }
}

async function deployDashboard(dashboard, name) {
  console.log(`\nDeploying ${name}...`);
  
  try {
    const deployment = await generator.deploy(dashboard);
    console.log(`✓ Dashboard deployed successfully!`);
    console.log(`  - GUID: ${deployment.guid}`);
    console.log(`  - URL: ${deployment.permalink}`);
    return deployment;
  } catch (error) {
    console.error(`✗ Failed to deploy dashboard:`, error.message);
    return null;
  }
}

async function main() {
  console.log('Dashboard Generator Examples');
  console.log('===========================');
  
  // Check for required environment variables
  if (!process.env.NEW_RELIC_API_KEY || !process.env.NEW_RELIC_ACCOUNT_ID) {
    console.error('\nError: Missing required environment variables');
    console.error('Please set NEW_RELIC_API_KEY and NEW_RELIC_ACCOUNT_ID in your .env file');
    process.exit(1);
  }
  
  // Get available templates
  console.log('\nAvailable templates:', generator.getAvailableTemplates().join(', '));
  
  const dashboards = [];
  
  // Generate different types of dashboards
  const systemHealth = await generateSystemHealthDashboard();
  if (systemHealth) dashboards.push({ result: systemHealth, name: 'System Health' });
  
  const appPerformance = await generateApplicationPerformanceDashboard();
  if (appPerformance) dashboards.push({ result: appPerformance, name: 'Application Performance' });
  
  const costOptimization = await generateCostOptimizationDashboard();
  if (costOptimization) dashboards.push({ result: costOptimization, name: 'Cost Optimization' });
  
  const autoDashboard = await generateAutoDashboard();
  if (autoDashboard) dashboards.push({ result: autoDashboard, name: 'Auto-Generated' });
  
  // Deploy dashboards if --deploy flag is passed
  if (process.argv.includes('--deploy')) {
    console.log('\n=== Deploying Dashboards ===');
    
    for (const { result, name } of dashboards) {
      await deployDashboard(result.dashboard, name);
    }
  } else {
    console.log('\nTo deploy these dashboards, run with --deploy flag');
  }
  
  // Save dashboards to files if --save flag is passed
  if (process.argv.includes('--save')) {
    console.log('\n=== Saving Dashboards ===');
    const fs = require('fs');
    const path = require('path');
    
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    for (const { result, name } of dashboards) {
      const filename = path.join(outputDir, `${name.toLowerCase().replace(/\s+/g, '-')}.json`);
      fs.writeFileSync(filename, JSON.stringify(result.dashboard, null, 2));
      console.log(`✓ Saved ${name} to ${filename}`);
    }
  }
  
  console.log('\nDone!');
}

// Run the examples
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});