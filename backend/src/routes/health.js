const express = require('express');
const os = require('os');
const config = require('../config');
const logger = require('../utils/logger');
const { version } = require('../../package.json');

const router = express.Router();

// Basic health check
router.get('/', async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'dashbuilder-backend',
    version,
  });
});

// Readiness check
router.get('/ready', async (req, res) => {
  const checks = {
    redis: false,
    newRelic: false,
  };
  
  try {
    // Check Redis connection
    const cache = req.app.locals.cache;
    if (cache && await cache.ping()) {
      checks.redis = true;
    }
    
    // Check New Relic API key
    if (config.newRelic.apiKey) {
      checks.newRelic = true;
    }
    
    const allHealthy = Object.values(checks).every(v => v === true);
    
    if (allHealthy) {
      res.json({
        status: 'ready',
        checks,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        checks,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Readiness check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Liveness check
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Detailed health check (protected)
router.get('/detailed', async (req, res) => {
  // Check for admin token or internal request
  const token = req.headers['x-health-token'];
  if (token !== process.env.HEALTH_CHECK_TOKEN && req.ip !== '127.0.0.1') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: {
      name: 'dashbuilder-backend',
      version,
      environment: config.env,
      uptime: process.uptime(),
      pid: process.pid,
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: os.loadavg(),
      cpus: os.cpus().length,
    },
    process: {
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
    },
    dependencies: {},
  };
  
  // Check dependencies
  try {
    const cache = req.app.locals.cache;
    if (cache && await cache.ping()) {
      health.dependencies.redis = {
        status: 'connected',
        latency: await measureRedisLatency(cache),
      };
    } else {
      health.dependencies.redis = { status: 'disconnected' };
    }
  } catch (error) {
    health.dependencies.redis = { 
      status: 'error', 
      error: error.message,
    };
  }
  
  // Check WebSocket server
  const wsManager = req.app.locals.wsManager;
  if (wsManager && wsManager.wss) {
    health.dependencies.websocket = {
      status: 'running',
      clients: wsManager.clients.size,
      subscriptions: wsManager.subscriptions.size,
      rooms: wsManager.rooms.size,
    };
  } else {
    health.dependencies.websocket = { status: 'not running' };
  }
  
  // Check New Relic API
  if (config.newRelic.apiKey) {
    health.dependencies.newRelic = {
      status: 'configured',
      endpoint: config.newRelic.nerdGraphEndpoint,
    };
  } else {
    health.dependencies.newRelic = { status: 'not configured' };
  }
  
  // Overall status
  const hasErrors = Object.values(health.dependencies).some(
    dep => dep.status === 'error' || dep.status === 'disconnected'
  );
  
  if (hasErrors) {
    health.status = 'degraded';
    res.status(503);
  }
  
  res.json(health);
});

// Measure Redis latency
async function measureRedisLatency(cache) {
  const start = process.hrtime.bigint();
  await cache.ping();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6; // Convert to milliseconds
}

module.exports = router;