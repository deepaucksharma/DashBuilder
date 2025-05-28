const promClient = require('prom-client');
const logger = require('../utils/logger');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
});

const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['operation'],
});

const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['operation'],
});

const wsConnections = new promClient.Gauge({
  name: 'websocket_connections',
  help: 'Number of active WebSocket connections',
});

const wsMessages = new promClient.Counter({
  name: 'websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['type', 'direction'],
});

const nerdGraphQueries = new promClient.Counter({
  name: 'nerdgraph_queries_total',
  help: 'Total number of NerdGraph queries',
  labelNames: ['operation', 'status'],
});

const nerdGraphDuration = new promClient.Histogram({
  name: 'nerdgraph_query_duration_seconds',
  help: 'Duration of NerdGraph queries in seconds',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

const authAttempts = new promClient.Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'status'],
});

const dashboardOperations = new promClient.Counter({
  name: 'dashboard_operations_total',
  help: 'Total number of dashboard operations',
  labelNames: ['operation', 'status'],
});

// Register all custom metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(activeConnections);
register.registerMetric(cacheHits);
register.registerMetric(cacheMisses);
register.registerMetric(wsConnections);
register.registerMetric(wsMessages);
register.registerMetric(nerdGraphQueries);
register.registerMetric(nerdGraphDuration);
register.registerMetric(authAttempts);
register.registerMetric(dashboardOperations);

// Middleware to track HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Increment active connections
  activeConnections.inc();
  
  // Track response
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const labels = {
      method: req.method,
      route: route,
      status_code: res.statusCode,
    };
    
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
    activeConnections.dec();
    
    // Store duration for logging
    res.locals.duration = duration;
    
    // Log slow requests
    if (duration > 1) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration,
        statusCode: res.statusCode,
      });
    }
  });
  
  next();
};

// Helper functions to track custom metrics
const trackCacheHit = (operation) => {
  cacheHits.inc({ operation });
};

const trackCacheMiss = (operation) => {
  cacheMisses.inc({ operation });
};

const trackWebSocketConnection = (delta) => {
  wsConnections.inc(delta);
};

const trackWebSocketMessage = (type, direction) => {
  wsMessages.inc({ type, direction });
};

const trackNerdGraphQuery = (operation, status, duration) => {
  nerdGraphQueries.inc({ operation, status });
  if (duration) {
    nerdGraphDuration.observe({ operation }, duration);
  }
};

const trackAuthAttempt = (type, status) => {
  authAttempts.inc({ type, status });
};

const trackDashboardOperation = (operation, status) => {
  dashboardOperations.inc({ operation, status });
};

// Endpoint to expose metrics
const metricsHandler = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).end();
  }
};

// Export metrics utilities
const metrics = {
  register,
  trackCacheHit,
  trackCacheMiss,
  trackWebSocketConnection,
  trackWebSocketMessage,
  trackNerdGraphQuery,
  trackAuthAttempt,
  trackDashboardOperation,
  // Direct access to metrics
  httpRequestDuration,
  httpRequestTotal,
  activeConnections,
  cacheHits,
  cacheMisses,
  wsConnections,
  wsMessages,
  nerdGraphQueries,
  nerdGraphDuration,
  authAttempts,
  dashboardOperations,
};

module.exports = metricsMiddleware;
module.exports.handler = metricsHandler;
module.exports.metrics = metrics;