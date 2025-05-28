#!/usr/bin/env node

/**
 * NR1 App Generator
 * Generates complete New Relic One applications from configurations
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Import existing services
const SchemaService = require('../src/services/schema.service');
const NRQLService = require('../src/services/nrql.service');
const DashboardService = require('../src/services/dashboard.service');

class NR1AppGenerator {
  constructor(config = {}) {
    this.config = {
      templatesDir: path.join(__dirname, 'templates'),
      outputDir: config.outputDir || './generated-apps',
      ...config
    };
    
    // Initialize services
    this.schemaService = new SchemaService();
    this.nrqlService = new NRQLService();
    this.dashboardService = new DashboardService();
  }

  /**
   * Generate a complete NR1 app
   */
  async generateApp(appConfig) {
    console.log(`🚀 Generating NR1 App: ${appConfig.name}`);
    
    try {
      // 1. Validate configuration
      await this.validateConfig(appConfig);
      
      // 2. Generate app structure
      const appStructure = await this.generateAppStructure(appConfig);
      
      // 3. Generate dashboards
      const dashboards = await this.generateDashboards(appConfig);
      
      // 4. Transform dashboards to components
      const components = await this.transformDashboardsToComponents(dashboards);
      
      // 5. Generate state management
      const stateManagement = await this.generateStateManagement(appConfig, components);
      
      // 6. Generate nerdlets
      const nerdlets = await this.generateNerdlets(appConfig, components, stateManagement);
      
      // 7. Write files
      await this.writeAppFiles(appConfig, appStructure, nerdlets);
      
      // 8. Validate generated app
      await this.validateGeneratedApp(appConfig.name);
      
      console.log(`✅ Successfully generated NR1 app: ${appConfig.name}`);
      return {
        appPath: path.join(this.config.outputDir, appConfig.name),
        uuid: appStructure.uuid
      };
      
    } catch (error) {
      console.error(`❌ Error generating app: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate app configuration
   */
  async validateConfig(appConfig) {
    if (!appConfig.name) throw new Error('App name is required');
    if (!appConfig.accountId) throw new Error('Account ID is required');
    
    // Validate metrics exist
    if (appConfig.metrics) {
      for (const metric of appConfig.metrics) {
        const exists = await this.schemaService.checkMetricExists(metric);
        if (!exists) {
          console.warn(`⚠️  Metric '${metric}' not found in account`);
        }
      }
    }
  }

  /**
   * Generate app file structure
   */
  async generateAppStructure(appConfig) {
    const uuid = uuidv4();
    
    return {
      uuid,
      nr1Json: {
        schemaType: "NERDPACK",
        id: uuid,
        displayName: appConfig.displayName || appConfig.name,
        description: appConfig.description || `Generated NR1 app: ${appConfig.name}`
      },
      packageJson: {
        name: appConfig.name.toLowerCase().replace(/\s+/g, '-'),
        version: "1.0.0",
        scripts: {
          start: "nr1 nerdpack:serve",
          build: "nr1 nerdpack:build",
          test: "jest",
          "eslint-check": "eslint nerdlets/",
          validate: "nr1 nerdpack:validate"
        },
        nr1: {
          uuid: uuid
        },
        dependencies: {
          "react": "^17.0.2",
          "react-dom": "^17.0.2",
          "prop-types": "^15.8.1"
        },
        devDependencies: {
          "jest": "^29.5.0",
          "@testing-library/react": "^13.4.0",
          "eslint": "^8.42.0"
        }
      }
    };
  }

  /**
   * Generate dashboards using existing dashboard service
   */
  async generateDashboards(appConfig) {
    const dashboards = [];
    
    // Use template-based generation
    if (appConfig.template) {
      const template = await this.loadTemplate(appConfig.template);
      dashboards.push(...template.dashboards);
    }
    
    // Generate custom dashboards
    if (appConfig.dashboards) {
      for (const dashboardConfig of appConfig.dashboards) {
        const dashboard = await this.dashboardService.generateDashboard({
          name: dashboardConfig.name,
          metrics: dashboardConfig.metrics || appConfig.metrics,
          template: dashboardConfig.template
        });
        dashboards.push(dashboard);
      }
    }
    
    return dashboards;
  }

  /**
   * Transform dashboard widgets into React components
   */
  async transformDashboardsToComponents(dashboards) {
    const components = new Map();
    
    for (const dashboard of dashboards) {
      for (const page of dashboard.pages || []) {
        for (const widget of page.widgets || []) {
          const componentName = this.generateComponentName(widget);
          const component = await this.generateComponent(widget);
          components.set(componentName, component);
        }
      }
    }
    
    return components;
  }

  /**
   * Generate a React component from a widget
   */
  async generateComponent(widget) {
    const { title, visualization, rawConfiguration } = widget;
    const componentType = this.mapVisualizationToComponent(visualization?.id);
    
    return {
      name: this.generateComponentName(widget),
      type: componentType,
      imports: this.getComponentImports(componentType),
      props: this.extractWidgetProps(widget),
      query: rawConfiguration?.nrqlQueries?.[0]?.query,
      render: await this.generateComponentRender(widget)
    };
  }

  /**
   * Generate component render method
   */
  async generateComponentRender(widget) {
    const { visualization, rawConfiguration } = widget;
    const query = rawConfiguration?.nrqlQueries?.[0]?.query;
    
    if (!query) {
      return this.generateStaticComponent(widget);
    }
    
    // Validate NRQL query
    const validation = await this.nrqlService.validate(query);
    if (!validation.isValid) {
      console.warn(`⚠️  Invalid NRQL in widget: ${validation.errors.join(', ')}`);
    }
    
    return `
export default function ${this.generateComponentName(widget)}({ accountId, timeRange }) {
  return (
    <Card>
      <CardHeader title="${widget.title}" />
      <CardBody>
        <NrqlQuery
          query={\`${query}\`}
          accountIds={[accountId]}
          timeRange={timeRange}
        >
          {({ data, loading, error }) => {
            if (loading) return <Spinner />;
            if (error) return <InlineMessage type={InlineMessage.TYPE.ERROR} message={error.message} />;
            
            return <${this.mapVisualizationToComponent(visualization?.id)} data={data} />;
          }}
        </NrqlQuery>
      </CardBody>
    </Card>
  );
}`;
  }

  /**
   * Generate state management hooks
   */
  async generateStateManagement(appConfig, components) {
    const hooks = new Map();
    
    // Generate data fetching hooks
    if (appConfig.features?.realTimeUpdates) {
      hooks.set('useRealTimeData', this.generateRealTimeHook(appConfig));
    }
    
    // Generate profile management if needed
    if (appConfig.features?.profileManagement) {
      hooks.set('useProfileManagement', this.generateProfileHook());
    }
    
    // Generate custom hooks based on components
    for (const [name, component] of components) {
      if (component.requiresState) {
        const hookName = `use${name}State`;
        hooks.set(hookName, this.generateComponentStateHook(component));
      }
    }
    
    return hooks;
  }

  /**
   * Generate nerdlets
   */
  async generateNerdlets(appConfig, components, stateManagement) {
    const nerdlets = [];
    
    // Main nerdlet
    const mainNerdlet = {
      name: 'home',
      displayName: 'Home',
      description: 'Main view',
      components: Array.from(components.values()),
      hooks: Array.from(stateManagement.values()),
      render: this.generateMainNerdletRender(appConfig, components)
    };
    
    nerdlets.push(mainNerdlet);
    
    // Additional nerdlets based on features
    if (appConfig.features?.settings) {
      nerdlets.push(this.generateSettingsNerdlet(appConfig));
    }
    
    return nerdlets;
  }

  /**
   * Write all app files to disk
   */
  async writeAppFiles(appConfig, appStructure, nerdlets) {
    const appDir = path.join(this.config.outputDir, appConfig.name);
    
    // Create directory structure
    await this.createDirectoryStructure(appDir);
    
    // Write root files
    await fs.writeFile(
      path.join(appDir, 'nr1.json'),
      JSON.stringify(appStructure.nr1Json, null, 2)
    );
    
    await fs.writeFile(
      path.join(appDir, 'package.json'),
      JSON.stringify(appStructure.packageJson, null, 2)
    );
    
    // Write nerdlets
    for (const nerdlet of nerdlets) {
      await this.writeNerdlet(appDir, nerdlet);
    }
    
    // Write catalog files
    await this.writeCatalogFiles(appDir, appConfig);
    
    // Write launchers
    await this.writeLaunchers(appDir, appConfig);
  }

  /**
   * Helper methods
   */
  
  generateComponentName(widget) {
    return widget.title
      .replace(/[^a-zA-Z0-9]/g, '')
      .replace(/^(.)/, (match) => match.toUpperCase());
  }
  
  mapVisualizationToComponent(vizId) {
    const mapping = {
      'viz.line': 'LineChart',
      'viz.area': 'AreaChart',
      'viz.bar': 'BarChart',
      'viz.billboard': 'BillboardChart',
      'viz.table': 'TableChart',
      'viz.pie': 'PieChart',
      'viz.heatmap': 'HeatmapChart'
    };
    return mapping[vizId] || 'LineChart';
  }
  
  getComponentImports(componentType) {
    return [
      'React',
      `{ ${componentType}, Card, CardHeader, CardBody, NrqlQuery, Spinner, InlineMessage }`,
      'prop-types'
    ];
  }
  
  async createDirectoryStructure(appDir) {
    const dirs = [
      appDir,
      path.join(appDir, 'nerdlets'),
      path.join(appDir, 'launchers'),
      path.join(appDir, 'catalog'),
      path.join(appDir, 'lib'),
      path.join(appDir, 'lib', 'hooks'),
      path.join(appDir, 'lib', 'components'),
      path.join(appDir, 'lib', 'utils')
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
  
  async loadTemplate(templateName) {
    const templatePath = path.join(this.config.templatesDir, `${templateName}.json`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    return JSON.parse(templateContent);
  }
}

// CLI interface
if (require.main === module) {
  const generator = new NR1AppGenerator();
  
  // Example usage
  const exampleConfig = {
    name: "My Monitoring App",
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    template: "monitoring-console",
    metrics: ["system.cpu.utilization", "system.memory.usage"],
    features: {
      realTimeUpdates: true,
      profileManagement: true,
      settings: true
    }
  };
  
  generator.generateApp(exampleConfig)
    .then(result => console.log('App generated at:', result.appPath))
    .catch(error => console.error('Generation failed:', error));
}

module.exports = NR1AppGenerator;