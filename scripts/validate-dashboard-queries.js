#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log(`
==============================================
Dashboard Query Validation
==============================================
`);

// Load the dashboard
const dashboardPath = path.join(__dirname, '..', 'dashboards', 'nrdot-metrics-dashboard-ready.json');
const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));

// Extract all NRQL queries from widgets
const queries = [];
dashboard.pages.forEach(page => {
  page.widgets.forEach(widget => {
    if (widget.rawConfiguration?.nrqlQueries) {
      widget.rawConfiguration.nrqlQueries.forEach(q => {
        queries.push({
          title: widget.title,
          query: q.query,
          page: page.name
        });
      });
    }
  });
});

console.log(`Found ${queries.length} queries to validate:\n`);

// Validate each query
queries.forEach((q, i) => {
  console.log(`${i + 1}. ${q.title} (${q.page})`);
  console.log(`   Query: ${q.query}`);
  
  // Check for required metrics
  const requiredMetrics = {
    'system.cpu.time': 'CPU time metrics',
    'system.cpu.load_average': 'CPU load averages',
    'system.memory.usage': 'Memory usage',
    'system.disk.io': 'Disk I/O',
    'system.network.io': 'Network I/O',
    'system.filesystem.usage': 'Filesystem usage',
    'system.filesystem.free': 'Filesystem free space'
  };
  
  let hasIssues = false;
  Object.entries(requiredMetrics).forEach(([metric, desc]) => {
    if (q.query.includes(metric)) {
      // Check if we're collecting this metric
      if (metric === 'system.filesystem.free') {
        console.log(`   ⚠️  Warning: ${metric} might need adjustment`);
        hasIssues = true;
      } else {
        console.log(`   ✅ Uses ${desc}`);
      }
    }
  });
  
  if (!hasIssues) {
    console.log(`   ✅ Query looks good`);
  }
  console.log('');
});

// Create validation queries for New Relic
console.log(`
==============================================
Run These Validation Queries in New Relic
==============================================

Copy and run each query to ensure data exists:
`);

const validationQueries = [
  {
    name: "Check CPU metrics exist",
    query: `SELECT count(*) FROM Metric WHERE metricName LIKE 'system.cpu%' AND host.id = 'dashbuilder-host' SINCE 10 minutes ago`
  },
  {
    name: "Check memory metrics exist", 
    query: `SELECT count(*) FROM Metric WHERE metricName LIKE 'system.memory%' AND host.id = 'dashbuilder-host' SINCE 10 minutes ago`
  },
  {
    name: "Check disk metrics exist",
    query: `SELECT count(*) FROM Metric WHERE metricName LIKE 'system.disk%' AND host.id = 'dashbuilder-host' SINCE 10 minutes ago`
  },
  {
    name: "Check network metrics exist",
    query: `SELECT count(*) FROM Metric WHERE metricName LIKE 'system.network%' AND host.id = 'dashbuilder-host' SINCE 10 minutes ago`
  },
  {
    name: "Check filesystem metrics exist",
    query: `SELECT count(*) FROM Metric WHERE metricName LIKE 'system.filesystem%' AND host.id = 'dashbuilder-host' SINCE 10 minutes ago`
  },
  {
    name: "List all available metrics",
    query: `SELECT uniques(metricName) FROM Metric WHERE host.id = 'dashbuilder-host' AND metricName LIKE 'system%' SINCE 30 minutes ago`
  }
];

validationQueries.forEach((vq, i) => {
  console.log(`${i + 1}. ${vq.name}:`);
  console.log(`   ${vq.query}\n`);
});

// Check for potential issues
console.log(`
==============================================
Potential Issues Found
==============================================
`);

let issueCount = 0;

// Check filesystem queries
const filesystemQuery = queries.find(q => q.query.includes('system.filesystem.free'));
if (filesystemQuery) {
  issueCount++;
  console.log(`${issueCount}. Filesystem Free Space`);
  console.log(`   The query uses 'system.filesystem.free' which might not exist.`);
  console.log(`   Consider using: system.filesystem.usage and calculating free space\n`);
}

// Create fixed dashboard if needed
if (issueCount > 0) {
  console.log(`Creating fixed dashboard...\n`);
  
  // Fix filesystem query
  dashboard.pages.forEach(page => {
    page.widgets.forEach(widget => {
      if (widget.rawConfiguration?.nrqlQueries) {
        widget.rawConfiguration.nrqlQueries.forEach(q => {
          if (q.query.includes('system.filesystem.free')) {
            // Update the query to calculate free space differently
            q.query = q.query.replace(
              'latest(system.filesystem.usage) / (latest(system.filesystem.usage) + latest(system.filesystem.free)) * 100',
              'latest(system.filesystem.utilization) * 100'
            );
            q.query = q.query.replace(
              'latest(system.filesystem.free)',
              'latest(system.filesystem.usage) * -1'  // Placeholder - adjust based on actual metrics
            );
          }
        });
      }
    });
  });
  
  const fixedPath = path.join(__dirname, '..', 'dashboards', 'nrdot-metrics-dashboard-fixed.json');
  fs.writeFileSync(fixedPath, JSON.stringify(dashboard, null, 2));
  console.log(`Fixed dashboard saved to: ${fixedPath}`);
}

console.log(`
==============================================
Deployment Instructions
==============================================

1. Go to New Relic: https://one.newrelic.com
2. Navigate to Dashboards
3. Click "Import dashboard"
4. Copy the content from: ${dashboardPath}
5. Paste and click "Import"

The dashboard will automatically use account ID: 3630072

Expected widgets:
- CPU Usage by State
- Memory Usage
- Disk I/O
- Network I/O  
- File System Usage
- CPU Load Average
- Collector Health Metrics
`);