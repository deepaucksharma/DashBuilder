/**
 * NR1 to Dashboard Migration Service
 * Helps migrate from deprecated NR1 apps to pure dashboards
 */

const fs = require('fs').promises;
const path = require('path');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const DashboardService = require('./services/dashboard.service');
const EnhancedNRQLService = require('./enhanced-nrql-service');

class NR1MigrationService {
  constructor() {
    this.dashboardService = new DashboardService();
    this.nrqlService = new EnhancedNRQLService();
    
    // Component to widget mapping
    this.componentMapping = {
      'LineChart': 'viz.line',
      'AreaChart': 'viz.area',
      'BarChart': 'viz.bar',
      'BillboardChart': 'viz.billboard',
      'TableChart': 'viz.table',
      'PieChart': 'viz.pie',
      'HeatmapChart': 'viz.heatmap',
      'ScatterChart': 'viz.scatter',
      'HistogramChart': 'viz.histogram'
    };
    
    // Features that cannot be migrated
    this.nonMigratableFeatures = [
      'NerdStorage',
      'UserStorage',
      'AccountStorage',
      'EntityStorage',
      'navigation',
      'Toast',
      'Modal',
      'user interactions',
      'state management',
      'custom hooks'
    ];
  }

  /**
   * Analyze NR1 app for migration feasibility
   */
  async analyzeApp(appPath) {
    console.log(`🔍 Analyzing NR1 app at ${appPath}...`);
    
    const analysis = {
      appPath,
      analyzedAt: new Date().toISOString(),
      nerdlets: [],
      components: [],
      queries: [],
      features: {
        migratable: [],
        nonMigratable: [],
        requiresManual: []
      },
      complexity: 'low',
      estimatedEffort: '1 day',
      migrationScore: 100
    };
    
    try {
      // Read app configuration
      const nr1Config = await this.readJson(path.join(appPath, 'nr1.json'));
      const packageJson = await this.readJson(path.join(appPath, 'package.json'));
      
      analysis.appName = packageJson.name;
      analysis.appId = nr1Config.id;
      
      // Analyze nerdlets
      const nerdletsPath = path.join(appPath, 'nerdlets');
      const nerdlets = await fs.readdir(nerdletsPath);
      
      for (const nerdlet of nerdlets) {
        const nerdletAnalysis = await this.analyzeNerdlet(
          path.join(nerdletsPath, nerdlet)
        );
        analysis.nerdlets.push(nerdletAnalysis);
        
        // Aggregate findings
        analysis.components.push(...nerdletAnalysis.components);
        analysis.queries.push(...nerdletAnalysis.queries);
        analysis.features.migratable.push(...nerdletAnalysis.migratable);
        analysis.features.nonMigratable.push(...nerdletAnalysis.nonMigratable);
      }
      
      // Calculate complexity and effort
      analysis.complexity = this.calculateComplexity(analysis);
      analysis.estimatedEffort = this.estimateEffort(analysis);
      analysis.migrationScore = this.calculateMigrationScore(analysis);
      
      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis);
      
    } catch (error) {
      analysis.error = error.message;
      analysis.migrationScore = 0;
    }
    
    return analysis;
  }

  /**
   * Analyze individual nerdlet
   */
  async analyzeNerdlet(nerdletPath) {
    const analysis = {
      path: nerdletPath,
      name: path.basename(nerdletPath),
      components: [],
      queries: [],
      migratable: [],
      nonMigratable: [],
      hooks: [],
      stateComplexity: 'none'
    };
    
    try {
      // Read main index file
      const indexPath = path.join(nerdletPath, 'index.js');
      const code = await fs.readFile(indexPath, 'utf-8');
      
      // Parse JavaScript/JSX
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'classProperties']
      });
      
      // Traverse AST to extract information
      traverse(ast, {
        // Find NR1 component usage
        JSXElement(path) {
          const elementName = path.node.openingElement.name.name;
          
          if (analysis.componentMapping[elementName]) {
            analysis.components.push({
              type: elementName,
              props: extractProps(path.node.openingElement.attributes),
              migratable: true
            });
            analysis.migratable.push(`${elementName} component`);
          } else if (elementName.startsWith('Nerd')) {
            analysis.components.push({
              type: elementName,
              migratable: false,
              reason: 'NR1-specific component'
            });
            analysis.nonMigratable.push(elementName);
          }
        },
        
        // Find NRQL queries
        StringLiteral(path) {
          const value = path.node.value;
          if (value.includes('SELECT') && value.includes('FROM')) {
            analysis.queries.push({
              query: value,
              valid: true // Will validate later
            });
          }
        },
        
        // Find hooks usage
        CallExpression(path) {
          if (path.node.callee.name?.startsWith('use')) {
            analysis.hooks.push(path.node.callee.name);
            if (path.node.callee.name === 'useState' || 
                path.node.callee.name === 'useReducer') {
              analysis.stateComplexity = 'simple';
            }
          }
        }
      });
      
      // Determine state complexity
      if (analysis.hooks.length > 5) {
        analysis.stateComplexity = 'complex';
      } else if (analysis.hooks.length > 2) {
        analysis.stateComplexity = 'moderate';
      }
      
    } catch (error) {
      analysis.parseError = error.message;
    }
    
    return analysis;
  }

  /**
   * Migrate NR1 app to dashboard
   */
  async migrateToMashboard(appPath, options = {}) {
    const {
      preserveLayout = true,
      includeReport = true,
      targetAccountId
    } = options;
    
    console.log(`🚀 Starting migration of ${appPath}...`);
    
    // First analyze the app
    const analysis = await this.analyzeApp(appPath);
    
    if (analysis.migrationScore < 30) {
      throw new Error(
        `Migration score too low (${analysis.migrationScore}%). ` +
        `Manual migration recommended.`
      );
    }
    
    // Create dashboard structure
    const dashboard = {
      name: analysis.appName + ' (Migrated)',
      description: `Migrated from NR1 app ${analysis.appId} on ${new Date().toISOString()}`,
      permissions: 'PUBLIC_READ_WRITE',
      pages: []
    };
    
    // Convert each nerdlet to a dashboard page
    for (const nerdlet of analysis.nerdlets) {
      const page = await this.convertNerdletToPage(nerdlet, analysis);
      if (page.widgets.length > 0) {
        dashboard.pages.push(page);
      }
    }
    
    // Optimize layout
    if (preserveLayout) {
      dashboard.pages = dashboard.pages.map(page => 
        this.optimizePageLayout(page)
      );
    }
    
    // Generate migration report
    const migrationResult = {
      success: true,
      dashboard,
      analysis,
      warnings: [],
      lostFeatures: analysis.features.nonMigratable
    };
    
    // Add warnings for complex features
    if (analysis.stateComplexity === 'complex') {
      migrationResult.warnings.push(
        'Complex state management detected. Dashboard will not maintain state between views.'
      );
    }
    
    if (analysis.features.nonMigratable.length > 0) {
      migrationResult.warnings.push(
        `${analysis.features.nonMigratable.length} features could not be migrated`
      );
    }
    
    // Save report if requested
    if (includeReport) {
      await this.saveMigrationReport(appPath, migrationResult);
    }
    
    return migrationResult;
  }

  /**
   * Convert nerdlet to dashboard page
   */
  async convertNerdletToPage(nerdlet, appAnalysis) {
    const page = {
      name: this.humanizeName(nerdlet.name),
      description: `Migrated from nerdlet: ${nerdlet.name}`,
      widgets: []
    };
    
    let row = 1;
    let column = 1;
    
    // Convert each component to a widget
    for (const component of nerdlet.components) {
      if (!component.migratable) continue;
      
      const widget = await this.convertComponentToWidget(
        component,
        { row, column }
      );
      
      if (widget) {
        page.widgets.push(widget);
        
        // Update position
        column += widget.layout.width;
        if (column > 12) {
          column = 1;
          row += widget.layout.height;
        }
      }
    }
    
    // Add widgets for orphaned queries
    const componentQueries = new Set(
      nerdlet.components.flatMap(c => c.props?.query || [])
    );
    
    for (const queryObj of nerdlet.queries) {
      if (!componentQueries.has(queryObj.query)) {
        // Create a widget for this orphaned query
        const widget = await this.createWidgetFromQuery(
          queryObj.query,
          { row, column }
        );
        
        if (widget) {
          page.widgets.push(widget);
          column += widget.layout.width;
          if (column > 12) {
            column = 1;
            row += widget.layout.height;
          }
        }
      }
    }
    
    return page;
  }

  /**
   * Convert NR1 component to dashboard widget
   */
  async convertComponentToWidget(component, position) {
    const { type, props } = component;
    const vizType = this.componentMapping[type];
    
    if (!vizType) return null;
    
    const widget = {
      title: props.title || `${type} Widget`,
      layout: {
        column: position.column,
        row: position.row,
        width: this.getDefaultWidth(vizType),
        height: this.getDefaultHeight(vizType)
      },
      linkedEntityGuids: null,
      visualization: {
        id: vizType
      },
      rawConfiguration: {}
    };
    
    // Handle NRQL query
    if (props.query) {
      // Validate and optimize query
      const validation = await this.nrqlService.validate(props.query);
      if (validation.isValid) {
        const optimized = await this.nrqlService.optimize(props.query);
        
        widget.rawConfiguration.nrqlQueries = [{
          accountId: parseInt(props.accountId || process.env.NEW_RELIC_ACCOUNT_ID),
          query: optimized.query || props.query
        }];
      } else {
        console.warn(`⚠️  Invalid query in ${type}: ${validation.errors.join(', ')}`);
        return null;
      }
    }
    
    // Map component-specific props
    this.mapComponentProps(widget, type, props);
    
    return widget;
  }

  /**
   * Create widget from standalone query
   */
  async createWidgetFromQuery(query, position) {
    // Analyze query to determine best visualization
    const queryAnalysis = await this.nrqlService.analyzeQuery(query);
    const vizType = this.selectVisualization(queryAnalysis);
    
    return {
      title: this.generateTitleFromQuery(query),
      layout: {
        column: position.column,
        row: position.row,
        width: this.getDefaultWidth(vizType),
        height: this.getDefaultHeight(vizType)
      },
      linkedEntityGuids: null,
      visualization: {
        id: vizType
      },
      rawConfiguration: {
        nrqlQueries: [{
          accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID),
          query: query
        }]
      }
    };
  }

  /**
   * Helper methods
   */
  
  calculateComplexity(analysis) {
    const score = 
      analysis.components.length * 1 +
      analysis.features.nonMigratable.length * 3 +
      (analysis.features.requiresManual?.length || 0) * 2;
    
    if (score < 10) return 'low';
    if (score < 30) return 'medium';
    return 'high';
  }
  
  estimateEffort(analysis) {
    const complexity = analysis.complexity;
    const componentCount = analysis.components.length;
    
    if (complexity === 'low' && componentCount < 10) return '1 day';
    if (complexity === 'medium' || componentCount < 30) return '2-3 days';
    if (complexity === 'high' || componentCount < 50) return '1 week';
    return '2+ weeks';
  }
  
  calculateMigrationScore(analysis) {
    const totalFeatures = 
      analysis.features.migratable.length + 
      analysis.features.nonMigratable.length;
    
    if (totalFeatures === 0) return 100;
    
    const migratablePercent = 
      (analysis.features.migratable.length / totalFeatures) * 100;
    
    // Penalize for complex state
    let penalty = 0;
    if (analysis.stateComplexity === 'complex') penalty = 20;
    else if (analysis.stateComplexity === 'moderate') penalty = 10;
    
    return Math.max(0, Math.round(migratablePercent - penalty));
  }
  
  generateRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.migrationScore < 50) {
      recommendations.push({
        type: 'warning',
        message: 'Consider rebuilding as pure dashboard instead of migration'
      });
    }
    
    if (analysis.features.nonMigratable.includes('NerdStorage')) {
      recommendations.push({
        type: 'alternative',
        feature: 'NerdStorage',
        suggestion: 'Use dashboard variables or external storage'
      });
    }
    
    if (analysis.stateComplexity !== 'none') {
      recommendations.push({
        type: 'limitation',
        message: 'Dashboard cannot maintain state. Consider using filters instead.'
      });
    }
    
    return recommendations;
  }
  
  mapComponentProps(widget, componentType, props) {
    // Map common props
    if (props.legend !== undefined) {
      widget.rawConfiguration.legend = { enabled: props.legend };
    }
    
    if (props.yAxisLeft) {
      widget.rawConfiguration.yAxisLeft = props.yAxisLeft;
    }
    
    // Component-specific mappings
    switch (componentType) {
      case 'BillboardChart':
        if (props.critical || props.warning) {
          widget.rawConfiguration.thresholds = [];
          if (props.warning) {
            widget.rawConfiguration.thresholds.push({
              alertSeverity: 'WARNING',
              value: props.warning
            });
          }
          if (props.critical) {
            widget.rawConfiguration.thresholds.push({
              alertSeverity: 'CRITICAL',
              value: props.critical
            });
          }
        }
        break;
        
      case 'BarChart':
      case 'PieChart':
        if (props.fullWidth) {
          widget.layout.width = 12;
        }
        break;
    }
  }
  
  getDefaultWidth(vizType) {
    const widths = {
      'viz.billboard': 4,
      'viz.line': 6,
      'viz.area': 6,
      'viz.bar': 6,
      'viz.table': 12,
      'viz.pie': 4,
      'viz.heatmap': 12
    };
    return widths[vizType] || 6;
  }
  
  getDefaultHeight(vizType) {
    const heights = {
      'viz.table': 4,
      'viz.heatmap': 4
    };
    return heights[vizType] || 3;
  }
  
  selectVisualization(queryAnalysis) {
    if (queryAnalysis.hasTimeseries) return 'viz.line';
    if (queryAnalysis.hasFacet) return 'viz.bar';
    if (queryAnalysis.isSingleValue) return 'viz.billboard';
    return 'viz.table';
  }
  
  generateTitleFromQuery(query) {
    // Extract main metric from query
    const selectMatch = query.match(/SELECT\s+(\w+)\(([^)]+)\)/);
    if (selectMatch) {
      const [, func, metric] = selectMatch;
      return `${func} of ${metric}`;
    }
    return 'Query Result';
  }
  
  humanizeName(name) {
    return name
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  optimizePageLayout(page) {
    // Re-flow widgets to optimize space
    let currentRow = 1;
    let currentColumn = 1;
    
    const optimizedWidgets = page.widgets.map(widget => {
      if (currentColumn + widget.layout.width > 12) {
        currentColumn = 1;
        currentRow += 3; // Standard height
      }
      
      const optimized = {
        ...widget,
        layout: {
          ...widget.layout,
          column: currentColumn,
          row: currentRow
        }
      };
      
      currentColumn += widget.layout.width;
      
      return optimized;
    });
    
    return {
      ...page,
      widgets: optimizedWidgets
    };
  }
  
  async readJson(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }
  
  async saveMigrationReport(appPath, result) {
    const reportPath = path.join(
      path.dirname(appPath),
      `${path.basename(appPath)}-migration-report.json`
    );
    
    await fs.writeFile(
      reportPath,
      JSON.stringify(result, null, 2)
    );
    
    console.log(`📄 Migration report saved to: ${reportPath}`);
  }
  
  extractProps(attributes) {
    const props = {};
    
    for (const attr of attributes) {
      if (attr.type === 'JSXAttribute') {
        const name = attr.name.name;
        const value = attr.value;
        
        if (value.type === 'StringLiteral') {
          props[name] = value.value;
        } else if (value.type === 'JSXExpressionContainer') {
          // Handle expressions
          if (value.expression.type === 'NumericLiteral') {
            props[name] = value.expression.value;
          } else if (value.expression.type === 'BooleanLiteral') {
            props[name] = value.expression.value;
          }
        }
      }
    }
    
    return props;
  }
}

module.exports = NR1MigrationService;