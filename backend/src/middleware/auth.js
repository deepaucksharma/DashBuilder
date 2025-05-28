const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    // Extract token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided', 401);
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    
    // Check token expiration
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      throw new AppError('Token expired', 401);
    }

    // Attach user to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      accountId: decoded.accountId,
      role: decoded.role || 'user',
    };

    // Log authentication
    logger.debug('User authenticated:', {
      userId: req.user.id,
      email: req.user.email,
      path: req.path,
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(new AppError('Invalid token', 401));
    } else if (error.name === 'TokenExpiredError') {
      next(new AppError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

// Optional auth middleware - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    
    req.user = {
      id: decoded.id,
      email: decoded.email,
      accountId: decoded.accountId,
      role: decoded.role || 'user',
    };
  } catch (error) {
    // Ignore errors for optional auth
    logger.debug('Optional auth failed:', error.message);
  }
  
  next();
};

// Role-based access control
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// API key authentication for service-to-service
const apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      throw new AppError('API key required', 401);
    }

    // In production, verify against stored API keys
    // For now, we'll check against environment variable
    if (apiKey !== process.env.SERVICE_API_KEY) {
      throw new AppError('Invalid API key', 401);
    }

    req.service = {
      authenticated: true,
      type: 'api-key',
    };

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authMiddleware,
  optionalAuth,
  requireRole,
  apiKeyAuth,
};