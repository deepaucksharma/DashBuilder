#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create a simplified dashboard with clean NRQL queries
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
          "title": "CPU Load Average",
          "layout": { "column": 1, "row": 1, "width": 4, "height": 3 },
          "visualization": { "id": "viz.billboard" },
          "rawConfiguration": {
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT latest(system.cpu.load_average.1m), latest(system.cpu.load_average.5m), latest(system.cpu.load_average.15m) FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 5 minutes ago"
            }],
            "thresholds": []
          }
        },
        {
          "title": "Memory Usage by State",
          "layout": { "column": 5, "row": 1, "width": 4, "height": 3 },
          "visualization": { "id": "viz.area" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": false },
            "legend": { "enabled": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT latest(system.memory.usage)/1e9 FROM Metric WHERE host.id = 'dashbuilder-host' FACET state TIMESERIES SINCE 30 minutes ago"
            }]
          }
        },
        {
          "title": "CPU Usage",
          "layout": { "column": 9, "row": 1, "width": 4, "height": 3 },
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
          "title": "Disk I/O",
          "layout": { "column": 1, "row": 4, "width": 6, "height": 3 },
          "visualization": { "id": "viz.line" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": false },
            "legend": { "enabled": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(max(system.disk.io), 1 second)/1e6 FROM Metric WHERE host.id = 'dashbuilder-host' FACET device, direction TIMESERIES SINCE 30 minutes ago"
            }],
            "yAxisLeft": { "zero": true }
          }
        },
        {
          "title": "Network I/O",
          "layout": { "column": 7, "row": 4, "width": 6, "height": 3 },
          "visualization": { "id": "viz.line" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": false },
            "legend": { "enabled": true },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(max(system.network.io), 1 second)/1e6 FROM Metric WHERE host.id = 'dashbuilder-host' AND device != 'lo' FACET device, direction TIMESERIES SINCE 30 minutes ago"
            }],
            "yAxisLeft": { "zero": true }
          }
        },
        {
          "title": "Filesystem Usage",
          "layout": { "column": 1, "row": 7, "width": 12, "height": 3 },
          "visualization": { "id": "viz.table" },
          "rawConfiguration": {
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT latest(system.filesystem.usage)/1e9, latest(mountpoint), latest(type) FROM Metric WHERE host.id = 'dashbuilder-host' AND metricName = 'system.filesystem.usage' FACET device LIMIT 20"
            }]
          }
        }
      ]
    },
    {
      "name": "NRDOT Analytics",
      "description": "Cost and optimization metrics",
      "widgets": [
        {
          "title": "Data Collection Stats",
          "layout": { "column": 1, "row": 1, "width": 6, "height": 3 },
          "visualization": { "id": "viz.billboard" },
          "rawConfiguration": {
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT uniqueCount(metricName), count(*), rate(count(*), 1 hour) FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 10 minutes ago"
            }]
          }
        },
        {
          "title": "Data Volume Trend",
          "layout": { "column": 7, "row": 1, "width": 6, "height": 3 },
          "visualization": { "id": "viz.line" },
          "rawConfiguration": {
            "legend": { "enabled": false },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(count(*), 1 minute) FROM Metric WHERE host.id = 'dashbuilder-host' TIMESERIES SINCE 2 hours ago"
            }]
          }
        },
        {
          "title": "Monthly Cost Estimate",
          "layout": { "column": 1, "row": 4, "width": 6, "height": 3 },
          "visualization": { "id": "viz.billboard" },
          "rawConfiguration": {
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT rate(count(*), 1 month)/1e9, rate(count(*), 1 month)/1e9*0.30 FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago"
            }]
          }
        },
        {
          "title": "Metrics by Type",
          "layout": { "column": 7, "row": 4, "width": 6, "height": 3 },
          "visualization": { "id": "viz.pie" },
          "rawConfiguration": {
            "facet": { "showOtherSeries": false },
            "nrqlQueries": [{
              "accountIds": [3630072],
              "query": "SELECT count(*) FROM Metric WHERE host.id = 'dashbuilder-host' FACET CASES(WHERE metricName LIKE 'system.cpu%' AS 'CPU', WHERE metricName LIKE 'system.memory%' AS 'Memory', WHERE metricName LIKE 'system.disk%' AS 'Disk', WHERE metricName LIKE 'system.network%' AS 'Network', WHERE metricName LIKE 'system.filesystem%' AS 'Filesystem') SINCE 1 hour ago"
            }]
          }
        }
      ]
    }
  ]
};

// Save the dashboard
const dashboardPath = path.join(__dirname, '..', 'dashboards', 'nrdot-simple-dashboard.json');
fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));

console.log(`
============================================================
SIMPLIFIED DASHBOARD CREATED
============================================================

Dashboard saved to: ${dashboardPath}

This dashboard contains:
✅ Clean NRQL queries without complex aliases
✅ All essential system metrics
✅ Cost optimization analytics
✅ 10 widgets across 2 pages

Ready to deploy via NerdGraph API!
`);