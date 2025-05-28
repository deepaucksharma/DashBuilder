const winston = require('winston');
const config = require('../config');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : config.logging.level || 'info';
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const transports = [
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? productionFormat : format,
  }),
];

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: productionFormat,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: productionFormat,
    })
  );
}

const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  exitOnError: false,
});

// Stream for Morgan
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Helper methods for structured logging
logger.logRequest = (req, additionalInfo = {}) => {
  logger.info('Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.user?.id,
    ...additionalInfo,
  });
};

logger.logResponse = (req, res, additionalInfo = {}) => {
  logger.info('Response', {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    userId: req.user?.id,
    duration: res.locals.duration,
    ...additionalInfo,
  });
};

logger.logError = (error, req = null, additionalInfo = {}) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...additionalInfo,
  };

  if (req) {
    errorInfo.request = {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userId: req.user?.id,
    };
  }

  logger.error('Error occurred', errorInfo);
};

logger.logMetric = (name, value, tags = {}) => {
  logger.info('Metric', {
    metric: name,
    value,
    tags,
    timestamp: new Date().toISOString(),
  });
};

logger.logAudit = (action, userId, details = {}) => {
  logger.info('Audit', {
    action,
    userId,
    details,
    timestamp: new Date().toISOString(),
  });
};

module.exports = logger;