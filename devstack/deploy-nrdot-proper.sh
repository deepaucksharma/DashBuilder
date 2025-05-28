#!/bin/bash

# Deploy NRDOT collectors with proper New Relic OTLP configuration

source /Users/deepaksharma/devstack/.env

echo "=== Deploying NRDOT with Proper OTLP Configuration ==="
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"
echo "License Key: ${NEW_RELIC_LICENSE_KEY:0:10}...${NEW_RELIC_LICENSE_KEY: -4}"

# Clean up existing containers
docker rm -f $(docker ps -aq --filter "name=nrdot-vm") 2>/dev/null
docker rm -f $(docker ps -aq --filter "name=otel-vm") 2>/dev/null
docker rm -f final-test 2>/dev/null

# Deploy 5 NRDOT collectors with all required configurations
for i in {1..5}; do
    GRPC_PORT=$((4316 + i))
    HTTP_PORT=$((4317 + i))
    
    echo -e "\nDeploying nrdot-vm-$i..."
    
    docker run -d \
        --name nrdot-vm-$i \
        --hostname openstack-vm-$i \
        -e NEW_RELIC_LICENSE_KEY="$NEW_RELIC_LICENSE_KEY" \
        -e OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.nr-data.net:4318" \
        -e OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf" \
        -e OTEL_EXPORTER_OTLP_HEADERS="api-key=$NEW_RELIC_LICENSE_KEY" \
        -e OTEL_EXPORTER_OTLP_COMPRESSION="gzip" \
        -e OTEL_EXPORTER_OTLP_TIMEOUT="30000" \
        -e OTEL_EXPORTER_OTLP_INSECURE="false" \
        -e OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE="delta" \
        -e OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION="base2_exponential_bucket_histogram" \
        -e OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT="4095" \
        -e OTEL_ATTRIBUTE_COUNT_LIMIT="64" \
        -e OTEL_RESOURCE_ATTRIBUTES="service.name=openstack-vm,host.id=openstack-vm-$i,host.name=openstack-vm-$i,vm.number=$i,environment=production,cloud.provider=openstack,account.id=$NEW_RELIC_ACCOUNT_ID" \
        -e OTEL_BSP_MAX_EXPORT_BATCH_SIZE="512" \
        -e OTEL_BSP_SCHEDULE_DELAY="5000" \
        -e OTEL_METRIC_EXPORT_INTERVAL="30000" \
        -e OTEL_METRIC_EXPORT_TIMEOUT="30000" \
        -v /:/hostfs:ro \
        -p ${GRPC_PORT}:4317 \
        -p ${HTTP_PORT}:4318 \
        newrelic/nrdot-collector-host:latest \
        --config /etc/nrdot-collector-host/config.yaml \
        --config 'yaml:receivers::hostmetrics::root_path: /hostfs' \
        --config 'yaml:exporters::otlphttp::endpoint: https://otlp.nr-data.net:4318' \
        --config 'yaml:exporters::otlphttp::headers::api-key: ${env:NEW_RELIC_LICENSE_KEY}' \
        --config 'yaml:exporters::otlphttp::compression: gzip' \
        --config 'yaml:exporters::otlphttp::timeout: 30s' \
        --config 'yaml:exporters::otlphttp::retry::enabled: true' \
        --config 'yaml:exporters::otlphttp::retry::initial_interval: 1s' \
        --config 'yaml:exporters::otlphttp::retry::max_interval: 30s' \
        --config 'yaml:exporters::otlphttp::retry::max_elapsed_time: 300s'
    
    if [ $? -eq 0 ]; then
        echo "✓ Started nrdot-vm-$i"
    else
        echo "✗ Failed to start nrdot-vm-$i"
    fi
done

echo -e "\n=== Waiting for Collectors to Initialize ==="
sleep 30

echo -e "\n=== Checking Collector Status ==="
for i in {1..5}; do
    echo -e "\nnrdot-vm-$i:"
    if docker ps | grep -q "nrdot-vm-$i"; then
        echo "  ✓ Running"
        
        # Check for errors
        ERROR_COUNT=$(docker logs nrdot-vm-$i 2>&1 | grep -E "(error|Error|403|401)" | grep -v "fileconsumer" | grep -v "failed to get host ID" | wc -l)
        if [ $ERROR_COUNT -eq 0 ]; then
            echo "  ✓ No export errors"
        else
            echo "  ✗ Found $ERROR_COUNT errors"
            docker logs nrdot-vm-$i 2>&1 | grep -E "(error|Error|403|401)" | tail -2
        fi
    else
        echo "  ✗ Not running"
    fi
done

echo -e "\n=== New Relic Queries ==="
echo ""
echo "Account: $NEW_RELIC_ACCOUNT_ID"
echo ""
echo "1. Find all metrics:"
echo "   FROM Metric SELECT count(*) WHERE account.id = '$NEW_RELIC_ACCOUNT_ID' SINCE 10 minutes ago"
echo ""
echo "2. Find OpenStack VMs:"
echo "   FROM Metric SELECT uniques(host.name) WHERE service.name = 'openstack-vm' SINCE 10 minutes ago"
echo ""
echo "3. Check specific host:"
echo "   FROM Metric SELECT * WHERE host.id = 'openstack-vm-1' SINCE 10 minutes ago LIMIT 10"
echo ""
echo "4. Direct link with account:"
echo "   https://one.newrelic.com/data-explorer?accountId=$NEW_RELIC_ACCOUNT_ID&query=FROM%20Metric%20SELECT%20count(*)%20WHERE%20service.name%20%3D%20%27openstack-vm%27%20SINCE%2010%20minutes%20ago"
echo ""
echo "Note: Data should appear within 1-3 minutes"