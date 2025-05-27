import { NerdGraphClient } from '../core/api-client.js';
import { Cache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

export class EntityService {
  constructor(config) {
    this.config = config;
    this.client = new NerdGraphClient(config);
    this.cache = new Cache({ 
      enabled: config.enableCache, 
      ttl: config.cacheTTL 
    });
  }

  async describeEntity(guid) {
    const cacheKey = this.cache.generateKey('entity', guid);
    
    return await this.cache.get(cacheKey, async () => {
      const entity = await this.client.getEntity(guid);
      
      if (!entity) {
        throw new ValidationError(`Entity with GUID ${guid} not found`);
      }

      return entity;
    });
  }

  async validateTags(entityGuid, expectedTags) {
    const entity = await this.describeEntity(entityGuid);
    const validation = {
      valid: true,
      entityName: entity.name,
      entityType: entity.type,
      missing: [],
      incorrect: [],
      suggestions: []
    };

    // Convert entity tags to a map for easier lookup
    const entityTagMap = {};
    if (entity.tags) {
      entity.tags.forEach(tag => {
        entityTagMap[tag.key] = tag.values;
      });
    }

    // Check each expected tag
    for (const [key, expectedValue] of Object.entries(expectedTags)) {
      if (!entityTagMap[key]) {
        validation.valid = false;
        validation.missing.push(key);
        
        // Generate NerdGraph mutation suggestion
        validation.suggestions.push(
          `mutation { taggingAddTagsToEntity(guid: "${entityGuid}", tags: [{key: "${key}", values: ["${expectedValue}"]}]) { errors { message } } }`
        );
      } else if (!entityTagMap[key].includes(expectedValue)) {
        validation.valid = false;
        validation.incorrect.push({
          key,
          expected: expectedValue,
          actual: entityTagMap[key].join(', ')
        });
        
        // Suggest adding the correct value
        validation.suggestions.push(
          `mutation { taggingAddTagsToEntity(guid: "${entityGuid}", tags: [{key: "${key}", values: ["${expectedValue}"]}]) { errors { message } } }`
        );
      }
    }

    return validation;
  }

  async findRelated(entityGuid, relationshipType = null) {
    const entity = await this.describeEntity(entityGuid);
    const relationships = [];

    if (!entity.relationships || entity.relationships.length === 0) {
      return relationships;
    }

    for (const rel of entity.relationships) {
      // Filter by relationship type if specified
      if (relationshipType && rel.type !== relationshipType) {
        continue;
      }

      // Determine direction
      const isSource = rel.source.entity.guid === entityGuid;
      const relatedEntity = isSource ? rel.target.entity : rel.source.entity;
      
      relationships.push({
        type: rel.type,
        direction: isSource ? 'outgoing' : 'incoming',
        entityName: relatedEntity.name,
        entityGuid: relatedEntity.guid,
        entityType: relatedEntity.type || 'Unknown'
      });
    }

    return relationships;
  }

  async checkApmInfraLink(apmAppName, hostName) {
    const linkStatus = {
      linked: false,
      apmEntity: null,
      infraEntity: null,
      relationship: null,
      suggestions: []
    };

    try {
      // Find APM application
      const apmQuery = `name = '${apmAppName}' AND type = 'APPLICATION'`;
      const apmEntities = await this.client.searchEntities(apmQuery, 10);
      
      if (apmEntities.length === 0) {
        linkStatus.error = `APM application '${apmAppName}' not found`;
        linkStatus.suggestions.push({
          issue: 'APM application not found',
          solution: 'Verify the application name and ensure the APM agent is reporting data'
        });
        return linkStatus;
      }

      linkStatus.apmEntity = apmEntities[0];

      // Find infrastructure host
      const infraQuery = `name = '${hostName}' AND (type = 'HOST' OR type = 'INFRA_HOST')`;
      const infraEntities = await this.client.searchEntities(infraQuery, 10);
      
      if (infraEntities.length === 0) {
        linkStatus.error = `Infrastructure host '${hostName}' not found`;
        linkStatus.suggestions.push({
          issue: 'Infrastructure host not found',
          solution: 'Verify the host name and ensure the infrastructure agent is installed and reporting'
        });
        return linkStatus;
      }

      linkStatus.infraEntity = infraEntities[0];

      // Check for relationship between APM and Infra
      const apmRelationships = await this.findRelated(linkStatus.apmEntity.guid);
      
      for (const rel of apmRelationships) {
        if (rel.entityGuid === linkStatus.infraEntity.guid && 
            (rel.type === 'RUNS_ON' || rel.type === 'HOSTED_ON')) {
          linkStatus.linked = true;
          linkStatus.relationship = rel;
          break;
        }
      }

      // If not linked, provide troubleshooting suggestions
      if (!linkStatus.linked) {
        linkStatus.suggestions.push({
          issue: 'APM and Infrastructure entities exist but are not linked',
          solution: 'Ensure both agents are running on the same host with matching host names'
        });

        // Check for hostname mismatches in tags
        const apmHostTag = linkStatus.apmEntity.tags?.find(t => t.key === 'host.name');
        const infraHostTag = linkStatus.infraEntity.tags?.find(t => t.key === 'hostname');
        
        if (apmHostTag && infraHostTag && apmHostTag.values[0] !== infraHostTag.values[0]) {
          linkStatus.suggestions.push({
            issue: 'Hostname mismatch detected',
            solution: `APM reports host as '${apmHostTag.values[0]}' while Infrastructure reports '${infraHostTag.values[0]}'. Ensure hostnames match.`
          });
        }

        // Check agent versions
        linkStatus.suggestions.push({
          issue: 'Agents might be outdated',
          solution: 'Update both APM and Infrastructure agents to the latest versions'
        });

        // Check display_name configuration
        linkStatus.suggestions.push({
          issue: 'Display name configuration',
          solution: 'Ensure display_name in infrastructure agent config matches the host where APM agent runs'
        });
      }

    } catch (error) {
      linkStatus.error = error.message;
      linkStatus.suggestions.push({
        issue: 'Error checking link status',
        solution: 'Verify API permissions and entity GUIDs'
      });
    }

    return linkStatus;
  }

  async searchEntities(query, limit = 100) {
    const cacheKey = this.cache.generateKey('entity-search', query, limit);
    
    return await this.cache.get(cacheKey, async () => {
      const entities = await this.client.searchEntities(query, limit);
      
      return entities.map(entity => ({
        name: entity.name,
        type: entity.type,
        domain: entity.domain,
        guid: entity.guid,
        tags: entity.tags?.map(t => `${t.key}:${t.values.join(',')}`).join('; ')
      }));
    });
  }
}