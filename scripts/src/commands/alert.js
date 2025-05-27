import { Command } from 'commander';
import { AlertService } from '../services/alert.service.js';
import { Config } from '../core/config.js';
import { Output } from '../utils/output.js';
import { logger } from '../utils/logger.js';

export class AlertCommand {
  getCommand() {
    const alert = new Command('alert')
      .description('Alert policy and condition validation');

    alert
      .command('list-policies')
      .description('List all alert policies')
      .option('--account-id <id>', 'Override default account ID')
      .option('--name-pattern <pattern>', 'Filter by name pattern')
      .action(async (options) => {
        await this.listPolicies(options, alert.parent.opts());
      });

    alert
      .command('describe-policy <policyIdOrName>')
      .description('Show policy details and conditions')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (policyIdOrName, options) => {
        await this.describePolicy(policyIdOrName, options, alert.parent.opts());
      });

    alert
      .command('validate-condition <policyIdOrName> <conditionIdOrName>')
      .description('Validate alert condition NRQL query')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (policyIdOrName, conditionIdOrName, options) => {
        await this.validateCondition(policyIdOrName, conditionIdOrName, options, alert.parent.opts());
      });

    alert
      .command('check-threshold-viability <policyIdOrName> <conditionIdOrName>')
      .description('Check if threshold would trigger appropriately based on historical data')
      .option('--account-id <id>', 'Override default account ID')
      .option('--lookback <duration>', 'Historical duration to check', '7 days ago')
      .action(async (policyIdOrName, conditionIdOrName, options) => {
        await this.checkThresholdViability(policyIdOrName, conditionIdOrName, options, alert.parent.opts());
      });

    alert
      .command('find-unstable-alerts')
      .description('Find alerts that are flapping frequently')
      .option('--account-id <id>', 'Override default account ID')
      .option('--lookback <duration>', 'Duration to analyze', '24 hours ago')
      .option('--flap-threshold <n>', 'Min state changes to consider unstable', parseInt, 5)
      .action(async (options) => {
        await this.findUnstableAlerts(options, alert.parent.opts());
      });

    return alert;
  }

  async listPolicies(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new AlertService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Fetching alert policies...');
      const policies = await service.listPolicies(options.namePattern);
      output.stopSpinner(true, `Found ${policies.length} policies`);

      output.print(policies, {
        title: 'Alert Policies',
        table: true,
        columns: ['name', 'id', 'incidentPreference', 'conditionCount']
      });
    } catch (error) {
      output.stopSpinner(false, 'Failed to list policies');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async describePolicy(policyIdOrName, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new AlertService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Fetching policy details...');
      const policy = await service.describePolicy(policyIdOrName);
      output.stopSpinner(true);

      output.print(policy, {
        title: `Policy: ${policy.name}`
      });

      if (policy.conditions?.length > 0) {
        output.info('\nConditions:');
        policy.conditions.forEach((condition, index) => {
          output.info(`\n${index + 1}. ${condition.name}`);
          output.info(`   Enabled: ${condition.enabled}`);
          output.info(`   Query: ${condition.nrql.query}`);
          condition.terms.forEach(term => {
            output.info(`   Threshold: ${term.operator} ${term.threshold} (${term.priority})`);
          });
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to describe policy');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async validateCondition(policyIdOrName, conditionIdOrName, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new AlertService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Validating alert condition...');
      const validation = await service.validateCondition(policyIdOrName, conditionIdOrName);
      output.stopSpinner(validation.valid);

      output.print(validation);

      if (!validation.valid && validation.suggestions?.length > 0) {
        output.info('\nSuggestions:');
        validation.suggestions.forEach(suggestion => {
          output.info(`  • ${suggestion}`);
        });
        process.exit(1);
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to validate condition');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async checkThresholdViability(policyIdOrName, conditionIdOrName, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new AlertService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Analyzing threshold viability...');
      const analysis = await service.checkThresholdViability(
        policyIdOrName,
        conditionIdOrName,
        options.lookback || '7 days ago'
      );
      output.stopSpinner(true);

      output.print(analysis, {
        title: 'Threshold Analysis'
      });

      // Print recommendations
      if (analysis.recommendations?.length > 0) {
        output.warning('\nRecommendations:');
        analysis.recommendations.forEach((rec, index) => {
          output.warning(`\n${index + 1}. ${rec.issue}`);
          output.info(`   Current: ${rec.current}`);
          output.info(`   Suggested: ${rec.suggested}`);
          output.info(`   Reason: ${rec.reason}`);
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to check threshold');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async findUnstableAlerts(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new AlertService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Finding unstable alerts...');
      const unstableAlerts = await service.findUnstableAlerts({
        lookback: options.lookback || '24 hours ago',
        flapThreshold: options.flapThreshold || 5
      });
      
      output.stopSpinner(true, `Found ${unstableAlerts.length} unstable alerts`);

      if (unstableAlerts.length === 0) {
        output.success('No unstable alerts found!');
      } else {
        output.print(unstableAlerts, {
          title: 'Unstable Alerts',
          table: true,
          columns: ['policy', 'condition', 'stateChanges', 'lastChange', 'recommendation']
        });

        output.warning('\nConsider adjusting thresholds or evaluation windows for these alerts');
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to find unstable alerts');
      output.error(error.message, error);
      process.exit(1);
    }
  }
}