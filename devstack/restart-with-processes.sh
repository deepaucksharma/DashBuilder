#!/bin/bash

# Restart NRDOT with process metrics enabled

source /Users/deepaksharma/devstack/.env

echo "=== Restarting NRDOT with Process Metrics Enabled ==="
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"
echo ""

# Stop existing collectors
echo "Stopping existing collectors..."
docker stop $(docker ps -q --filter "name=otel-vm") 2>/dev/null
docker rm $(docker ps -aq --filter "name=otel-vm") 2>/dev/null
echo "✓ Stopped existing collectors"

echo ""
echo "Starting collectors with process metrics..."

# Deploy 5 collectors with process metrics
for i in {1..5}; do
    docker run -d \
        --name otel-vm-$i \
        --hostname openstack-vm-$i \
        -e NEW_RELIC_LICENSE_KEY="$NEW_RELIC_LICENSE_KEY" \
        -e NEW_RELIC_ACCOUNT_ID="$NEW_RELIC_ACCOUNT_ID" \
        -e OTEL_RESOURCE_ATTRIBUTES="host.name=openstack-vm-$i,host.id=openstack-vm-$i,vm.number=$i" \
        -v $(pwd)/otel-config-with-processes.yaml:/config.yaml:ro \
        -v /proc:/host/proc:ro \
        -v /sys:/host/sys:ro \
        -v /etc/os-release:/host/etc/os-release:ro \
        --pid host \
        otel/opentelemetry-collector-contrib:latest \
        --config=/config.yaml
    
    if [ $? -eq 0 ]; then
        echo "✓ Started otel-vm-$i with process metrics"
    else
        echo "✗ Failed to start otel-vm-$i"
    fi
done

echo ""
echo "=== Waiting for collectors to initialize ==="
sleep 20

echo ""
echo "=== Verification ==="
for i in {1..5}; do
    echo -n "otel-vm-$i: "
    if docker ps | grep -q "otel-vm-$i"; then
        echo "✓ Running"
    else
        echo "✗ Not running"
    fi
done

echo ""
echo "=== Process Metrics Queries ==="
echo ""
echo "1. See all processes:"
echo "   SELECT uniques(process.name) FROM Metric WHERE host.id LIKE 'openstack-vm-%' SINCE 10 minutes ago"
echo ""
echo "2. Top CPU consuming processes:"
echo "   SELECT average(process.cpu.utilization) FROM Metric WHERE host.id LIKE 'openstack-vm-%' FACET process.name SINCE 10 minutes ago LIMIT 20"
echo ""
echo "3. Process memory usage:"
echo "   SELECT average(process.memory.usage) FROM Metric WHERE host.id LIKE 'openstack-vm-%' FACET process.name SINCE 10 minutes ago LIMIT 20"
echo ""
echo "4. Process count by host:"
echo "   SELECT uniqueCount(process.name) FROM Metric WHERE host.id LIKE 'openstack-vm-%' FACET host.id SINCE 10 minutes ago"
echo ""
echo "5. Specific process monitoring:"
echo "   SELECT average(process.cpu.utilization), average(process.memory.usage) FROM Metric WHERE process.name LIKE '%docker%' FACET host.id TIMESERIES SINCE 30 minutes ago"
echo ""
echo "Process metrics will start appearing in 2-3 minutes!"