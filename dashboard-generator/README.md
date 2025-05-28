# Dashboard Generator

An intelligent dashboard generation platform for New Relic that automatically creates optimized dashboards based on available metrics.

## Features

- **Automatic Metric Discovery**: Discovers available metrics from your New Relic account
- **Intelligent Classification**: Classifies metrics by type, category, and characteristics
- **Template-Based Generation**: Pre-built templates for common dashboard patterns
- **Query Optimization**: Generates optimized NRQL queries for each metric
- **Layout Optimization**: Arranges widgets for optimal visual hierarchy
- **Deployment Automation**: Direct deployment to New Relic via NerdGraph API

## Installation

```bash
npm install @dashbuilder/dashboard-generator
```

## Quick Start

```javascript
const { DashboardGenerator } = require('@dashbuilder/dashboard-generator');

const generator = new DashboardGenerator({
  apiKey: 'YOUR_NEW_RELIC_API_KEY',
  accountId: 'YOUR_ACCOUNT_ID'
});

// Generate a system health dashboard
const result = await generator.generate({
  name: 'System Health',
  template: 'system-health',
  metrics: {
    include: ['system.*', 'host.*']
  }
});

// Deploy the dashboard
const deployment = await generator.deploy(result.dashboard);
console.log('Dashboard URL:', deployment.permalink);
```

## API Reference

### DashboardGenerator

#### Constructor

```javascript
new DashboardGenerator(config)
```

**Config Options:**
- `apiKey` (required): New Relic API key
- `accountId` (required): New Relic account ID
- `layoutOptions` (optional): Layout configuration
  - `gridColumns`: Number of grid columns (default: 12)
  - `minWidgetWidth`: Minimum widget width (default: 3)
  - `defaultRowHeight`: Default row height (default: 3)

#### Methods

##### generate(options)

Generates a dashboard based on the provided options.

```javascript
const result = await generator.generate({
  name: 'Dashboard Name',
  description: 'Dashboard description',
  template: 'system-health', // or 'auto' for automatic selection
  metrics: {
    include: ['pattern.*'], // Metric patterns to include
    exclude: ['*.internal.*'], // Patterns to exclude
    namespace: 'app' // Optional namespace filter
  },
  layoutPreference: 'balanced', // 'compact', 'balanced', or 'detailed'
  timeRange: '1 hour', // Default time range
  autoRefresh: true // Enable auto-refresh
});
```

**Returns:**
```javascript
{
  dashboard: { /* Dashboard structure */ },
  metadata: {
    metricsUsed: 25,
    widgetsCreated: 12,
    template: 'system-health',
    generatedAt: '2024-01-01T00:00:00Z'
  }
}
```

##### deploy(dashboard)

Deploys a dashboard to New Relic.

```javascript
const deployment = await generator.deploy(dashboard);
```

**Returns:**
```javascript
{
  guid: 'dashboard-guid',
  name: 'Dashboard Name',
  permalink: 'https://one.newrelic.com/dashboards/...'
}
```

##### discoverMetrics(options)

Discovers available metrics.

```javascript
const discovery = await generator.discoverMetrics({
  namespace: 'app',
  pattern: 'request.*',
  limit: 1000
});
```

##### searchMetrics(searchTerm, options)

Searches for metrics by name.

```javascript
const results = await generator.searchMetrics('cpu', {
  limit: 100
});
```

## Templates

### Built-in Templates

1. **system-health**: System and infrastructure metrics
2. **application-performance**: Application performance metrics
3. **cost-optimization**: Cost and resource utilization metrics
4. **business-kpi**: Business metrics and KPIs
5. **general-metrics**: General purpose template

### Custom Templates

Create custom templates by extending the template engine:

```javascript
const { DashboardTemplateEngine } = require('@dashbuilder/dashboard-generator');

const engine = new DashboardTemplateEngine();
engine.addTemplate('my-template', {
  name: 'my-template',
  description: 'My custom template',
  sections: [
    {
      title: 'Section 1',
      widgets: [
        {
          type: 'line',
          title: 'Custom Widget',
          metrics: ['my.metric.*']
        }
      ]
    }
  ]
});
```

## Examples

### System Health Dashboard

```javascript
const result = await generator.generate({
  name: 'System Health Overview',
  template: 'system-health',
  metrics: {
    include: [
      'system.cpu.*',
      'system.memory.*',
      'system.disk.*'
    ]
  },
  layoutPreference: 'balanced'
});
```

### Auto-Generated Dashboard

```javascript
// Discover and use all available metrics
const result = await generator.generate({
  name: 'Auto-Generated Dashboard',
  template: 'auto', // Automatically selects best template
  metrics: {
    include: ['*'] // Include all metrics
  }
});
```

### Application Performance Dashboard

```javascript
const result = await generator.generate({
  name: 'App Performance',
  template: 'application-performance',
  metrics: {
    include: ['app.*'],
    exclude: ['*.debug.*']
  },
  layoutPreference: 'detailed',
  timeRange: '30 minutes'
});
```

### Generate and Deploy

```javascript
const result = await generator.generateAndDeploy({
  name: 'Production Monitoring',
  template: 'system-health',
  metrics: {
    include: ['prod.*']
  }
});

console.log('Dashboard deployed:', result.deployment.permalink);
```

## CLI Usage

### Generate Dashboard

```bash
# Using npm scripts
npm run generate -- --template system-health --name "My Dashboard"

# Direct execution
node dashboard-generator generate \
  --template application-performance \
  --metrics "app.*" \
  --name "App Dashboard" \
  --deploy
```

### Run Examples

```bash
# Generate example dashboards
npm run example:system-health

# Generate and deploy
npm run example:deploy
```

## Component Overview

### MetricClassifier

Classifies metrics by type and suggests visualizations.

```javascript
const { MetricClassifier } = require('@dashbuilder/dashboard-generator');

const classifier = new MetricClassifier();
const classification = classifier.classifyMetric('system.cpu.usage');
// Returns: { type: 'gauge', category: 'system', suggestedVisualizations: ['line', 'area'] }
```

### QueryBuilder

Builds optimized NRQL queries.

```javascript
const { QueryBuilder } = require('@dashbuilder/dashboard-generator');

const builder = new QueryBuilder();
const query = builder.buildQuery(metric, {
  aggregation: 'average',
  timeWindow: '1 hour',
  facets: ['host']
});
```

### LayoutOptimizer

Optimizes widget layout.

```javascript
const { LayoutOptimizer } = require('@dashbuilder/dashboard-generator');

const optimizer = new LayoutOptimizer();
const layout = optimizer.optimizeLayout(widgets, {
  layoutPreference: 'balanced',
  groupBy: 'category'
});
```

## Best Practices

1. **Use Metric Patterns**: Use wildcards to include related metrics
   ```javascript
   metrics: { include: ['app.request.*', 'app.response.*'] }
   ```

2. **Exclude Noise**: Filter out debug or internal metrics
   ```javascript
   metrics: { exclude: ['*.debug.*', '*.internal.*'] }
   ```

3. **Choose Appropriate Templates**: Select templates that match your metric types

4. **Optimize Layout**: Use layout preferences based on dashboard purpose
   - `compact`: Maximum information density
   - `balanced`: Good mix of visibility and density
   - `detailed`: Larger widgets with more detail

5. **Test Before Deployment**: Use `preview()` to validate before deploying

## Troubleshooting

### Common Issues

1. **No metrics found**: Check metric patterns and ensure metrics exist in the specified time range

2. **Authentication errors**: Verify API key has dashboard creation permissions

3. **Layout issues**: Ensure widget count doesn't exceed reasonable limits

### Debug Mode

Enable debug logging:

```javascript
const generator = new DashboardGenerator({
  apiKey: 'YOUR_API_KEY',
  accountId: 'YOUR_ACCOUNT_ID',
  debug: true
});
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup and guidelines.

## License

MIT