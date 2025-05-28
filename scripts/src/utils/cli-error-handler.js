/**
 * CLI Error Handler
 * Provides centralized error handling for CLI commands
 */

const chalk = require('chalk');
const { logger } = require('./logger.js');

class CLIError extends Error {
  constructor(message, code = 1, details = null) {
    super(message);
    this.name = 'CLIError';
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends CLIError {
  constructor(message, details = null) {
    super(message, 2, details);
    this.name = 'ValidationError';
  }
}

class APIError extends CLIError {
  constructor(message, details = null) {
    super(message, 3, details);
    this.name = 'APIError';
  }
}

class ConfigError extends CLIError {
  constructor(message, details = null) {
    super(message, 4, details);
    this.name = 'ConfigError';
  }
}

/**
 * Handle errors in CLI context
 * @param {Error} error - The error to handle
 * @param {Object} options - Options for error handling
 */
function handleCLIError(error, options = {}) {
  const { verbose = false, exitOnError = true } = options;
  
  // Log error details
  if (error instanceof CLIError) {
    console.error(chalk.red(`\n❌ ${error.name}: ${error.message}\n`));
    
    if (error.details && verbose) {
      console.error(chalk.gray('Error details:'));
      console.error(error.details);
    }
    
    logger.error(`${error.name}: ${error.message}`, error.details);
  } else {
    // Generic error
    console.error(chalk.red(`\n❌ Error: ${error.message}\n`));
    
    if (verbose && error.stack) {
      console.error(chalk.gray('Stack trace:'));
      console.error(error.stack);
    }
    
    logger.error('Unhandled error', { message: error.message, stack: error.stack });
  }
  
  // Exit if required (for CLI usage)
  if (exitOnError) {
    process.exit(error.code || 1);
  }
  
  // Otherwise, re-throw for programmatic usage
  throw error;
}

/**
 * Wrap async functions for CLI error handling
 * @param {Function} fn - The async function to wrap
 * @returns {Function} - The wrapped function
 */
function withCLIErrorHandler(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleCLIError(error, { exitOnError: true });
    }
  };
}

/**
 * Create error from API response
 * @param {Object} response - API response
 * @returns {APIError} - API error instance
 */
function createAPIError(response) {
  const message = response.error || response.message || 'API request failed';
  const details = {
    status: response.status,
    statusText: response.statusText,
    data: response.data
  };
  
  return new APIError(message, details);
}

module.exports = {
  CLIError,
  ValidationError,
  APIError,
  ConfigError,
  handleCLIError,
  withCLIErrorHandler,
  createAPIError
};