const { Command } = require('commander');
const { SchemaService } = require('../services/schema.service.js');
const { Config } = require('../core/config.js');
const { Output } = require('../utils/output.js');
const { validateEventType, validateAttributeName, validateTimeRange } = require('../utils/validators.js');
const { logger } = require('../utils/logger.js');

class SchemaCommand {
  getCommand() {
    const schema = new Command('schema')
      .description('Schema intelligence and discovery operations')
      .option('--since <duration>', 'Time range for schema discovery', '1 day ago');

    schema
      .command('discover-event-types')
      .description('List all event types in the account')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (options) => {
        await this.discoverEventTypes(options, schema.parent.opts());
      });

    schema
      .command('describe-event-type <eventType>')
      .description('Show attributes and metadata for an event type')
      .option('--show-data-types', 'Include data type information')
      .option('--show-cardinality', 'Show estimated unique value counts')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (eventType, options) => {
        await this.describeEventType(eventType, options, schema.parent.opts());
      });

    schema
      .command('compare-schemas')
      .description('Compare schemas between accounts')
      .requiredOption('--event-type <type>', 'Event type to compare')
      .requiredOption('--account-id-a <id>', 'First account ID')
      .requiredOption('--account-id-b <id>', 'Second account ID')
      .action(async (options) => {
        await this.compareSchemas(options, schema.parent.opts());
      });

    schema
      .command('validate-attributes')
      .description('Check if event type contains expected attributes')
      .requiredOption('--event-type <type>', 'Event type to validate')
      .requiredOption('--expected-attributes <attrs>', 'Comma-separated list of expected attributes')
      .option('--allow-extra', 'Allow additional attributes beyond expected')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (options) => {
        await this.validateAttributes(options, schema.parent.opts());
      });

    schema
      .command('find-attribute <attributeName>')
      .description('Search for an attribute across event types')
      .option('--event-type-pattern <pattern>', 'Filter event types by pattern')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (attributeName, options) => {
        await this.findAttribute(attributeName, options, schema.parent.opts());
      });

    schema
      .command('get-attribute-type <eventType> <attributeName>')
      .description('Get data type of a specific attribute')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (eventType, attributeName, options) => {
        await this.getAttributeType(eventType, attributeName, options, schema.parent.opts());
      });

    return schema;
  }

  async discoverEventTypes(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new SchemaService(config);

    try {
      output.startSpinner('Discovering event types...');
      const eventTypes = await service.discoverEventTypes(options.since || '1 day ago');
      output.stopSpinner(true, `Found ${eventTypes.length} event types`);

      output.print(eventTypes, {
        title: 'Event Types',
        table: true,
        columns: ['name', 'lastSeen']
      });
    } catch (error) {
      output.stopSpinner(false, 'Failed to discover event types');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async describeEventType(eventType, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new SchemaService(config);

    try {
      validateEventType(eventType);
      
      output.startSpinner(`Analyzing ${eventType}...`);
      const description = await service.describeEventType(
        eventType,
        globalOptions.since || '1 day ago',
        {
          includeDataTypes: options.showDataTypes,
          includeCardinality: options.showCardinality
        }
      );
      output.stopSpinner(true);

      output.print(description, {
        title: `Event Type: ${eventType}`
      });

      // Print suggestions if high cardinality attributes found
      if (options.showCardinality && description.highCardinalityWarnings?.length > 0) {
        output.warning('High cardinality attributes detected:');
        description.highCardinalityWarnings.forEach(warning => {
          output.warning(`  ${warning.attribute}: ~${warning.cardinality} unique values`);
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to describe event type');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async compareSchemas(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new SchemaService(config);

    try {
      validateEventType(options.eventType);
      
      output.startSpinner('Comparing schemas...');
      const comparison = await service.compareSchemas(
        options.eventType,
        options.accountIdA,
        options.accountIdB,
        globalOptions.since || '1 day ago'
      );
      output.stopSpinner(true);

      output.print(comparison, {
        title: `Schema Comparison: ${options.eventType}`
      });

      // Print summary
      if (!config.outputFormat === 'json') {
        output.info(`Attributes only in account ${options.accountIdA}: ${comparison.onlyInA.length}`);
        output.info(`Attributes only in account ${options.accountIdB}: ${comparison.onlyInB.length}`);
        output.info(`Common attributes: ${comparison.common.length}`);
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to compare schemas');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async validateAttributes(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new SchemaService(config);

    try {
      validateEventType(options.eventType);
      const expectedAttributes = options.expectedAttributes.split(',').map(a => a.trim());
      
      output.startSpinner('Validating attributes...');
      const validation = await service.validateAttributes(
        options.eventType,
        expectedAttributes,
        {
          allowExtra: options.allowExtra,
          since: globalOptions.since || '1 day ago'
        }
      );
      output.stopSpinner(validation.valid);

      output.print(validation);

      if (!validation.valid) {
        if (validation.suggestions?.length > 0) {
          output.info('Suggestions:');
          validation.suggestions.forEach(suggestion => {
            output.info(`  ${suggestion}`);
          });
        }
        process.exit(1);
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to validate attributes');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async findAttribute(attributeName, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new SchemaService(config);

    try {
      validateAttributeName(attributeName);
      
      output.startSpinner(`Searching for attribute '${attributeName}'...`);
      const results = await service.findAttribute(
        attributeName,
        {
          eventTypePattern: options.eventTypePattern,
          since: globalOptions.since || '1 day ago'
        }
      );
      output.stopSpinner(true, `Found in ${results.length} event types`);

      output.print(results, {
        title: `Attribute '${attributeName}' found in:`,
        table: true,
        columns: ['eventType', 'dataType', 'sampleValue']
      });
    } catch (error) {
      output.stopSpinner(false, 'Failed to find attribute');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async getAttributeType(eventType, attributeName, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new SchemaService(config);

    try {
      validateEventType(eventType);
      validateAttributeName(attributeName);
      
      output.startSpinner('Checking attribute type...');
      const attributeInfo = await service.getAttributeType(
        eventType,
        attributeName,
        globalOptions.since || '1 day ago'
      );
      output.stopSpinner(true);

      output.print(attributeInfo);
    } catch (error) {
      output.stopSpinner(false, 'Failed to get attribute type');
      output.error(error.message, error);
      process.exit(1);
    }
  }
}

module.exports = {
  SchemaCommand
};