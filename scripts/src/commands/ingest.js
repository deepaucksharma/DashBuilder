const { Command } = require('commander');
const fs = require('fs/promises');
const { IngestService } = require('../services/ingest.service.js');
const { Config } = require('../core/config.js');
const { Output } = require('../utils/output.js');
const { validateEventType, validateAttributeName } = require('../utils/validators.js');
const { logger } = require('../utils/logger.js');

class IngestCommand {
  getCommand() {
    const ingest = new Command('ingest')
      .description('Data ingest and cost intelligence operations');

    ingest
      .command('get-data-volume')
      .description('Get data volume for event types')
      .option('--event-type <type>', 'Specific event type (or all)')
      .option('--since <duration>', 'Time range', '24 hours ago')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (options) => {
        await this.getDataVolume(options, ingest.parent.opts());
      });

    ingest
      .command('get-cardinality')
      .description('Get unique count for an attribute')
      .requiredOption('--event-type <type>', 'Event type')
      .requiredOption('--attribute <name>', 'Attribute name')
      .option('--since <duration>', 'Time range', '24 hours ago')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (options) => {
        await this.getCardinality(options, ingest.parent.opts());
      });

    ingest
      .command('estimate-query-cost <query>')
      .description('Estimate query cost/complexity')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (query, options) => {
        await this.estimateQueryCost(query, options, ingest.parent.opts());
      });

    ingest
      .command('list-high-cardinality-attributes')
      .description('Find attributes with high cardinality')
      .option('--event-type <type>', 'Filter by event type')
      .option('--threshold <n>', 'Cardinality threshold', parseInt, 1000)
      .option('--since <duration>', 'Time range', '24 hours ago')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (options) => {
        await this.listHighCardinalityAttributes(options, ingest.parent.opts());
      });

    ingest
      .command('check-otel-export')
      .description('Test OpenTelemetry export to New Relic')
      .requiredOption('--otel-endpoint <url>', 'OTLP endpoint URL')
      .requiredOption('--nr-license-key <key>', 'New Relic license key')
      .requiredOption('--payload-file <file>', 'Sample OTLP payload file')
      .option('--timeout <ms>', 'Check timeout in ms', parseInt, 30000)
      .option('--account-id <id>', 'Override default account ID')
      .action(async (options) => {
        await this.checkOtelExport(options, ingest.parent.opts());
      });

    return ingest;
  }

  async getDataVolume(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new IngestService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Calculating data volume...');
      const volumes = await service.getDataVolume({
        eventType: options.eventType,
        since: options.since || '24 hours ago'
      });
      
      output.stopSpinner(true);

      // Calculate totals
      const totalEvents = volumes.reduce((sum, v) => sum + v.eventCount, 0);
      const totalBytes = volumes.reduce((sum, v) => sum + v.estimatedBytes, 0);

      output.print(volumes, {
        title: 'Data Volume Analysis',
        table: true,
        columns: ['eventType', 'eventCount', 'estimatedSize', 'percentOfTotal']
      });

      output.info(`\nTotal events: ${output.formatNumber(totalEvents)}`);
      output.info(`Total volume: ${output.formatBytes(totalBytes)}`);

      // Warnings for high volume
      const highVolumeTypes = volumes.filter(v => v.percentOfTotal > 25);
      if (highVolumeTypes.length > 0) {
        output.warning('\nHigh volume event types:');
        highVolumeTypes.forEach(type => {
          output.warning(`  • ${type.eventType}: ${type.percentOfTotal}% of total volume`);
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to get data volume');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async getCardinality(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new IngestService(config);

    try {
      config.requireAccountId();
      validateEventType(options.eventType);
      validateAttributeName(options.attribute);
      
      output.startSpinner('Calculating cardinality...');
      const cardinality = await service.getCardinality(
        options.eventType,
        options.attribute,
        options.since || '24 hours ago'
      );
      
      output.stopSpinner(true);

      output.print(cardinality);

      // Warnings and suggestions
      if (cardinality.uniqueCount > 10000) {
        output.warning('\nHigh cardinality detected!');
        output.warning('This attribute may not be suitable for:');
        output.warning('  • FACET operations (performance impact)');
        output.warning('  • Alert conditions (may cause excessive notifications)');
        
        if (cardinality.suggestions?.length > 0) {
          output.info('\nSuggestions:');
          cardinality.suggestions.forEach(suggestion => {
            output.info(`  • ${suggestion}`);
          });
        }
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to get cardinality');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async estimateQueryCost(query, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new IngestService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Estimating query cost...');
      const estimate = await service.estimateQueryCost(query);
      
      output.stopSpinner(true);

      output.print(estimate, {
        title: 'Query Cost Estimate'
      });

      // Display cost factors
      if (estimate.costFactors?.length > 0) {
        output.info('\nCost Factors:');
        estimate.costFactors.forEach(factor => {
          const icon = factor.impact === 'high' ? '⚠️ ' : 
                      factor.impact === 'medium' ? '⚡' : 
                      '✓';
          output.info(`  ${icon} ${factor.factor}: ${factor.description}`);
        });
      }

      // Optimization suggestions
      if (estimate.optimizations?.length > 0) {
        output.info('\nOptimization Suggestions:');
        estimate.optimizations.forEach((opt, index) => {
          output.info(`\n${index + 1}. ${opt.suggestion}`);
          if (opt.example) {
            output.info(`   Example: ${opt.example}`);
          }
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to estimate cost');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async listHighCardinalityAttributes(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new IngestService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Finding high cardinality attributes...');
      const attributes = await service.listHighCardinalityAttributes({
        eventType: options.eventType,
        threshold: options.threshold || 1000,
        since: options.since || '24 hours ago'
      });
      
      output.stopSpinner(true, `Found ${attributes.length} high cardinality attributes`);

      if (attributes.length === 0) {
        output.success('No high cardinality attributes found!');
      } else {
        output.print(attributes, {
          title: 'High Cardinality Attributes',
          table: true,
          columns: ['eventType', 'attribute', 'cardinality', 'impact', 'suggestion']
        });

        output.warning('\nConsider:');
        output.warning('  • Avoiding these attributes in FACET clauses');
        output.warning('  • Using sampling or aggregation strategies');
        output.warning('  • Implementing attribute value bucketing or hashing');
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to find high cardinality attributes');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async checkOtelExport(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new IngestService(config);

    try {
      config.requireAccountId();
      
      // Read payload file
      const payloadContent = await fs.readFile(options.payloadFile, 'utf-8');
      const payload = JSON.parse(payloadContent);
      
      output.startSpinner('Sending OTLP payload...');
      const exportResult = await service.checkOtelExport({
        endpoint: options.otelEndpoint,
        licenseKey: options.nrLicenseKey,
        payload,
        timeout: options.timeout || 30000
      });
      
      output.stopSpinner(exportResult.success);

      output.print(exportResult);

      if (exportResult.success) {
        output.success('OTLP export successful!');
        
        if (exportResult.dataFound) {
          output.success('Data successfully appeared in New Relic');
          output.info(`  Event Type: ${exportResult.eventType}`);
          output.info(`  Record Count: ${exportResult.recordCount}`);
          output.info(`  Latency: ${exportResult.latencyMs}ms`);
        } else {
          output.warning('Data sent but not yet visible in New Relic');
          output.info('This could be due to processing delay. Try checking again in a few minutes.');
        }
      } else {
        output.error('OTLP export failed');
        
        if (exportResult.troubleshooting?.length > 0) {
          output.info('\nTroubleshooting steps:');
          exportResult.troubleshooting.forEach((step, index) => {
            output.info(`\n${index + 1}. ${step.check}`);
            output.info(`   ${step.solution}`);
          });
        }
        
        process.exit(1);
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to check OTLP export');
      output.error(error.message, error);
      process.exit(1);
    }
  }
}

module.exports = {
  IngestCommand
};