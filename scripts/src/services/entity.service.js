import { NerdGraphClient } from '../core/api-client.js';
import { SchemaService } from './schema.service.js';
import { Cache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

export class EntityService {
  constructor(config) {
    this.config = config;
    this.client = new NerdGraphClient(config);
    this.schemaService = new SchemaService(config);
    this.cache = new Cache({ 
      enabled: config.enableCache, 
      ttl: config.cacheTTL 
    });
    
    // NRDOT v2: Process entity relationship patterns
    this.processEntityPatterns = this.loadProcessEntityPatterns();
    
    // NRDOT v2: Entity health scoring criteria
    this.healthCriteria = {
      dataFreshness: {
        critical: 300,  // 5 minutes
        warning: 900    // 15 minutes
      },
      attributeCompleteness: {
        required: ['name', 'entityType'],
        recommended: ['hostname', 'environment', 'team']
      }
    };
  }

  // NRDOT v2: Process-entity relationship patterns
  loadProcessEntityPatterns() {
    return {
      application: {
        relations: ['RUNS_ON', 'HOSTED_ON', 'CONNECTS_TO'],
        requiredTags: ['environment', 'service', 'version'],
        processTypes: ['java', 'node', 'python', 'ruby', 'php', 'dotnet']
      },
      host: {
        relations: ['HOSTS', 'CONTAINS'],
        requiredTags: ['hostname', 'environment', 'role'],
        processTypes: ['system', 'kernel', 'daemon']
      },
      container: {
        relations: ['CONTAINS', 'RUNS_IN'],
        requiredTags: ['container.name', 'image.name'],
        processTypes: ['containerized']
      },
      service: {
        relations: ['SERVES', 'CALLS', 'DEPENDS_ON'],
        requiredTags: ['service.name', 'service.version', 'environment'],
        processTypes: ['service', 'microservice']
      }
    };
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

  // NRDOT v2: Analyze process-entity relationships
  async analyzeProcessRelationships(entityGuid) {
    const entity = await this.describeEntity(entityGuid);
    const accountId = this.config.requireAccountId();
    
    const analysis = {
      entityName: entity.name,
      entityType: entity.type,
      processCorrelation: {
        directMatches: [],
        inferredMatches: [],
        missingProcesses: []
      },
      healthScore: 0,
      recommendations: []
    };

    try {
      // Get process intelligence
      const processIntelligence = await this.schemaService.getProcessIntelligence(
        accountId,
        'ProcessSample',
        '1 hour ago'
      );

      // Find processes related to this entity
      if (entity.type === 'APPLICATION') {
        await this.analyzeApplicationProcesses(entity, processIntelligence, analysis);
      } else if (entity.type === 'HOST' || entity.type === 'INFRA_HOST') {
        await this.analyzeHostProcesses(entity, processIntelligence, analysis);
      } else if (entity.type === 'CONTAINER') {
        await this.analyzeContainerProcesses(entity, processIntelligence, analysis);
      }

      // Calculate health score
      analysis.healthScore = this.calculateEntityHealthScore(entity, analysis);

      // Generate recommendations
      analysis.recommendations = this.generateProcessEntityRecommendations(entity, analysis);

    } catch (error) {
      analysis.error = `Failed to analyze process relationships: ${error.message}`;
      logger.debug(`Process relationship analysis failed: ${error.message}`);
    }

    return analysis;
  }

  // NRDOT v2: Analyze application processes
  async analyzeApplicationProcesses(entity, processIntelligence, analysis) {
    const hostname = this.extractHostname(entity);
    const appName = entity.name;

    // Look for processes matching the application
    for (const process of processIntelligence.criticalProcesses) {
      // Direct name match
      if (process.processDisplayName && 
          (process.processDisplayName.includes(appName) || 
           appName.toLowerCase().includes(process.processDisplayName.toLowerCase()))) {
        analysis.processCorrelation.directMatches.push({
          processName: process.processDisplayName,
          hostname: process.hostname,
          confidence: 'high',
          reason: 'Application name matches process name'
        });
      }
      
      // Hostname match
      else if (hostname && process.hostname === hostname) {
        analysis.processCorrelation.inferredMatches.push({
          processName: process.processDisplayName,
          hostname: process.hostname,
          confidence: 'medium',
          reason: 'Same hostname as application entity'
        });
      }
    }

    // Check for expected application processes
    const expectedPatterns = this.processEntityPatterns.application.processTypes;
    for (const pattern of expectedPatterns) {
      const found = analysis.processCorrelation.directMatches.some(p => 
        p.processName.toLowerCase().includes(pattern)
      );
      
      if (!found) {
        analysis.processCorrelation.missingProcesses.push({
          type: pattern,
          reason: `Expected ${pattern} process for application entity`
        });
      }
    }
  }

  // NRDOT v2: Analyze host processes
  async analyzeHostProcesses(entity, processIntelligence, analysis) {
    const hostname = entity.name;

    // Find all processes on this host
    const hostProcesses = processIntelligence.criticalProcesses.filter(p => 
      p.hostname === hostname
    );

    analysis.processCorrelation.directMatches = hostProcesses.map(p => ({
      processName: p.processDisplayName,
      hostname: p.hostname,
      confidence: 'high',
      reason: 'Process runs on this host'
    }));

    // Check for system processes
    const systemProcesses = ['systemd', 'kernel', 'init', 'ssh', 'cron'];
    for (const sysProc of systemProcesses) {
      const found = hostProcesses.some(p => 
        p.processDisplayName.toLowerCase().includes(sysProc)
      );
      
      if (!found) {
        analysis.processCorrelation.missingProcesses.push({
          type: sysProc,
          reason: `Expected system process ${sysProc} on host`
        });
      }
    }
  }

  // NRDOT v2: Analyze container processes
  async analyzeContainerProcesses(entity, processIntelligence, analysis) {
    const containerName = entity.name;
    const containerId = this.extractTag(entity, 'container.id') || 
                       this.extractTag(entity, 'containerId');

    // Look for processes in container context
    for (const process of processIntelligence.criticalProcesses) {
      // Direct container ID match
      if (containerId && process.containerId === containerId) {
        analysis.processCorrelation.directMatches.push({
          processName: process.processDisplayName,
          containerId: process.containerId,
          confidence: 'high',
          reason: 'Process runs in this container (ID match)'
        });
      }
      // Container name match
      else if (process.containerName && process.containerName === containerName) {
        analysis.processCorrelation.directMatches.push({
          processName: process.processDisplayName,
          containerName: process.containerName,
          confidence: 'high',
          reason: 'Process runs in this container (name match)'
        });
      }
      // Hostname match for containerized processes
      else if (process.hostname && process.hostname === this.extractHostname(entity)) {
        analysis.processCorrelation.inferredMatches.push({
          processName: process.processDisplayName,
          hostname: process.hostname,
          confidence: 'medium',
          reason: 'Process runs on same host as container'
        });
      }
    }
  }

  // NRDOT v2: Calculate entity health score
  calculateEntityHealthScore(entity, analysis) {
    let score = 100;

    // Deduct for missing processes
    score -= analysis.processCorrelation.missingProcesses.length * 10;

    // Deduct for missing tags
    const patterns = this.processEntityPatterns[entity.type.toLowerCase()];
    if (patterns) {
      const missingTags = patterns.requiredTags.filter(tag => 
        !this.extractTag(entity, tag)
      );
      score -= missingTags.length * 15;
    }

    // Bonus for direct process matches
    score += Math.min(analysis.processCorrelation.directMatches.length * 5, 20);

    // Check data freshness (mock implementation)
    const lastReportTime = entity.reporting ? Date.now() - 60000 : Date.now() - 600000;
    const staleness = Date.now() - lastReportTime;
    
    if (staleness > this.healthCriteria.dataFreshness.critical * 1000) {
      score -= 30;
    } else if (staleness > this.healthCriteria.dataFreshness.warning * 1000) {
      score -= 15;
    }

    return Math.max(0, Math.min(100, score));
  }

  // NRDOT v2: Generate process-entity recommendations
  generateProcessEntityRecommendations(entity, analysis) {
    const recommendations = [];

    // Missing process recommendations
    if (analysis.processCorrelation.missingProcesses.length > 0) {
      recommendations.push({
        category: 'Process Coverage',
        priority: 'high',
        issue: `${analysis.processCorrelation.missingProcesses.length} expected processes not found`,
        action: 'Install infrastructure agent or check process filters',
        details: analysis.processCorrelation.missingProcesses.map(p => p.type).join(', ')
      });
    }

    // Tag completeness recommendations
    const patterns = this.processEntityPatterns[entity.type.toLowerCase()];
    if (patterns) {
      const missingTags = patterns.requiredTags.filter(tag => 
        !this.extractTag(entity, tag)
      );
      
      if (missingTags.length > 0) {
        recommendations.push({
          category: 'Tag Completeness',
          priority: 'medium',
          issue: `Missing required tags: ${missingTags.join(', ')}`,
          action: 'Add missing tags to improve entity classification',
          details: `Use tagging API or agent configuration to add: ${missingTags.join(', ')}`
        });
      }
    }

    // Relationship recommendations
    if (analysis.processCorrelation.directMatches.length === 0 && 
        analysis.processCorrelation.inferredMatches.length === 0) {
      recommendations.push({
        category: 'Process Visibility',
        priority: 'high',
        issue: 'No processes found related to this entity',
        action: 'Check infrastructure agent installation and configuration',
        details: 'Entity exists but no processes are reporting. Verify agent deployment.'
      });
    }

    // Health score recommendations
    if (analysis.healthScore < 70) {
      recommendations.push({
        category: 'Entity Health',
        priority: 'high',
        issue: `Low entity health score: ${analysis.healthScore}/100`,
        action: 'Address missing processes, tags, and data freshness issues',
        details: 'Improve entity health by resolving the issues identified above'
      });
    }

    return recommendations;
  }

  // NRDOT v2: Track process-entity coverage
  async getProcessEntityCoverage(entityType = null) {
    const accountId = this.config.requireAccountId();
    
    // Get all entities of specified type (or all types)
    let entityQuery = 'domain = "INFRA" OR domain = "APM" OR domain = "BROWSER"';
    if (entityType) {
      entityQuery += ` AND type = "${entityType}"`;
    }
    
    const entities = await this.client.searchEntities(entityQuery, 1000);
    
    const coverage = {
      totalEntities: entities.length,
      entitiesWithProcesses: 0,
      entitiesWithoutProcesses: 0,
      coveragePercentage: 0,
      entityBreakdown: {},
      recommendations: []
    };

    // Analyze each entity
    for (const entity of entities) {
      const analysis = await this.analyzeProcessRelationships(entity.guid);
      const hasProcesses = analysis.processCorrelation.directMatches.length > 0 ||
                          analysis.processCorrelation.inferredMatches.length > 0;
      
      if (hasProcesses) {
        coverage.entitiesWithProcesses++;
      } else {
        coverage.entitiesWithoutProcesses++;
      }
      
      // Track by entity type
      if (!coverage.entityBreakdown[entity.type]) {
        coverage.entityBreakdown[entity.type] = {
          total: 0,
          withProcesses: 0
        };
      }
      
      coverage.entityBreakdown[entity.type].total++;
      if (hasProcesses) {
        coverage.entityBreakdown[entity.type].withProcesses++;
      }
    }

    coverage.coveragePercentage = entities.length > 0 ? 
      (coverage.entitiesWithProcesses / entities.length) * 100 : 0;

    // Generate coverage recommendations
    if (coverage.coveragePercentage < 95) {
      coverage.recommendations.push({
        issue: `Process coverage below 95% (currently ${coverage.coveragePercentage.toFixed(1)}%)`,
        action: 'Deploy infrastructure agents to entities without process visibility',
        priority: 'high'
      });
    }

    return coverage;
  }

  // Helper methods
  extractHostname(entity) {
    return this.extractTag(entity, 'hostname') || 
           this.extractTag(entity, 'host.name') || 
           this.extractTag(entity, 'host') ||
           entity.name;
  }

  extractTag(entity, tagKey) {
    if (!entity.tags) return null;
    const tag = entity.tags.find(t => t.key === tagKey);
    return tag ? tag.values[0] : null;
  }
}