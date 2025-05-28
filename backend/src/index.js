const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const WebSocket = require('ws');
const http = require('http');
const { promisify } = require('util');
const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/error-handler');
const authMiddleware = require('./middleware/auth');
const rateLimiter = require('./middleware/rate-limiter');
const metricsMiddleware = require('./middleware/metrics');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboards');
const nerdgraphRoutes = require('./routes/nerdgraph');
const queryRoutes = require('./routes/queries');
const WebSocketManager = require('./services/websocket-manager');
const CacheManager = require('./services/cache-manager');

const app = express();
const server = http.createServer(app);

// Initialize services
const cacheManager = new CacheManager();
const wsManager = new WebSocketManager(server);

// Global middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.newrelic.com", "wss:"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined', { stream: logger.stream }));
app.use(metricsMiddleware);

// API Routes
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboards', authMiddleware, rateLimiter, dashboardRoutes);
app.use('/api/nerdgraph', authMiddleware, rateLimiter, nerdgraphRoutes);
app.use('/api/queries', authMiddleware, rateLimiter, queryRoutes);

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

async function startServer() {
  try {
    // Connect to Redis
    await cacheManager.connect();
    
    // Make services available to routes
    app.locals.cache = cacheManager;
    app.locals.wsManager = wsManager;
    
    // Start HTTP server
    await promisify(server.listen).bind(server)(PORT);
    logger.info(`HTTP server listening on port ${PORT}`);
    
    // Start WebSocket server
    wsManager.start();
    logger.info(`WebSocket server listening on port ${WS_PORT}`);
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      
      server.close(() => {
        logger.info('HTTP server closed');
      });
      
      wsManager.stop();
      await cacheManager.disconnect();
      
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, server };