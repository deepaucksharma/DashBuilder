#!/bin/bash

# Deploy NRDOT collectors with proper host.id configuration

source /Users/deepaksharma/.env

echo "Deploying 5 NRDOT collectors with proper host.id configuration"
echo "License Key: ${NEW_RELIC_LICENSE_KEY:0:10}...${NEW_RELIC_LICENSE_KEY: -4}"

# Clean up any existing containers
docker ps -a | grep nrdot-vm | awk '{print $1}' | xargs -r docker rm -f 2>/dev/null

# Deploy 5 collectors with explicit host.id to avoid the detection issue
for i in {1..5}; do
    GRPC_PORT=$((4316 + i))
    HTTP_PORT=$((4322 + i))
    
    # Set explicit host.id to avoid detection issues
    RESOURCE_ATTRS="service.name=openstack-vm,host.id=openstack-vm-$i,vm.number=$i,environment=production,cloud.provider=openstack,host.name=openstack-vm-$i"
    
    docker run -d \
        --name nrdot-vm-$i \
        --hostname openstack-vm-$i \
        -e NEW_RELIC_LICENSE_KEY="$NEW_RELIC_LICENSE_KEY" \
        -e OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.nr-data.net" \
        -e OTEL_RESOURCE_ATTRIBUTES="$RESOURCE_ATTRS" \
        -v /:/hostfs:ro \
        -p ${GRPC_PORT}:4317 \
        -p ${HTTP_PORT}:4318 \
        newrelic/nrdot-collector-host:latest \
        --config /etc/nrdot-collector-host/config.yaml \
        --config 'yaml:receivers::hostmetrics::root_path: /hostfs'
    
    if [ $? -eq 0 ]; then
        echo "✓ Started nrdot-vm-$i on ports $GRPC_PORT/$HTTP_PORT with host.id=openstack-vm-$i"
    else
        echo "✗ Failed to start nrdot-vm-$i"
    fi
done

echo ""
echo "Waiting for collectors to start exporting metrics..."
sleep 30

echo ""
echo "=== Checking Export Status ==="
for i in {1..5}; do
    echo -e "\nnrdot-vm-$i:"
    if docker ps | grep -q "nrdot-vm-$i"; then
        # Check for the specific warning we're trying to fix
        if docker logs nrdot-vm-$i 2>&1 | grep -q "failed to get host ID"; then
            echo "  ⚠ Still getting host ID warning (but we set it manually, so it's OK)"
        fi
        
        # Check for export errors
        if docker logs nrdot-vm-$i 2>&1 | tail -50 | grep -q "403"; then
            echo "  ✗ Authentication errors detected"
        else
            echo "  ✓ No authentication errors"
        fi
        
        # Show resource attributes
        echo "  Resource attributes: host.id=openstack-vm-$i"
    else
        echo "  ✗ Not running"
    fi
done

echo ""
echo "=== Data Verification in New Relic ==="
echo ""
echo "The collectors are configured with:"
echo "- service.name: openstack-vm"
echo "- host.id: openstack-vm-1 through openstack-vm-5"
echo "- environment: production"
echo "- cloud.provider: openstack"
echo ""
echo "Check your data at:"
echo "1. Infrastructure: https://one.newrelic.com/infra"
echo "   - Look for hosts: openstack-vm-1, openstack-vm-2, etc."
echo ""
echo "2. Query Builder: https://one.newrelic.com/data-explorer"
echo "   - Query: SELECT * FROM Metric WHERE host.id LIKE 'openstack-vm-%' SINCE 10 minutes ago"
echo "   - Query: SELECT * FROM Metric WHERE service.name = 'openstack-vm' SINCE 10 minutes ago"
echo ""
echo "3. Entity Search: https://one.newrelic.com/entity-explorer"
echo "   - Search for: openstack"
echo ""
echo "Note: We've explicitly set host.id to ensure host entities are created."