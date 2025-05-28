#!/bin/bash

# Deploy working OpenTelemetry collectors

source /Users/deepaksharma/devstack/.env

echo "Deploying 5 OpenTelemetry collectors"
echo "License Key: ${NEW_RELIC_LICENSE_KEY:0:10}...${NEW_RELIC_LICENSE_KEY: -4}"
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"

# Clean up
docker rm -f $(docker ps -aq --filter "name=otel-vm") 2>/dev/null
docker rm -f $(docker ps -aq --filter "name=nrdot-vm") 2>/dev/null
docker rm -f test-otel test-debug test-nrdot-fix 2>/dev/null

# Create config
cat > /tmp/otel-collector-config.yaml <<EOF
receivers:
  hostmetrics:
    collection_interval: 30s
    scrapers:
      cpu:
      memory:
      disk:
      filesystem:
      network:
      load:

processors:
  resource:
    attributes:
      - key: host.id
        from_attribute: host.name
        action: upsert
      - key: account.id
        value: "${NEW_RELIC_ACCOUNT_ID}"
        action: upsert
  
  resourcedetection:
    detectors: [env, system]
    system:
      hostname_sources: ["os"]
      resource_attributes:
        host.id:
          enabled: true
  
  batch:
    timeout: 10s

exporters:
  otlphttp:
    endpoint: https://otlp.nr-data.net
    headers:
      api-key: ${NEW_RELIC_LICENSE_KEY}

service:
  pipelines:
    metrics:
      receivers: [hostmetrics]
      processors: [resourcedetection, resource, batch]
      exporters: [otlphttp]

  telemetry:
    logs:
      level: info
EOF

# Deploy 5 collectors
for i in {1..5}; do
    GRPC_PORT=$((4330 + i))
    HTTP_PORT=$((4340 + i))
    
    docker run -d \
        --name otel-vm-$i \
        --hostname openstack-vm-$i \
        -e OTEL_RESOURCE_ATTRIBUTES="service.name=openstack-vm,host.name=openstack-vm-$i,vm.number=$i,environment=production,cloud.provider=openstack" \
        -v /tmp/otel-collector-config.yaml:/etc/otel/config.yaml:ro \
        -p ${GRPC_PORT}:4317 \
        -p ${HTTP_PORT}:4318 \
        otel/opentelemetry-collector-contrib:latest \
        --config=/etc/otel/config.yaml
    
    if [ $? -eq 0 ]; then
        echo "✓ Started otel-vm-$i on ports $GRPC_PORT/$HTTP_PORT"
    else
        echo "✗ Failed to start otel-vm-$i"
    fi
done

echo ""
echo "Waiting for collectors to start sending metrics..."
sleep 45

echo ""
echo "=== Checking Collector Status ==="
for i in {1..5}; do
    echo -e "\notel-vm-$i:"
    if docker ps | grep -q "otel-vm-$i"; then
        echo "  ✓ Running"
        
        # Check for metrics
        if docker logs otel-vm-$i 2>&1 | grep -q "system.cpu"; then
            echo "  ✓ Collecting metrics"
        fi
        
        # Check for errors
        if docker logs otel-vm-$i 2>&1 | tail -50 | grep -q "403"; then
            echo "  ✗ Authentication errors"
        else
            echo "  ✓ No authentication errors"
        fi
    else
        echo "  ✗ Not running"
    fi
done

echo ""
echo "=== New Relic Queries to Find Your Data ==="
echo ""
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"
echo ""
echo "1. Basic check:"
echo "   SELECT count(*) FROM Metric WHERE host.name LIKE 'openstack-vm-%' SINCE 10 minutes ago"
echo ""
echo "2. Check by account:"
echo "   SELECT count(*) FROM Metric WHERE account.id = '$NEW_RELIC_ACCOUNT_ID' SINCE 10 minutes ago FACET host.name"
echo ""
echo "3. CPU metrics:"
echo "   SELECT average(system.cpu.utilization) FROM Metric WHERE service.name = 'openstack-vm' SINCE 10 minutes ago FACET host.name"
echo ""
echo "Direct link to your account:"
echo "https://one.nr-data.net/launcher/nr1-core.explorer?pane=eyJuZXJkbGV0SWQiOiJkYXRhLWV4cGxvcmF0aW9uLnF1ZXJ5LWJ1aWxkZXIiLCJpbml0aWFsQWN0aXZlSW50ZXJmYWNlIjoibnJxbEVkaXRvciIsImluaXRpYWxOcnFsVmFsdWUiOiJTRUxFQ1QgKiBGUk9NIE1ldHJpYyBXSEVSRSBob3N0Lm5hbWUgTElLRSAnb3BlbnN0YWNrLXZtLSUnIFNJTkNFIDEwIG1pbnV0ZXMgYWdvIiwiaW5pdGlhbEFjY291bnRJZCI6MzYzMDA3Mn0="