#!/usr/bin/env node

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

class NerdGraphDashboardValidator {
  constructor() {
    this.apiKey = process.env.NEW_RELIC_USER_API_KEY || process.env.NEW_RELIC_API_KEY;
    this.accountId = process.env.NEW_RELIC_ACCOUNT_ID || '3630072';
    this.validationResults = {
      queries: [],
      errors: [],
      warnings: [],
      metrics: {}
    };
  }

  async graphqlRequest(query, variables = {}) {
    const postData = JSON.stringify({
      query,
      variables
    });

    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey,
        'Content-Length': postData.length
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.errors) {
              console.error('GraphQL Errors:', response.errors);
              reject(new Error(response.errors[0].message));
            } else {
              resolve(response.data);
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  // Step 1: Validate NRQL queries
  async validateNrqlQuery(query, widgetTitle) {
    console.log(`\nValidating: ${widgetTitle}`);
    console.log(`Query: ${query}`);

    const nerdGraphQuery = `
      query validateNrql($accountId: Int!, $query: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $query) {
              results
              metadata {
                eventTypes
                facets
                messages
              }
            }
          }
        }
      }
    `;

    try {
      const result = await this.graphqlRequest(nerdGraphQuery, {
        accountId: parseInt(this.accountId),
        query: query
      });

      const nrqlResult = result?.actor?.account?.nrql;
      
      if (nrqlResult?.results && nrqlResult.results.length > 0) {
        console.log(`✅ Query valid - returned ${nrqlResult.results.length} results`);
        this.validationResults.queries.push({
          title: widgetTitle,
          query: query,
          status: 'valid',
          resultCount: nrqlResult.results.length,
          eventTypes: nrqlResult.metadata?.eventTypes || []
        });
        return true;
      } else {
        console.log(`⚠️  Query returned no results`);
        this.validationResults.warnings.push({
          title: widgetTitle,
          query: query,
          issue: 'No data returned'
        });
        return false;
      }
    } catch (error) {
      console.log(`❌ Query failed: ${error.message}`);
      this.validationResults.errors.push({
        title: widgetTitle,
        query: query,
        error: error.message
      });
      return false;
    }
  }

  // Step 2: Get available metrics
  async getAvailableMetrics() {
    console.log('\n📊 Fetching available metrics...');

    const query = `
      query getMetrics($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SELECT uniques(metricName) FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago LIMIT 100") {
              results
            }
          }
        }
      }
    `;

    try {
      const result = await this.graphqlRequest(query, {
        accountId: parseInt(this.accountId)
      });

      const metrics = result?.actor?.account?.nrql?.results[0]?.['uniques.metricName'] || [];
      console.log(`Found ${metrics.length} unique metrics`);
      
      // Categorize metrics
      this.validationResults.metrics = {
        cpu: metrics.filter(m => m.includes('cpu')),
        memory: metrics.filter(m => m.includes('memory')),
        disk: metrics.filter(m => m.includes('disk')),
        network: metrics.filter(m => m.includes('network')),
        filesystem: metrics.filter(m => m.includes('filesystem')),
        other: metrics.filter(m => !m.includes('cpu') && !m.includes('memory') && 
                                  !m.includes('disk') && !m.includes('network') && 
                                  !m.includes('filesystem'))
      };

      return metrics;
    } catch (error) {
      console.error(`Failed to fetch metrics: ${error.message}`);
      return [];
    }
  }

  // Step 3: Create dashboard via NerdGraph
  async createDashboard(dashboardJson) {
    console.log('\n🚀 Creating dashboard via NerdGraph API...');

    const mutation = `
      mutation createDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
            accountId
            createdAt
            updatedAt
            permissions
            ... on DashboardEntity {
              pages {
                guid
                name
                widgets {
                  id
                  title
                  visualization {
                    id
                  }
                }
              }
            }
          }
          errors {
            description
            type
          }
        }
      }
    `;

    // Convert dashboard JSON to NerdGraph format
    const dashboardInput = this.convertToNerdGraphFormat(dashboardJson);

    try {
      const result = await this.graphqlRequest(mutation, {
        accountId: parseInt(this.accountId),
        dashboard: dashboardInput
      });

      if (result?.dashboardCreate?.errors?.length > 0) {
        console.error('❌ Dashboard creation failed:');
        result.dashboardCreate.errors.forEach(err => {
          console.error(`   - ${err.type}: ${err.description}`);
        });
        return null;
      }

      const created = result?.dashboardCreate?.entityResult;
      if (created) {
        console.log(`✅ Dashboard created successfully!`);
        console.log(`   Name: ${created.name}`);
        console.log(`   GUID: ${created.guid}`);
        console.log(`   Pages: ${created.pages.length}`);
        console.log(`   Total Widgets: ${created.pages.reduce((sum, p) => sum + p.widgets.length, 0)}`);
        return created;
      }
    } catch (error) {
      console.error(`❌ API Error: ${error.message}`);
      return null;
    }
  }

  // Convert dashboard JSON to NerdGraph format
  convertToNerdGraphFormat(dashboard) {
    return {
      name: dashboard.name,
      description: dashboard.description,
      permissions: dashboard.permissions,
      pages: dashboard.pages.map(page => ({
        name: page.name,
        description: page.description,
        widgets: page.widgets.map(widget => ({
          title: widget.title,
          layout: widget.layout,
          visualization: widget.visualization,
          rawConfiguration: widget.rawConfiguration
        }))
      }))
    };
  }

  // Step 4: Create optimized dashboard based on available metrics
  createOptimizedDashboard(availableMetrics) {
    console.log('\n🔧 Creating optimized dashboard based on available metrics...');

    const dashboard = {
      name: "NRDOT Metrics - Validated",
      description: "Auto-generated dashboard with validated queries",
      permissions: "PUBLIC_READ_WRITE",
      pages: []
    };

    // Page 1: System Overview
    const systemPage = {
      name: "System Overview",
      description: "Core system metrics",
      widgets: []
    };

    // Add CPU widget if metrics available
    if (availableMetrics.some(m => m.includes('system.cpu.time'))) {
      systemPage.widgets.push({
        title: "CPU Usage by State",
        layout: { column: 1, row: 1, width: 4, height: 3 },
        visualization: { id: "viz.line" },
        rawConfiguration: {
          facet: { showOtherSeries: false },
          legend: { enabled: true },
          nrqlQueries: [{
            accountIds: [parseInt(this.accountId)],
            query: "SELECT rate(sum(system.cpu.time), 1 second) FROM Metric WHERE host.id = 'dashbuilder-host' FACET state SINCE 30 minutes ago TIMESERIES"
          }],
          yAxisLeft: { zero: true }
        }
      });
    }

    // Add Memory widget if metrics available
    if (availableMetrics.some(m => m.includes('system.memory.usage'))) {
      systemPage.widgets.push({
        title: "Memory Usage",
        layout: { column: 5, row: 1, width: 4, height: 3 },
        visualization: { id: "viz.area" },
        rawConfiguration: {
          facet: { showOtherSeries: false },
          legend: { enabled: true },
          nrqlQueries: [{
            accountIds: [parseInt(this.accountId)],
            query: "SELECT latest(system.memory.usage) / 1e9 as 'GB' FROM Metric WHERE host.id = 'dashbuilder-host' FACET state SINCE 30 minutes ago TIMESERIES"
          }]
        }
      });
    }

    // Add Load Average widget
    if (availableMetrics.some(m => m.includes('system.cpu.load_average'))) {
      systemPage.widgets.push({
        title: "CPU Load Average",
        layout: { column: 9, row: 1, width: 4, height: 3 },
        visualization: { id: "viz.billboard" },
        rawConfiguration: {
          nrqlQueries: [{
            accountIds: [parseInt(this.accountId)],
            query: "SELECT latest(system.cpu.load_average.1m) as '1 min', latest(system.cpu.load_average.5m) as '5 min', latest(system.cpu.load_average.15m) as '15 min' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 5 minutes ago"
          }],
          thresholds: [
            { alertSeverity: "WARNING", value: 0.8 },
            { alertSeverity: "CRITICAL", value: 1 }
          ]
        }
      });
    }

    dashboard.pages.push(systemPage);

    // Page 2: NRDOT Analytics
    const analyticsPage = {
      name: "NRDOT Analytics",
      description: "Collection and optimization metrics",
      widgets: [
        {
          title: "Metrics Collection Rate",
          layout: { column: 1, row: 1, width: 8, height: 3 },
          visualization: { id: "viz.line" },
          rawConfiguration: {
            legend: { enabled: true },
            nrqlQueries: [{
              accountIds: [parseInt(this.accountId)],
              query: "SELECT rate(count(*), 1 minute) as 'Data Points/min' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago TIMESERIES"
            }]
          }
        },
        {
          title: "Unique Metrics Count",
          layout: { column: 9, row: 1, width: 4, height: 3 },
          visualization: { id: "viz.billboard" },
          rawConfiguration: {
            nrqlQueries: [{
              accountIds: [parseInt(this.accountId)],
              query: "SELECT uniqueCount(metricName) as 'Unique Metrics' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 10 minutes ago"
            }]
          }
        }
      ]
    };

    dashboard.pages.push(analyticsPage);

    return dashboard;
  }

  // Main validation flow
  async validateAndCreateDashboard() {
    console.log('='.repeat(60));
    console.log('NERDGRAPH DASHBOARD VALIDATOR');
    console.log('='.repeat(60));

    // Check API key
    if (!this.apiKey) {
      console.error('❌ No API key found. Please set NEW_RELIC_API_KEY or NEW_RELIC_USER_API_KEY');
      return;
    }

    console.log(`Account ID: ${this.accountId}`);
    console.log(`API Key: ${this.apiKey.substring(0, 10)}...`);

    // Step 1: Get available metrics
    const availableMetrics = await this.getAvailableMetrics();
    
    if (availableMetrics.length === 0) {
      console.error('❌ No metrics found. Is the collector running?');
      return;
    }

    console.log('\nMetrics by category:');
    Object.entries(this.validationResults.metrics).forEach(([category, metrics]) => {
      if (metrics.length > 0) {
        console.log(`  ${category}: ${metrics.length} metrics`);
      }
    });

    // Step 2: Load and validate existing dashboard
    const dashboardPath = path.join(__dirname, '..', 'dashboards', 'nrdot-dashboard-final.json');
    if (fs.existsSync(dashboardPath)) {
      console.log('\n📋 Validating existing dashboard queries...');
      const existingDashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
      
      for (const page of existingDashboard.pages) {
        for (const widget of page.widgets) {
          if (widget.rawConfiguration?.nrqlQueries) {
            for (const q of widget.rawConfiguration.nrqlQueries) {
              await this.validateNrqlQuery(q.query, widget.title);
            }
          }
        }
      }
    }

    // Step 3: Create optimized dashboard
    const optimizedDashboard = this.createOptimizedDashboard(availableMetrics);
    
    // Save optimized dashboard
    const optimizedPath = path.join(__dirname, '..', 'dashboards', 'nrdot-dashboard-optimized.json');
    fs.writeFileSync(optimizedPath, JSON.stringify(optimizedDashboard, null, 2));
    console.log(`\n✅ Optimized dashboard saved to: ${optimizedPath}`);

    // Step 4: Show validation summary
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`\nValid Queries: ${this.validationResults.queries.filter(q => q.status === 'valid').length}`);
    console.log(`Warnings: ${this.validationResults.warnings.length}`);
    console.log(`Errors: ${this.validationResults.errors.length}`);

    if (this.validationResults.errors.length > 0) {
      console.log('\n❌ Errors found:');
      this.validationResults.errors.forEach(err => {
        console.log(`  - ${err.title}: ${err.error}`);
      });
    }

    // Save validation report
    const reportPath = path.join(__dirname, '..', 'dashboards', 'validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.validationResults, null, 2));
    console.log(`\n📄 Full validation report saved to: ${reportPath}`);

    // Offer to create dashboard via API
    console.log('\n' + '='.repeat(60));
    console.log('NEXT STEPS');
    console.log('='.repeat(60));
    console.log('\n1. Review the optimized dashboard at:');
    console.log(`   ${optimizedPath}`);
    console.log('\n2. To create via API, run:');
    console.log(`   node ${__filename} --create`);
    console.log('\n3. Or import manually in New Relic UI');
  }

  // Check if we should create dashboard
  async run() {
    const shouldCreate = process.argv.includes('--create');
    
    if (shouldCreate) {
      console.log('Creating dashboard via NerdGraph API...\n');
      const dashboardPath = path.join(__dirname, '..', 'dashboards', 'nrdot-dashboard-optimized.json');
      if (fs.existsSync(dashboardPath)) {
        const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
        await this.createDashboard(dashboard);
      } else {
        console.error('❌ No optimized dashboard found. Run validation first.');
      }
    } else {
      await this.validateAndCreateDashboard();
    }
  }
}

// Run the validator
const validator = new NerdGraphDashboardValidator();
validator.run().catch(console.error);