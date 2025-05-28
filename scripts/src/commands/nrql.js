const { Command } = require('commander');
const fs = require('fs/promises');
const { NRQLService } = require('../services/nrql.service.js');
const { Config } = require('../core/config.js');
const { Output } = require('../utils/output.js');
const { validateNRQLQuery } = require('../utils/validators.js');
const { logger } = require('../utils/logger.js');

class NRQLCommand {
  getCommand() {
    const nrql = new Command('nrql')
      .description('NRQL validation, optimization, and intelligence operations');

    nrql
      .command('validate <query>')
      .description('Validate NRQL query syntax and execution')
      .option('--account-id <id>', 'Override default account ID')
      .option('--min-results <n>', 'Minimum expected results', parseInt)
      .option('--max-results <n>', 'Maximum expected results', parseInt)
      .option('--expect-no-error', 'Expect query to run without errors')
      .action(async (query, options) => {
        await this.validateQuery(query, options, nrql.parent.opts());
      });

    nrql
      .command('validate-file <filePath>')
      .description('Batch validate queries from file')
      .option('--account-id <id>', 'Override default account ID')
      .option('--parallel', 'Run validations in parallel')
      .option('--stop-on-error', 'Stop on first validation error')
      .action(async (filePath, options) => {
        await this.validateFile(filePath, options, nrql.parent.opts());
      });

    nrql
      .command('optimize <query>')
      .description('Suggest query optimizations')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (query, options) => {
        await this.optimizeQuery(query, options, nrql.parent.opts());
      });

    nrql
      .command('explain <query>')
      .description('Explain query components and performance')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (query, options) => {
        await this.explainQuery(query, options, nrql.parent.opts());
      });

    nrql
      .command('check-function <functionName>')
      .description('Check if NRQL function is valid')
      .option('--event-type <type>', 'Check compatibility with event type')
      .option('--account-id <id>', 'Override default account ID')
      .action(async (functionName, options) => {
        await this.checkFunction(functionName, options, nrql.parent.opts());
      });

    nrql
      .command('autofix <query>')
      .description('Attempt to automatically fix common query issues')
      .option('--account-id <id>', 'Override default account ID')
      .option('--apply', 'Apply the fix (otherwise just suggest)')
      .action(async (query, options) => {
        await this.autofixQuery(query, options, nrql.parent.opts());
      });

    return nrql;
  }

  async validateQuery(query, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new NRQLService(config);

    try {
      output.startSpinner('Validating query...');
      const validation = await service.validateQuery(query, {
        minResults: options.minResults,
        maxResults: options.maxResults,
        expectNoError: options.expectNoError
      });
      
      const isValid = validation.valid && 
        (!options.expectNoError || !validation.hasErrors) &&
        (!options.minResults || validation.resultCount >= options.minResults) &&
        (!options.maxResults || validation.resultCount <= options.maxResults);
      
      output.stopSpinner(isValid);
      output.print(validation);

      if (!isValid) {
        if (validation.suggestions?.length > 0) {
          output.info('Suggestions:');
          validation.suggestions.forEach(suggestion => {
            output.info(`  • ${suggestion}`);
          });
        }
        process.exit(1);
      }
    } catch (error) {
      output.stopSpinner(false, 'Query validation failed');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async validateFile(filePath, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new NRQLService(config);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const queries = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      output.info(`Found ${queries.length} queries to validate`);

      const results = [];
      let failed = 0;

      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        output.updateSpinner(`Validating query ${i + 1}/${queries.length}...`);
        
        try {
          const validation = await service.validateQuery(query);
          results.push({
            query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
            valid: validation.valid,
            resultCount: validation.resultCount,
            executionTime: validation.executionTime,
            error: validation.error
          });

          if (!validation.valid) {
            failed++;
            if (options.stopOnError) {
              output.stopSpinner(false, `Query ${i + 1} failed`);
              output.error(`Failed query: ${query}`);
              output.error(validation.error || 'Unknown error');
              process.exit(1);
            }
          }
        } catch (error) {
          failed++;
          results.push({
            query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
            valid: false,
            error: error.message
          });

          if (options.stopOnError) {
            output.stopSpinner(false, `Query ${i + 1} failed`);
            output.error(error.message);
            process.exit(1);
          }
        }
      }

      output.stopSpinner(failed === 0, `Validated ${queries.length} queries`);
      
      output.print(results, {
        title: 'Validation Results',
        table: true,
        columns: ['query', 'valid', 'resultCount', 'executionTime', 'error']
      });

      if (failed > 0) {
        output.error(`${failed} queries failed validation`);
        process.exit(1);
      }
    } catch (error) {
      output.error(`Failed to read file: ${error.message}`);
      process.exit(1);
    }
  }

  async optimizeQuery(query, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new NRQLService(config);

    try {
      output.startSpinner('Analyzing query for optimizations...');
      const optimization = await service.optimizeQuery(query);
      output.stopSpinner(true);

      output.print(optimization);

      if (optimization.suggestions?.length > 0) {
        output.info('Optimization Suggestions:');
        optimization.suggestions.forEach((suggestion, index) => {
          output.info(`\n${index + 1}. ${suggestion.description}`);
          if (suggestion.impact) {
            output.info(`   Impact: ${suggestion.impact}`);
          }
          if (suggestion.example) {
            output.info(`   Example: ${suggestion.example}`);
          }
        });
      }

      if (optimization.optimizedQuery && optimization.optimizedQuery !== query) {
        output.success('\nOptimized Query:');
        output.print(optimization.optimizedQuery);
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to optimize query');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async explainQuery(query, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new NRQLService(config);

    try {
      output.startSpinner('Analyzing query...');
      const explanation = await service.explainQuery(query);
      output.stopSpinner(true);

      output.print(explanation, {
        title: 'Query Explanation'
      });

      // Performance warnings
      if (explanation.warnings?.length > 0) {
        output.warning('\nPerformance Warnings:');
        explanation.warnings.forEach(warning => {
          output.warning(`  • ${warning}`);
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to explain query');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async checkFunction(functionName, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new NRQLService(config);

    try {
      output.startSpinner(`Checking function '${functionName}'...`);
      const functionInfo = await service.checkFunctionSupport(functionName, options.eventType);
      output.stopSpinner(functionInfo.supported);

      output.print(functionInfo);

      if (!functionInfo.supported && functionInfo.suggestions?.length > 0) {
        output.info('\nDid you mean:');
        functionInfo.suggestions.forEach(suggestion => {
          output.info(`  • ${suggestion}`);
        });
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to check function');
      output.error(error.message, error);
      process.exit(1);
    }
  }

  async autofixQuery(query, options, globalOptions) {
    const config = new Config({ ...globalOptions, ...options });
    const output = new Output(config.outputFormat, config.quiet);
    const service = new NRQLService(config);

    try {
      output.startSpinner('Analyzing query for fixes...');
      const fixes = await service.autofixQuery(query);
      output.stopSpinner(fixes.hasFixableIssues);

      output.print(fixes);

      if (fixes.fixedQuery && fixes.fixedQuery !== query) {
        output.success('\nFixed Query:');
        output.print(fixes.fixedQuery);

        if (options.apply) {
          output.info('\nValidating fixed query...');
          const validation = await service.validateQuery(fixes.fixedQuery);
          
          if (validation.valid) {
            output.success('Fixed query is valid!');
          } else {
            output.error('Fixed query still has issues');
            process.exit(1);
          }
        }
      } else {
        output.info('No automatic fixes available');
      }
    } catch (error) {
      output.stopSpinner(false, 'Failed to autofix query');
      output.error(error.message, error);
      process.exit(1);
    }
  }
}

module.exports = {
  NRQLCommand
};