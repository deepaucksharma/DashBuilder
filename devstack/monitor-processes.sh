#!/bin/bash

source /Users/deepaksharma/devstack/.env

echo "=== Process Metrics Monitoring Dashboard ==="
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"
echo ""
echo "Direct links to New Relic:"
echo ""

# URL encode the queries
BASE_URL="https://one.newrelic.com/data-explorer"
ACCOUNT_PARAM="accountId=$NEW_RELIC_ACCOUNT_ID"

echo "1. 📊 All Processes Dashboard:"
echo "   ${BASE_URL}?${ACCOUNT_PARAM}&query=SELECT%20uniques(process.name)%20FROM%20Metric%20WHERE%20host.id%20LIKE%20'openstack-vm-%25'%20SINCE%2010%20minutes%20ago"
echo ""

echo "2. 🔥 Top CPU Processes:"
echo "   ${BASE_URL}?${ACCOUNT_PARAM}&query=SELECT%20average(process.cpu.utilization)%20FROM%20Metric%20WHERE%20host.id%20LIKE%20'openstack-vm-%25'%20FACET%20process.name%20SINCE%2010%20minutes%20ago%20LIMIT%2020"
echo ""

echo "3. 💾 Memory Usage by Process:"
echo "   ${BASE_URL}?${ACCOUNT_PARAM}&query=SELECT%20average(process.memory.usage)%20FROM%20Metric%20WHERE%20host.id%20LIKE%20'openstack-vm-%25'%20FACET%20process.name%20SINCE%2010%20minutes%20ago%20LIMIT%2020"
echo ""

echo "=== Quick Status Check ==="
echo ""

# Check if process metrics are appearing
echo "Checking for process metrics..."
CURRENT_TIME=$(date +%s)000000000

RESPONSE=$(curl -s -X POST https://otlp.nr-data.net:4318/v1/metrics \
  -H "api-key: $NEW_RELIC_LICENSE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceMetrics": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "process-test"}},
          {"key": "host.name", "value": {"stringValue": "test-host"}}
        ]
      },
      "scopeMetrics": [{
        "metrics": [{
          "name": "test.process.check",
          "gauge": {
            "dataPoints": [{
              "asDouble": 1.0,
              "timeUnixNano": "'$CURRENT_TIME'"
            }]
          }
        }]
      }]
    }]
  }' -w "\nHTTP Status: %{http_code}\n")

echo "$RESPONSE"

echo ""
echo "=== What to Expect ==="
echo "• Process names (docker, systemd, kernel threads, etc.)"
echo "• CPU utilization per process"
echo "• Memory usage per process"
echo "• Process count per host"
echo "• Virtual memory usage"
echo ""
echo "Note: Process metrics may take 2-3 minutes to appear after restart."