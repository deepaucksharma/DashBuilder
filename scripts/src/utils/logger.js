const winston = require('winston');
const chalk = require('chalk');

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    verbose: 4
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'cyan',
    debug: 'gray',
    verbose: 'magenta'
  }
};

// Console format with colors
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const colorize = {
      error: chalk.red,
      warn: chalk.yellow,
      info: chalk.cyan,
      debug: chalk.gray,
      verbose: chalk.magenta
    };

    const color = colorize[level] || chalk.white;
    let output = `${chalk.gray(timestamp)} ${color(`[${level.toUpperCase()}]`)} ${message}`;
    
    if (Object.keys(meta).length > 0) {
      output += ' ' + chalk.gray(JSON.stringify(meta));
    }
    
    return output;
  })
);

// JSON format for programmatic use
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.NR_GUARDIAN_LOG_LEVEL || 'info',
  format: jsonFormat,
  transports: [
    new winston.transports.Console({
      format: process.env.NR_GUARDIAN_OUTPUT_JSON === 'true' ? jsonFormat : consoleFormat
    })
  ]
});

// Add color support
winston.addColors(customLevels.colors);

// Helper functions for structured logging
function logSuccess(message, data = {}) {
  logger.info(chalk.green('✓ ') + message, data);
}

function logError(message, error = null) {
  const errorData = error ? {
    error: error.message,
    stack: error.stack,
    ...(error.details && { details: error.details })
  } : {};
  
  logger.error(chalk.red('✗ ') + message, errorData);
}

function logWarning(message, data = {}) {
  logger.warn(chalk.yellow('⚠ ') + message, data);
}

function logDebug(message, data = {}) {
  logger.debug(message, data);
}

function setLogLevel(level) {
  logger.level = level;
}

function setOutputFormat(format) {
  if (format === 'json') {
    logger.transports[0].format = jsonFormat;
    process.env.NR_GUARDIAN_OUTPUT_JSON = 'true';
  } else {
    logger.transports[0].format = consoleFormat;
    process.env.NR_GUARDIAN_OUTPUT_JSON = 'false';
  }
}

module.exports = {
  logger,
  logSuccess,
  logError,
  logWarning,
  logDebug,
  setLogLevel,
  setOutputFormat
};