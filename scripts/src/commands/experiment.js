const { Command } = require('commander');
const fs = require('fs/promises');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const yaml = require('js-yaml');
const { table } = require('table');
const { Config } = require('../core/config.js');
const { Output } = require('../utils/output.js');
const { logger } = require('../utils/logger.js');
const { withCLIErrorHandler, CLIError } = require('../utils/cli-error-handler.js');
const { ExperimentOrchestrator } = require('../../../experiments/orchestrator/experiment-orchestrator.js');

class ExperimentCommand {
  getCommand() {
    const experiment = new Command('experiment')
      .description('Run and manage NRDOT configuration experiments');

    experiment
      .command('list')
      .description('List available experiment profiles')
      .action(withCLIErrorHandler(async () => {
        await this.listExperiments();
      }));

    experiment
      .command('run <profile>')
      .description('Run an experiment using a profile')
      .option('--dry-run', 'Validate experiment without running')
      .option('--skip-warmup', 'Skip warmup phase')
      .option('--skip-cooldown', 'Skip cooldown phase')
      .option('--duration <minutes>', 'Override test duration', parseInt)
      .action(withCLIErrorHandler(async (profile, options) => {
        await this.runExperiment(profile, options);
      }));

    experiment
      .command('create <name>')
      .description('Create a new experiment configuration')
      .option('--template <template>', 'Base template to use', 'basic')
      .option('--duration <minutes>', 'Test duration in minutes', parseInt, 30)
      .option('--configs <configs>', 'Comma-separated list of configs to test', 'conservative,balanced,aggressive')
      .action(withCLIErrorHandler(async (name, options) => {
        await this.createExperiment(name, options);
      }));

    experiment
      .command('results [experimentId]')
      .description('View experiment results')
      .option('--format <format>', 'Output format (table|json|markdown)', 'table')
      .option('--detailed', 'Include detailed metrics')
      .action(withCLIErrorHandler(async (experimentId, options) => {
        await this.viewResults(experimentId, options);
      }));

    experiment
      .command('compare <experiments...>')
      .description('Compare results from multiple experiments')
      .option('--metric <metric>', 'Primary metric to compare', 'estimated_monthly_cost')
      .action(withCLIErrorHandler(async (experiments, options) => {
        await this.compareExperiments(experiments, options);
      }));

    experiment
      .command('validate <profile>')
      .description('Validate an experiment configuration')
      .action(withCLIErrorHandler(async (profile) => {
        await this.validateExperiment(profile);
      }));

    experiment
      .command('status')
      .description('Check status of running experiments')
      .action(withCLIErrorHandler(async () => {
        await this.checkStatus();
      }));

    experiment
      .command('stop [experimentId]')
      .description('Stop a running experiment')
      .option('--force', 'Force stop without cleanup')
      .action(withCLIErrorHandler(async (experimentId, options) => {
        await this.stopExperiment(experimentId, options);
      }));

    return experiment;
  }

  async listExperiments() {
    const output = new Output();
    output.startSpinner('Loading experiment profiles...');

    try {
      // List built-in profiles
      const profilesDir = path.join(process.cwd(), 'experiments/profiles');
      const files = await fs.readdir(profilesDir);
      const profiles = [];

      for (const file of files) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const content = await fs.readFile(path.join(profilesDir, file), 'utf8');
          const config = yaml.load(content);
          
          profiles.push({
            file: file.replace(/\.(yaml|yml)$/, ''),
            id: config.experiment.id,
            name: config.experiment.name,
            duration: config.experiment.duration.test_minutes,
            configs: config.experiment.containers.test_groups.length + 1
          });
        }
      }

      output.stopSpinner(true);

      console.log(chalk.blue.bold('\n📋 Available Experiment Profiles\n'));
      
      const data = [
        ['Profile', 'ID', 'Name', 'Duration', 'Configs'],
        ...profiles.map(p => [
          chalk.cyan(p.file),
          p.id,
          p.name,
          `${p.duration}m`,
          p.configs
        ])
      ];

      console.log(table(data));

      // List recent results
      const resultsDir = path.join(process.cwd(), 'experiment-results');
      try {
        const results = await fs.readdir(resultsDir);
        if (results.length > 0) {
          console.log(chalk.blue.bold('\n📊 Recent Experiment Results\n'));
          
          const recentResults = [];
          for (const resultId of results.slice(-5)) {
            try {
              const analysisPath = path.join(resultsDir, resultId, 'analysis.json');
              const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf8'));
              
              recentResults.push({
                id: resultId,
                timestamp: new Date(analysis.timestamp).toLocaleDateString(),
                status: 'completed'
              });
            } catch {
              recentResults.push({
                id: resultId,
                timestamp: 'Unknown',
                status: 'incomplete'
              });
            }
          }

          const resultData = [
            ['Experiment ID', 'Date', 'Status'],
            ...recentResults.map(r => [
              chalk.yellow(r.id),
              r.timestamp,
              r.status === 'completed' ? chalk.green(r.status) : chalk.red(r.status)
            ])
          ];

          console.log(table(resultData));
        }
      } catch {
        // No results directory yet
      }

    } catch (error) {
      output.stopSpinner(false);
      throw new CLIError(`Failed to list experiments: ${error.message}`);
    }
  }

  async runExperiment(profile, options) {
    const output = new Output();
    const orchestrator = new ExperimentOrchestrator();

    try {
      // Load experiment config
      let configPath;
      if (profile.includes('/')) {
        configPath = profile;
      } else {
        configPath = path.join(process.cwd(), `experiments/profiles/${profile}.yaml`);
      }

      console.log(chalk.blue.bold('\n🧪 Loading Experiment Configuration\n'));
      
      const experiment = await orchestrator.loadExperiment(configPath);
      
      // Override options if provided
      if (options.duration) {
        experiment.duration.test_minutes = options.duration;
      }
      if (options.skipWarmup) {
        experiment.duration.warmup_minutes = 0;
      }
      if (options.skipCooldown) {
        experiment.duration.cooldown_minutes = 0;
      }

      // Validate environment
      if (!process.env.NEW_RELIC_API_KEY || !process.env.NEW_RELIC_ACCOUNT_ID) {
        throw new CLIError('Missing required environment variables: NEW_RELIC_API_KEY, NEW_RELIC_ACCOUNT_ID');
      }

      if (options.dryRun) {
        console.log(chalk.yellow('\n🔍 Dry Run Mode - Validating Only\n'));
        
        console.log(chalk.cyan('Experiment:'), experiment.name);
        console.log(chalk.cyan('Duration:'), `${experiment.duration.test_minutes} minutes`);
        console.log(chalk.cyan('Configurations:'), experiment.containers.test_groups.length + 1);
        console.log(chalk.cyan('Primary Metrics:'), experiment.metrics.primary_metrics.map(m => m.name).join(', '));
        
        console.log(chalk.green('\n✅ Experiment configuration is valid\n'));
        return;
      }

      // Subscribe to events
      orchestrator.on('experiment:start', () => {
        console.log(chalk.green('\n🚀 Experiment Started\n'));
      });

      orchestrator.on('metrics:collected', (metrics) => {
        // Could display real-time metrics here
      });

      orchestrator.on('experiment:error', ({ error }) => {
        console.error(chalk.red('\n❌ Experiment Error:'), error.message);
      });

      // Run experiment
      const { analysis } = await orchestrator.runExperiment(experiment.id);

      // Display summary
      console.log(chalk.green.bold('\n📊 Experiment Results Summary\n'));

      for (const [configName, comparison] of Object.entries(analysis.comparisons)) {
        console.log(chalk.cyan(`\n${configName}:`));
        
        if (comparison.cost_savings) {
          const savings = comparison.cost_savings.change_percentage;
          const savingsColor = savings < 0 ? chalk.green : chalk.red;
          console.log(`  Cost Savings: ${savingsColor(`${Math.abs(savings).toFixed(1)}%`)}`);
        }
        
        if (comparison.data_reduction) {
          const reduction = comparison.data_reduction.change_percentage;
          const reductionColor = reduction < 0 ? chalk.green : chalk.red;
          console.log(`  Data Reduction: ${reductionColor(`${Math.abs(reduction).toFixed(1)}%`)}`);
        }
        
        if (comparison.process_coverage) {
          const coverage = comparison.process_coverage.percentage_of_control;
          const coverageColor = coverage >= 95 ? chalk.green : chalk.yellow;
          console.log(`  Process Coverage: ${coverageColor(`${coverage.toFixed(1)}%`)}`);
        }
      }

      // Display recommendations
      if (analysis.recommendations.length > 0) {
        console.log(chalk.blue.bold('\n💡 Recommendations\n'));
        
        for (const rec of analysis.recommendations) {
          console.log(chalk.yellow(`• ${rec.action}`));
          console.log(chalk.gray(`  ${rec.rationale}`));
        }
      }

      console.log(chalk.gray(`\nFull results saved to: ./experiment-results/${experiment.id}/`));

    } catch (error) {
      throw error instanceof CLIError ? error : new CLIError(`Failed to run experiment: ${error.message}`);
    }
  }

  async createExperiment(name, options) {
    const output = new Output();
    
    console.log(chalk.blue.bold('\n📝 Creating New Experiment Configuration\n'));

    const experimentId = `exp-${name}-${Date.now()}`;
    const configs = options.configs.split(',').map(c => c.trim());

    const experiment = {
      experiment: {
        id: experimentId,
        name: `${name} Experiment`,
        description: `Custom experiment testing ${configs.join(', ')} configurations`,
        
        metadata: {
          created_by: 'cli',
          created_at: new Date().toISOString(),
          tags: ['custom', ...configs]
        },
        
        duration: {
          warmup_minutes: 5,
          test_minutes: options.duration,
          cooldown_minutes: 5
        },
        
        containers: {
          control: {
            name: 'nrdot-baseline',
            image: 'dashbuilder-nrdot:latest',
            config_profile: 'baseline',
            replicas: 1,
            environment: {
              NEW_RELIC_API_KEY: '${NEW_RELIC_API_KEY}',
              NEW_RELIC_ACCOUNT_ID: '${NEW_RELIC_ACCOUNT_ID}',
              NRDOT_MODE: 'standard',
              ENABLE_METRICS: 'true'
            }
          },
          
          test_groups: configs.map(config => ({
            name: `nrdot-${config}`,
            image: 'dashbuilder-nrdot:latest',
            config_profile: config,
            replicas: 1,
            environment: {
              NEW_RELIC_API_KEY: '${NEW_RELIC_API_KEY}',
              NEW_RELIC_ACCOUNT_ID: '${NEW_RELIC_ACCOUNT_ID}',
              NRDOT_MODE: 'optimized',
              OPTIMIZATION_LEVEL: config,
              ENABLE_METRICS: 'true'
            }
          }))
        },
        
        metrics: {
          collection_interval_seconds: 30,
          primary_metrics: [
            {
              name: 'telemetry_volume',
              query: "SELECT sum(nrdot.bytes.sent) FROM Metric WHERE service.name LIKE 'nrdot%' SINCE 1 minute ago",
              unit: 'bytes'
            },
            {
              name: 'process_count',
              query: "SELECT uniqueCount(processDisplayName) FROM ProcessSample WHERE nrdot.enabled = 'true' SINCE 1 minute ago",
              unit: 'count'
            },
            {
              name: 'estimated_cost',
              query: "SELECT latest(nrdot.estimated.cost.hourly) FROM Metric WHERE service.name LIKE 'nrdot%'",
              unit: 'usd_per_hour'
            }
          ]
        },
        
        success_criteria: {
          requirements: [
            {
              metric: 'process_count',
              operator: '>=',
              threshold: 20,
              description: 'Must monitor at least 20 processes'
            }
          ],
          goals: [
            {
              metric: 'telemetry_volume',
              operator: '<',
              baseline_percentage: 70,
              description: 'Target 30% reduction'
            }
          ]
        },
        
        workload: {
          enabled: true,
          type: 'synthetic',
          processes: {
            total_count: 50,
            distribution: {
              critical: 10,
              important: 20,
              standard: 20
            }
          }
        },
        
        comparison: {
          baseline: 'control',
          dimensions: [
            {
              name: 'cost_reduction',
              primary_metric: 'estimated_cost',
              calculation: 'percentage_change'
            },
            {
              name: 'data_reduction',
              primary_metric: 'telemetry_volume',
              calculation: 'percentage_change'
            }
          ]
        },
        
        output: {
          storage: {
            type: 'local',
            path: './experiment-results/${experiment.id}'
          },
          reports: [
            {
              type: 'summary',
              format: 'markdown',
              include_charts: true
            }
          ]
        }
      }
    };

    // Save experiment config
    const configPath = path.join(process.cwd(), 'experiments/profiles', `${name}.yaml`);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, yaml.dump(experiment));

    console.log(chalk.green(`✅ Created experiment configuration: ${configPath}`));
    console.log(chalk.gray(`\nRun with: npm run experiment:run ${name}`));
  }

  async viewResults(experimentId, options) {
    const output = new Output();
    
    try {
      let experimentsToShow = [];
      
      if (experimentId) {
        experimentsToShow = [experimentId];
      } else {
        // Show latest experiment
        const resultsDir = path.join(process.cwd(), 'experiment-results');
        const results = await fs.readdir(resultsDir);
        if (results.length === 0) {
          console.log(chalk.yellow('\nNo experiment results found\n'));
          return;
        }
        experimentsToShow = [results[results.length - 1]];
      }

      for (const expId of experimentsToShow) {
        const analysisPath = path.join(process.cwd(), 'experiment-results', expId, 'analysis.json');
        const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf8'));

        if (options.format === 'json') {
          console.log(JSON.stringify(analysis, null, 2));
        } else if (options.format === 'markdown') {
          const reportPath = path.join(process.cwd(), 'experiment-results', expId, 'report.md');
          const report = await fs.readFile(reportPath, 'utf8');
          console.log(report);
        } else {
          // Table format
          console.log(chalk.blue.bold(`\n📊 Experiment Results: ${expId}\n`));
          console.log(chalk.cyan('Date:'), new Date(analysis.timestamp).toLocaleString());
          
          // Comparisons table
          const comparisonData = [
            ['Configuration', 'Cost Change', 'Data Reduction', 'Coverage']
          ];
          
          for (const [config, comparison] of Object.entries(analysis.comparisons)) {
            comparisonData.push([
              config,
              comparison.cost_savings ? `${comparison.cost_savings.change_percentage.toFixed(1)}%` : 'N/A',
              comparison.data_reduction ? `${comparison.data_reduction.change_percentage.toFixed(1)}%` : 'N/A',
              comparison.process_coverage ? `${comparison.process_coverage.percentage_of_control.toFixed(1)}%` : 'N/A'
            ]);
          }
          
          console.log('\n' + table(comparisonData));
          
          // Insights
          if (analysis.insights.length > 0) {
            console.log(chalk.blue.bold('\n🔍 Insights\n'));
            for (const insight of analysis.insights) {
              const icon = insight.type === 'success' ? '✅' : '⚠️';
              console.log(`${icon} ${insight.message}`);
            }
          }
          
          // Recommendations
          if (analysis.recommendations.length > 0) {
            console.log(chalk.blue.bold('\n💡 Recommendations\n'));
            for (const rec of analysis.recommendations) {
              console.log(chalk.yellow(`• ${rec.action}`));
              if (options.detailed) {
                console.log(chalk.gray(`  Rationale: ${rec.rationale}`));
                console.log(chalk.gray(`  Priority: ${rec.priority}`));
              }
            }
          }
        }
      }
    } catch (error) {
      throw new CLIError(`Failed to view results: ${error.message}`);
    }
  }

  async compareExperiments(experimentIds, options) {
    const output = new Output();
    
    console.log(chalk.blue.bold('\n📊 Comparing Experiments\n'));
    
    try {
      const comparisons = [];
      
      for (const expId of experimentIds) {
        const analysisPath = path.join(process.cwd(), 'experiment-results', expId, 'analysis.json');
        const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf8'));
        
        comparisons.push({
          id: expId,
          timestamp: analysis.timestamp,
          results: analysis.comparisons
        });
      }
      
      // Create comparison table
      const metric = options.metric;
      const data = [
        ['Experiment', 'Date', ...Object.keys(comparisons[0].results)]
      ];
      
      for (const comp of comparisons) {
        const row = [
          comp.id,
          new Date(comp.timestamp).toLocaleDateString()
        ];
        
        for (const [config, results] of Object.entries(comp.results)) {
          // Find the metric in the results
          let value = 'N/A';
          
          if (metric === 'estimated_monthly_cost' && results.cost_savings) {
            value = `${results.cost_savings.change_percentage.toFixed(1)}%`;
          } else if (metric === 'telemetry_volume' && results.data_reduction) {
            value = `${results.data_reduction.change_percentage.toFixed(1)}%`;
          }
          
          row.push(value);
        }
        
        data.push(row);
      }
      
      console.log(table(data));
      
      // Find best performing config across experiments
      let bestConfig = null;
      let bestPerformance = 0;
      
      for (const comp of comparisons) {
        for (const [config, results] of Object.entries(comp.results)) {
          if (results.cost_savings && Math.abs(results.cost_savings.change_percentage) > bestPerformance) {
            bestConfig = config;
            bestPerformance = Math.abs(results.cost_savings.change_percentage);
          }
        }
      }
      
      if (bestConfig) {
        console.log(chalk.green(`\n🏆 Best performing configuration: ${bestConfig} (${bestPerformance.toFixed(1)}% improvement)\n`));
      }
      
    } catch (error) {
      throw new CLIError(`Failed to compare experiments: ${error.message}`);
    }
  }

  async validateExperiment(profile) {
    const output = new Output();
    const orchestrator = new ExperimentOrchestrator();
    
    output.startSpinner('Validating experiment configuration...');
    
    try {
      let configPath;
      if (profile.includes('/')) {
        configPath = profile;
      } else {
        configPath = path.join(process.cwd(), `experiments/profiles/${profile}.yaml`);
      }
      
      const experiment = await orchestrator.loadExperiment(configPath);
      
      // Additional validation checks
      const issues = [];
      
      // Check duration
      if (experiment.duration.test_minutes < 5) {
        issues.push('Test duration should be at least 5 minutes for meaningful results');
      }
      
      // Check metrics
      if (experiment.metrics.primary_metrics.length < 3) {
        issues.push('At least 3 primary metrics recommended for comprehensive analysis');
      }
      
      // Check configs
      if (experiment.containers.test_groups.length < 1) {
        issues.push('At least one test configuration required');
      }
      
      output.stopSpinner(true);
      
      console.log(chalk.green('\n✅ Experiment configuration is valid\n'));
      console.log(chalk.cyan('Name:'), experiment.name);
      console.log(chalk.cyan('Duration:'), `${experiment.duration.test_minutes} minutes`);
      console.log(chalk.cyan('Configurations:'), experiment.containers.test_groups.length + 1);
      
      if (issues.length > 0) {
        console.log(chalk.yellow('\n⚠️  Warnings:'));
        issues.forEach(issue => console.log(chalk.yellow(`  • ${issue}`)));
      }
      
    } catch (error) {
      output.stopSpinner(false);
      throw new CLIError(`Validation failed: ${error.message}`);
    }
  }

  async checkStatus() {
    const output = new Output();
    
    console.log(chalk.blue.bold('\n📊 Experiment Status\n'));
    
    try {
      // Check for running containers
      const { stdout } = await execAsync('docker ps --filter "name=exp-" --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}"');
      
      if (stdout.trim()) {
        console.log(chalk.cyan('Running Experiments:\n'));
        console.log(stdout);
      } else {
        console.log(chalk.yellow('No experiments currently running\n'));
      }
      
      // Check recent results
      const resultsDir = path.join(process.cwd(), 'experiment-results');
      const results = await fs.readdir(resultsDir);
      
      if (results.length > 0) {
        console.log(chalk.cyan('\nRecent Experiments:\n'));
        
        const recentData = [
          ['Experiment ID', 'Status', 'Date']
        ];
        
        for (const expId of results.slice(-5).reverse()) {
          try {
            const analysisPath = path.join(resultsDir, expId, 'analysis.json');
            const analysis = JSON.parse(await fs.readFile(analysisPath, 'utf8'));
            
            recentData.push([
              expId,
              chalk.green('Completed'),
              new Date(analysis.timestamp).toLocaleString()
            ]);
          } catch {
            recentData.push([
              expId,
              chalk.red('Incomplete'),
              'Unknown'
            ]);
          }
        }
        
        console.log(table(recentData));
      }
      
    } catch (error) {
      throw new CLIError(`Failed to check status: ${error.message}`);
    }
  }

  async stopExperiment(experimentId, options) {
    const output = new Output();
    
    output.startSpinner('Stopping experiment...');
    
    try {
      let containersToStop = [];
      
      if (experimentId) {
        // Stop specific experiment
        const { stdout } = await execAsync(`docker ps --filter "name=${experimentId}" --format "{{.Names}}"`);
        containersToStop = stdout.trim().split('\n').filter(n => n);
      } else {
        // Stop all experiments
        const { stdout } = await execAsync('docker ps --filter "name=exp-" --format "{{.Names}}"');
        containersToStop = stdout.trim().split('\n').filter(n => n);
      }
      
      if (containersToStop.length === 0) {
        output.stopSpinner(false);
        console.log(chalk.yellow('\nNo running experiments found\n'));
        return;
      }
      
      for (const container of containersToStop) {
        await execAsync(`docker stop ${container}`);
        if (!options.force) {
          await execAsync(`docker rm ${container}`);
        }
      }
      
      output.stopSpinner(true);
      console.log(chalk.green(`\n✅ Stopped ${containersToStop.length} container(s)\n`));
      
    } catch (error) {
      output.stopSpinner(false);
      throw new CLIError(`Failed to stop experiment: ${error.message}`);
    }
  }
}

module.exports = {
  ExperimentCommand
};