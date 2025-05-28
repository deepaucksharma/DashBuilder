const { DashboardGenerator } = require('../index');
const path = require('path');
const fs = require('fs');

/**
 * Integration between Dashboard Generator and Experiment Framework
 */
class ExperimentDashboardGenerator {
  constructor(config) {
    this.generator = new DashboardGenerator(config);
    this.experimentsPath = path.join(process.cwd(), 'experiments', 'results');
  }

  /**
   * Generate dashboard for a specific experiment
   */
  async generateExperimentDashboard(experimentId, options = {}) {
    const experimentData = await this.loadExperimentData(experimentId);
    
    if (!experimentData) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const dashboardConfig = {
      name: options.name || `Experiment: ${experimentData.name}`,
      description: options.description || `Dashboard for experiment ${experimentId} - ${experimentData.description}`,
      template: 'experiment-analysis',
      metrics: {
        include: this.extractMetricsFromExperiment(experimentData),
        exclude: options.excludeMetrics || []
      },
      layoutPreference: options.layout || 'detailed',
      timeRange: experimentData.duration || '1 hour'
    };

    // Add experiment-specific widgets
    const result = await this.generator.generate(dashboardConfig);
    
    // Enhance with experiment data
    const enhancedDashboard = this.enhanceDashboardWithExperimentData(
      result.dashboard,
      experimentData
    );

    return {
      dashboard: enhancedDashboard,
      metadata: {
        ...result.metadata,
        experimentId,
        experimentName: experimentData.name
      }
    };
  }

  /**
   * Generate comparison dashboard for multiple experiments
   */
  async generateComparisonDashboard(experimentIds, options = {}) {
    const experiments = await Promise.all(
      experimentIds.map(id => this.loadExperimentData(id))
    );

    const validExperiments = experiments.filter(exp => exp !== null);
    
    if (validExperiments.length === 0) {
      throw new Error('No valid experiments found');
    }

    // Collect all metrics from all experiments
    const allMetrics = new Set();
    validExperiments.forEach(exp => {
      const metrics = this.extractMetricsFromExperiment(exp);
      metrics.forEach(m => allMetrics.add(m));
    });

    const dashboardConfig = {
      name: options.name || `Experiment Comparison: ${validExperiments.map(e => e.name).join(' vs ')}`,
      description: options.description || 'Comparison dashboard for multiple experiments',
      template: 'experiment-comparison',
      metrics: {
        include: Array.from(allMetrics)
      },
      layoutPreference: options.layout || 'balanced'
    };

    const result = await this.generator.generate(dashboardConfig);
    
    // Add comparison widgets
    const comparisonDashboard = this.addComparisonWidgets(
      result.dashboard,
      validExperiments
    );

    return {
      dashboard: comparisonDashboard,
      metadata: {
        ...result.metadata,
        experimentIds,
        experimentNames: validExperiments.map(e => e.name)
      }
    };
  }

  /**
   * Generate dashboard for NRDOT optimization experiments
   */
  async generateNRDOTDashboard(profileName, options = {}) {
    const nrdotMetrics = [
      'nrdot.optimization.score',
      'nrdot.coverage.percent',
      'nrdot.cost.reduction',
      'process.count.filtered',
      'process.count.total',
      'telemetry.volume.before',
      'telemetry.volume.after'
    ];

    const dashboardConfig = {
      name: options.name || `NRDOT Profile: ${profileName}`,
      description: `NRDOT optimization dashboard for ${profileName} profile`,
      template: 'nrdot-optimization',
      metrics: {
        include: [...nrdotMetrics, ...(options.additionalMetrics || [])]
      },
      layoutPreference: 'detailed',
      timeRange: options.timeRange || '1 day'
    };

    const result = await this.generator.generate(dashboardConfig);
    
    // Add NRDOT-specific widgets
    const nrdotDashboard = this.addNRDOTWidgets(result.dashboard, profileName);

    return {
      dashboard: nrdotDashboard,
      metadata: {
        ...result.metadata,
        profileName,
        type: 'nrdot-optimization'
      }
    };
  }

  /**
   * Generate KPI tracking dashboard
   */
  async generateKPIDashboard(kpis, options = {}) {
    const kpiMetrics = kpis.map(kpi => kpi.metric);
    
    const dashboardConfig = {
      name: options.name || 'KPI Tracking Dashboard',
      description: 'Track key performance indicators',
      template: 'business-kpi',
      metrics: {
        include: kpiMetrics
      },
      layoutPreference: 'compact'
    };

    const result = await this.generator.generate(dashboardConfig);
    
    // Add KPI-specific widgets
    const kpiDashboard = this.addKPIWidgets(result.dashboard, kpis);

    return {
      dashboard: kpiDashboard,
      metadata: {
        ...result.metadata,
        kpis: kpis.map(k => k.name)
      }
    };
  }

  // Helper methods

  async loadExperimentData(experimentId) {
    try {
      const experimentFile = path.join(
        this.experimentsPath,
        `${experimentId}.json`
      );
      
      if (!fs.existsSync(experimentFile)) {
        // Try alternate locations
        const altPath = path.join(
          process.cwd(),
          'experiments',
          'profiles',
          `${experimentId}.yaml`
        );
        
        if (fs.existsSync(altPath)) {
          // Load YAML experiment profile
          const yaml = require('js-yaml');
          const content = fs.readFileSync(altPath, 'utf8');
          return yaml.load(content);
        }
        
        return null;
      }
      
      const content = fs.readFileSync(experimentFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error loading experiment ${experimentId}:`, error);
      return null;
    }
  }

  extractMetricsFromExperiment(experimentData) {
    const metrics = new Set();
    
    // Extract from metrics configuration
    if (experimentData.metrics) {
      if (Array.isArray(experimentData.metrics)) {
        experimentData.metrics.forEach(m => metrics.add(m));
      } else if (experimentData.metrics.track) {
        experimentData.metrics.track.forEach(m => metrics.add(m));
      }
    }
    
    // Extract from targets
    if (experimentData.targets) {
      Object.values(experimentData.targets).forEach(target => {
        if (target.metric) {
          metrics.add(target.metric);
        }
      });
    }
    
    // Add default experiment metrics
    const defaultMetrics = [
      'experiment.duration',
      'experiment.status',
      'experiment.score'
    ];
    
    defaultMetrics.forEach(m => metrics.add(m));
    
    return Array.from(metrics);
  }

  enhanceDashboardWithExperimentData(dashboard, experimentData) {
    // Add experiment info widget at the top
    const infoWidget = {
      title: 'Experiment Information',
      configuration: {
        markdown: {
          text: `
# ${experimentData.name}

**ID**: ${experimentData.id}  
**Description**: ${experimentData.description}  
**Duration**: ${experimentData.duration}  
**Profile**: ${experimentData.profile || 'N/A'}  
**Status**: ${experimentData.status || 'Completed'}  

## Targets
${Object.entries(experimentData.targets || {})
  .map(([key, target]) => `- **${key}**: ${target.value} (${target.metric})`)
  .join('\n')}
          `.trim()
        }
      },
      layout: { column: 1, row: 1, width: 12, height: 3 },
      visualization: { id: 'viz.markdown' }
    };
    
    // Prepend info widget
    dashboard.pages[0].widgets.unshift(infoWidget);
    
    // Adjust other widget positions
    dashboard.pages[0].widgets.slice(1).forEach(widget => {
      widget.layout.row += 3;
    });
    
    return dashboard;
  }

  addComparisonWidgets(dashboard, experiments) {
    // Add comparison summary widget
    const comparisonWidget = {
      title: 'Experiment Comparison',
      configuration: {
        table: {
          nrqlQueries: [{
            accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID),
            query: this.buildComparisonQuery(experiments)
          }]
        }
      },
      layout: { column: 1, row: 1, width: 12, height: 4 },
      visualization: { id: 'viz.table' }
    };
    
    dashboard.pages[0].widgets.unshift(comparisonWidget);
    
    // Adjust positions
    dashboard.pages[0].widgets.slice(1).forEach(widget => {
      widget.layout.row += 4;
    });
    
    return dashboard;
  }

  addNRDOTWidgets(dashboard, profileName) {
    // Add NRDOT summary widgets
    const nrdotWidgets = [
      {
        title: 'Optimization Score',
        configuration: {
          billboard: {
            nrqlQueries: [{
              accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID),
              query: `SELECT latest(nrdot.optimization.score) AS 'Score' FROM Metric WHERE profile = '${profileName}' SINCE 1 hour ago`
            }]
          }
        },
        layout: { column: 1, row: 1, width: 3, height: 2 },
        visualization: { id: 'viz.billboard' }
      },
      {
        title: 'Coverage %',
        configuration: {
          billboard: {
            nrqlQueries: [{
              accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID),
              query: `SELECT latest(nrdot.coverage.percent) AS 'Coverage' FROM Metric WHERE profile = '${profileName}' SINCE 1 hour ago`
            }]
          }
        },
        layout: { column: 4, row: 1, width: 3, height: 2 },
        visualization: { id: 'viz.billboard' }
      },
      {
        title: 'Cost Reduction %',
        configuration: {
          billboard: {
            nrqlQueries: [{
              accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID),
              query: `SELECT latest(nrdot.cost.reduction) AS 'Savings' FROM Metric WHERE profile = '${profileName}' SINCE 1 hour ago`
            }]
          }
        },
        layout: { column: 7, row: 1, width: 3, height: 2 },
        visualization: { id: 'viz.billboard' }
      },
      {
        title: 'Process Filtering',
        configuration: {
          billboard: {
            nrqlQueries: [{
              accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID),
              query: `SELECT latest(process.count.filtered) AS 'Filtered', latest(process.count.total) AS 'Total' FROM Metric WHERE profile = '${profileName}' SINCE 1 hour ago`
            }]
          }
        },
        layout: { column: 10, row: 1, width: 3, height: 2 },
        visualization: { id: 'viz.billboard' }
      }
    ];
    
    // Prepend NRDOT widgets
    dashboard.pages[0].widgets = [...nrdotWidgets, ...dashboard.pages[0].widgets];
    
    // Adjust positions of other widgets
    dashboard.pages[0].widgets.slice(nrdotWidgets.length).forEach(widget => {
      widget.layout.row += 2;
    });
    
    return dashboard;
  }

  addKPIWidgets(dashboard, kpis) {
    // Create billboard widgets for each KPI
    const kpiWidgets = kpis.map((kpi, index) => ({
      title: kpi.name,
      configuration: {
        billboard: {
          nrqlQueries: [{
            accountId: parseInt(process.env.NEW_RELIC_ACCOUNT_ID),
            query: `SELECT ${kpi.aggregation || 'latest'}(${kpi.metric}) AS '${kpi.unit || 'value'}' FROM Metric SINCE 1 hour ago`
          }],
          thresholds: kpi.thresholds
        }
      },
      layout: {
        column: (index % 4) * 3 + 1,
        row: Math.floor(index / 4) * 2 + 1,
        width: 3,
        height: 2
      },
      visualization: { id: 'viz.billboard' }
    }));
    
    // Replace widgets with KPI widgets at top
    const maxKpiRow = Math.max(...kpiWidgets.map(w => w.layout.row + w.layout.height));
    
    dashboard.pages[0].widgets.forEach(widget => {
      widget.layout.row += maxKpiRow;
    });
    
    dashboard.pages[0].widgets = [...kpiWidgets, ...dashboard.pages[0].widgets];
    
    return dashboard;
  }

  buildComparisonQuery(experiments) {
    // Build a query that compares key metrics across experiments
    const experimentNames = experiments.map(e => `'${e.name}'`).join(', ');
    
    return `
      SELECT 
        average(experiment.score) AS 'Score',
        average(optimization.percent) AS 'Optimization %',
        count(*) AS 'Data Points'
      FROM Metric 
      WHERE experiment.name IN (${experimentNames})
      SINCE 1 day ago
      FACET experiment.name
    `.trim();
  }
}

module.exports = ExperimentDashboardGenerator;