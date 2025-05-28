#!/usr/bin/env node

/**
 * NRDOT Experiment Orchestrator
 * Manages systematic experiments comparing NRDOT configurations
 */

import { EventEmitter } from 'events';
import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import { services } from '../../lib/shared/index.js';
import { logger } from '../../scripts/src/utils/logger.js';

const execAsync = promisify(exec);

export class ExperimentOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.experiments = new Map();
    this.activeExperiment = null;
    this.metricsCollector = null;
    this.containers = new Map();
  }

  /**
   * Load experiment configuration from file
   */
  async loadExperiment(configPath) {
    try {
      const content = await fs.readFile(configPath, 'utf8');
      const config = yaml.load(content);
      
      // Validate experiment config
      this.validateExperimentConfig(config.experiment);
      
      this.experiments.set(config.experiment.id, config.experiment);
      logger.info(`Loaded experiment: ${config.experiment.name}`);
      
      return config.experiment;
    } catch (error) {
      logger.error(`Failed to load experiment config: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate experiment configuration
   */
  validateExperimentConfig(experiment) {
    const required = ['id', 'name', 'containers', 'metrics', 'duration'];
    for (const field of required) {
      if (!experiment[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    if (!experiment.containers.control) {
      throw new Error('Experiment must have a control group');
    }
    
    if (!experiment.containers.test_groups || experiment.containers.test_groups.length === 0) {
      throw new Error('Experiment must have at least one test group');
    }
  }

  /**
   * Run an experiment
   */
  async runExperiment(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }
    
    console.log(chalk.blue.bold(`\n🧪 Starting Experiment: ${experiment.name}\n`));
    
    this.activeExperiment = experiment;
    this.emit('experiment:start', experiment);
    
    try {
      // Phase 1: Setup
      await this.setupPhase(experiment);
      
      // Phase 2: Warmup
      await this.warmupPhase(experiment);
      
      // Phase 3: Test execution
      const results = await this.testPhase(experiment);
      
      // Phase 4: Cooldown
      await this.cooldownPhase(experiment);
      
      // Phase 5: Analysis
      const analysis = await this.analysisPhase(experiment, results);
      
      // Phase 6: Cleanup
      await this.cleanupPhase(experiment);
      
      this.emit('experiment:complete', { experiment, results, analysis });
      
      return { results, analysis };
      
    } catch (error) {
      this.emit('experiment:error', { experiment, error });
      await this.cleanupPhase(experiment);
      throw error;
    } finally {
      this.activeExperiment = null;
    }
  }

  /**
   * Setup phase - prepare environment and launch containers
   */
  async setupPhase(experiment) {
    const spinner = ora('Setting up experiment environment...').start();
    
    try {
      // Create results directory
      const resultsDir = path.join('./experiment-results', experiment.id);
      await fs.mkdir(resultsDir, { recursive: true });
      
      // Launch control container
      spinner.text = 'Launching control container...';
      await this.launchContainer(experiment.containers.control, 'control');
      
      // Launch test containers
      for (const testGroup of experiment.containers.test_groups) {
        spinner.text = `Launching test container: ${testGroup.name}...`;
        await this.launchContainer(testGroup, 'test');
      }
      
      // Wait for containers to be ready
      spinner.text = 'Waiting for containers to be ready...';
      await this.waitForContainersReady();
      
      spinner.succeed('Experiment environment ready');
      
    } catch (error) {
      spinner.fail('Setup failed');
      throw error;
    }
  }

  /**
   * Launch a container with specific configuration
   */
  async launchContainer(config, type) {
    const containerName = `${this.activeExperiment.id}-${config.name}`;
    
    // Build docker run command
    const envVars = Object.entries(config.environment || {})
      .map(([key, value]) => `-e ${key}="${value}"`)
      .join(' ');
    
    const configMount = `-v ${path.resolve(`./configs/collector-profiles/${config.config_profile}.yaml`)}:/etc/otel/config.yaml`;
    
    const command = `docker run -d --name ${containerName} ${envVars} ${configMount} ${config.image}`;
    
    logger.info(`Launching container: ${command}`);
    
    try {
      const { stdout } = await execAsync(command);
      const containerId = stdout.trim();
      
      this.containers.set(containerName, {
        id: containerId,
        name: containerName,
        config: config,
        type: type,
        startTime: new Date()
      });
      
      return containerId;
    } catch (error) {
      logger.error(`Failed to launch container ${containerName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Wait for all containers to be ready
   */
  async waitForContainersReady(maxWaitSeconds = 60) {
    const startTime = Date.now();
    
    while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
      const allReady = await this.checkContainersHealth();
      
      if (allReady) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error('Containers failed to become ready in time');
  }

  /**
   * Check health of all containers
   */
  async checkContainersHealth() {
    for (const [name, container] of this.containers) {
      try {
        const { stdout } = await execAsync(`docker inspect ${container.id} --format='{{.State.Running}}'`);
        if (stdout.trim() !== 'true') {
          return false;
        }
      } catch (error) {
        return false;
      }
    }
    return true;
  }

  /**
   * Warmup phase
   */
  async warmupPhase(experiment) {
    const duration = experiment.duration.warmup_minutes;
    console.log(chalk.yellow(`\n⏱️  Warmup phase: ${duration} minutes\n`));
    
    // Start workload generator if enabled
    if (experiment.workload?.enabled) {
      await this.startWorkloadGenerator(experiment.workload);
    }
    
    // Wait for warmup period
    await this.waitWithProgress(duration * 60, 'Warmup');
  }

  /**
   * Test phase - collect metrics
   */
  async testPhase(experiment) {
    const duration = experiment.duration.test_minutes;
    console.log(chalk.green(`\n📊 Test phase: ${duration} minutes\n`));
    
    const results = {
      experiment_id: experiment.id,
      start_time: new Date(),
      end_time: null,
      containers: {},
      metrics: {},
      raw_data: []
    };
    
    // Initialize container results
    for (const [name, container] of this.containers) {
      results.containers[name] = {
        config: container.config,
        type: container.type,
        metrics: {}
      };
    }
    
    // Start metrics collection
    const collectionInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics(experiment);
        results.raw_data.push({
          timestamp: new Date(),
          metrics: metrics
        });
        
        this.emit('metrics:collected', metrics);
      } catch (error) {
        logger.error('Failed to collect metrics:', error);
      }
    }, experiment.metrics.collection_interval_seconds * 1000);
    
    // Wait for test duration
    await this.waitWithProgress(duration * 60, 'Test');
    
    // Stop metrics collection
    clearInterval(collectionInterval);
    
    results.end_time = new Date();
    
    // Calculate aggregated metrics
    results.metrics = await this.aggregateMetrics(results.raw_data);
    
    return results;
  }

  /**
   * Collect metrics for all containers
   */
  async collectMetrics(experiment) {
    const metrics = {};
    
    for (const [containerName, container] of this.containers) {
      metrics[containerName] = {};
      
      // Collect primary metrics
      for (const metric of experiment.metrics.primary_metrics) {
        try {
          // Add container filter to query
          const containerQuery = metric.query.replace(
            'WHERE',
            `WHERE containerName = '${containerName}' AND`
          );
          
          const result = await services.nrql.runQuery(containerQuery);
          metrics[containerName][metric.name] = {
            value: result.results?.[0]?.value || 0,
            unit: metric.unit
          };
        } catch (error) {
          logger.error(`Failed to collect metric ${metric.name}: ${error.message}`);
          metrics[containerName][metric.name] = { value: 0, unit: metric.unit, error: true };
        }
      }
    }
    
    return metrics;
  }

  /**
   * Aggregate metrics from raw data
   */
  async aggregateMetrics(rawData) {
    const aggregated = {};
    
    // Group by container
    const containerMetrics = {};
    
    for (const dataPoint of rawData) {
      for (const [container, metrics] of Object.entries(dataPoint.metrics)) {
        if (!containerMetrics[container]) {
          containerMetrics[container] = {};
        }
        
        for (const [metricName, metricData] of Object.entries(metrics)) {
          if (!containerMetrics[container][metricName]) {
            containerMetrics[container][metricName] = [];
          }
          
          if (!metricData.error) {
            containerMetrics[container][metricName].push(metricData.value);
          }
        }
      }
    }
    
    // Calculate aggregations
    for (const [container, metrics] of Object.entries(containerMetrics)) {
      aggregated[container] = {};
      
      for (const [metricName, values] of Object.entries(metrics)) {
        if (values.length > 0) {
          aggregated[container][metricName] = {
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            count: values.length
          };
        }
      }
    }
    
    return aggregated;
  }

  /**
   * Cooldown phase
   */
  async cooldownPhase(experiment) {
    const duration = experiment.duration.cooldown_minutes;
    console.log(chalk.yellow(`\n⏱️  Cooldown phase: ${duration} minutes\n`));
    
    // Stop workload generator
    if (experiment.workload?.enabled) {
      await this.stopWorkloadGenerator();
    }
    
    await this.waitWithProgress(duration * 60, 'Cooldown');
  }

  /**
   * Analysis phase - compare results
   */
  async analysisPhase(experiment, results) {
    const spinner = ora('Analyzing experiment results...').start();
    
    try {
      const analysis = {
        experiment_id: experiment.id,
        timestamp: new Date(),
        comparisons: {},
        insights: [],
        recommendations: []
      };
      
      // Get control metrics
      const controlName = `${experiment.id}-${experiment.containers.control.name}`;
      const controlMetrics = results.metrics[controlName];
      
      if (!controlMetrics) {
        throw new Error('Control metrics not found');
      }
      
      // Compare each test group to control
      for (const testGroup of experiment.containers.test_groups) {
        const testName = `${experiment.id}-${testGroup.name}`;
        const testMetrics = results.metrics[testName];
        
        if (!testMetrics) continue;
        
        const comparison = this.compareMetrics(
          controlMetrics,
          testMetrics,
          experiment.comparison.dimensions
        );
        
        analysis.comparisons[testGroup.name] = comparison;
        
        // Generate insights
        const insights = this.generateInsights(
          testGroup.name,
          comparison,
          experiment.success_criteria
        );
        
        analysis.insights.push(...insights);
      }
      
      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis);
      
      // Save analysis
      await this.saveAnalysis(experiment, analysis);
      
      spinner.succeed('Analysis complete');
      
      return analysis;
      
    } catch (error) {
      spinner.fail('Analysis failed');
      throw error;
    }
  }

  /**
   * Compare metrics between control and test
   */
  compareMetrics(controlMetrics, testMetrics, dimensions) {
    const comparison = {};
    
    for (const dimension of dimensions) {
      if (dimension.calculation === 'percentage_change') {
        const controlValue = controlMetrics[dimension.primary_metric]?.avg || 0;
        const testValue = testMetrics[dimension.primary_metric]?.avg || 0;
        
        const change = controlValue > 0 
          ? ((testValue - controlValue) / controlValue) * 100
          : 0;
        
        comparison[dimension.name] = {
          control: controlValue,
          test: testValue,
          change_percentage: change,
          improved: dimension.name.includes('reduction') ? change < 0 : change > 0
        };
      } else if (dimension.calculation === 'absolute_difference') {
        const controlValue = controlMetrics[dimension.primary_metric]?.avg || 0;
        const testValue = testMetrics[dimension.primary_metric]?.avg || 0;
        
        comparison[dimension.name] = {
          control: controlValue,
          test: testValue,
          difference: testValue - controlValue,
          percentage_of_control: controlValue > 0 ? (testValue / controlValue) * 100 : 100
        };
      }
    }
    
    return comparison;
  }

  /**
   * Generate insights from comparison
   */
  generateInsights(testGroupName, comparison, criteria) {
    const insights = [];
    
    // Check cost reduction
    if (comparison.cost_reduction?.improved) {
      insights.push({
        type: 'success',
        message: `${testGroupName} achieved ${Math.abs(comparison.cost_reduction.change_percentage).toFixed(1)}% cost reduction`
      });
    }
    
    // Check data reduction
    if (comparison.data_reduction?.improved) {
      insights.push({
        type: 'success',
        message: `${testGroupName} reduced telemetry volume by ${Math.abs(comparison.data_reduction.change_percentage).toFixed(1)}%`
      });
    }
    
    // Check coverage
    if (comparison.coverage_maintained) {
      const coveragePercentage = comparison.coverage_maintained.percentage_of_control;
      if (coveragePercentage >= 95) {
        insights.push({
          type: 'success',
          message: `${testGroupName} maintained ${coveragePercentage.toFixed(1)}% process coverage`
        });
      } else {
        insights.push({
          type: 'warning',
          message: `${testGroupName} coverage dropped to ${coveragePercentage.toFixed(1)}% of control`
        });
      }
    }
    
    return insights;
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];
    
    // Find best performing configuration
    let bestConfig = null;
    let bestSavings = 0;
    
    for (const [configName, comparison] of Object.entries(analysis.comparisons)) {
      const savings = Math.abs(comparison.cost_reduction?.change_percentage || 0);
      const coverageMaintained = comparison.coverage_maintained?.percentage_of_control >= 95;
      
      if (savings > bestSavings && coverageMaintained) {
        bestConfig = configName;
        bestSavings = savings;
      }
    }
    
    if (bestConfig) {
      recommendations.push({
        priority: 'high',
        action: `Deploy ${bestConfig} configuration`,
        rationale: `Achieves ${bestSavings.toFixed(1)}% cost reduction while maintaining coverage`,
        impact: 'immediate'
      });
    }
    
    // Add specific recommendations based on patterns
    const hasHighReduction = Object.values(analysis.comparisons).some(
      comp => Math.abs(comp.data_reduction?.change_percentage || 0) > 50
    );
    
    if (hasHighReduction) {
      recommendations.push({
        priority: 'medium',
        action: 'Review process importance scoring',
        rationale: 'High data reduction suggests many processes may be over-monitored',
        impact: 'long-term'
      });
    }
    
    return recommendations;
  }

  /**
   * Save analysis results
   */
  async saveAnalysis(experiment, analysis) {
    const resultsDir = path.join('./experiment-results', experiment.id);
    
    // Save JSON report
    await fs.writeFile(
      path.join(resultsDir, 'analysis.json'),
      JSON.stringify(analysis, null, 2)
    );
    
    // Generate markdown report
    const markdownReport = this.generateMarkdownReport(experiment, analysis);
    await fs.writeFile(
      path.join(resultsDir, 'report.md'),
      markdownReport
    );
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(experiment, analysis) {
    let report = `# NRDOT Experiment Report\n\n`;
    report += `## Experiment: ${experiment.name}\n`;
    report += `**ID:** ${experiment.id}\n`;
    report += `**Date:** ${analysis.timestamp.toISOString()}\n\n`;
    
    report += `## Summary\n\n`;
    report += `${experiment.description}\n\n`;
    
    report += `## Results\n\n`;
    
    for (const [configName, comparison] of Object.entries(analysis.comparisons)) {
      report += `### ${configName}\n\n`;
      
      report += `| Metric | Control | Test | Change |\n`;
      report += `|--------|---------|------|--------|\n`;
      
      for (const [metric, data] of Object.entries(comparison)) {
        if (data.change_percentage !== undefined) {
          report += `| ${metric} | ${data.control.toFixed(2)} | ${data.test.toFixed(2)} | ${data.change_percentage.toFixed(1)}% |\n`;
        }
      }
      
      report += '\n';
    }
    
    report += `## Insights\n\n`;
    for (const insight of analysis.insights) {
      report += `- **${insight.type.toUpperCase()}**: ${insight.message}\n`;
    }
    
    report += `\n## Recommendations\n\n`;
    for (const rec of analysis.recommendations) {
      report += `### ${rec.action}\n`;
      report += `- **Priority:** ${rec.priority}\n`;
      report += `- **Rationale:** ${rec.rationale}\n`;
      report += `- **Impact:** ${rec.impact}\n\n`;
    }
    
    return report;
  }

  /**
   * Cleanup phase
   */
  async cleanupPhase(experiment) {
    const spinner = ora('Cleaning up experiment environment...').start();
    
    try {
      // Stop and remove containers
      for (const [name, container] of this.containers) {
        await execAsync(`docker stop ${container.id}`);
        await execAsync(`docker rm ${container.id}`);
      }
      
      this.containers.clear();
      
      spinner.succeed('Cleanup complete');
    } catch (error) {
      spinner.fail('Cleanup failed');
      logger.error('Cleanup error:', error);
    }
  }

  /**
   * Start workload generator
   */
  async startWorkloadGenerator(workloadConfig) {
    // This would launch the metrics generator with specific config
    logger.info('Starting workload generator');
    
    const command = `node scripts/metrics-generator-fixed.js --config ${JSON.stringify(workloadConfig)}`;
    this.workloadProcess = exec(command);
  }

  /**
   * Stop workload generator
   */
  async stopWorkloadGenerator() {
    if (this.workloadProcess) {
      this.workloadProcess.kill('SIGTERM');
      this.workloadProcess = null;
    }
  }

  /**
   * Wait with progress bar
   */
  async waitWithProgress(seconds, phase) {
    const startTime = Date.now();
    const endTime = startTime + (seconds * 1000);
    
    const progressBar = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;
      const remaining = Math.max(0, (endTime - now) / 1000);
      const progress = (elapsed / seconds) * 100;
      
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(
        `${phase}: [${'='.repeat(Math.floor(progress / 2))}${' '.repeat(50 - Math.floor(progress / 2))}] ${progress.toFixed(1)}% (${Math.floor(remaining)}s remaining)`
      );
    }, 1000);
    
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    
    clearInterval(progressBar);
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(`${phase}: Complete ✓`);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const orchestrator = new ExperimentOrchestrator();
  
  const experimentPath = process.argv[2];
  if (!experimentPath) {
    console.error('Usage: node experiment-orchestrator.js <experiment-config.yaml>');
    process.exit(1);
  }
  
  orchestrator.loadExperiment(experimentPath)
    .then(experiment => orchestrator.runExperiment(experiment.id))
    .then(({ analysis }) => {
      console.log(chalk.green('\n✅ Experiment completed successfully!\n'));
      console.log('Results saved to:', `./experiment-results/${analysis.experiment_id}/`);
    })
    .catch(error => {
      console.error(chalk.red('\n❌ Experiment failed:'), error.message);
      process.exit(1);
    });
}