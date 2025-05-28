/**
 * Common logging utilities for DashBuilder
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4
};

// Default to info if not specified
const logLevel = process.env.LOG_LEVEL ? 
  (LOG_LEVELS[process.env.LOG_LEVEL.toLowerCase()] || LOG_LEVELS.info) : 
  LOG_LEVELS.info;

/**
 * Logs a debug message
 * @param {string} message - Message to log
 */
function debug(message) {
  if (logLevel <= LOG_LEVELS.debug) {
    console.log(`\x1b[90m[DEBUG]\x1b[0m ${message}`);
  }
}

/**
 * Logs an info message
 * @param {string} message - Message to log
 */
function info(message) {
  if (logLevel <= LOG_LEVELS.info) {
    console.log(`\x1b[34m[INFO]\x1b[0m ${message}`);
  }
}

/**
 * Logs a warning message
 * @param {string} message - Message to log
 */
function warn(message) {
  if (logLevel <= LOG_LEVELS.warn) {
    console.log(`\x1b[33m[WARN]\x1b[0m ${message}`);
  }
}

/**
 * Logs an error message
 * @param {string} message - Message to log
 */
function error(message) {
  if (logLevel <= LOG_LEVELS.error) {
    console.log(`\x1b[31m[ERROR]\x1b[0m ${message}`);
  }
}

module.exports = {
  debug,
  info,
  warn,
  error,
  LOG_LEVELS
};
