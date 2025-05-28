#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log(`
===========================================
NRDOT Dashboard Deployment Instructions
===========================================

Since API authentication is not working programmatically,
here's how to manually deploy the NRDOT dashboard:

1. LOCATE THE DASHBOARD JSON:
   ${path.join(__dirname, '..', 'dashboards', 'nrdot-metrics-dashboard.json')}

2. OPEN NEW RELIC:
   - Go to https://one.newrelic.com
   - Navigate to Dashboards
   - Click "Import dashboard"

3. UPDATE THE JSON:
   Before importing, update these values in the JSON:
   - Replace "accountIds": [] with "accountIds": [3630072]
   - This appears in multiple places in the widgets

4. IMPORT THE DASHBOARD:
   - Copy the entire JSON content
   - Paste into the import dialog
   - Click "Import dashboard"

5. VERIFY THE DASHBOARD:
   Once imported, you should see:
   - CPU usage by state
   - Memory usage breakdown
   - Disk I/O metrics
   - Network I/O metrics
   - Filesystem usage
   - CPU load averages
   - Collector health metrics

===========================================
`);

// Read and display the dashboard JSON with accountId populated
const dashboardPath = path.join(__dirname, '..', 'dashboards', 'nrdot-metrics-dashboard.json');
const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));

// Update all accountIds in the dashboard
function updateAccountIds(obj, accountId) {
  if (Array.isArray(obj)) {
    obj.forEach(item => updateAccountIds(item, accountId));
  } else if (obj && typeof obj === 'object') {
    if ('accountIds' in obj && Array.isArray(obj.accountIds)) {
      obj.accountIds = [accountId];
    }
    Object.values(obj).forEach(value => updateAccountIds(value, accountId));
  }
}

updateAccountIds(dashboard, 3630072);

// Save updated dashboard
const updatedPath = path.join(__dirname, '..', 'dashboards', 'nrdot-metrics-dashboard-ready.json');
fs.writeFileSync(updatedPath, JSON.stringify(dashboard, null, 2));

console.log(`Updated dashboard saved to:
${updatedPath}

This file has the correct account ID (3630072) already set.
You can directly copy and import this file.
`);

// Show some sample queries that are working
console.log(`
===========================================
Sample Queries You Can Run Now:
===========================================

1. Check CPU load:
   SELECT latest(system.cpu.load_average.15m) 
   FROM Metric 
   WHERE host.id = 'dashbuilder-host' 
   SINCE 5 minutes ago

2. View all metrics:
   SELECT uniques(metricName) 
   FROM Metric 
   WHERE host.id = 'dashbuilder-host' 
   SINCE 30 minutes ago

3. Memory usage:
   SELECT latest(system.memory.usage) / 1e9 as 'GB' 
   FROM Metric 
   WHERE host.id = 'dashbuilder-host' 
   FACET state 
   SINCE 5 minutes ago

===========================================
`);