const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const config = require('../config');
const logger = require('../utils/logger');

// Create different rate limiters for different endpoints
const createRateLimiter = (options = {}) => {
  const defaults = {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded:', {
        ip: req.ip,
        path: req.path,
        userId: req.user?.id,
      });
      
      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.round(options.windowMs / 1000),
      });
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/ready';
    },
  };

  const settings = { ...defaults, ...options };

  // Use Redis store if available
  if (config.redis.url && global.redisClient) {
    settings.store = new RedisStore({
      client: global.redisClient,
      prefix: 'rl:',
    });
  }

  return rateLimit(settings);
};

// Default rate limiter
const defaultLimiter = createRateLimiter();

// Strict rate limiter for auth endpoints
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Use email for auth endpoints if available
    return req.body?.email || req.ip;
  },
});

// Lenient rate limiter for read operations
const readLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
});

// Strict rate limiter for write operations
const writeLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per window
});

// API key rate limiter (more lenient)
const apiKeyLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per window
  keyGenerator: (req) => {
    return req.headers['x-api-key'] || req.ip;
  },
});

// Dynamic rate limiter based on user tier
const tieredLimiter = (req, res, next) => {
  const userTier = req.user?.tier || 'free';
  
  const limits = {
    free: { windowMs: 60 * 1000, max: 50 },
    pro: { windowMs: 60 * 1000, max: 200 },
    enterprise: { windowMs: 60 * 1000, max: 1000 },
  };

  const limiter = createRateLimiter(limits[userTier] || limits.free);
  return limiter(req, res, next);
};

// Cost-based rate limiter for expensive operations
const costBasedLimiter = (costFn) => {
  return async (req, res, next) => {
    const cost = await costFn(req);
    const limiter = createRateLimiter({
      points: config.rateLimit.max,
      duration: config.rateLimit.windowMs / 1000,
      execEvenly: false,
      keyGenerator: (req) => req.user?.id || req.ip,
      pointsConsumed: cost,
    });
    
    return limiter(req, res, next);
  };
};

// Middleware to set rate limit headers
const setRateLimitHeaders = (req, res, next) => {
  res.setHeader('X-RateLimit-Policy', 'https://dashbuilder.example.com/rate-limits');
  next();
};

module.exports = {
  default: defaultLimiter,
  auth: authLimiter,
  read: readLimiter,
  write: writeLimiter,
  apiKey: apiKeyLimiter,
  tiered: tieredLimiter,
  costBased: costBasedLimiter,
  setHeaders: setRateLimitHeaders,
  createRateLimiter,
};

// Export default limiter as main export
module.exports = defaultLimiter;
module.exports.auth = authLimiter;
module.exports.read = readLimiter;
module.exports.write = writeLimiter;
module.exports.apiKey = apiKeyLimiter;
module.exports.tiered = tieredLimiter;
module.exports.costBased = costBasedLimiter;
module.exports.setHeaders = setRateLimitHeaders;
module.exports.create = createRateLimiter;