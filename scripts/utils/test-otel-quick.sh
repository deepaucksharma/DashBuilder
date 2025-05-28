#!/bin/bash
# Quick OpenTelemetry Test Script
# Tests if the collector can start and collect metrics

set -euo pipefail

# Configuration
CONFIG_FILE="distributions/nrdot-plus/config/config.yaml"
TEST_LICENSE_KEY="test-key-12345678901234567890123456789012345678"

echo "Quick OpenTelemetry Test"
echo "======================="

# Test 1: Configuration validation
echo "1. Testing configuration validation..."
if docker run --rm \
    -v "$(pwd)/$CONFIG_FILE:/tmp/config.yaml" \
    -e NEW_RELIC_LICENSE_KEY="$TEST_LICENSE_KEY" \
    otel/opentelemetry-collector-contrib:0.91.0 \
    validate --config=/tmp/config.yaml; then
    echo "✓ Configuration is valid"
else
    echo "✗ Configuration validation failed"
    exit 1
fi

# Test 2: Collector startup test
echo -e "\n2. Testing collector startup..."
CONTAINER_ID=$(docker run -d \
    -v "$(pwd)/$CONFIG_FILE:/tmp/config.yaml" \
    -e NEW_RELIC_LICENSE_KEY="$TEST_LICENSE_KEY" \
    -e OTEL_LOG_LEVEL="debug" \
    -p 8888:8888 \
    -p 13133:13133 \
    otel/opentelemetry-collector-contrib:0.91.0 \
    --config=/tmp/config.yaml)

echo "Started container: $CONTAINER_ID"

# Wait for startup
echo "Waiting for collector to start..."
sleep 10

# Test 3: Health check
echo -e "\n3. Testing health endpoint..."
if curl -sf http://localhost:13133/health > /dev/null; then
    echo "✓ Health endpoint responding"
else
    echo "✗ Health endpoint not responding"
    docker logs "$CONTAINER_ID"
    docker stop "$CONTAINER_ID" && docker rm "$CONTAINER_ID"
    exit 1
fi

# Test 4: Metrics endpoint
echo -e "\n4. Testing metrics endpoint..."
if curl -sf http://localhost:8888/metrics > /dev/null; then
    echo "✓ Metrics endpoint responding"
    
    # Count metrics
    METRIC_COUNT=$(curl -s http://localhost:8888/metrics | grep -c "^[a-zA-Z]" || true)
    echo "Found $METRIC_COUNT metrics"
    
    # Look for process metrics
    if curl -s http://localhost:8888/metrics | grep -q "process_"; then
        echo "✓ Process metrics are being collected"
    else
        echo "⚠ No process metrics found (may be normal in container)"
    fi
    
else
    echo "✗ Metrics endpoint not responding"
    docker logs "$CONTAINER_ID"
    docker stop "$CONTAINER_ID" && docker rm "$CONTAINER_ID"
    exit 1
fi

# Test 5: Check for errors in logs
echo -e "\n5. Checking for errors in logs..."
ERROR_COUNT=$(docker logs "$CONTAINER_ID" 2>&1 | grep -i "error" | wc -l || true)
if [[ $ERROR_COUNT -eq 0 ]]; then
    echo "✓ No errors found in logs"
else
    echo "⚠ Found $ERROR_COUNT error messages:"
    docker logs "$CONTAINER_ID" 2>&1 | grep -i "error" | head -5
fi

# Cleanup
echo -e "\n6. Cleaning up..."
docker stop "$CONTAINER_ID" && docker rm "$CONTAINER_ID"

echo -e "\n✓ Quick test completed successfully!"
echo "The OpenTelemetry configuration is working."