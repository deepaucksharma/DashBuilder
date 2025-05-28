/**
 * New Relic API utilities for DashBuilder
 */

const axios = require('axios');
const { info, error } = require('./logging');

// Constants
const NR_REGIONS = {
  US: 'api.newrelic.com',
  EU: 'api.eu.newrelic.com'
};

/**
 * Create a configured New Relic API client
 * @param {Object} config - Configuration options
 * @returns {Object} - Configured API client
 */
function createNRClient(config = {}) {
  const {
    apiKey = process.env.NEW_RELIC_API_KEY,
    accountId = process.env.NEW_RELIC_ACCOUNT_ID,
    region = process.env.NEW_RELIC_REGION || 'US',
    timeout = 30000
  } = config;

  if (!apiKey) {
    throw new Error('NEW_RELIC_API_KEY is required');
  }

  if (!accountId) {
    throw new Error('NEW_RELIC_ACCOUNT_ID is required');
  }

  const baseURL = `https://${NR_REGIONS[region.toUpperCase()] || NR_REGIONS.US}/v2`;

  const client = axios.create({
    baseURL,
    timeout,
    headers: {
      'Api-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  return {
    /**
     * Execute a NRQL query
     * @param {string} query - NRQL query to execute
     * @returns {Promise<Object>} - Query results
     */
    async executeQuery(query) {
      try {
        info(`Executing NRQL query: ${query}`);
        const response = await client.post(`/accounts/${accountId}/query`, {
          query
        });
        return response.data.results[0];
      } catch (err) {
        error(`NRQL query failed: ${err.message}`);
        throw err;
      }
    },

    /**
     * Get metrics by name pattern
     * @param {string} pattern - Metrics name pattern
     * @returns {Promise<Array>} - List of matching metrics
     */
    async getMetrics(pattern) {
      try {
        info(`Fetching metrics matching: ${pattern}`);
        const query = `SELECT uniques(metricName) FROM Metric WHERE metricName LIKE '%${pattern}%' LIMIT 1000`;
        const result = await this.executeQuery(query);
        return result?.members || [];
      } catch (err) {
        error(`Failed to fetch metrics: ${err.message}`);
        throw err;
      }
    },

    /**
     * Create a dashboard
     * @param {Object} dashboard - Dashboard definition
     * @returns {Promise<Object>} - Created dashboard
     */
    async createDashboard(dashboard) {
      try {
        info('Creating dashboard');
        const response = await client.post(`/dashboards`, dashboard);
        return response.data;
      } catch (err) {
        error(`Failed to create dashboard: ${err.message}`);
        throw err;
      }
    }
  };
}

module.exports = {
  createNRClient,
  NR_REGIONS
};
