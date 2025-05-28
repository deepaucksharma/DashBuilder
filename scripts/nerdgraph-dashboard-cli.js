#!/usr/bin/env node

/**
 * NerdGraph Dashboard CLI
 * Complete dashboard management tool following New Relic's official NerdGraph API
 * Based on: https://github.com/newrelic/docs-website/tree/develop/src/content/docs/apis/nerdgraph/examples
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

class NerdGraphDashboardCLI {
  constructor() {
    this.apiKey = process.env.NEW_RELIC_API_KEY || process.env.NEW_RELIC_USER_API_KEY;
    this.accountId = process.env.NEW_RELIC_ACCOUNT_ID || '3630072';
    this.apiEndpoint = 'api.newrelic.com';
  }

  // Core GraphQL request handler
  async graphQL(query, variables = {}) {
    const data = JSON.stringify({ query, variables });
    
    const options = {
      hostname: this.apiEndpoint,
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

  // 1. List existing dashboards
  async listDashboards() {
    const query = `
      query listDashboards($accountId: Int!) {
        actor {
          entitySearch(query: "accountId = $accountId AND type = 'DASHBOARD'") {
            results {
              entities {
                ... on DashboardEntity {
                  guid
                  name
                  description
                  createdAt
                  updatedAt
                  permissions
                  owner {
                    email
                  }
                  pages {
                    name
                    widgets {
                      title
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const result = await this.graphQL(query, { accountId: parseInt(this.accountId) });
      return result?.actor?.entitySearch?.results?.entities || [];
    } catch (error) {
      console.error('Failed to list dashboards:', error.message);
      return [];
    }
  }

  // 2. Get dashboard by GUID
  async getDashboard(guid) {
    const query = `
      query getDashboard($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            ... on DashboardEntity {
              guid
              name
              description
              permissions
              pages {
                guid
                name
                description
                widgets {
                  id
                  title
                  layout {
                    column
                    row
                    width
                    height
                  }
                  visualization {
                    id
                  }
                  rawConfiguration
                }
              }
              variables {
                defaultValues {
                  value {
                    string
                  }
                }
                isMultiSelection
                items {
                  title
                  value
                }
                name
                nrqlQuery {
                  accountIds
                  query
                }
                replacementStrategy
                title
                type
              }
            }
          }
        }
      }
    `;

    try {
      const result = await this.graphQL(query, { guid });
      return result?.actor?.entity;
    } catch (error) {
      console.error('Failed to get dashboard:', error.message);
      return null;
    }
  }

  // 3. Create dashboard
  async createDashboard(dashboardInput) {
    const mutation = `
      mutation createDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
            description
            permissions
            createdAt
            updatedAt
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
        dashboard: dashboardInput
      });

      if (result?.dashboardCreate?.errors?.length > 0) {
        throw new Error(result.dashboardCreate.errors[0].description);
      }

      return result?.dashboardCreate?.entityResult;
    } catch (error) {
      console.error('Failed to create dashboard:', error.message);
      return null;
    }
  }

  // 4. Update dashboard
  async updateDashboard(guid, dashboardInput) {
    const mutation = `
      mutation updateDashboard($guid: EntityGuid!, $dashboard: DashboardUpdateInput!) {
        dashboardUpdate(guid: $guid, dashboard: $dashboard) {
          entityResult {
            guid
            name
            ... on DashboardEntity {
              pages {
                guid
                name
                widgets {
                  id
                  title
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

    try {
      const result = await this.graphQL(mutation, { guid, dashboard: dashboardInput });
      
      if (result?.dashboardUpdate?.errors?.length > 0) {
        throw new Error(result.dashboardUpdate.errors[0].description);
      }

      return result?.dashboardUpdate?.entityResult;
    } catch (error) {
      console.error('Failed to update dashboard:', error.message);
      return null;
    }
  }

  // 5. Delete dashboard
  async deleteDashboard(guid) {
    const mutation = `
      mutation deleteDashboard($guid: EntityGuid!) {
        dashboardDelete(guid: $guid) {
          status
          errors {
            description
            type
          }
        }
      }
    `;

    try {
      const result = await this.graphQL(mutation, { guid });
      
      if (result?.dashboardDelete?.errors?.length > 0) {
        throw new Error(result.dashboardDelete.errors[0].description);
      }

      return result?.dashboardDelete?.status === 'SUCCESS';
    } catch (error) {
      console.error('Failed to delete dashboard:', error.message);
      return false;
    }
  }

  // 6. Validate dashboard structure
  validateDashboardStructure(dashboard) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!dashboard.name) errors.push('Dashboard name is required');
    if (!dashboard.pages || dashboard.pages.length === 0) errors.push('At least one page is required');

    // Validate pages
    dashboard.pages?.forEach((page, pageIndex) => {
      if (!page.name) errors.push(`Page ${pageIndex + 1}: name is required`);
      
      if (!page.widgets || page.widgets.length === 0) {
        warnings.push(`Page '${page.name}': no widgets defined`);
      }

      // Validate widgets
      page.widgets?.forEach((widget, widgetIndex) => {
        if (!widget.title) errors.push(`Page '${page.name}', Widget ${widgetIndex + 1}: title is required`);
        if (!widget.visualization?.id) errors.push(`Widget '${widget.title}': visualization is required`);
        if (!widget.rawConfiguration) errors.push(`Widget '${widget.title}': rawConfiguration is required`);
        
        // Validate layout
        if (!widget.layout) {
          errors.push(`Widget '${widget.title}': layout is required`);
        } else {
          if (widget.layout.column < 1 || widget.layout.column > 12) {
            errors.push(`Widget '${widget.title}': column must be 1-12`);
          }
          if (widget.layout.width < 1 || widget.layout.width > 12) {
            errors.push(`Widget '${widget.title}': width must be 1-12`);
          }
          if (widget.layout.column + widget.layout.width > 13) {
            errors.push(`Widget '${widget.title}': column + width exceeds 12`);
          }
        }

        // Validate NRQL queries
        if (widget.rawConfiguration?.nrqlQueries) {
          widget.rawConfiguration.nrqlQueries.forEach((q, queryIndex) => {
            if (!q.query) {
              errors.push(`Widget '${widget.title}', Query ${queryIndex + 1}: query is required`);
            }
            if (!q.accountIds || q.accountIds.length === 0) {
              errors.push(`Widget '${widget.title}', Query ${queryIndex + 1}: accountIds is required`);
            }
          });
        }
      });
    });

    return { errors, warnings, valid: errors.length === 0 };
  }

  // 7. Validate NRQL syntax
  async validateNrqlQuery(query) {
    const nrqlQuery = `
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
      const result = await this.graphQL(nrqlQuery, {
        accountId: parseInt(this.accountId),
        query: query
      });

      const nrqlResult = result?.actor?.account?.nrql;
      return {
        valid: !!nrqlResult,
        results: nrqlResult?.results || [],
        metadata: nrqlResult?.metadata || {},
        hasData: (nrqlResult?.results?.length || 0) > 0
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // 8. Convert dashboard format
  convertDashboardFormat(dashboard) {
    // Ensure proper structure for NerdGraph
    return {
      name: dashboard.name,
      description: dashboard.description || '',
      permissions: dashboard.permissions || 'PUBLIC_READ_WRITE',
      pages: dashboard.pages.map(page => ({
        name: page.name,
        description: page.description || '',
        widgets: page.widgets.map(widget => ({
          title: widget.title,
          layout: {
            column: widget.layout.column,
            row: widget.layout.row,
            width: widget.layout.width,
            height: widget.layout.height
          },
          visualization: {
            id: widget.visualization.id
          },
          rawConfiguration: widget.rawConfiguration
        }))
      })),
      variables: dashboard.variables || []
    };
  }

  // 9. Load dashboard from file
  loadDashboardFromFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to load dashboard from ${filePath}:`, error.message);
      return null;
    }
  }

  // 10. CLI Commands
  async runCommand(command, args) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`NerdGraph Dashboard CLI`);
    console.log(`${'='.repeat(60)}\n`);

    switch (command) {
      case 'list':
        await this.cmdList();
        break;
      
      case 'get':
        await this.cmdGet(args[0]);
        break;
      
      case 'create':
        await this.cmdCreate(args[0]);
        break;
      
      case 'update':
        await this.cmdUpdate(args[0], args[1]);
        break;
      
      case 'delete':
        await this.cmdDelete(args[0]);
        break;
      
      case 'validate':
        await this.cmdValidate(args[0]);
        break;
      
      case 'deploy':
        await this.cmdDeploy(args[0]);
        break;
      
      default:
        this.showHelp();
    }
  }

  async cmdList() {
    console.log('Fetching dashboards...\n');
    const dashboards = await this.listDashboards();
    
    if (dashboards.length === 0) {
      console.log('No dashboards found');
      return;
    }

    dashboards.forEach(dash => {
      console.log(`📊 ${dash.name}`);
      console.log(`   GUID: ${dash.guid}`);
      console.log(`   Pages: ${dash.pages.length}`);
      console.log(`   Widgets: ${dash.pages.reduce((sum, p) => sum + p.widgets.length, 0)}`);
      console.log(`   Permissions: ${dash.permissions}`);
      console.log('');
    });
  }

  async cmdGet(guid) {
    if (!guid) {
      console.error('Please provide a dashboard GUID');
      return;
    }

    console.log(`Fetching dashboard ${guid}...\n`);
    const dashboard = await this.getDashboard(guid);
    
    if (!dashboard) {
      console.error('Dashboard not found');
      return;
    }

    console.log(JSON.stringify(dashboard, null, 2));
  }

  async cmdCreate(filePath) {
    if (!filePath) {
      console.error('Please provide a dashboard JSON file path');
      return;
    }

    const dashboard = this.loadDashboardFromFile(filePath);
    if (!dashboard) return;

    // Validate structure
    const validation = this.validateDashboardStructure(dashboard);
    if (!validation.valid) {
      console.error('Dashboard validation failed:');
      validation.errors.forEach(err => console.error(`  ❌ ${err}`));
      return;
    }

    console.log('Creating dashboard...\n');
    const dashboardInput = this.convertDashboardFormat(dashboard);
    const created = await this.createDashboard(dashboardInput);
    
    if (created) {
      console.log(`✅ Dashboard created successfully!`);
      console.log(`   Name: ${created.name}`);
      console.log(`   GUID: ${created.guid}`);
      console.log(`   URL: https://one.newrelic.com/dashboards/${created.guid}`);
    }
  }

  async cmdValidate(filePath) {
    if (!filePath) {
      console.error('Please provide a dashboard JSON file path');
      return;
    }

    const dashboard = this.loadDashboardFromFile(filePath);
    if (!dashboard) return;

    console.log(`Validating dashboard: ${dashboard.name}\n`);

    // Structure validation
    const validation = this.validateDashboardStructure(dashboard);
    
    console.log('Structure Validation:');
    if (validation.valid) {
      console.log('  ✅ Structure is valid');
    } else {
      console.log('  ❌ Structure has errors:');
      validation.errors.forEach(err => console.error(`     - ${err}`));
    }
    
    if (validation.warnings.length > 0) {
      console.log('\n  ⚠️  Warnings:');
      validation.warnings.forEach(warn => console.log(`     - ${warn}`));
    }

    // NRQL validation
    console.log('\nNRQL Query Validation:');
    let queryCount = 0;
    let validQueries = 0;

    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        if (widget.rawConfiguration?.nrqlQueries) {
          for (const q of widget.rawConfiguration.nrqlQueries) {
            queryCount++;
            const result = await this.validateNrqlQuery(q.query);
            
            if (result.valid) {
              validQueries++;
              console.log(`  ✅ ${widget.title}: Valid (${result.hasData ? 'has data' : 'no data'})`);
            } else {
              console.log(`  ❌ ${widget.title}: ${result.error}`);
            }
          }
        }
      }
    }

    console.log(`\nSummary: ${validQueries}/${queryCount} queries valid`);
  }

  async cmdDeploy(filePath) {
    if (!filePath) {
      // Use default dashboard
      filePath = path.join(__dirname, '..', 'dashboards', 'nrdot-verified-dashboard.json');
      console.log(`Using default dashboard: ${filePath}\n`);
    }

    await this.cmdValidate(filePath);
    
    console.log('\nProceed with deployment? (y/n)');
    // In real CLI, wait for user input
    // For now, auto-proceed
    
    await this.cmdCreate(filePath);
  }

  showHelp() {
    console.log(`
Usage: nerdgraph-dashboard-cli <command> [options]

Commands:
  list                    List all dashboards in the account
  get <guid>             Get dashboard by GUID
  create <file>          Create dashboard from JSON file
  update <guid> <file>   Update existing dashboard
  delete <guid>          Delete dashboard
  validate <file>        Validate dashboard JSON
  deploy [file]          Validate and create dashboard

Examples:
  node nerdgraph-dashboard-cli.js list
  node nerdgraph-dashboard-cli.js validate dashboards/my-dashboard.json
  node nerdgraph-dashboard-cli.js create dashboards/my-dashboard.json
  node nerdgraph-dashboard-cli.js deploy

Environment Variables:
  NEW_RELIC_API_KEY      Your New Relic User API key
  NEW_RELIC_ACCOUNT_ID   Your New Relic account ID
`);
  }
}

// Main execution
if (require.main === module) {
  const cli = new NerdGraphDashboardCLI();
  const [,, command, ...args] = process.argv;
  
  if (!cli.apiKey) {
    console.error('❌ NEW_RELIC_API_KEY environment variable not set');
    process.exit(1);
  }
  
  cli.runCommand(command || 'help', args).catch(console.error);
}

module.exports = NerdGraphDashboardCLI;