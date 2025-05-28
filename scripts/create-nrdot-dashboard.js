#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID;
const API_KEY = process.env.NEW_RELIC_API_KEY;
const REGION = process.env.NEW_RELIC_REGION || 'US';

if (!ACCOUNT_ID || !API_KEY) {
  console.error('Missing required environment variables: NEW_RELIC_ACCOUNT_ID or NEW_RELIC_API_KEY');
  process.exit(1);
}

const dashboard = {
  "name": "NRDOT v2 - Process Optimization Dashboard",
  "description": "Real-time monitoring of NRDOT process optimization and cost savings",
  "permissions": "PUBLIC_READ_WRITE",
  "pages": [
    {
      "name": "Overview",
      "description": "High-level KPIs and savings",
      "widgets": [
        {
          "title": "Current Cost Savings",
          "layout": {
            "column": 1,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.billboard"
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT (1 - (uniqueCount(process.executable.name) / 100)) * 100 as 'Cost Savings %' FROM Metric WHERE metricName LIKE 'process%' SINCE 1 hour ago"
              }
            ],
            "thresholds": [
              {
                "alertSeverity": "WARNING",
                "value": 50
              },
              {
                "alertSeverity": "CRITICAL", 
                "value": 70
              }
            ]
          }
        },
        {
          "title": "Process Coverage",
          "layout": {
            "column": 5,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.billboard"
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT uniqueCount(process.executable.name) as 'Monitored Processes' FROM Metric WHERE metricName LIKE 'process%' SINCE 1 hour ago"
              }
            ]
          }
        },
        {
          "title": "Active Optimization Profile",
          "layout": {
            "column": 9,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.billboard"
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "FROM Metric SELECT latest(optimization.profile) as 'Current Profile' WHERE optimization.profile IS NOT NULL SINCE 5 minutes ago"
              }
            ]
          }
        },
        {
          "title": "Top Processes by CPU",
          "layout": {
            "column": 1,
            "row": 4,
            "width": 6,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.bar"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT average(process.cpu.utilization) FROM Metric FACET process.executable.name SINCE 1 hour ago LIMIT 10"
              }
            ]
          }
        },
        {
          "title": "Top Processes by Memory",
          "layout": {
            "column": 7,
            "row": 4,
            "width": 6,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.bar"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT average(process.memory.usage) / 1e6 as 'MB' FROM Metric FACET process.executable.name SINCE 1 hour ago LIMIT 10"
              }
            ]
          }
        },
        {
          "title": "System CPU Usage Over Time",
          "layout": {
            "column": 1,
            "row": 7,
            "width": 12,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.line"
          },
          "rawConfiguration": {
            "legend": {
              "enabled": true
            },
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT average(system.cpu.utilization) FROM Metric TIMESERIES SINCE 1 hour ago"
              }
            ],
            "yAxisLeft": {
              "zero": true
            }
          }
        }
      ]
    },
    {
      "name": "Cost Analysis",
      "description": "Detailed cost metrics and savings",
      "widgets": [
        {
          "title": "Hourly Data Point Rate",
          "layout": {
            "column": 1,
            "row": 1,
            "width": 12,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.area"
          },
          "rawConfiguration": {
            "legend": {
              "enabled": true
            },
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT rate(count(*), 1 hour) as 'Data Points/Hour' FROM Metric WHERE metricName LIKE 'process%' OR metricName LIKE 'system%' TIMESERIES SINCE 24 hours ago"
              }
            ]
          }
        },
        {
          "title": "Optimization Savings by Profile",
          "layout": {
            "column": 1,
            "row": 4,
            "width": 6,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.table"
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "FROM Log SELECT 'Conservative' as Profile, '50%' as 'Cost Reduction', '95%' as 'Process Coverage' WHERE message = 'placeholder' LIMIT 1"
              }
            ]
          }
        },
        {
          "title": "Projected Monthly Savings",
          "layout": {
            "column": 7,
            "row": 4,
            "width": 6,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.billboard"
          },
          "rawConfiguration": {
            "nrqlQueries": [
              {
                "accountId": parseInt(ACCOUNT_ID),
                "query": "SELECT rate(count(*), 1 month) / 1e9 * 0.25 * 0.7 as 'Monthly Savings (USD)' FROM Metric WHERE metricName LIKE 'process%' SINCE 1 hour ago"
              }
            ]
          }
        }
      ]
    }
  ]
};

async function createDashboard() {
  const apiEndpoint = REGION === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com';
  
  try {
    console.log('Creating NRDOT dashboard...');
    
    const response = await axios.post(
      `https://${apiEndpoint}/graphql`,
      {
        query: `
          mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
            dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
              entityResult {
                guid
                name
                accountId
                createdAt
                updatedAt
              }
              errors {
                description
                type
              }
            }
          }
        `,
        variables: {
          accountId: parseInt(ACCOUNT_ID),
          dashboard: dashboard
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'API-Key': API_KEY
        }
      }
    );

    if (response.data.errors || (response.data.data?.dashboardCreate?.errors?.length > 0)) {
      console.error('Dashboard creation failed:', response.data.errors || response.data.data.dashboardCreate.errors);
      process.exit(1);
    }

    const result = response.data.data.dashboardCreate.entityResult;
    console.log('✅ Dashboard created successfully!');
    console.log(`📊 Name: ${result.name}`);
    console.log(`🆔 GUID: ${result.guid}`);
    console.log(`📅 Created: ${result.createdAt}`);
    
    // Construct the dashboard URL
    const dashboardUrl = `https://one.newrelic.com/dashboards/${result.guid}`;
    console.log(`🔗 URL: ${dashboardUrl}`);
    
    // Save dashboard info
    fs.writeFileSync(
      path.join(__dirname, '..', 'dashboards', 'nrdot-deployed.json'),
      JSON.stringify({ dashboard: dashboard, deployment: result, url: dashboardUrl }, null, 2)
    );
    
  } catch (error) {
    console.error('Error creating dashboard:', error.response?.data || error.message);
    process.exit(1);
  }
}

createDashboard();