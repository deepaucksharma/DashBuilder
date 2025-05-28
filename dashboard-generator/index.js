const DashboardOrchestrator = require('./lib/dashboard-orchestrator');
const MetricDiscoveryService = require('./lib/metric-discovery');
const MetricClassifier = require('./lib/metric-classifier');
const DashboardTemplateEngine = require('./lib/template-engine');
const QueryBuilder = require('./lib/query-builder');
const LayoutOptimizer = require('./lib/layout-optimizer');

// Main entry point
class DashboardGenerator {
  constructor(config) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }
    
    if (!config.accountId) {
      throw new Error('Account ID is required');
    }
    
    this.orchestrator = new DashboardOrchestrator(config);
  }

  async generate(options) {
    return this.orchestrator.generateDashboard(options);
  }

  async preview(options) {
    return this.orchestrator.previewDashboard(options);
  }

  async deploy(dashboard) {
    return this.orchestrator.deployDashboard(dashboard);
  }

  async discoverMetrics(options) {
    return this.orchestrator.metricDiscovery.discoverMetrics(options);
  }

  async searchMetrics(searchTerm, options) {
    return this.orchestrator.metricDiscovery.searchMetrics(searchTerm, options);
  }

  getAvailableTemplates() {
    return Object.keys(this.orchestrator.templateEngine.templates);
  }

  async generateAndDeploy(options) {
    const result = await this.generate(options);
    const deployed = await this.deploy(result.dashboard);
    
    return {
      ...result,
      deployment: deployed
    };
  }
}

// Export main class and components
module.exports = {
  DashboardGenerator,
  DashboardOrchestrator,
  MetricDiscoveryService,
  MetricClassifier,
  DashboardTemplateEngine,
  QueryBuilder,
  LayoutOptimizer
};

// CLI usage example
if (require.main === module) {
  const dotenv = require('dotenv');
  dotenv.config();
  
  const generator = new DashboardGenerator({
    apiKey: process.env.NEW_RELIC_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID
  });
  
  // Example: Generate a system health dashboard
  async function example() {
    try {
      console.log('Generating dashboard...');
      
      const result = await generator.generate({
        name: 'Auto-Generated System Health',
        description: 'System health metrics dashboard',
        template: 'system-health',
        metrics: {
          include: ['system.*', 'host.*']
        },
        layoutPreference: 'balanced'
      });
      
      console.log('Dashboard generated successfully!');
      console.log(`- Metrics used: ${result.metadata.metricsUsed}`);
      console.log(`- Widgets created: ${result.metadata.widgetsCreated}`);
      console.log(`- Template: ${result.metadata.template}`);
      
      // Deploy if requested
      if (process.argv.includes('--deploy')) {
        console.log('Deploying dashboard...');
        const deployment = await generator.deploy(result.dashboard);
        console.log(`Dashboard deployed successfully!`);
        console.log(`URL: ${deployment.permalink}`);
      }
      
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
  
  example();
}