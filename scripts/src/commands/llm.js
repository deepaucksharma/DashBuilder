const { Command } = require('commander');
const { LLMEnhancementService } = require('../services/llm-enhancement.service.js');
const { Config } = require('../core/config.js');
const { Output } = require('../utils/output.js');
const { logger } = require('../utils/logger.js');
const fs = require('fs/promises');

class LLMCommand {
  getCommand() {
    const llm = new Command('llm')
      .description('LLM-enhanced operations for intelligent dashboard and query generation');

    llm
      .command('context')
      .description('Generate context information for LLM prompts')
      .option('--since <duration>', 'Time range for schema discovery', '7 days ago')
      .option('-o, --output <file>', 'Save context to file')
      .action(async (options) => {
        await this.generateContext(options, llm.parent.opts());
      });

    llm
      .command('enhance-query <query>')
      .description('Validate and enhance an LLM-generated query')
      .option('--validate-attributes', 'Validate attributes against schema')
      .option('--apply-fixes', 'Apply suggested fixes automatically')
      .action(async (query, options) => {
        await this.enhanceQuery(query, options, llm.parent.opts());
      });

    llm
      .command('generate-dashboard <description>')
      .description('Generate a dashboard from natural language description')
      .option('-o, --output <file>', 'Save dashboard to file')
      .option('--dry-run', 'Generate without creating dashboard')
      .option('--permissions <perm>', 'Dashboard permissions', 'PUBLIC_READ_ONLY')
      .action(async (description, options) => {
        await this.generateDashboard(description, options, llm.parent.opts());
      });

    llm
      .command('suggest-improvements <dashboardFile>')
      .description('Suggest improvements for an existing dashboard')
      .option('--apply', 'Apply suggested improvements')
      .option('-o, --output <file>', 'Save improved dashboard to file')
      .action(async (dashboardFile, options) => {
        await this.suggestImprovements(dashboardFile, options, llm.parent.opts());
      });

    llm
      .command('validate-batch <file>')
      .description('Validate and enhance multiple queries from a file')
      .option('--fix-all', 'Apply all possible fixes')
      .option('-o, --output <file>', 'Save enhanced queries to file')
      .action(async (file, options) => {
        await this.validateBatch(file, options, llm.parent.opts());
      });

    return llm;
  }

  async generateContext(options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new LLMEnhancementService(config);

    try {
      output.startSpinner('Generating LLM context...');
      const context = await service.generateContext({ since: options.since });
      output.stopSpinner(true);

      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(context, null, 2));
        output.success(`Context saved to ${options.output}`);
      } else {
        output.print(context, {
          title: 'LLM Context Information'
        });
      }

      // Print summary
      if (config.outputFormat !== 'json') {
        output.info('\nContext Summary:');
        output.info(`  Event Types: ${context.eventTypes.length}`);
        output.info(`  Common Attributes: ${Object.keys(context.commonAttributes).length} event types documented`);
        output.info(`  Query Patterns: ${context.queryPatterns.length}`);
        output.info(`  Performance Hints: ${context.performanceHints.length}`);
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to generate context');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async enhanceQuery(query, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new LLMEnhancementService(config);

    try {
      output.startSpinner('Enhancing query...');
      const enhancement = await service.enhanceQuery(query, {
        validateAttributes: options.validateAttributes
      });
      output.stopSpinner(enhancement.valid);

      output.print(enhancement);

      if (!enhancement.valid) {
        output.error('Query validation failed');
        
        if (enhancement.suggestions?.length > 0) {
          output.info('\nSuggestions:');
          enhancement.suggestions.forEach(suggestion => {
            output.info(`  • ${suggestion}`);
          });
        }
        
        if (!options.applyFixes) {
          output.info('\nUse --apply-fixes to automatically apply corrections');
        }
        
        process.exit(1);
      } else {
        output.success('Query is valid!');
        
        if (enhancement.corrections?.length > 0) {
          output.info('\nApplied corrections:');
          enhancement.corrections.forEach(correction => {
            output.info(`  • ${correction}`);
          });
        }
        
        if (enhancement.optimizations?.length > 0) {
          output.info('\nOptimizations applied:');
          enhancement.optimizations.forEach(opt => {
            output.info(`  • ${opt.description}`);
          });
        }
        
        if (enhancement.warnings?.length > 0) {
          output.warning('\nWarnings:');
          enhancement.warnings.forEach(warning => {
            output.warning(`  • ${warning}`);
          });
        }

        if (query !== enhancement.enhancedQuery) {
          output.success('\nEnhanced Query:');
          output.print(enhancement.enhancedQuery);
        }
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to enhance query');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async generateDashboard(description, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new LLMEnhancementService(config);

    try {
      config.requireAccountId();
      
      output.startSpinner('Generating dashboard from description...');
      const result = await service.generateDashboardFromDescription(description, {
        permissions: options.permissions,
        description: `Generated from: "${description}"`
      });
      
      output.stopSpinner(result.success);

      if (!result.success) {
        output.error('Failed to generate valid dashboard');
        
        if (result.warnings?.length > 0) {
          output.warning('\nWarnings:');
          result.warnings.forEach(warning => {
            output.warning(`  • ${warning}`);
          });
        }
        
        if (result.errors?.length > 0) {
          output.error('\nErrors:');
          result.errors.forEach(error => {
            output.error(`  • ${error}`);
          });
        }
        
        process.exit(1);
      }

      output.success('Dashboard generated successfully!');
      
      // Show generated queries
      output.info('\nGenerated Widgets:');
      result.queries.forEach((query, index) => {
        output.info(`\n${index + 1}. ${query.title}`);
        output.info(`   Query: ${query.query}`);
        output.info(`   Visualization: ${query.visualization}`);
        
        if (query.corrections?.length > 0) {
          output.info(`   Corrections: ${query.corrections.join(', ')}`);
        }
        if (query.optimizations?.length > 0) {
          output.info(`   Optimizations: ${query.optimizations.length} applied`);
        }
      });

      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(result.dashboard, null, 2));
        output.success(`\nDashboard saved to ${options.output}`);
      }

      if (!options.dryRun) {
        output.info('\nUse the following command to import:');
        output.info(`  nr-guardian dashboard import ${options.output || '<dashboard.json>'}`);
      }

    } catch (error) {
      output.stopSpinner(false, 'Failed to generate dashboard');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async suggestImprovements(dashboardFile, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new LLMEnhancementService(config);

    try {
      const content = await fs.readFile(dashboardFile, 'utf-8');
      const dashboard = JSON.parse(content);

      output.startSpinner('Analyzing dashboard for improvements...');
      const suggestions = await service.suggestDashboardImprovements(dashboard);
      output.stopSpinner(true);

      output.print(suggestions, {
        title: 'Dashboard Improvement Suggestions'
      });

      // Display summary
      const totalSuggestions = 
        suggestions.performance.length +
        suggestions.queries.length +
        suggestions.layout.length +
        suggestions.visualizations.length;

      if (totalSuggestions === 0) {
        output.success('No improvements needed - dashboard is well optimized!');
        return;
      }

      output.info(`\nTotal suggestions: ${totalSuggestions}`);

      // Performance suggestions
      if (suggestions.performance.length > 0) {
        output.warning('\nPerformance Improvements:');
        suggestions.performance.forEach((perf, index) => {
          output.warning(`\n${index + 1}. ${perf.issue}`);
          output.info(`   Impact: ${perf.impact}`);
          output.info(`   Solution: ${perf.solution}`);
        });
      }

      // Query optimizations
      if (suggestions.queries.length > 0) {
        output.info('\nQuery Optimizations:');
        suggestions.queries.forEach((query, index) => {
          output.info(`\n${index + 1}. Widget: ${query.widget}`);
          query.optimizations.forEach(opt => {
            output.info(`   • ${opt.description}`);
          });
        });
      }

      // Visualization suggestions
      if (suggestions.visualizations.length > 0) {
        output.info('\nVisualization Improvements:');
        suggestions.visualizations.forEach((viz, index) => {
          output.info(`\n${index + 1}. Widget: ${viz.widget}`);
          output.info(`   Current: ${viz.current}`);
          output.info(`   Suggested: ${viz.suggested}`);
          output.info(`   Reason: ${viz.reason}`);
        });
      }

      // Layout suggestions
      if (suggestions.layout.length > 0) {
        output.warning('\nLayout Issues:');
        suggestions.layout.forEach((layout, index) => {
          const icon = layout.severity === 'error' ? '✗' : '⚠';
          output.warning(`${icon} ${layout.message}`);
        });
      }

      if (options.apply) {
        output.info('\nApplying improvements...');
        // Apply improvements logic would go here
        output.warning('Auto-apply not yet implemented');
      }

    } catch (error) {
      output.stopSpinner(false, 'Failed to analyze dashboard');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async validateBatch(file, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new LLMEnhancementService(config);

    try {
      const content = await fs.readFile(file, 'utf-8');
      const queries = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      output.info(`Found ${queries.length} queries to validate and enhance`);

      const results = [];
      let enhanced = 0;
      let failed = 0;

      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        output.updateSpinner(`Enhancing query ${i + 1}/${queries.length}...`);
        
        try {
          const enhancement = await service.enhanceQuery(query, {
            validateAttributes: true
          });
          
          results.push({
            original: query,
            enhanced: enhancement.enhancedQuery,
            valid: enhancement.valid,
            changed: query !== enhancement.enhancedQuery,
            corrections: enhancement.corrections,
            optimizations: enhancement.optimizations
          });

          if (enhancement.valid) {
            enhanced++;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
          results.push({
            original: query,
            valid: false,
            error: error.message
          });
        }
      }

      output.stopSpinner(failed === 0, `Enhanced ${enhanced} queries`);

      // Display results
      output.info('\nEnhancement Summary:');
      output.info(`  Total queries: ${queries.length}`);
      output.info(`  Successfully enhanced: ${enhanced}`);
      output.info(`  Failed: ${failed}`);

      const changed = results.filter(r => r.changed).length;
      if (changed > 0) {
        output.success(`  Improved: ${changed} queries`);
      }

      // Save results if requested
      if (options.output) {
        const outputContent = results
          .filter(r => r.valid)
          .map(r => r.enhanced)
          .join('\n');
        
        await fs.writeFile(options.output, outputContent);
        output.success(`\nEnhanced queries saved to ${options.output}`);
      }

      // Show details for failed queries
      const failures = results.filter(r => !r.valid);
      if (failures.length > 0 && config.outputFormat !== 'json') {
        output.error('\nFailed queries:');
        failures.forEach((failure, index) => {
          output.error(`\n${index + 1}. ${failure.original}`);
          output.error(`   Error: ${failure.error || 'Unknown error'}`);
        });
      }

      if (config.outputFormat === 'json') {
        output.print(results);
      }

      if (failed > 0) {
        process.exit(1);
      }
    } catch (error) {
      output.error(`Failed to process file: ${error.message}`);
      process.exit(1);
    }
  }
}

module.exports = {
  LLMCommand
};