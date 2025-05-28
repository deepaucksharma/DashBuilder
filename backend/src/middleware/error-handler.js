const logger = require('../utils/logger');
const { serializeError, isOperationalError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  // Log error
  logger.logError(err, req, {
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let status = err.status || 'error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    status = 'fail';
    message = 'Validation Error';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    status = 'fail';
    message = 'Invalid ID format';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    status = 'fail';
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    status = 'fail';
    message = 'Token expired';
  } else if (err.code === 11000) {
    statusCode = 409;
    status = 'fail';
    message = 'Duplicate value';
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && !isOperationalError(err)) {
    message = 'Something went wrong';
  }

  // Serialize error for response
  const errorResponse = serializeError({
    ...err,
    message,
    status,
    statusCode,
  });

  // Add request ID if available
  if (req.id) {
    errorResponse.requestId = req.id;
  }

  // Set cache control headers for errors
  res.set('Cache-Control', 'no-store');

  // Send error response
  res.status(statusCode).json(errorResponse);

  // For critical errors in production, trigger alerts
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    // Here you would trigger alerts to your monitoring service
    logger.error('Critical error occurred', {
      error: err,
      request: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
      },
    });
  }
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  const message = `Cannot ${req.method} ${req.url}`;
  
  logger.warn('404 Not Found', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(404).json({
    status: 'fail',
    statusCode: 404,
    message,
    path: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
};

// Unhandled rejection handler
const unhandledRejectionHandler = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', {
      promise,
      reason: reason?.toString() || 'Unknown reason',
      stack: reason?.stack,
    });
    
    // In production, you might want to gracefully shutdown
    if (process.env.NODE_ENV === 'production') {
      logger.error('Shutting down due to unhandled rejection...');
      process.exit(1);
    }
  });
};

// Uncaught exception handler
const uncaughtExceptionHandler = () => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
      error: error.toString(),
      stack: error.stack,
    });
    
    // Always exit on uncaught exceptions
    logger.error('Shutting down due to uncaught exception...');
    process.exit(1);
  });
};

// Initialize error handlers
const initializeErrorHandlers = () => {
  unhandledRejectionHandler();
  uncaughtExceptionHandler();
};

module.exports = errorHandler;
module.exports.notFoundHandler = notFoundHandler;
module.exports.initializeErrorHandlers = initializeErrorHandlers;