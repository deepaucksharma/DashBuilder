#!/usr/bin/env node

/**
 * Comprehensive Dashboard Validator
 * Validates all aspects of a New Relic dashboard according to NerdGraph specifications
 */

const fs = require('fs');
const path = require('path');

class DashboardComprehensiveValidator {
  constructor() {
    // Valid visualization IDs per NerdGraph docs
    this.validVisualizations = [
      'viz.area',
      'viz.bar',
      'viz.billboard',
      'viz.bullet',
      'viz.funnel',
      'viz.heatmap',
      'viz.histogram',
      'viz.json',
      'viz.line',
      'viz.markdown',
      'viz.pie',
      'viz.scatter',
      'viz.sparkline',
      'viz.stacked-bar',
      'viz.table',
      'viz.traffic-light'
    ];

    // Valid variable types
    this.validVariableTypes = ['ENUM', 'NRQL', 'STRING'];
    
    // Valid replacement strategies
    this.validReplacementStrategies = ['DEFAULT', 'IDENTIFIER', 'NUMBER', 'STRING'];

    this.validationReport = {
      errors: [],
      warnings: [],
      info: [],
      stats: {}
    };
  }

  // Main validation entry point
  validate(dashboardPath) {
    console.log(`${'='.repeat(80)}`);
    console.log('COMPREHENSIVE DASHBOARD VALIDATOR');
    console.log(`${'='.repeat(80)}\n`);

    // Load dashboard
    let dashboard;
    try {
      const content = fs.readFileSync(dashboardPath, 'utf8');
      dashboard = JSON.parse(content);
      console.log(`✅ Successfully loaded: ${path.basename(dashboardPath)}`);
    } catch (error) {
      console.error(`❌ Failed to load dashboard: ${error.message}`);
      return false;
    }

    // Run all validations
    this.validateBasicStructure(dashboard);
    this.validatePages(dashboard);
    this.validateWidgets(dashboard);
    this.validateVariables(dashboard);
    this.validateNrqlQueries(dashboard);
    this.validateLayoutConstraints(dashboard);
    this.validateVisualizations(dashboard);
    this.validateRawConfigurations(dashboard);
    this.validateAccountReferences(dashboard);
    this.generateOptimizationSuggestions(dashboard);

    // Display report
    this.displayReport();
    
    return this.validationReport.errors.length === 0;
  }

  // 1. Basic Structure Validation
  validateBasicStructure(dashboard) {
    console.log('\n📋 Validating Basic Structure...');
    
    // Required fields
    if (!dashboard.name || dashboard.name.trim() === '') {
      this.addError('Dashboard name is required and cannot be empty');
    } else if (dashboard.name.length > 255) {
      this.addError('Dashboard name exceeds 255 character limit');
    }

    if (!dashboard.permissions) {
      this.addWarning('No permissions specified, will default to PUBLIC_READ_WRITE');
    } else if (!['PUBLIC_READ_WRITE', 'PUBLIC_READ_ONLY', 'PRIVATE'].includes(dashboard.permissions)) {
      this.addError(`Invalid permissions: ${dashboard.permissions}`);
    }

    if (!dashboard.pages || !Array.isArray(dashboard.pages)) {
      this.addError('Dashboard must have a pages array');
    } else if (dashboard.pages.length === 0) {
      this.addError('Dashboard must have at least one page');
    } else if (dashboard.pages.length > 20) {
      this.addError('Dashboard cannot have more than 20 pages');
    }

    // Optional fields
    if (dashboard.description && dashboard.description.length > 1024) {
      this.addError('Dashboard description exceeds 1024 character limit');
    }

    this.validationReport.stats.pageCount = dashboard.pages?.length || 0;
  }

  // 2. Pages Validation
  validatePages(dashboard) {
    console.log('\n📄 Validating Pages...');
    
    if (!dashboard.pages) return;

    dashboard.pages.forEach((page, index) => {
      const pageContext = `Page ${index + 1}`;
      
      // Required fields
      if (!page.name || page.name.trim() === '') {
        this.addError(`${pageContext}: name is required`);
      } else if (page.name.length > 255) {
        this.addError(`${pageContext}: name exceeds 255 character limit`);
      }

      // Optional fields
      if (page.description && page.description.length > 1024) {
        this.addError(`${pageContext}: description exceeds 1024 character limit`);
      }

      // Widgets
      if (!page.widgets || !Array.isArray(page.widgets)) {
        this.addError(`${pageContext}: must have a widgets array`);
      } else if (page.widgets.length === 0) {
        this.addWarning(`${pageContext}: has no widgets`);
      } else if (page.widgets.length > 50) {
        this.addError(`${pageContext}: cannot have more than 50 widgets`);
      }
    });
  }

  // 3. Widgets Validation
  validateWidgets(dashboard) {
    console.log('\n🔧 Validating Widgets...');
    
    let totalWidgets = 0;
    const widgetTitles = new Set();

    dashboard.pages?.forEach((page, pageIndex) => {
      page.widgets?.forEach((widget, widgetIndex) => {
        totalWidgets++;
        const context = `Page '${page.name}', Widget ${widgetIndex + 1}`;

        // Required fields
        if (!widget.title) {
          this.addError(`${context}: title is required`);
        } else {
          if (widget.title.length > 255) {
            this.addError(`${context}: title exceeds 255 character limit`);
          }
          // Check for duplicate titles
          if (widgetTitles.has(widget.title)) {
            this.addWarning(`${context}: duplicate title '${widget.title}'`);
          }
          widgetTitles.add(widget.title);
        }

        // Visualization
        if (!widget.visualization || !widget.visualization.id) {
          this.addError(`${context}: visualization.id is required`);
        }

        // Raw configuration
        if (!widget.rawConfiguration) {
          this.addError(`${context}: rawConfiguration is required`);
        }

        // Layout
        if (!widget.layout) {
          this.addError(`${context}: layout is required`);
        }
      });
    });

    this.validationReport.stats.totalWidgets = totalWidgets;
  }

  // 4. Variables Validation
  validateVariables(dashboard) {
    console.log('\n🔤 Validating Variables...');
    
    if (!dashboard.variables || dashboard.variables.length === 0) {
      this.addInfo('No dashboard variables defined');
      return;
    }

    dashboard.variables.forEach((variable, index) => {
      const context = `Variable ${index + 1}`;

      // Required fields
      if (!variable.name) {
        this.addError(`${context}: name is required`);
      } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(variable.name)) {
        this.addError(`${context}: name must start with letter and contain only letters, numbers, underscore`);
      }

      if (!variable.title) {
        this.addError(`${context}: title is required`);
      }

      if (!variable.type) {
        this.addError(`${context}: type is required`);
      } else if (!this.validVariableTypes.includes(variable.type)) {
        this.addError(`${context}: invalid type '${variable.type}'`);
      }

      if (!variable.replacementStrategy) {
        this.addError(`${context}: replacementStrategy is required`);
      } else if (!this.validReplacementStrategies.includes(variable.replacementStrategy)) {
        this.addError(`${context}: invalid replacementStrategy '${variable.replacementStrategy}'`);
      }

      // Type-specific validation
      if (variable.type === 'NRQL' && !variable.nrqlQuery) {
        this.addError(`${context}: nrqlQuery is required for NRQL type`);
      }

      if (variable.type === 'ENUM' && (!variable.items || variable.items.length === 0)) {
        this.addError(`${context}: items are required for ENUM type`);
      }
    });
  }

  // 5. NRQL Queries Validation
  validateNrqlQueries(dashboard) {
    console.log('\n🔍 Validating NRQL Queries...');
    
    let totalQueries = 0;
    const accountIds = new Set();

    dashboard.pages?.forEach((page) => {
      page.widgets?.forEach((widget) => {
        if (widget.rawConfiguration?.nrqlQueries) {
          widget.rawConfiguration.nrqlQueries.forEach((nrqlQuery, index) => {
            totalQueries++;
            const context = `Widget '${widget.title}', Query ${index + 1}`;

            // Required fields
            if (!nrqlQuery.query) {
              this.addError(`${context}: query is required`);
            } else {
              // Basic NRQL syntax validation
              this.validateNrqlSyntax(nrqlQuery.query, context);
            }

            if (!nrqlQuery.accountIds || !Array.isArray(nrqlQuery.accountIds) || nrqlQuery.accountIds.length === 0) {
              this.addError(`${context}: accountIds array is required and cannot be empty`);
            } else {
              nrqlQuery.accountIds.forEach(id => {
                if (typeof id !== 'number' || id <= 0) {
                  this.addError(`${context}: invalid account ID ${id}`);
                }
                accountIds.add(id);
              });
            }
          });
        }
      });
    });

    this.validationReport.stats.totalQueries = totalQueries;
    this.validationReport.stats.uniqueAccounts = accountIds.size;
  }

  // 6. NRQL Syntax Validation
  validateNrqlSyntax(query, context) {
    // Basic NRQL validation rules
    if (!query.match(/^(SELECT|FROM)/i)) {
      this.addError(`${context}: NRQL query must start with SELECT or FROM`);
    }

    if (!query.match(/FROM\s+\w+/i)) {
      this.addError(`${context}: NRQL query must have a FROM clause`);
    }

    // Check for common issues
    if (query.includes('{{') && query.includes('}}')) {
      const variablePattern = /\{\{(\w+)\}\}/g;
      const matches = query.matchAll(variablePattern);
      for (const match of matches) {
        this.addInfo(`${context}: uses variable '${match[1]}'`);
      }
    }

    // Warn about performance issues
    if (!query.match(/SINCE|UNTIL|LIMIT/i)) {
      this.addWarning(`${context}: query has no time range or limit, may impact performance`);
    }

    if (query.match(/SELECT\s+\*/i)) {
      this.addWarning(`${context}: SELECT * may return too much data`);
    }
  }

  // 7. Layout Constraints Validation
  validateLayoutConstraints(dashboard) {
    console.log('\n📐 Validating Layout Constraints...');
    
    dashboard.pages?.forEach((page) => {
      const layoutMap = new Map(); // row -> occupied columns
      
      page.widgets?.forEach((widget) => {
        if (!widget.layout) return;
        
        const { column, row, width, height } = widget.layout;
        const context = `Widget '${widget.title}'`;

        // Basic constraints
        if (column < 1 || column > 12) {
          this.addError(`${context}: column must be between 1 and 12`);
        }
        if (row < 1) {
          this.addError(`${context}: row must be >= 1`);
        }
        if (width < 1 || width > 12) {
          this.addError(`${context}: width must be between 1 and 12`);
        }
        if (height < 1 || height > 50) {
          this.addError(`${context}: height must be between 1 and 50`);
        }

        // Check if widget fits in grid
        if (column + width - 1 > 12) {
          this.addError(`${context}: widget extends beyond column 12`);
        }

        // Check for overlaps
        for (let r = row; r < row + height; r++) {
          if (!layoutMap.has(r)) {
            layoutMap.set(r, new Set());
          }
          const occupiedColumns = layoutMap.get(r);
          
          for (let c = column; c < column + width; c++) {
            if (occupiedColumns.has(c)) {
              this.addError(`${context}: overlaps with another widget at row ${r}, column ${c}`);
            }
            occupiedColumns.add(c);
          }
        }
      });
    });
  }

  // 8. Visualization Validation
  validateVisualizations(dashboard) {
    console.log('\n📊 Validating Visualizations...');
    
    const vizCounts = {};

    dashboard.pages?.forEach((page) => {
      page.widgets?.forEach((widget) => {
        const vizId = widget.visualization?.id;
        if (!vizId) return;

        const context = `Widget '${widget.title}'`;

        if (!this.validVisualizations.includes(vizId)) {
          this.addError(`${context}: invalid visualization '${vizId}'`);
        }

        // Count visualization usage
        vizCounts[vizId] = (vizCounts[vizId] || 0) + 1;

        // Visualization-specific validation
        this.validateVisualizationConfig(widget, vizId, context);
      });
    });

    // Report visualization usage
    this.validationReport.stats.visualizationUsage = vizCounts;
  }

  // 9. Visualization-specific Configuration Validation
  validateVisualizationConfig(widget, vizId, context) {
    const config = widget.rawConfiguration;
    if (!config) return;

    switch (vizId) {
      case 'viz.line':
      case 'viz.area':
        if (!config.nrqlQueries || config.nrqlQueries.length === 0) {
          this.addError(`${context}: ${vizId} requires NRQL queries`);
        }
        if (config.nrqlQueries?.some(q => !q.query.match(/TIMESERIES/i))) {
          this.addWarning(`${context}: ${vizId} works best with TIMESERIES`);
        }
        break;

      case 'viz.billboard':
        if (config.nrqlQueries?.some(q => q.query.match(/TIMESERIES/i))) {
          this.addWarning(`${context}: billboard should not use TIMESERIES`);
        }
        break;

      case 'viz.table':
        if (config.nrqlQueries?.some(q => q.query.match(/TIMESERIES/i))) {
          this.addWarning(`${context}: table should not use TIMESERIES`);
        }
        break;

      case 'viz.markdown':
        if (!config.text) {
          this.addError(`${context}: markdown widget requires text`);
        }
        break;
    }
  }

  // 10. Raw Configuration Validation
  validateRawConfigurations(dashboard) {
    console.log('\n⚙️  Validating Raw Configurations...');
    
    dashboard.pages?.forEach((page) => {
      page.widgets?.forEach((widget) => {
        const config = widget.rawConfiguration;
        if (!config) return;

        const context = `Widget '${widget.title}'`;

        // Check for common configuration issues
        if (config.facet && config.facet.max > 100) {
          this.addWarning(`${context}: facet max exceeds 100, may impact performance`);
        }

        if (config.yAxisLeft && config.yAxisRight) {
          this.addInfo(`${context}: uses dual Y-axis`);
        }

        // Validate thresholds
        if (config.thresholds && Array.isArray(config.thresholds)) {
          config.thresholds.forEach((threshold, i) => {
            if (!threshold.value && threshold.value !== 0) {
              this.addError(`${context}: threshold ${i + 1} missing value`);
            }
            if (!['CRITICAL', 'WARNING', 'INFO'].includes(threshold.alertSeverity)) {
              this.addError(`${context}: threshold ${i + 1} invalid severity`);
            }
          });
        }
      });
    });
  }

  // 11. Account References Validation
  validateAccountReferences(dashboard) {
    console.log('\n🏢 Validating Account References...');
    
    const accountIds = new Set();

    // Collect all account IDs
    dashboard.pages?.forEach((page) => {
      page.widgets?.forEach((widget) => {
        widget.rawConfiguration?.nrqlQueries?.forEach((q) => {
          q.accountIds?.forEach(id => accountIds.add(id));
        });
      });
    });

    dashboard.variables?.forEach((variable) => {
      variable.nrqlQuery?.accountIds?.forEach(id => accountIds.add(id));
    });

    if (accountIds.size === 0) {
      this.addError('No account IDs found in dashboard');
    } else if (accountIds.size > 1) {
      this.addInfo(`Dashboard references ${accountIds.size} different accounts: ${Array.from(accountIds).join(', ')}`);
    }
  }

  // 12. Generate Optimization Suggestions
  generateOptimizationSuggestions(dashboard) {
    console.log('\n💡 Generating Optimization Suggestions...');
    
    // Check for too many queries
    const totalQueries = this.validationReport.stats.totalQueries || 0;
    if (totalQueries > 50) {
      this.addWarning(`Dashboard has ${totalQueries} queries, consider reducing for better performance`);
    }

    // Check for missing time ranges
    let queriesWithoutTimeRange = 0;
    dashboard.pages?.forEach((page) => {
      page.widgets?.forEach((widget) => {
        widget.rawConfiguration?.nrqlQueries?.forEach((q) => {
          if (q.query && !q.query.match(/SINCE|UNTIL/i)) {
            queriesWithoutTimeRange++;
          }
        });
      });
    });

    if (queriesWithoutTimeRange > 0) {
      this.addWarning(`${queriesWithoutTimeRange} queries lack explicit time ranges`);
    }

    // Suggest using variables for repeated values
    const hostIds = [];
    dashboard.pages?.forEach((page) => {
      page.widgets?.forEach((widget) => {
        widget.rawConfiguration?.nrqlQueries?.forEach((q) => {
          const hostMatch = q.query?.match(/host\.id\s*=\s*'([^']+)'/);
          if (hostMatch) {
            hostIds.push(hostMatch[1]);
          }
        });
      });
    });

    if (hostIds.length > 3 && new Set(hostIds).size === 1) {
      this.addInfo(`Consider using a dashboard variable for host.id = '${hostIds[0]}'`);
    }
  }

  // Helper methods
  addError(message) {
    this.validationReport.errors.push(message);
    console.log(`  ❌ ${message}`);
  }

  addWarning(message) {
    this.validationReport.warnings.push(message);
    console.log(`  ⚠️  ${message}`);
  }

  addInfo(message) {
    this.validationReport.info.push(message);
    console.log(`  ℹ️  ${message}`);
  }

  // Display final report
  displayReport() {
    console.log(`\n${'='.repeat(80)}`);
    console.log('VALIDATION REPORT');
    console.log(`${'='.repeat(80)}\n`);

    console.log('📊 Statistics:');
    Object.entries(this.validationReport.stats).forEach(([key, value]) => {
      console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    });

    console.log(`\n📋 Summary:`);
    console.log(`  ✅ Valid: ${this.validationReport.errors.length === 0 ? 'YES' : 'NO'}`);
    console.log(`  ❌ Errors: ${this.validationReport.errors.length}`);
    console.log(`  ⚠️  Warnings: ${this.validationReport.warnings.length}`);
    console.log(`  ℹ️  Info: ${this.validationReport.info.length}`);

    if (this.validationReport.errors.length > 0) {
      console.log('\n❌ Errors must be fixed:');
      this.validationReport.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }

    if (this.validationReport.warnings.length > 0) {
      console.log('\n⚠️  Warnings to consider:');
      this.validationReport.warnings.forEach((warn, i) => {
        console.log(`  ${i + 1}. ${warn}`);
      });
    }

    // Save report
    const reportPath = path.join(__dirname, '..', 'dashboards', 'validation-report-comprehensive.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.validationReport, null, 2));
    console.log(`\n📄 Full report saved to: ${reportPath}`);
  }
}

// Run validator
if (require.main === module) {
  const validator = new DashboardComprehensiveValidator();
  const dashboardPath = process.argv[2] || path.join(__dirname, '..', 'dashboards', 'nrdot-verified-dashboard.json');
  
  console.log(`Validating: ${dashboardPath}`);
  const isValid = validator.validate(dashboardPath);
  
  process.exit(isValid ? 0 : 1);
}

module.exports = DashboardComprehensiveValidator;