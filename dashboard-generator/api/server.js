const express = require('express');
const { DashboardGenerator } = require('../index');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());

// Initialize dashboard generator
const generator = new DashboardGenerator({
  apiKey: process.env.NEW_RELIC_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID
});

// Middleware for error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'dashboard-generator',
    timestamp: new Date().toISOString()
  });
});

// List available templates
app.get('/api/templates', (req, res) => {
  const templates = generator.getAvailableTemplates();
  res.json({
    templates,
    count: templates.length
  });
});

// Discover metrics
app.get('/api/metrics/discover', asyncHandler(async (req, res) => {
  const { namespace, pattern, limit = 100 } = req.query;
  
  const result = await generator.discoverMetrics({
    namespace,
    pattern,
    limit: parseInt(limit)
  });
  
  res.json(result);
}));

// Search metrics
app.get('/api/metrics/search/:term', asyncHandler(async (req, res) => {
  const { term } = req.params;
  const { limit = 50 } = req.query;
  
  const result = await generator.searchMetrics(term, {
    limit: parseInt(limit)
  });
  
  res.json(result);
}));

// Generate dashboard
app.post('/api/dashboards/generate', asyncHandler(async (req, res) => {
  const {
    name,
    description,
    template = 'auto',
    metrics = {},
    layoutPreference = 'balanced',
    timeRange = '1 hour',
    autoRefresh = true
  } = req.body;
  
  const result = await generator.generate({
    name,
    description,
    template,
    metrics,
    layoutPreference,
    timeRange,
    autoRefresh
  });
  
  res.json({
    success: true,
    dashboard: result.dashboard,
    metadata: result.metadata
  });
}));

// Preview dashboard
app.post('/api/dashboards/preview', asyncHandler(async (req, res) => {
  const options = req.body;
  
  const result = await generator.preview(options);
  
  res.json({
    success: true,
    dashboard: result.dashboard,
    metadata: result.metadata,
    preview: result.preview
  });
}));

// Deploy dashboard
app.post('/api/dashboards/deploy', asyncHandler(async (req, res) => {
  const { dashboard } = req.body;
  
  if (!dashboard) {
    return res.status(400).json({
      success: false,
      error: 'Dashboard configuration required'
    });
  }
  
  const deployment = await generator.deploy(dashboard);
  
  res.json({
    success: true,
    deployment
  });
}));

// Generate and deploy in one step
app.post('/api/dashboards/generate-deploy', asyncHandler(async (req, res) => {
  const options = req.body;
  
  const result = await generator.generateAndDeploy(options);
  
  res.json({
    success: true,
    dashboard: result.dashboard,
    metadata: result.metadata,
    deployment: result.deployment
  });
}));

// Get metric metadata
app.get('/api/metrics/:metricName/metadata', asyncHandler(async (req, res) => {
  const { metricName } = req.params;
  
  const metadata = await generator.orchestrator.metricDiscovery.getMetricMetadata(metricName);
  
  if (!metadata) {
    return res.status(404).json({
      success: false,
      error: 'Metric not found'
    });
  }
  
  res.json({
    success: true,
    metadata
  });
}));

// Validate dashboard
app.post('/api/dashboards/validate', asyncHandler(async (req, res) => {
  const { dashboard } = req.body;
  
  if (!dashboard) {
    return res.status(400).json({
      success: false,
      error: 'Dashboard configuration required'
    });
  }
  
  const validation = await generator.orchestrator.validateDashboard(dashboard);
  
  res.json({
    success: validation.valid,
    valid: validation.valid,
    errors: validation.errors
  });
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
const PORT = process.env.DASHBOARD_API_PORT || 3001;

app.listen(PORT, () => {
  console.log(`Dashboard Generator API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;