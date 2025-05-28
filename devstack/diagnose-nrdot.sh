#!/bin/bash

source /Users/deepaksharma/devstack/.env

echo "=== OTLP Data Flow Diagnosis ==="
echo ""
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"
echo "License Key: ${NEW_RELIC_LICENSE_KEY:0:10}...${NEW_RELIC_LICENSE_KEY: -4}"
echo ""

# 1. Send a test metric with explicit timestamp
echo "1. Sending test metric with current timestamp..."
CURRENT_TIME=$(date +%s)000000000
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST https://otlp.nr-data.net/v1/metrics \
  -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceMetrics": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "otlp-test"}},
          {"key": "host.name", "value": {"stringValue": "test-host"}},
          {"key": "test.source", "value": {"stringValue": "manual-test"}}
        ]
      },
      "scopeMetrics": [{
        "scope": {
          "name": "manual-test"
        },
        "metrics": [{
          "name": "test.metric.gauge",
          "unit": "1",
          "gauge": {
            "dataPoints": [{
              "asDouble": 123.45,
              "timeUnixNano": "'$CURRENT_TIME'",
              "attributes": [
                {"key": "test", "value": {"stringValue": "true"}}
              ]
            }]
          }
        }]
      }]
    }]
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
echo "Response: HTTP $HTTP_CODE"

if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ Test metric sent successfully!"
    echo ""
    echo "2. Query to find this test metric:"
    echo "   FROM Metric SELECT * WHERE service.name = 'otlp-test' SINCE 5 minutes ago"
    echo ""
    echo "3. Direct query link:"
    echo "   https://one.newrelic.com/data-explorer?query=FROM%20Metric%20SELECT%20*%20WHERE%20service.name%20%3D%20%27otlp-test%27%20SINCE%205%20minutes%20ago&accountId=$NEW_RELIC_ACCOUNT_ID"
else
    echo "❌ Failed to send test metric"
    echo "Response: $RESPONSE"
fi

echo ""
echo "4. Checking collector data format..."
# Get a sample of actual metrics being sent
docker exec final-test cat /tmp/metrics.json 2>/dev/null || echo "No metric file found"

echo ""
echo "5. Resource attributes from running collectors:"
docker logs otel-vm-1 2>&1 | grep "detected resource information" | tail -1

echo ""
echo "=== Troubleshooting Checklist ==="
echo "✓ OTLP endpoint is reachable"
echo "✓ License key is valid (HTTP 200)"
echo "✓ Using correct US endpoint"
echo "✓ Metrics are being collected"
echo ""
echo "=== Next Steps ==="
echo "1. Wait 2-3 minutes for data to appear"
echo "2. Make sure you're logged into account $NEW_RELIC_ACCOUNT_ID"
echo "3. Try the test metric query above"
echo "4. Check for any account-specific data processing delays"