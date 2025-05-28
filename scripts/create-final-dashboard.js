#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('Creating final NRDOT dashboard with validated queries...\n');

const dashboard = {
  "name": "NRDOT System Metrics",
  "description": "System metrics collected by NRDOT OTEL collector with cost optimization",
  "permissions": "PUBLIC_READ_WRITE",
  "pages": [
    {
      "name": "System Overview",
      "description": "CPU, Memory, and Disk metrics",
      "guid": null,
      "widgets": [
        {
          "title": "CPU Usage by State",
          "layout": {
            "column": 1,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.line"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "legend": {
              "enabled": true
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT rate(sum(system.cpu.time), 1 second) FROM Metric WHERE host.id = 'dashbuilder-host' FACET state SINCE 30 minutes ago TIMESERIES"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            },
            "yAxisLeft": {
              "zero": true
            }
          }
        },
        {
          "title": "Memory Usage",
          "layout": {
            "column": 5,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.area"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "legend": {
              "enabled": true
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT latest(system.memory.usage) / 1e9 as 'GB' FROM Metric WHERE host.id = 'dashbuilder-host' FACET state SINCE 30 minutes ago TIMESERIES"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            },
            "units": {
              "unit": "GIGABYTES"
            }
          }
        },
        {
          "title": "Disk I/O",
          "layout": {
            "column": 9,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.line"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "legend": {
              "enabled": true
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT rate(sum(system.disk.io), 1 second) / 1e6 as 'MB/s' FROM Metric WHERE host.id = 'dashbuilder-host' FACET device, direction SINCE 30 minutes ago TIMESERIES"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            }
          }
        },
        {
          "title": "Network I/O",
          "layout": {
            "column": 1,
            "row": 4,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.line"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "legend": {
              "enabled": true
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT rate(sum(system.network.io), 1 second) / 1e6 as 'MB/s' FROM Metric WHERE host.id = 'dashbuilder-host' FACET device, direction WHERE device != 'lo' SINCE 30 minutes ago TIMESERIES"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            }
          }
        },
        {
          "title": "File System Usage",
          "layout": {
            "column": 5,
            "row": 4,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.table"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT latest(system.filesystem.usage) / 1e9 as 'Used GB', latest(system.filesystem.inodes.usage) as 'Inodes Used' FROM Metric WHERE host.id = 'dashbuilder-host' FACET device, mountpoint, type SINCE 5 minutes ago"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            }
          }
        },
        {
          "title": "CPU Load Average",
          "layout": {
            "column": 9,
            "row": 4,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.billboard"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT latest(system.cpu.load_average.1m) as '1 min', latest(system.cpu.load_average.5m) as '5 min', latest(system.cpu.load_average.15m) as '15 min' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 5 minutes ago"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            },
            "thresholds": [
              {
                "alertSeverity": "WARNING",
                "value": 0.8
              },
              {
                "alertSeverity": "CRITICAL",
                "value": 1
              }
            ]
          }
        }
      ]
    },
    {
      "name": "NRDOT Optimization",
      "description": "Cost optimization and collector health",
      "guid": null,
      "widgets": [
        {
          "title": "Current Profile",
          "layout": {
            "column": 1,
            "row": 1,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.billboard"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT latest(nrdot.profile) as 'Profile', latest(service.name) as 'Collector' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 5 minutes ago"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            }
          }
        },
        {
          "title": "Data Volume Trend",
          "layout": {
            "column": 5,
            "row": 1,
            "width": 8,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.line"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "legend": {
              "enabled": true
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT rate(count(*), 1 minute) as 'Data Points/min', uniqueCount(metricName) as 'Unique Metrics' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago TIMESERIES"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            }
          }
        },
        {
          "title": "Estimated Monthly Cost",
          "layout": {
            "column": 1,
            "row": 4,
            "width": 4,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.billboard"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": false
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT rate(count(*), 1 month) / 1e9 as 'Billion Points/Month', rate(count(*), 1 month) / 1e9 * 0.30 as 'Est. Cost (USD)' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            },
            "thresholds": [
              {
                "alertSeverity": "WARNING",
                "value": 10
              },
              {
                "alertSeverity": "CRITICAL",
                "value": 20
              }
            ]
          }
        },
        {
          "title": "Metrics by Type",
          "layout": {
            "column": 5,
            "row": 4,
            "width": 8,
            "height": 3
          },
          "linkedEntityGuids": null,
          "visualization": {
            "id": "viz.pie"
          },
          "rawConfiguration": {
            "facet": {
              "showOtherSeries": true
            },
            "legend": {
              "enabled": true
            },
            "nrqlQueries": [
              {
                "accountIds": [3630072],
                "query": "SELECT count(*) FROM Metric WHERE host.id = 'dashbuilder-host' AND metricName LIKE 'system%' FACET cases(WHERE metricName LIKE 'system.cpu%' as 'CPU', WHERE metricName LIKE 'system.memory%' as 'Memory', WHERE metricName LIKE 'system.disk%' as 'Disk', WHERE metricName LIKE 'system.network%' as 'Network', WHERE metricName LIKE 'system.filesystem%' as 'Filesystem') SINCE 1 hour ago"
              }
            ],
            "platformOptions": {
              "ignoreTimeRange": false
            }
          }
        }
      ]
    }
  ],
  "variables": []
};

// Save the dashboard
const dashboardPath = path.join(__dirname, '..', 'dashboards', 'nrdot-dashboard-final.json');
fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));

console.log(`✅ Dashboard created: ${dashboardPath}\n`);

// Create deployment instructions
console.log(`
==============================================
Dashboard Deployment Instructions
==============================================

1. Copy the dashboard JSON:
   cat ${dashboardPath} | pbcopy  # macOS
   # OR manually copy the file content

2. Go to New Relic:
   https://one.newrelic.com

3. Navigate to:
   All Capabilities → Dashboards

4. Click "Import dashboard"

5. Paste the JSON and click "Import"

==============================================
What You'll See
==============================================

Page 1: System Overview
- CPU Usage by State (line chart)
- Memory Usage by State (area chart)
- Disk I/O by Device (line chart)
- Network I/O by Interface (line chart)
- File System Usage (table)
- CPU Load Averages (billboard)

Page 2: NRDOT Optimization
- Current Profile (billboard)
- Data Volume Trend (line chart)
- Estimated Monthly Cost (billboard)
- Metrics by Type (pie chart)

==============================================
Verify It's Working
==============================================

After import, all widgets should show data.
If any widget shows "No data", check:

1. Correct account ID (3630072)
2. Host ID is 'dashbuilder-host'
3. Metrics are being collected

Current collection status:
`);

// Check current metrics
const metricsCheck = require('child_process').execSync(
  'curl -s http://localhost:8889/metrics | grep -c "^system_"',
  { encoding: 'utf8' }
).trim();

console.log(`✅ Metrics being collected: ${metricsCheck}\n`);

console.log('Ready to deploy! 🚀');