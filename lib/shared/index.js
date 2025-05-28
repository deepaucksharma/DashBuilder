/**
 * Shared library for CLI/Orchestrator integration
 * Provides direct access to CLI functionality without subprocess calls
 */

const { DashboardService } = require('../../scripts/src/services/dashboard.service.js');
const { NRQLService } = require('../../scripts/src/services/nrql.service.js');
const { EntityService } = require('../../scripts/src/services/entity.service.js');
const { IngestService } = require('../../scripts/src/services/ingest.service.js');
const { SchemaService } = require('../../scripts/src/services/schema.service.js');
const { LLMEnhancementService } = require('../../scripts/src/services/llm-enhancement.service.js');
const { NerdGraphClient } = require('../../scripts/src/core/api-client.js');
const { Config } = require('../../scripts/src/core/config.js');

// Create singleton instances lazily
let config;
let apiClient;

function getConfig() {
  if (!config) {
    config = new Config();
  }
  return config;
}

function getApiClient() {
  if (!apiClient) {
    apiClient = new NerdGraphClient(getConfig());
  }
  return apiClient;
}

// Export service instances lazily
const services = {
  get dashboard() {
    return new DashboardService(getApiClient());
  },
  get nrql() {
    return new NRQLService(getApiClient());
  },
  get entity() {
    return new EntityService(getApiClient());
  },
  get ingest() {
    return new IngestService(getApiClient());
  },
  get schema() {
    return new SchemaService(getApiClient());
  },
  get llm() {
    return new LLMEnhancementService(getApiClient());
  }
};

// Export common functions with consistent error handling
async function listDashboards(options = {}) {
  try {
    const { limit = 100, json = false } = options;
    const dashboards = await services.dashboard.listDashboards(limit);
    
    if (json) {
      return dashboards;
    }
    
    return {
      dashboards,
      count: dashboards.length,
      message: `Found ${dashboards.length} dashboards`
    };
  } catch (error) {
    throw new Error(`Failed to list dashboards: ${error.message}`);
  }
}

async function createDashboard(dashboardConfig) {
  try {
    const result = await services.dashboard.createDashboard(dashboardConfig);
    return {
      id: result.id,
      url: `https://one.newrelic.com/dashboards/${result.id}`,
      message: `Dashboard created with ID: ${result.id}`
    };
  } catch (error) {
    throw new Error(`Failed to create dashboard: ${error.message}`);
  }
}

async function validateDashboard(dashboardId) {
  try {
    const results = await services.dashboard.validateDashboard(dashboardId);
    return {
      valid: results.every(r => r.valid),
      results,
      message: results.every(r => r.valid) 
        ? 'Dashboard validation passed'
        : 'Dashboard validation failed'
    };
  } catch (error) {
    throw new Error(`Failed to validate dashboard: ${error.message}`);
  }
}

async function validateQuery(query) {
  try {
    const results = await services.nrql.validateQuery(query);
    return {
      valid: !results.error,
      results,
      message: results.error 
        ? `Query validation failed: ${results.error}`
        : 'Query validation passed'
    };
  } catch (error) {
    throw new Error(`Failed to validate query: ${error.message}`);
  }
}

async function testConnection() {
  try {
    const query = 'SELECT 1';
    const result = await services.nrql.runQuery(query);
    return {
      connected: !result.error,
      message: result.error 
        ? `Connection failed: ${result.error}`
        : 'Successfully connected to New Relic API'
    };
  } catch (error) {
    throw new Error(`Failed to test connection: ${error.message}`);
  }
}

async function searchEntities(query, type = null) {
  try {
    const entities = await services.entity.searchEntities(query, type);
    return {
      entities,
      count: entities.length,
      message: `Found ${entities.length} entities`
    };
  } catch (error) {
    throw new Error(`Failed to search entities: ${error.message}`);
  }
}

async function analyzeIngestion(options = {}) {
  try {
    const { eventType = null, timeWindow = '1 day ago' } = options;
    
    if (eventType) {
      const analysis = await services.ingest.analyzeEventType(eventType, timeWindow);
      return {
        analysis,
        message: `Analysis complete for ${eventType}`
      };
    } else {
      const analysis = await services.ingest.analyzeAllEventTypes(timeWindow);
      return {
        analysis,
        message: 'Analysis complete for all event types'
      };
    }
  } catch (error) {
    throw new Error(`Failed to analyze ingestion: ${error.message}`);
  }
}

async function getProcessOptimization(timeWindow = '1 day ago') {
  try {
    const optimization = await services.ingest.analyzeProcessOptimization(timeWindow);
    return {
      optimization,
      message: 'Process optimization analysis complete'
    };
  } catch (error) {
    throw new Error(`Failed to analyze process optimization: ${error.message}`);
  }
}

// Export everything
module.exports = {
  services,
  getConfig,
  getApiClient,
  listDashboards,
  createDashboard,
  validateDashboard,
  validateQuery,
  testConnection,
  searchEntities,
  analyzeIngestion,
  getProcessOptimization
};