class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(retryAfter = 60) {
    super('Rate limit exceeded', 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

class ExternalServiceError extends AppError {
  constructor(service, originalError) {
    super(`External service error: ${service}`, 502);
    this.name = 'ExternalServiceError';
    this.service = service;
    this.originalError = originalError;
  }
}

class DatabaseError extends AppError {
  constructor(operation, originalError) {
    super(`Database error during ${operation}`, 500);
    this.name = 'DatabaseError';
    this.operation = operation;
    this.originalError = originalError;
  }
}

// Error factory
const createError = (type, ...args) => {
  const errorTypes = {
    validation: ValidationError,
    auth: AuthenticationError,
    authorization: AuthorizationError,
    notFound: NotFoundError,
    conflict: ConflictError,
    rateLimit: RateLimitError,
    external: ExternalServiceError,
    database: DatabaseError,
  };

  const ErrorClass = errorTypes[type] || AppError;
  return new ErrorClass(...args);
};

// Error handler for async routes
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Error serializer
const serializeError = (error) => {
  const serialized = {
    message: error.message,
    status: error.status || 'error',
    statusCode: error.statusCode || 500,
  };

  if (error.details) {
    serialized.details = error.details;
  }

  if (error.retryAfter) {
    serialized.retryAfter = error.retryAfter;
  }

  if (process.env.NODE_ENV === 'development') {
    serialized.stack = error.stack;
    serialized.name = error.name;
  }

  return serialized;
};

// Error predicates
const isOperationalError = (error) => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};

const isValidationError = (error) => {
  return error instanceof ValidationError || 
         error.name === 'ValidationError' ||
         error.statusCode === 400;
};

const isAuthError = (error) => {
  return error instanceof AuthenticationError || 
         error instanceof AuthorizationError ||
         error.statusCode === 401 ||
         error.statusCode === 403;
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  DatabaseError,
  createError,
  asyncHandler,
  serializeError,
  isOperationalError,
  isValidationError,
  isAuthError,
};