#!/bin/bash

# Simple working OpenTelemetry deployment

source /Users/deepaksharma/devstack/.env

echo "=== Deploying Simple OpenTelemetry Collectors ==="
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"

# Clean up
docker rm -f $(docker ps -aq) 2>/dev/null

# Create simple config that works
cat > /tmp/simple-otel-config.yaml <<EOF
receivers:
  hostmetrics:
    collection_interval: 30s
    scrapers:
      cpu:
      memory:
      disk:
      filesystem:
      load:
      network:

processors:
  resource:
    attributes:
      - key: account.id
        value: "$NEW_RELIC_ACCOUNT_ID"
        action: upsert
  
  batch:
    timeout: 10s
    send_batch_size: 1000

exporters:
  otlphttp:
    endpoint: https://otlp.nr-data.net:4318
    headers:
      api-key: $NEW_RELIC_LICENSE_KEY
    compression: gzip
    timeout: 30s
    retry:
      enabled: true
      initial_interval: 1s
      max_interval: 30s
      max_elapsed_time: 300s

service:
  pipelines:
    metrics:
      receivers: [hostmetrics]
      processors: [resource, batch]
      exporters: [otlphttp]

  telemetry:
    logs:
      level: info
EOF

# Deploy 5 collectors
for i in {1..5}; do
    docker run -d \
        --name otel-vm-$i \
        --hostname openstack-vm-$i \
        -e OTEL_RESOURCE_ATTRIBUTES="service.name=openstack-vm,host.name=openstack-vm-$i,host.id=openstack-vm-$i,environment=production" \
        -v /tmp/simple-otel-config.yaml:/otel-config.yaml:ro \
        -p $((4340 + i)):4317 \
        otel/opentelemetry-collector-contrib:latest \
        --config=/otel-config.yaml
    
    echo "✓ Started otel-vm-$i on port $((4340 + i))"
done

echo -e "\n=== Test Manual Metric Send ==="
# Send a test metric directly
curl -s -X POST https://otlp.nr-data.net:4318/v1/metrics \
  -H "api-key: $NEW_RELIC_LICENSE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceMetrics": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "manual-test"}},
          {"key": "account.id", "value": {"intValue": "'$NEW_RELIC_ACCOUNT_ID'"}}
        ]
      },
      "scopeMetrics": [{
        "metrics": [{
          "name": "test.manual.metric",
          "gauge": {
            "dataPoints": [{
              "asDouble": 42.0,
              "timeUnixNano": "'$(date +%s)000000000'"
            }]
          }
        }]
      }]
    }]
  }' -o /dev/null -w "HTTP Status: %{http_code}\n"

echo -e "\n=== Waiting for Data ==="
sleep 45

echo -e "\n=== Checking Status ==="
for i in {1..5}; do
    echo -n "otel-vm-$i: "
    if docker ps | grep -q "otel-vm-$i"; then
        echo -n "✓ Running - "
        docker logs otel-vm-$i 2>&1 | grep -c "otlphttp" | xargs echo "Export attempts:"
    else
        echo "✗ Not running"
    fi
done

echo -e "\n=== CRITICAL: Test These Queries NOW ==="
echo ""
echo "1. SIMPLEST query (try this first):"
echo "   FROM Metric SELECT count(*) SINCE 30 minutes ago"
echo ""
echo "2. Find manual test metric:"
echo "   FROM Metric SELECT * WHERE metricName = 'test.manual.metric' SINCE 10 minutes ago"
echo ""
echo "3. Find by account:"
echo "   FROM Metric SELECT uniques(service.name) WHERE account.id = $NEW_RELIC_ACCOUNT_ID SINCE 30 minutes ago"
echo ""
echo "4. Find OpenStack VMs:"
echo "   FROM Metric SELECT * WHERE service.name = 'openstack-vm' SINCE 30 minutes ago LIMIT 10"
echo ""
echo "IMPORTANT: Make sure you are:"
echo "- Logged into account $NEW_RELIC_ACCOUNT_ID"
echo "- In the US region (not EU)"
echo "- Looking at the right time range (last 30 minutes)"