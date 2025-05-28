#!/usr/bin/env node

const ExperimentDashboardGenerator = require('../dashboard-generator/integrations/experiment-integration');
const chalk = require('chalk');
const ora = require('ora');
const dotenv = require('dotenv');

dotenv.config();

async function generateExperimentDashboards() {
  console.log(chalk.blue.bold('\n=== Experiment Dashboard Generator ===\n'));

  const generator = new ExperimentDashboardGenerator({
    apiKey: process.env.NEW_RELIC_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID
  });

  // Example 1: Generate NRDOT optimization dashboard
  console.log(chalk.yellow('1. Generating NRDOT Optimization Dashboard...'));
  const nrdotSpinner = ora('Creating NRDOT dashboard...').start();
  
  try {
    const nrdotResult = await generator.generateNRDOTDashboard('balanced', {
      name: 'NRDOT Balanced Profile Performance',
      additionalMetrics: ['system.cpu.usage', 'system.memory.usage'],
      timeRange: '3 hours'
    });
    
    nrdotSpinner.succeed('NRDOT dashboard generated!');
    console.log(chalk.green(`  ✓ Widgets: ${nrdotResult.dashboard.pages[0].widgets.length}`));
    console.log(chalk.green(`  ✓ Profile: ${nrdotResult.metadata.profileName}`));
    
    if (process.argv.includes('--deploy')) {
      const deploySpinner = ora('Deploying NRDOT dashboard...').start();
      const deployment = await generator.generator.deploy(nrdotResult.dashboard);
      deploySpinner.succeed(`Deployed: ${deployment.permalink}`);
    }
  } catch (error) {
    nrdotSpinner.fail(`Failed: ${error.message}`);
  }

  // Example 2: Generate experiment comparison dashboard
  console.log(chalk.yellow('\n2. Generating Experiment Comparison Dashboard...'));
  const comparisonSpinner = ora('Creating comparison dashboard...').start();
  
  try {
    // Mock experiment data for demonstration
    const mockExperiments = [
      { id: 'exp-001', name: 'Conservative Profile Test' },
      { id: 'exp-002', name: 'Aggressive Profile Test' }
    ];
    
    const comparisonResult = await generator.generateComparisonDashboard(
      mockExperiments.map(e => e.id),
      {
        name: 'Profile Comparison: Conservative vs Aggressive',
        layout: 'detailed'
      }
    );
    
    comparisonSpinner.succeed('Comparison dashboard generated!');
    console.log(chalk.green(`  ✓ Experiments: ${comparisonResult.metadata.experimentIds.join(', ')}`));
    console.log(chalk.green(`  ✓ Widgets: ${comparisonResult.dashboard.pages[0].widgets.length}`));
  } catch (error) {
    comparisonSpinner.fail(`Failed: ${error.message}`);
  }

  // Example 3: Generate KPI tracking dashboard
  console.log(chalk.yellow('\n3. Generating KPI Tracking Dashboard...'));
  const kpiSpinner = ora('Creating KPI dashboard...').start();
  
  try {
    const kpis = [
      {
        name: 'Cost Reduction',
        metric: 'nrdot.cost.reduction',
        unit: '%',
        aggregation: 'average',
        thresholds: [
          { value: 50, alertSeverity: 'WARNING' },
          { value: 70, alertSeverity: 'CRITICAL' }
        ]
      },
      {
        name: 'Process Coverage',
        metric: 'nrdot.coverage.percent',
        unit: '%',
        aggregation: 'latest',
        thresholds: [
          { value: 90, alertSeverity: 'WARNING' },
          { value: 95, alertSeverity: 'CRITICAL' }
        ]
      },
      {
        name: 'Optimization Score',
        metric: 'nrdot.optimization.score',
        unit: 'score',
        aggregation: 'average'
      },
      {
        name: 'Telemetry Volume',
        metric: 'telemetry.volume.after',
        unit: 'MB/s',
        aggregation: 'sum'
      }
    ];
    
    const kpiResult = await generator.generateKPIDashboard(kpis, {
      name: 'NRDOT KPI Dashboard'
    });
    
    kpiSpinner.succeed('KPI dashboard generated!');
    console.log(chalk.green(`  ✓ KPIs tracked: ${kpiResult.metadata.kpis.join(', ')}`));
    console.log(chalk.green(`  ✓ Widgets: ${kpiResult.dashboard.pages[0].widgets.length}`));
    
    if (process.argv.includes('--deploy')) {
      const deploySpinner = ora('Deploying KPI dashboard...').start();
      const deployment = await generator.generator.deploy(kpiResult.dashboard);
      deploySpinner.succeed(`Deployed: ${deployment.permalink}`);
    }
  } catch (error) {
    kpiSpinner.fail(`Failed: ${error.message}`);
  }

  // Example 4: Generate dashboard from experiment results
  console.log(chalk.yellow('\n4. Generating Dashboard from Experiment Results...'));
  const expSpinner = ora('Creating experiment dashboard...').start();
  
  try {
    // Mock experiment data structure
    const experimentData = {
      id: 'cost-optimization-test',
      name: 'Cost Optimization Experiment',
      description: 'Testing NRDOT cost optimization with balanced profile',
      duration: '2 hours',
      profile: 'balanced',
      status: 'completed',
      targets: {
        costReduction: { metric: 'nrdot.cost.reduction', value: '> 70%' },
        coverage: { metric: 'nrdot.coverage.percent', value: '> 95%' },
        performance: { metric: 'system.response.time', value: '< 100ms' }
      },
      metrics: {
        track: [
          'nrdot.cost.reduction',
          'nrdot.coverage.percent',
          'process.count.filtered',
          'process.count.total',
          'system.cpu.usage',
          'system.memory.usage'
        ]
      }
    };
    
    // Save mock data temporarily
    const fs = require('fs');
    const path = require('path');
    const tempPath = path.join(process.cwd(), 'experiments', 'results');
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }
    fs.writeFileSync(
      path.join(tempPath, `${experimentData.id}.json`),
      JSON.stringify(experimentData, null, 2)
    );
    
    const expResult = await generator.generateExperimentDashboard(experimentData.id, {
      layout: 'detailed'
    });
    
    expSpinner.succeed('Experiment dashboard generated!');
    console.log(chalk.green(`  ✓ Experiment: ${expResult.metadata.experimentName}`));
    console.log(chalk.green(`  ✓ Metrics tracked: ${expResult.metadata.metricsUsed}`));
    console.log(chalk.green(`  ✓ Widgets: ${expResult.dashboard.pages[0].widgets.length}`));
    
    // Clean up temp file
    fs.unlinkSync(path.join(tempPath, `${experimentData.id}.json`));
    
  } catch (error) {
    expSpinner.fail(`Failed: ${error.message}`);
  }

  // Summary
  console.log(chalk.blue.bold('\n=== Summary ==='));
  console.log('The experiment dashboard integration provides:');
  console.log('  • NRDOT optimization dashboards for each profile');
  console.log('  • Experiment comparison dashboards');
  console.log('  • KPI tracking dashboards');
  console.log('  • Automatic dashboard generation from experiment results');
  
  if (!process.argv.includes('--deploy')) {
    console.log(chalk.yellow('\nTip: Run with --deploy to deploy dashboards to New Relic'));
  }
}

// Run the examples
generateExperimentDashboards().catch(error => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});