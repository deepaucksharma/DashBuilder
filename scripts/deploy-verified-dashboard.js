#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ACCOUNT_ID = process.env.NEW_RELIC_ACCOUNT_ID;
const API_KEY = process.env.NEW_RELIC_API_KEY;
const REGION = process.env.NEW_RELIC_REGION || 'US';

async function deployDashboard(dashboardPath) {
  try {
    // Read the dashboard JSON
    const dashboardData = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
    
    // Remove accountId from the dashboard object as it's passed separately
    const { accountId, ...dashboard } = dashboardData;
    
    console.log(`Deploying dashboard: ${dashboard.name}`);
    
    const apiEndpoint = REGION === 'EU' ? 'api.eu.newrelic.com' : 'api.newrelic.com';
    
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
      return false;
    }

    const result = response.data.data.dashboardCreate.entityResult;
    console.log('✅ Dashboard created successfully!');
    console.log(`📊 Name: ${result.name}`);
    console.log(`🆔 GUID: ${result.guid}`);
    console.log(`🔗 URL: https://one.newrelic.com/dashboards/${result.guid}`);
    
    return result;
    
  } catch (error) {
    console.error('Error deploying dashboard:', error.response?.data || error.message);
    return false;
  }
}

// Deploy multiple dashboards
async function deployAll() {
  const dashboards = [
    'dashboards/nrdot-verified-dashboard.json',
    'dashboards/experiment-dashboard.json',
    'dashboards/kpi-dashboard.json'
  ];
  
  const results = [];
  
  for (const dashboard of dashboards) {
    const dashboardPath = path.join(__dirname, '..', dashboard);
    if (fs.existsSync(dashboardPath)) {
      console.log(`\n--- Deploying ${dashboard} ---`);
      const result = await deployDashboard(dashboardPath);
      if (result) {
        results.push({ file: dashboard, ...result });
      }
    } else {
      console.log(`⚠️  Dashboard not found: ${dashboard}`);
    }
  }
  
  // Save deployment results
  if (results.length > 0) {
    const deploymentInfo = {
      deployedAt: new Date().toISOString(),
      dashboards: results
    };
    
    fs.writeFileSync(
      path.join(__dirname, '..', 'dashboards', 'deployment-results.json'),
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log('\n📋 Deployment Summary:');
    console.log(`✅ Successfully deployed: ${results.length} dashboards`);
    console.log('\nDashboard URLs:');
    results.forEach(r => {
      console.log(`- ${r.name}: https://one.newrelic.com/dashboards/${r.guid}`);
    });
  }
}

deployAll();