const { Command } = require('commander');
const { EntityService } = require('../services/entity.service.js');
const { Config } = require('../core/config.js');
const { Output } = require('../utils/output.js');
const { validateEntityGuid } = require('../utils/validators.js');
const { logger } = require('../utils/logger.js');

class EntityCommand {
  getCommand() {
    const entity = new Command('entity')
      .description('Entity and relationship intelligence operations');

    entity
      .command('describe <entityGuid>')
      .description('Get details for any New Relic entity')
      .action(async (entityGuid, options) => {
        await this.describeEntity(entityGuid, options, entity.parent.opts());
      });

    entity
      .command('validate-tags <entityGuid>')
      .description('Check if entity has required tags')
      .requiredOption('--expected-tags <tags>', 'Expected tags as key:value pairs (comma-separated)')
      .action(async (entityGuid, options) => {
        await this.validateTags(entityGuid, options, entity.parent.opts());
      });

    entity
      .command('find-related <entityGuid>')
      .description('Find related entities')
      .option('--relationship-type <type>', 'Filter by relationship type (SERVES, DEPENDS_ON, etc.)')
      .action(async (entityGuid, options) => {
        await this.findRelated(entityGuid, options, entity.parent.opts());
      });

    entity
      .command('check-apm-infra-link')
      .description('Verify APM application is linked to infrastructure')
      .requiredOption('--apm-app-name <name>', 'APM application name')
      .requiredOption('--host-name <name>', 'Infrastructure host name')
      .action(async (options) => {
        await this.checkApmInfraLink(options, entity.parent.opts());
      });

    entity
      .command('search <query>')
      .description('Search for entities')
      .option('--limit <n>', 'Maximum results', parseInt, 100)
      .action(async (query, options) => {
        await this.searchEntities(query, options, entity.parent.opts());
      });

    return entity;
  }

  async describeEntity(entityGuid, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new EntityService(config);

    try {
      validateEntityGuid(entityGuid);
      
      output.startSpinner('Fetching entity details...');
      const entity = await service.describeEntity(entityGuid);
      output.stopSpinner(true);

      output.print(entity, {
        title: `Entity: ${entity.name}`
      });

      // Display relationships if any
      if (entity.relationships?.length > 0) {
        output.info('\nRelationships:');
        entity.relationships.forEach((rel, index) => {
          output.info(`\n${index + 1}. ${rel.type}`);
          if (rel.source?.entity?.guid === entityGuid) {
            output.info(`   → ${rel.target.entity.name} (${rel.target.entity.guid})`);
          } else {
            output.info(`   ← ${rel.source.entity.name} (${rel.source.entity.guid})`);
          }
        });
      }

      // Display tags
      if (entity.tags?.length > 0) {
        output.info('\nTags:');
        entity.tags.forEach(tag => {
          output.info(`  ${tag.key}: ${tag.values.join(', ')}`);
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to describe entity');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async validateTags(entityGuid, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new EntityService(config);

    try {
      validateEntityGuid(entityGuid);
      
      // Parse expected tags
      const expectedTags = {};
      options.expectedTags.split(',').forEach(tagPair => {
        const [key, value] = tagPair.trim().split(':');
        if (key && value) {
          expectedTags[key] = value;
        }
      });

      output.startSpinner('Validating entity tags...');
      const validation = await service.validateTags(entityGuid, expectedTags);
      output.stopSpinner(validation.valid);

      output.print(validation);

      if (!validation.valid) {
        if (validation.missing?.length > 0) {
          output.error('\nMissing tags:');
          validation.missing.forEach(tag => {
            output.error(`  • ${tag}`);
          });
        }

        if (validation.incorrect?.length > 0) {
          output.error('\nIncorrect tag values:');
          validation.incorrect.forEach(tag => {
            output.error(`  • ${tag.key}: expected "${tag.expected}", found "${tag.actual}"`);
          });
        }

        if (validation.suggestions?.length > 0) {
          output.info('\nTo add missing tags, use:');
          validation.suggestions.forEach(suggestion => {
            output.info(`  ${suggestion}`);
          });
        }

        process.exit(1);
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to validate tags');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async findRelated(entityGuid, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new EntityService(config);

    try {
      validateEntityGuid(entityGuid);
      
      output.startSpinner('Finding related entities...');
      const relationships = await service.findRelated(entityGuid, options.relationshipType);
      output.stopSpinner(true, `Found ${relationships.length} relationships`);

      if (relationships.length === 0) {
        output.info('No related entities found');
      } else {
        output.print(relationships, {
          title: 'Related Entities',
          table: true,
          columns: ['type', 'direction', 'entityName', 'entityType', 'entityGuid']
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to find related entities');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async checkApmInfraLink(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new EntityService(config);

    try {
      output.startSpinner('Checking APM-Infrastructure link...');
      const linkStatus = await service.checkApmInfraLink(
        options.apmAppName,
        options.hostName
      );
      output.stopSpinner(linkStatus.linked);

      output.print(linkStatus);

      if (!linkStatus.linked) {
        output.error('APM application is not linked to infrastructure host');
        
        if (linkStatus.suggestions?.length > 0) {
          output.info('\nTroubleshooting suggestions:');
          linkStatus.suggestions.forEach((suggestion, index) => {
            output.info(`\n${index + 1}. ${suggestion.issue}`);
            output.info(`   Solution: ${suggestion.solution}`);
          });
        }
        
        process.exit(1);
      } else {
        output.success('APM application is properly linked to infrastructure!');
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to check link');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async searchEntities(query, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new EntityService(config);

    try {
      output.startSpinner(`Searching for entities: "${query}"...`);
      const entities = await service.searchEntities(query, options.limit || 100);
      output.stopSpinner(true, `Found ${entities.length} entities`);

      if (entities.length === 0) {
        output.info('No entities found matching your query');
      } else {
        output.print(entities, {
          title: 'Search Results',
          table: true,
          columns: ['name', 'type', 'domain', 'guid']
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to search entities');
      output.error(error.message, error);
      process.exit(1);
    }
  }
}

module.exports = {
  EntityCommand
};