#!/usr/bin/env node

/**
 * Unified Dashboard Builder
 * A programmatic approach to validate and create NRQL queries and dashboards
 * using existing services and GraphQL schema knowledge
 */

const axios = require('axios');
const Joi = require('joi');

// Import existing services
const SchemaService = require('./services/schema.service');
const NRQLService = require('./services/nrql.service');
const DashboardService = require('./services/dashboard.service');
const APIClient = require('./core/api-client');
const validators = require('./utils/validators');

class UnifiedDashboardBuilder {
  constructor(config = {}) {
    this.accountId = config.accountId || process.env.NEW_RELIC_ACCOUNT_ID;
    this.apiKey = config.apiKey || process.env.NEW_RELIC_API_KEY;
    
    // Initialize services
    this.schema = new SchemaService();
    this.nrql = new NRQLService();
    this.dashboard = new DashboardService();
    this.api = new APIClient({
      apiKey: this.apiKey,
      accountId: this.accountId
    });
    
    // GraphQL schema for dashboard creation
    this.dashboardSchema = {
      widget: Joi.object({
        title: Joi.string().required(),
        layout: Joi.object({
          column: Joi.number().min(1).max(12).required(),
          row: Joi.number().min(1).required(),
          width: Joi.number().min(1).max(12).required(),
          height: Joi.number().min(1).required()
        }).required(),
        linkedEntityGuids: Joi.array().items(Joi.string()).allow(null),
        visualization: Joi.object({
          id: Joi.string().valid(
            'viz.line', 'viz.area', 'viz.bar', 'viz.billboard',
            'viz.table', 'viz.pie', 'viz.heatmap', 'viz.histogram',
            'viz.json', 'viz.markdown'
          ).required()
        }).required(),
        rawConfiguration: Joi.object({
          nrqlQueries: Joi.array().items(
            Joi.object({
              accountId: Joi.number().required(),
              query: Joi.string().required()
            })
          ),
          text: Joi.string(),
          facet: Joi.object({
            showOtherSeries: Joi.boolean()
          }),
          legend: Joi.object({
            enabled: Joi.boolean()
          }),
          yAxisLeft: Joi.object({
            zero: Joi.boolean(),
            min: Joi.number(),
            max: Joi.number()
          }),
          thresholds: Joi.array().items(
            Joi.object({
              alertSeverity: Joi.string().valid('WARNING', 'CRITICAL'),
              value: Joi.number()
            })
          )
        }).required()
      }),
      
      page: Joi.object({
        name: Joi.string().required(),
        description: Joi.string(),
        widgets: Joi.array().items(Joi.link('#widget')).required()
      }),
      
      dashboard: Joi.object({
        name: Joi.string().required(),
        description: Joi.string(),
        permissions: Joi.string().valid(
          'PUBLIC_READ_ONLY', 'PUBLIC_READ_WRITE', 'PRIVATE'
        ).default('PUBLIC_READ_WRITE'),
        pages: Joi.array().items(Joi.link('#page')).min(1).required()
      })
    };
  }

  /**
   * Build a dashboard with full validation and optimization
   */
  async buildDashboard(config) {
    console.log('🏗️  Building dashboard with unified approach...\n');
    
    try {
      // Step 1: Discover and validate metrics
      const metrics = await this.discoverAndValidateMetrics(config.metrics);
      
      // Step 2: Generate optimized NRQL queries
      const queries = await this.generateOptimizedQueries(metrics, config);
      
      // Step 3: Select appropriate visualizations
      const widgets = await this.createWidgets(queries, config);
      
      // Step 4: Optimize layout
      const optimizedLayout = await this.optimizeLayout(widgets);
      
      // Step 5: Build dashboard structure
      const dashboard = await this.assembleDashboard(config, optimizedLayout);
      
      // Step 6: Validate against schema
      await this.validateDashboard(dashboard);
      
      // Step 7: Deploy dashboard
      const result = await this.deployDashboard(dashboard);
      
      return result;
      
    } catch (error) {
      console.error('❌ Dashboard build failed:', error.message);
      throw error;
    }
  }

  /**
   * Discover and validate metrics
   */
  async discoverAndValidateMetrics(metricPatterns) {
    console.log('📊 Discovering metrics...');
    const discoveredMetrics = new Map();
    
    for (const pattern of metricPatterns) {
      // Use schema service to discover metrics
      const metrics = await this.schema.discoverMetrics({
        pattern,
        limit: 100
      });
      
      for (const metric of metrics) {
        // Get metric metadata
        const metadata = await this.schema.getMetricMetadata(metric.name);
        
        // Validate metric exists and has data
        const validation = await this.validateMetricHasData(metric.name);
        
        if (validation.hasData) {
          discoveredMetrics.set(metric.name, {
            ...metric,
            ...metadata,
            sampleQuery: validation.sampleQuery,
            dataType: this.inferDataType(metadata)
          });
        }
      }
    }
    
    console.log(`✅ Discovered ${discoveredMetrics.size} valid metrics\n`);
    return discoveredMetrics;
  }

  /**
   * Generate optimized NRQL queries
   */
  async generateOptimizedQueries(metrics, config) {
    console.log('🔧 Generating optimized NRQL queries...');
    const queries = [];
    
    for (const [metricName, metadata] of metrics) {
      // Determine aggregation based on metric type
      const aggregation = this.selectAggregation(metadata);
      
      // Build base query
      let query = `SELECT ${aggregation}(\`${metricName}\`) FROM Metric`;
      
      // Add WHERE clauses if needed
      if (config.filters) {
        const whereClause = this.buildWhereClause(config.filters);
        query += ` WHERE ${whereClause}`;
      }
      
      // Add time range
      query += ` ${config.timeRange || 'SINCE 1 hour ago'}`;
      
      // Add FACET if appropriate
      if (metadata.dimensions?.length > 0 && config.enableFacets) {
        const facetDimension = this.selectBestFacet(metadata.dimensions);
        query += ` FACET ${facetDimension}`;
      }
      
      // Validate and optimize query
      const validation = await this.nrql.validate(query);
      if (!validation.isValid) {
        console.warn(`⚠️  Query validation failed for ${metricName}: ${validation.errors.join(', ')}`);
        continue;
      }
      
      // Optimize query
      const optimized = await this.nrql.optimize(query);
      
      queries.push({
        metric: metricName,
        query: optimized.query || query,
        metadata,
        performance: await this.nrql.analyzePerformance(query)
      });
    }
    
    console.log(`✅ Generated ${queries.length} optimized queries\n`);
    return queries;
  }

  /**
   * Create widgets with appropriate visualizations
   */
  async createWidgets(queries, config) {
    console.log('📈 Creating widgets...');
    const widgets = [];
    let row = 1;
    let column = 1;
    
    for (const queryData of queries) {
      const { metric, query, metadata } = queryData;
      
      // Select visualization based on metric characteristics
      const visualization = this.selectVisualization(metadata, query);
      
      // Determine widget size
      const size = this.determineWidgetSize(visualization, metadata.importance);
      
      // Create widget configuration
      const widget = {
        title: this.generateWidgetTitle(metric, metadata),
        layout: {
          column,
          row,
          width: size.width,
          height: size.height
        },
        linkedEntityGuids: null,
        visualization: {
          id: visualization
        },
        rawConfiguration: {
          nrqlQueries: [{
            accountId: parseInt(this.accountId),
            query: query
          }]
        }
      };
      
      // Add visualization-specific configuration
      this.addVisualizationConfig(widget, visualization, metadata);
      
      widgets.push(widget);
      
      // Update position for next widget
      column += size.width;
      if (column > 12) {
        column = 1;
        row += size.height;
      }
    }
    
    console.log(`✅ Created ${widgets.length} widgets\n`);
    return widgets;
  }

  /**
   * Optimize widget layout
   */
  async optimizeLayout(widgets) {
    console.log('🎨 Optimizing layout...');
    
    // Group related widgets
    const groups = this.groupRelatedWidgets(widgets);
    
    // Sort by importance
    const sorted = this.sortByImportance(groups);
    
    // Reflow layout
    const optimized = this.reflowLayout(sorted);
    
    console.log('✅ Layout optimized\n');
    return optimized;
  }

  /**
   * Assemble final dashboard
   */
  async assembleDashboard(config, widgets) {
    console.log('🔨 Assembling dashboard...');
    
    const dashboard = {
      name: config.name,
      description: config.description || `Generated dashboard for ${config.name}`,
      permissions: config.permissions || 'PUBLIC_READ_WRITE',
      pages: [{
        name: config.pageName || 'Overview',
        description: config.pageDescription || 'Main dashboard view',
        widgets: widgets
      }]
    };
    
    // Add additional pages if configured
    if (config.additionalPages) {
      for (const page of config.additionalPages) {
        dashboard.pages.push(await this.createAdditionalPage(page));
      }
    }
    
    console.log('✅ Dashboard assembled\n');
    return dashboard;
  }

  /**
   * Validate dashboard against schema
   */
  async validateDashboard(dashboard) {
    console.log('✔️  Validating dashboard...');
    
    const { error } = this.dashboardSchema.dashboard.validate(dashboard, {
      abortEarly: false,
      allowUnknown: false
    });
    
    if (error) {
      const errors = error.details.map(d => d.message);
      throw new Error(`Dashboard validation failed:\n${errors.join('\n')}`);
    }
    
    // Additional semantic validation
    await this.validateSemantics(dashboard);
    
    console.log('✅ Dashboard validation passed\n');
  }

  /**
   * Deploy dashboard to New Relic
   */
  async deployDashboard(dashboard) {
    console.log('🚀 Deploying dashboard...');
    
    try {
      const mutation = `
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
      `;
      
      const result = await this.api.query(mutation, {
        accountId: parseInt(this.accountId),
        dashboard: dashboard
      });
      
      if (result.dashboardCreate?.errors?.length > 0) {
        throw new Error(`Deployment errors: ${JSON.stringify(result.dashboardCreate.errors)}`);
      }
      
      const entity = result.dashboardCreate.entityResult;
      console.log(`✅ Dashboard deployed successfully!`);
      console.log(`📊 Name: ${entity.name}`);
      console.log(`🆔 GUID: ${entity.guid}`);
      console.log(`🔗 URL: https://one.newrelic.com/dashboards/${entity.guid}\n`);
      
      return entity;
      
    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  
  async validateMetricHasData(metricName) {
    const query = `SELECT count(*) FROM Metric WHERE metricName = '${metricName}' SINCE 1 hour ago`;
    
    try {
      const result = await this.api.nrqlQuery(query);
      return {
        hasData: result.results?.[0]?.count > 0,
        sampleQuery: query
      };
    } catch (error) {
      return { hasData: false, error: error.message };
    }
  }
  
  inferDataType(metadata) {
    if (metadata.unit?.includes('percent')) return 'percentage';
    if (metadata.unit?.includes('bytes')) return 'bytes';
    if (metadata.unit?.includes('seconds')) return 'duration';
    if (metadata.type === 'counter') return 'rate';
    return 'gauge';
  }
  
  selectAggregation(metadata) {
    switch (metadata.type) {
      case 'counter': return 'rate';
      case 'gauge': return 'average';
      case 'histogram': return 'percentile';
      case 'summary': return 'average';
      default: return 'latest';
    }
  }
  
  selectVisualization(metadata, query) {
    // Time series data
    if (query.includes('TIMESERIES')) {
      if (metadata.type === 'counter') return 'viz.area';
      return 'viz.line';
    }
    
    // Faceted data
    if (query.includes('FACET')) {
      if (query.includes('LIMIT 1')) return 'viz.billboard';
      return 'viz.bar';
    }
    
    // Single value
    return 'viz.billboard';
  }
  
  determineWidgetSize(visualization, importance = 'medium') {
    const sizes = {
      'viz.billboard': { width: 4, height: 3 },
      'viz.line': { width: 6, height: 3 },
      'viz.area': { width: 6, height: 3 },
      'viz.bar': { width: 6, height: 3 },
      'viz.table': { width: 12, height: 4 },
      'viz.pie': { width: 4, height: 3 },
      'viz.heatmap': { width: 12, height: 4 }
    };
    
    const size = sizes[visualization] || { width: 6, height: 3 };
    
    // Adjust for importance
    if (importance === 'high' && size.width < 12) {
      size.width = Math.min(size.width * 1.5, 12);
    }
    
    return size;
  }
  
  generateWidgetTitle(metric, metadata) {
    // Clean up metric name
    let title = metric
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    
    // Add unit if available
    if (metadata.unit) {
      title += ` (${metadata.unit})`;
    }
    
    return title;
  }
  
  addVisualizationConfig(widget, visualization, metadata) {
    switch (visualization) {
      case 'viz.line':
      case 'viz.area':
        widget.rawConfiguration.legend = { enabled: true };
        widget.rawConfiguration.yAxisLeft = { zero: true };
        break;
        
      case 'viz.billboard':
        if (metadata.thresholds) {
          widget.rawConfiguration.thresholds = metadata.thresholds.map(t => ({
            alertSeverity: t.severity.toUpperCase(),
            value: t.value
          }));
        }
        break;
        
      case 'viz.bar':
        widget.rawConfiguration.facet = { showOtherSeries: false };
        break;
    }
  }
  
  async validateSemantics(dashboard) {
    // Check for duplicate widgets
    const titles = new Set();
    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        if (titles.has(widget.title)) {
          throw new Error(`Duplicate widget title: ${widget.title}`);
        }
        titles.add(widget.title);
      }
    }
    
    // Validate queries can execute
    for (const page of dashboard.pages) {
      for (const widget of page.widgets) {
        const query = widget.rawConfiguration.nrqlQueries?.[0]?.query;
        if (query) {
          const result = await this.nrql.validate(query);
          if (!result.isValid) {
            throw new Error(`Invalid query in widget '${widget.title}': ${result.errors.join(', ')}`);
          }
        }
      }
    }
  }
}

// CLI interface
if (require.main === module) {
  const builder = new UnifiedDashboardBuilder();
  
  // Example usage
  async function example() {
    const dashboard = await builder.buildDashboard({
      name: 'Unified System Metrics',
      description: 'Comprehensive system monitoring dashboard',
      metrics: [
        'system.cpu.*',
        'system.memory.*',
        'system.disk.*',
        'system.network.*'
      ],
      timeRange: 'SINCE 1 hour ago',
      enableFacets: true,
      filters: {
        hostType: 'production'
      }
    });
    
    console.log('Dashboard created:', dashboard);
  }
  
  example().catch(console.error);
}

module.exports = UnifiedDashboardBuilder;