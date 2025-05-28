#!/usr/bin/env node
/**
 * Create NRDOT Dashboard in New Relic
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const API_KEY = process.env.NEW_RELIC_API_KEY;
const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID;

const dashboardTemplate = {
  name: "NRDOT v2 - Process Optimization Dashboard",
  description: "Monitor NRDOT telemetry optimization and cost reduction",
  permissions: "PUBLIC_READ_WRITE",
  pages: [
    {
      name: "Overview",
      description: "NRDOT optimization overview",
      widgets: [
        {
          title: "Current Profile",
          visualization: { id: "viz.billboard" },
          configuration: {
            nrqlQueries: [{
              accountId: parseInt(ACCOUNT_ID),
              query: `SELECT latest(nrdot.profile) as 'Current Profile' FROM Metric WHERE nrdot.profile IS NOT NULL SINCE 1 hour ago`
            }]
          },
          layout: { column: 1, row: 1, width: 4, height: 3 }
        },
        {
          title: "Estimated Monthly Cost",
          visualization: { id: "viz.billboard" },
          configuration: {
            nrqlQueries: [{
              accountId: parseInt(ACCOUNT_ID),
              query: `SELECT rate(sum(newrelic.resourceSample.IngestBytes), 1 month) * 0.25 / 1000000 as 'Monthly Cost (USD)' FROM Metric SINCE 1 hour ago`
            }]
          },
          layout: { column: 5, row: 1, width: 4, height: 3 }
        },
        {
          title: "Process Coverage",
          visualization: { id: "viz.billboard" },
          configuration: {
            nrqlQueries: [{
              accountId: parseInt(ACCOUNT_ID),
              query: `SELECT uniqueCount(processDisplayName) as 'Monitored Processes' FROM ProcessSample SINCE 1 hour ago`
            }]
          },
          layout: { column: 9, row: 1, width: 4, height: 3 }
        },
        {
          title: "Metrics Over Time",
          visualization: { id: "viz.line" },
          configuration: {
            nrqlQueries: [{
              accountId: parseInt(ACCOUNT_ID),
              query: `SELECT count(*) FROM Metric WHERE collector.name = 'otelcol-contrib' TIMESERIES SINCE 1 hour ago`
            }]
          },
          layout: { column: 1, row: 4, width: 12, height: 3 }
        },
        {
          title: "Top Processes by CPU",
          visualization: { id: "viz.bar" },
          configuration: {
            nrqlQueries: [{
              accountId: parseInt(ACCOUNT_ID),
              query: `SELECT average(cpuPercent) FROM ProcessSample FACET processDisplayName SINCE 1 hour ago LIMIT 10`
            }]
          },
          layout: { column: 1, row: 7, width: 6, height: 3 }
        },
        {
          title: "Top Processes by Memory",
          visualization: { id: "viz.bar" },
          configuration: {
            nrqlQueries: [{
              accountId: parseInt(ACCOUNT_ID),
              query: `SELECT average(memoryResidentSizeBytes) / 1048576 as 'Memory (MB)' FROM ProcessSample FACET processDisplayName SINCE 1 hour ago LIMIT 10`
            }]
          },
          layout: { column: 7, row: 7, width: 6, height: 3 }
        }
      ]
    },
    {
      name: "Cost Analysis",
      description: "Cost reduction metrics",
      widgets: [
        {
          title: "Cost Reduction Trend",
          visualization: { id: "viz.line" },
          configuration: {
            nrqlQueries: [{
              accountId: parseInt(ACCOUNT_ID),
              query: `SELECT average(nrdot.cost.reduction) as 'Cost Reduction %' FROM Metric TIMESERIES SINCE 24 hours ago`
            }]
          },
          layout: { column: 1, row: 1, width: 12, height: 3 }
        }
      ]
    }
  ]
};

async function createDashboard() {
  console.log('Creating NRDOT Dashboard...');
  
  if (!API_KEY || !ACCOUNT_ID) {
    console.error('Missing required environment variables: NEW_RELIC_API_KEY, NEW_RELIC_ACCOUNT_ID');
    process.exit(1);
  }

  const mutation = `
    mutation CreateDashboard($dashboard: DashboardInput!) {
      dashboardCreate(accountId: ${ACCOUNT_ID}, dashboard: $dashboard) {
        entityResult {
          guid
          name
          accountId
          ... on DashboardEntity {
            permissions
            createdAt
            updatedAt
            dashboardParentGuid
          }
        }
        errors {
          description
          type
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      'https://api.newrelic.com/graphql',
      {
        query: mutation,
        variables: { dashboard: dashboardTemplate }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': API_KEY
        }
      }
    );

    if (response.data.errors) {
      console.error('GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
      process.exit(1);
    }

    const result = response.data.data.dashboardCreate;
    if (result.errors && result.errors.length > 0) {
      console.error('Dashboard creation errors:', JSON.stringify(result.errors, null, 2));
      process.exit(1);
    }

    console.log('✅ Dashboard created successfully!');
    console.log('Dashboard GUID:', result.entityResult.guid);
    console.log('Dashboard Name:', result.entityResult.name);
    
    // Save dashboard info
    const dashboardInfo = {
      guid: result.entityResult.guid,
      name: result.entityResult.name,
      accountId: result.entityResult.accountId,
      createdAt: new Date().toISOString(),
      url: `https://one.newrelic.com/dashboards/${result.entityResult.guid}`
    };
    
    await fs.writeFile(
      path.join(__dirname, '..', 'dashboards', 'created-dashboard.json'),
      JSON.stringify(dashboardInfo, null, 2)
    );
    
    console.log('\nView your dashboard at:');
    console.log(dashboardInfo.url);
    
  } catch (error) {
    console.error('Failed to create dashboard:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  createDashboard();
}

module.exports = { createDashboard };