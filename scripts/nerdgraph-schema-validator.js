#!/usr/bin/env node

/**
 * NerdGraph Schema-Based Dashboard Builder
 * Uses official New Relic schemas and specifications to build valid dashboards programmatically
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

class NerdGraphSchemaValidator {
  constructor() {
    this.apiKey = process.env.NEW_RELIC_API_KEY;
    this.accountId = process.env.NEW_RELIC_ACCOUNT_ID;
    
    // NRQL Grammar Rules (based on New Relic documentation)
    this.nrqlGrammar = {
      // Valid NRQL functions
      aggregateFunctions: ['average', 'count', 'latest', 'max', 'min', 'percentage', 'percentile', 'rate', 'stddev', 'sum', 'uniqueCount'],
      
      // Valid time functions
      timeFunctions: ['rate', 'derivative'],
      
      // Valid clauses
      clauses: ['SELECT', 'FROM', 'WHERE', 'FACET', 'LIMIT', 'SINCE', 'UNTIL', 'TIMESERIES', 'COMPARE WITH'],
      
      // Valid operators
      operators: ['=', '!=', '<', '>', '<=', '>=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL', 'AND', 'OR'],
      
      // Reserved words that need special handling
      reservedWords: ['AS', 'BY', 'FROM', 'SELECT', 'WHERE', 'WITH', 'FACET', 'LIMIT', 'SINCE', 'UNTIL'],
      
      // Valid event types
      eventTypes: ['Metric', 'Log', 'Span', 'Event', 'ProcessSample', 'SystemSample']
    };

    // Widget Schema (based on NerdGraph DashboardInput type)
    this.widgetSchema = {
      required: ['title', 'visualization', 'layout', 'rawConfiguration'],
      
      visualizations: {
        'viz.area': { 
          supportsTimeseries: true, 
          requiresNrql: true,
          configOptions: ['legend', 'yAxisLeft', 'yAxisRight', 'facet']
        },
        'viz.bar': { 
          supportsTimeseries: false, 
          requiresNrql: true,
          configOptions: ['facet', 'legend']
        },
        'viz.billboard': { 
          supportsTimeseries: false, 
          requiresNrql: true,
          configOptions: ['thresholds']
        },
        'viz.line': { 
          supportsTimeseries: true, 
          requiresNrql: true,
          configOptions: ['legend', 'yAxisLeft', 'yAxisRight', 'facet']
        },
        'viz.markdown': { 
          supportsTimeseries: false, 
          requiresNrql: false,
          requiresText: true
        },
        'viz.pie': { 
          supportsTimeseries: false, 
          requiresNrql: true,
          configOptions: ['facet', 'legend']
        },
        'viz.table': { 
          supportsTimeseries: false, 
          requiresNrql: true,
          configOptions: []
        }
      },
      
      layoutConstraints: {
        minColumn: 1,
        maxColumn: 12,
        minRow: 1,
        minWidth: 1,
        maxWidth: 12,
        minHeight: 1,
        maxHeight: 50
      }
    };
  }

  // GraphQL request handler
  async graphQL(query, variables = {}) {
    const data = JSON.stringify({ query, variables });
    
    const options = {
      hostname: 'api.newrelic.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': this.apiKey,
        'Content-Length': data.length
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.errors) {
              reject(new Error(JSON.stringify(response.errors)));
            } else {
              resolve(response.data);
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // 1. Get available metrics schema
  async getMetricsSchema() {
    console.log('🔍 Fetching available metrics...\n');
    
    const query = `
      query getMetrics($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "SELECT uniques(metricName) FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago LIMIT 1000") {
              results
            }
          }
        }
      }
    `;

    try {
      const result = await this.graphQL(query, { accountId: parseInt(this.accountId) });
      const metrics = result?.actor?.account?.nrql?.results[0]?.['uniques.metricName'] || [];
      
      // Categorize metrics by type
      const schema = {
        cpu: metrics.filter(m => m.includes('cpu')),
        memory: metrics.filter(m => m.includes('memory')),
        disk: metrics.filter(m => m.includes('disk')),
        network: metrics.filter(m => m.includes('network')),
        filesystem: metrics.filter(m => m.includes('filesystem')),
        paging: metrics.filter(m => m.includes('paging')),
        all: metrics
      };
      
      return schema;
    } catch (error) {
      console.error('Failed to fetch metrics:', error.message);
      return null;
    }
  }

  // 2. Validate NRQL syntax against grammar
  validateNrqlSyntax(query) {
    const errors = [];
    const warnings = [];
    
    // Check for required clauses
    if (!query.match(/SELECT/i)) {
      errors.push('Query must contain SELECT clause');
    }
    
    if (!query.match(/FROM\s+\w+/i)) {
      errors.push('Query must contain FROM clause');
    }
    
    // Check event type
    const fromMatch = query.match(/FROM\s+(\w+)/i);
    if (fromMatch && !this.nrqlGrammar.eventTypes.includes(fromMatch[1])) {
      warnings.push(`Event type '${fromMatch[1]}' may not be valid`);
    }
    
    // Check for alias issues (common error)
    const aliasMatches = query.matchAll(/as\s+['"`]([^'"`]+)['"`]/gi);
    for (const match of aliasMatches) {
      const alias = match[1];
      if (alias.includes(' ') || alias.includes('-')) {
        errors.push(`Alias '${alias}' contains invalid characters. Use underscores instead of spaces/hyphens.`);
      }
    }
    
    // Check for unmatched quotes
    const singleQuotes = (query.match(/'/g) || []).length;
    const doubleQuotes = (query.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0) {
      errors.push('Unmatched single quotes in query');
    }
    if (doubleQuotes % 2 !== 0) {
      errors.push('Unmatched double quotes in query');
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }

  // 3. Test NRQL query execution
  async testNrqlQuery(query) {
    const testQuery = `
      query testNrql($accountId: Int!, $query: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $query) {
              results
              metadata {
                eventTypes
                facets
              }
            }
          }
        }
      }
    `;

    try {
      const result = await this.graphQL(testQuery, {
        accountId: parseInt(this.accountId),
        query: query
      });
      
      const nrqlResult = result?.actor?.account?.nrql;
      return {
        success: true,
        hasData: nrqlResult?.results?.length > 0,
        eventTypes: nrqlResult?.metadata?.eventTypes || [],
        resultCount: nrqlResult?.results?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 4. Build valid NRQL queries based on available metrics
  buildValidQueries(metricsSchema) {
    const queries = [];
    
    // CPU queries
    if (metricsSchema.cpu.includes('system.cpu.time')) {
      queries.push({
        name: 'CPU Usage by State',
        visualization: 'viz.line',
        query: 'SELECT rate(max(system.cpu.time), 1 second) FROM Metric WHERE host.id = \'dashbuilder-host\' FACET state TIMESERIES SINCE 30 minutes ago'
      });
    }
    
    if (metricsSchema.cpu.includes('system.cpu.load_average.1m')) {
      queries.push({
        name: 'CPU Load Averages',
        visualization: 'viz.billboard',
        query: 'SELECT latest(system.cpu.load_average.1m) AS load_1m, latest(system.cpu.load_average.5m) AS load_5m, latest(system.cpu.load_average.15m) AS load_15m FROM Metric WHERE host.id = \'dashbuilder-host\' SINCE 5 minutes ago'
      });
    }
    
    // Memory queries
    if (metricsSchema.memory.includes('system.memory.usage')) {
      queries.push({
        name: 'Memory Usage',
        visualization: 'viz.area',
        query: 'SELECT latest(system.memory.usage) / 1e9 AS memory_gb FROM Metric WHERE host.id = \'dashbuilder-host\' FACET state TIMESERIES SINCE 30 minutes ago'
      });
    }
    
    // Disk queries
    if (metricsSchema.disk.includes('system.disk.io')) {
      queries.push({
        name: 'Disk I/O',
        visualization: 'viz.line',
        query: 'SELECT rate(max(system.disk.io), 1 second) / 1e6 AS mb_per_sec FROM Metric WHERE host.id = \'dashbuilder-host\' FACET device, direction TIMESERIES SINCE 30 minutes ago'
      });
    }
    
    // Network queries
    if (metricsSchema.network.includes('system.network.io')) {
      queries.push({
        name: 'Network I/O',
        visualization: 'viz.line',
        query: 'SELECT rate(max(system.network.io), 1 second) / 1e6 AS mb_per_sec FROM Metric WHERE host.id = \'dashbuilder-host\' AND device != \'lo\' FACET device, direction TIMESERIES SINCE 30 minutes ago'
      });
    }
    
    // Collection stats
    queries.push({
      name: 'Metrics Collection Stats',
      visualization: 'viz.billboard',
      query: 'SELECT uniqueCount(metricName) AS unique_metrics, count(*) AS data_points FROM Metric WHERE host.id = \'dashbuilder-host\' SINCE 10 minutes ago'
    });
    
    // Cost estimation
    queries.push({
      name: 'Monthly Cost Estimate',
      visualization: 'viz.billboard',
      query: 'SELECT rate(count(*), 1 month) / 1e9 AS billion_per_month FROM Metric WHERE host.id = \'dashbuilder-host\' SINCE 1 hour ago'
    });
    
    return queries;
  }

  // 5. Build widget with proper schema
  buildWidget(queryDef, position) {
    const vizConfig = this.widgetSchema.visualizations[queryDef.visualization];
    
    const widget = {
      title: queryDef.name,
      visualization: {
        id: queryDef.visualization
      },
      layout: {
        column: position.column,
        row: position.row,
        width: position.width || 4,
        height: position.height || 3
      },
      rawConfiguration: {
        nrqlQueries: [{
          accountIds: [parseInt(this.accountId)],
          query: queryDef.query
        }]
      }
    };
    
    // Add visualization-specific configuration
    if (vizConfig.supportsTimeseries && queryDef.query.includes('TIMESERIES')) {
      widget.rawConfiguration.legend = { enabled: true };
      widget.rawConfiguration.yAxisLeft = { zero: true };
    }
    
    if (queryDef.visualization === 'viz.billboard' && queryDef.thresholds) {
      widget.rawConfiguration.thresholds = queryDef.thresholds;
    }
    
    if (vizConfig.configOptions?.includes('facet')) {
      widget.rawConfiguration.facet = { showOtherSeries: false };
    }
    
    return widget;
  }

  // 6. Create dashboard programmatically
  async createDashboardProgrammatically() {
    console.log('🏗️  Building dashboard programmatically...\n');
    
    // Step 1: Get metrics schema
    const metricsSchema = await this.getMetricsSchema();
    if (!metricsSchema) {
      console.error('Failed to fetch metrics schema');
      return;
    }
    
    console.log(`Found ${metricsSchema.all.length} metrics\n`);
    
    // Step 2: Build valid queries
    const queries = this.buildValidQueries(metricsSchema);
    
    // Step 3: Test each query
    console.log('🧪 Testing queries...\n');
    const validQueries = [];
    
    for (const queryDef of queries) {
      console.log(`Testing: ${queryDef.name}`);
      
      // Validate syntax
      const syntaxValidation = this.validateNrqlSyntax(queryDef.query);
      if (!syntaxValidation.valid) {
        console.log(`  ❌ Syntax errors: ${syntaxValidation.errors.join(', ')}`);
        continue;
      }
      
      // Test execution
      const testResult = await this.testNrqlQuery(queryDef.query);
      if (testResult.success) {
        console.log(`  ✅ Valid (${testResult.hasData ? 'has data' : 'no data yet'})`);
        validQueries.push(queryDef);
      } else {
        console.log(`  ❌ Execution error: ${testResult.error}`);
      }
    }
    
    console.log(`\n✅ ${validQueries.length} valid queries\n`);
    
    // Step 4: Build dashboard structure
    const dashboard = {
      name: 'NRDOT Metrics - Programmatic',
      description: 'Automatically generated dashboard using schema validation',
      permissions: 'PUBLIC_READ_WRITE',
      pages: [
        {
          name: 'System Metrics',
          description: 'Core system performance metrics',
          widgets: []
        },
        {
          name: 'Analytics',
          description: 'Cost and collection analytics',
          widgets: []
        }
      ]
    };
    
    // Step 5: Add widgets with proper layout
    let systemRow = 1;
    let analyticsRow = 1;
    let systemCol = 1;
    let analyticsCol = 1;
    
    validQueries.forEach(queryDef => {
      const isAnalytics = queryDef.name.includes('Cost') || queryDef.name.includes('Collection');
      const page = isAnalytics ? 1 : 0;
      
      const position = {
        column: isAnalytics ? analyticsCol : systemCol,
        row: isAnalytics ? analyticsRow : systemRow,
        width: queryDef.visualization === 'viz.table' ? 12 : 4,
        height: 3
      };
      
      const widget = this.buildWidget(queryDef, position);
      dashboard.pages[page].widgets.push(widget);
      
      // Update position for next widget
      if (isAnalytics) {
        analyticsCol += position.width;
        if (analyticsCol > 12) {
          analyticsCol = 1;
          analyticsRow += 3;
        }
      } else {
        systemCol += position.width;
        if (systemCol > 12) {
          systemCol = 1;
          systemRow += 3;
        }
      }
    });
    
    // Save dashboard
    const dashboardPath = path.join(__dirname, '..', 'dashboards', 'nrdot-programmatic-dashboard.json');
    fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));
    
    console.log(`📊 Dashboard created: ${dashboardPath}\n`);
    
    // Step 6: Deploy dashboard
    console.log('🚀 Deploying dashboard...\n');
    
    const mutation = `
      mutation createDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
          }
          errors {
            description
            type
          }
        }
      }
    `;
    
    try {
      const result = await this.graphQL(mutation, {
        accountId: parseInt(this.accountId),
        dashboard: dashboard
      });
      
      if (result?.dashboardCreate?.errors?.length > 0) {
        console.error('❌ Deployment failed:', result.dashboardCreate.errors[0].description);
      } else if (result?.dashboardCreate?.entityResult) {
        const created = result.dashboardCreate.entityResult;
        console.log('✅ Dashboard deployed successfully!');
        console.log(`   Name: ${created.name}`);
        console.log(`   GUID: ${created.guid}`);
        console.log(`   URL: https://one.newrelic.com/dashboards/${created.guid}`);
      }
    } catch (error) {
      console.error('❌ Deployment error:', error.message);
    }
  }

  // 7. Schema introspection (for development)
  async introspectSchema() {
    const query = `
      query IntrospectionQuery {
        __schema {
          types {
            name
            kind
            description
            fields {
              name
              type {
                name
                kind
              }
            }
          }
        }
      }
    `;
    
    try {
      const result = await this.graphQL(query);
      const dashboardTypes = result.__schema.types.filter(t => 
        t.name.includes('Dashboard') || t.name.includes('Widget')
      );
      
      fs.writeFileSync(
        path.join(__dirname, '..', 'dashboards', 'nerdgraph-schema.json'),
        JSON.stringify(dashboardTypes, null, 2)
      );
      
      console.log('Schema introspection saved to nerdgraph-schema.json');
    } catch (error) {
      console.error('Schema introspection failed:', error.message);
    }
  }
}

// Main execution
if (require.main === module) {
  const validator = new NerdGraphSchemaValidator();
  
  if (!validator.apiKey) {
    console.error('❌ NEW_RELIC_API_KEY not set');
    process.exit(1);
  }
  
  validator.createDashboardProgrammatically().catch(console.error);
}

module.exports = NerdGraphSchemaValidator;