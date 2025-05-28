#!/bin/bash

echo "=== NRDOT Data Collection Test ==="
echo ""

# Check environment variables
echo "1. Checking environment variables..."
if [ -f .env ]; then
    source .env
    
    if [ "$NEW_RELIC_LICENSE_KEY" = "your_license_key_here" ] || [ -z "$NEW_RELIC_LICENSE_KEY" ]; then
        echo "❌ NEW_RELIC_LICENSE_KEY not set properly in .env"
        echo "   Please update .env with your actual New Relic credentials"
        exit 1
    else
        echo "✅ NEW_RELIC_LICENSE_KEY is set"
    fi
    
    if [ "$NEW_RELIC_API_KEY" = "your_api_key_here" ] || [ -z "$NEW_RELIC_API_KEY" ]; then
        echo "❌ NEW_RELIC_API_KEY not set properly in .env"
        exit 1
    else
        echo "✅ NEW_RELIC_API_KEY is set"
    fi
    
    if [ "$NEW_RELIC_ACCOUNT_ID" = "your_account_id_here" ] || [ -z "$NEW_RELIC_ACCOUNT_ID" ]; then
        echo "❌ NEW_RELIC_ACCOUNT_ID not set properly in .env"
        exit 1
    else
        echo "✅ NEW_RELIC_ACCOUNT_ID is set"
    fi
else
    echo "❌ .env file not found"
    exit 1
fi

echo ""
echo "2. Testing metrics format..."
node test-metrics-format.js > /tmp/metrics-test.log 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Metrics format test passed"
else
    echo "❌ Metrics format test failed"
    cat /tmp/metrics-test.log
    exit 1
fi

echo ""
echo "3. Testing experiment data format..."
node test-experiment-data.js > /tmp/experiment-test.log 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Experiment data format test passed"
else
    echo "❌ Experiment data format test failed"
    cat /tmp/experiment-test.log
    exit 1
fi

echo ""
echo "4. Starting OTEL collector..."
docker-compose -f docker-compose-simple.yml up -d otel-collector
sleep 10

echo ""
echo "5. Checking collector health..."
curl -s http://localhost:13133/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ OTEL collector is healthy"
else
    echo "❌ OTEL collector health check failed"
    docker-compose -f docker-compose-simple.yml logs otel-collector
    exit 1
fi

echo ""
echo "6. Starting metrics generator..."
docker-compose -f docker-compose-simple.yml up -d metrics-generator
sleep 5

echo ""
echo "7. Checking metrics generation..."
docker-compose -f docker-compose-simple.yml logs metrics-generator | tail -n 20

echo ""
echo "8. Checking collector metrics endpoint..."
curl -s http://localhost:8888/metrics | grep -E "(otelcol_receiver_accepted|otelcol_exporter_sent)" | head -n 10

echo ""
echo "9. Testing OTLP endpoint..."
node test-metrics-format.js --test-endpoint

echo ""
echo "10. Summary of expected data in NRDB:"
echo "    - system.cpu.utilization"
echo "    - system.memory.utilization" 
echo "    - process.cpu.utilization (with dimensions)"
echo "    - process.memory.usage (with dimensions)"
echo "    - nrdot.optimization.score"
echo "    - nrdot.cost.reduction"
echo "    - nrdot.process.coverage"
echo "    - otelcol_* metrics"

echo ""
echo "To check data in New Relic:"
echo "1. Go to https://one.newrelic.com"
echo "2. Navigate to Query Builder"
echo "3. Run: SELECT count(*) FROM Metric WHERE metricName LIKE 'process.%' SINCE 5 minutes ago"
echo "4. Run: SELECT count(*) FROM Metric WHERE metricName LIKE 'nrdot.%' SINCE 5 minutes ago"

echo ""
echo "To stop the test:"
echo "docker-compose -f docker-compose-simple.yml down"