/**
 * DashBuilder Orchestrator Service
 * Manages dashboard operations, NRDOT experiments, and health monitoring
 */

const express = require('express');
const { Client } = require('pg');
const redis = require('redis');
const axios = require('axios');
const winston = require('winston');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Express app setup
const app = express();
app.use(express.json());

// Database connection
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgres://dashbuilder:postgres@postgres:5432/dashbuilder'
});

// Redis connection
let redisClient;

// Initialize connections
async function initializeConnections() {
  try {
    // Connect to PostgreSQL
    await pgClient.connect();
    logger.info('Connected to PostgreSQL');
    
    // Initialize database schema
    await initializeDatabase();
    
    // Connect to Redis
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://redis:6379'
    });
    
    redisClient.on('error', (err) => logger.error('Redis Client Error', err));
    await redisClient.connect();
    logger.info('Connected to Redis');
    
  } catch (error) {
    logger.error('Failed to initialize connections:', error);
    // Don't exit - allow service to run for health checks
  }
}

// Initialize database schema
async function initializeDatabase() {
  try {
    // Create experiments table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS experiments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        profile VARCHAR(50) NOT NULL,
        start_time TIMESTAMP DEFAULT NOW(),
        end_time TIMESTAMP,
        status VARCHAR(50) DEFAULT 'running',
        metrics JSONB,
        config JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create dashboards table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS dashboards (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        dashboard_id VARCHAR(255),
        config JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create metrics table for tracking
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS metrics_tracking (
        id SERIAL PRIMARY KEY,
        metric_name VARCHAR(255) NOT NULL,
        value NUMERIC,
        tags JSONB,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);
    
    logger.info('Database schema initialized');
  } catch (error) {
    logger.error('Failed to initialize database schema:', error);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      api: 'up',
      postgres: pgClient._connected ? 'connected' : 'disconnected',
      redis: redisClient?.isOpen ? 'connected' : 'disconnected'
    }
  };
  
  res.json(health);
});

// API endpoints
app.get('/api/experiments', async (req, res) => {
  try {
    const result = await pgClient.query('SELECT * FROM experiments ORDER BY created_at DESC LIMIT 20');
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to fetch experiments:', error);
    res.status(500).json({ error: 'Failed to fetch experiments' });
  }
});

app.post('/api/experiments', async (req, res) => {
  try {
    const { name, profile, config } = req.body;
    const result = await pgClient.query(
      'INSERT INTO experiments (name, profile, config) VALUES ($1, $2, $3) RETURNING *',
      [name, profile, config || {}]
    );
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to create experiment:', error);
    res.status(500).json({ error: 'Failed to create experiment' });
  }
});

app.get('/api/dashboards', async (req, res) => {
  try {
    const result = await pgClient.query('SELECT * FROM dashboards ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to fetch dashboards:', error);
    res.status(500).json({ error: 'Failed to fetch dashboards' });
  }
});

app.post('/api/dashboards', async (req, res) => {
  try {
    const { name, dashboard_id, config } = req.body;
    const result = await pgClient.query(
      'INSERT INTO dashboards (name, dashboard_id, config) VALUES ($1, $2, $3) RETURNING *',
      [name, dashboard_id, config || {}]
    );
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to create dashboard:', error);
    res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

// Metrics endpoint for monitoring
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = {
      experiments: {
        total: await getCount('experiments'),
        running: await getCount('experiments', "status = 'running'"),
        completed: await getCount('experiments', "status = 'completed'")
      },
      dashboards: {
        total: await getCount('dashboards')
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to fetch metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Helper function to get counts
async function getCount(table, where = null) {
  try {
    const query = where ? `SELECT COUNT(*) FROM ${table} WHERE ${where}` : `SELECT COUNT(*) FROM ${table}`;
    const result = await pgClient.query(query);
    return parseInt(result.rows[0].count);
  } catch (error) {
    return 0;
  }
}

// Dashboard UI route (serve static files)
app.get('/', (req, res) => {
  res.json({
    service: 'DashBuilder Orchestrator',
    version: '1.0.0',
    endpoints: [
      '/health',
      '/api/experiments',
      '/api/dashboards',
      '/api/metrics'
    ]
  });
});

// Background job to check New Relic data
cron.schedule('*/5 * * * *', async () => {
  try {
    logger.info('Running New Relic data check...');
    
    // Check if data is flowing to New Relic
    const response = await axios({
      method: 'POST',
      url: `https://api.newrelic.com/graphql`,
      headers: {
        'Content-Type': 'application/json',
        'API-Key': process.env.NEW_RELIC_API_KEY
      },
      data: {
        query: `{
          actor {
            account(id: ${process.env.NEW_RELIC_ACCOUNT_ID}) {
              nrql(query: "SELECT count(*) FROM Metric WHERE metricName LIKE 'otelcol_%' SINCE 5 minutes ago") {
                results
              }
            }
          }
        }`
      }
    });
    
    const count = response.data?.data?.actor?.account?.nrql?.results?.[0]?.count || 0;
    logger.info(`OTEL metrics count in last 5 minutes: ${count}`);
    
    // Store in Redis for quick access
    if (redisClient?.isOpen) {
      await redisClient.set('nrdot:metrics:count', count, { EX: 300 });
    }
    
  } catch (error) {
    logger.error('Failed to check New Relic data:', error.message);
  }
});

// Start server
const PORT = process.env.APP_PORT || 8080;
const UI_PORT = process.env.UI_PORT || 3000;

// Start API server
app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`Orchestrator API running on port ${PORT}`);
  await initializeConnections();
});

// Simple UI server for port 3000
const uiApp = express();
uiApp.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>DashBuilder</title></head>
      <body>
        <h1>DashBuilder Dashboard</h1>
        <p>API Server: <a href="http://localhost:${PORT}">http://localhost:${PORT}</a></p>
        <p>Health Check: <a href="http://localhost:${PORT}/health">http://localhost:${PORT}/health</a></p>
        <p>Experiments: <a href="http://localhost:${PORT}/api/experiments">http://localhost:${PORT}/api/experiments</a></p>
        <p>Dashboards: <a href="http://localhost:${PORT}/api/dashboards">http://localhost:${PORT}/api/dashboards</a></p>
      </body>
    </html>
  `);
});

uiApp.listen(UI_PORT, '0.0.0.0', () => {
  logger.info(`Dashboard UI running on port ${UI_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await pgClient.end();
  await redisClient?.quit();
  process.exit(0);
});