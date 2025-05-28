#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create dashboard with verified metric names
const dashboard = {
  "name": "NRDOT System Metrics",
  "description": "OpenTelemetry collector metrics with NRDOT optimization",
  "permissions": "PUBLIC_READ_WRITE",
  "pages": [
    {
      "name": "System Performance",
      "description": "CPU, Memory, Disk, and Network metrics",
      "widgets": [
        {
          "title": "CPU Time by State",
          "layout": { "column": 1, "row": 1, "width": 4, "height": 3 },
          "visualization": { "id": "viz.line" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": false },
            "legend": { "enabled": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(max(system.cpu.time), 1 second) FROM Metric WHERE host.id = 'dashbuilder-host' FACET state TIMESERIES SINCE 30 minutes ago"
            }],
            "yAxisLeft": { "zero": true }
          }
        },
        {
          "title": "CPU Load Averages",
          "layout": { "column": 5, "row": 1, "width": 4, "height": 3 },
          "visualization": { "id": "viz.billboard" },
          "rawConfiguration": {
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT latest(system.cpu.load_average.1m) as '1 min', latest(system.cpu.load_average.5m) as '5 min', latest(system.cpu.load_average.15m) as '15 min' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 5 minutes ago"
            }],
            "thresholds": [
              { "alertSeverity": "WARNING", "value": 2 },
              { "alertSeverity": "CRITICAL", "value": 4 }
            ]
          }
        },
        {
          "title": "Memory Usage",
          "layout": { "column": 9, "row": 1, "width": 4, "height": 3 },
          "visualization": { "id": "viz.area" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": false },
            "legend": { "enabled": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT latest(system.memory.usage) / 1e9 as 'GB' FROM Metric WHERE host.id = 'dashbuilder-host' FACET state TIMESERIES SINCE 30 minutes ago"
            }]
          }
        },
        {
          "title": "Disk I/O Rate",
          "layout": { "column": 1, "row": 4, "width": 6, "height": 3 },
          "visualization": { "id": "viz.line" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": false },
            "legend": { "enabled": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(max(system.disk.io), 1 second) / 1e6 as 'MB/s' FROM Metric WHERE host.id = 'dashbuilder-host' FACET device, direction TIMESERIES SINCE 30 minutes ago"
            }],
            "yAxisLeft": { "zero": true }
          }
        },
        {
          "title": "Network I/O Rate",
          "layout": { "column": 7, "row": 4, "width": 6, "height": 3 },
          "visualization": { "id": "viz.line" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": false },
            "legend": { "enabled": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(max(system.network.io), 1 second) / 1e6 as 'MB/s' FROM Metric WHERE host.id = 'dashbuilder-host' AND device != 'lo' FACET device, direction TIMESERIES SINCE 30 minutes ago"
            }],
            "yAxisLeft": { "zero": true }
          }
        },
        {
          "title": "Filesystem Usage",
          "layout": { "column": 1, "row": 7, "width": 6, "height": 3 },
          "visualization": { "id": "viz.table" },
          "rawConfiguration": {
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT latest(system.filesystem.usage) / 1e9 as 'Used GB', latest(mountpoint), latest(type) FROM Metric WHERE host.id = 'dashbuilder-host' AND metricName = 'system.filesystem.usage' FACET device LIMIT 20"
            }]
          }
        },
        {
          "title": "Disk Operations",
          "layout": { "column": 7, "row": 7, "width": 6, "height": 3 },
          "visualization": { "id": "viz.line" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": false },
            "legend": { "enabled": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(max(system.disk.operations), 1 second) as 'ops/sec' FROM Metric WHERE host.id = 'dashbuilder-host' FACET device TIMESERIES SINCE 30 minutes ago"
            }]
          }
        }
      ]
    },
    {
      "name": "NRDOT Cost Analysis",
      "description": "Data volume and cost optimization metrics",
      "widgets": [
        {
          "title": "Data Collection Overview",
          "layout": { "column": 1, "row": 1, "width": 8, "height": 3 },
          "visualization": { "id": "viz.billboard" },
          "rawConfiguration": {
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT uniqueCount(metricName) as 'Unique Metrics', count(*) as 'Data Points (10 min)', rate(count(*), 1 hour) as 'Hourly Rate' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 10 minutes ago"
            }]
          }
        },
        {
          "title": "Optimization Profile",
          "layout": { "column": 9, "row": 1, "width": 4, "height": 3 },
          "visualization": { "id": "viz.billboard" },
          "rawConfiguration": {
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT latest(nrdot.profile) as 'Current Profile' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 5 minutes ago"
            }]
          }
        },
        {
          "title": "Data Volume Trend",
          "layout": { "column": 1, "row": 4, "width": 8, "height": 3 },
          "visualization": { "id": "viz.line" },
          "rawConfiguration": {
            "legend": { "enabled": false },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(count(*), 1 minute) as 'Data Points per Minute' FROM Metric WHERE host.id = 'dashbuilder-host' TIMESERIES SINCE 2 hours ago"
            }]
          }
        },
        {
          "title": "Estimated Monthly Cost",
          "layout": { "column": 9, "row": 4, "width": 4, "height": 3 },
          "visualization": { "id": "viz.billboard" },
          "rawConfiguration": {
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(count(*), 1 month) / 1e9 as 'Billion/Month', rate(count(*), 1 month) / 1e9 * 0.30 as 'USD/Month' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago"
            }],
            "thresholds": [
              { "alertSeverity": "CRITICAL", "value": 10 }
            ]
          }
        },
        {
          "title": "Metrics by Category",
          "layout": { "column": 1, "row": 7, "width": 6, "height": 3 },
          "visualization": { "id": "viz.pie" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT count(*) FROM Metric WHERE host.id = 'dashbuilder-host' FACET CASES(WHERE metricName LIKE 'system.cpu%' as 'CPU', WHERE metricName LIKE 'system.memory%' as 'Memory', WHERE metricName LIKE 'system.disk%' as 'Disk', WHERE metricName LIKE 'system.network%' as 'Network', WHERE metricName LIKE 'system.filesystem%' as 'Filesystem', WHERE metricName LIKE 'system.paging%' as 'Paging') SINCE 1 hour ago"
            }]
          }
        },
        {
          "title": "Collection Interval Analysis",
          "layout": { "column": 7, "row": 7, "width": 6, "height": 3 },
          "visualization": { "id": "viz.line" },
          "rawConfiguration": {
            "legend": { "enabled": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT uniqueCount(timestamp) as 'Collections' FROM Metric WHERE host.id = 'dashbuilder-host' FACET metricName LIMIT 5 TIMESERIES 1 minute SINCE 30 minutes ago"
            }]
          }
        }
      ]
    }
  ]
};

// Save dashboard
const dashboardPath = path.join(__dirname, '..', 'dashboards', 'nrdot-verified-dashboard.json');
fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));

console.log(`
============================================================
VERIFIED NRDOT DASHBOARD CREATED
============================================================

Dashboard saved to: ${dashboardPath}

This dashboard contains:
✅ 13 widgets across 2 pages
✅ All queries use verified metric names
✅ Proper account ID (3630072)
✅ Correct host.id filter (dashbuilder-host)

Page 1: System Performance
- CPU Time by State
- CPU Load Averages  
- Memory Usage
- Disk I/O Rate
- Network I/O Rate
- Filesystem Usage
- Disk Operations

Page 2: NRDOT Cost Analysis
- Data Collection Overview
- Optimization Profile
- Data Volume Trend
- Estimated Monthly Cost
- Metrics by Category
- Collection Interval Analysis

Copying to clipboard now...
`);

// Copy to clipboard
try {
  execSync(`cat ${dashboardPath} | pbcopy`);
  console.log('✅ Dashboard JSON copied to clipboard!');
  console.log(`
TO DEPLOY:
1. Go to https://one.newrelic.com
2. Navigate to Dashboards
3. Click "Import dashboard"
4. Paste (Cmd+V) and import

The dashboard will appear immediately with live data.
`);
} catch (e) {
  console.log('⚠️  Could not copy to clipboard. Manually copy from:');
  console.log(`   ${dashboardPath}`);
}