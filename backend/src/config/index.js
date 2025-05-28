require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  wsPort: process.env.WS_PORT || 8080,
  
  // New Relic
  newRelic: {
    apiKey: process.env.NEW_RELIC_API_KEY,
    accountId: process.env.NEW_RELIC_ACCOUNT_ID,
    nerdGraphEndpoint: process.env.NERDGRAPH_ENDPOINT || 'https://api.newrelic.com/graphql',
  },
  
  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
  },
  
  // Authentication
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
  
  // CORS
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  
  // Metrics
  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true',
    port: process.env.METRICS_PORT || 9090,
  },
};