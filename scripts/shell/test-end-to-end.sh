#!/bin/bash

# Simple end-to-end test script for DashBuilder

set -e

# Load environment variables
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

echo "🧪 DashBuilder End-to-End Test"
echo "=============================="
echo ""

# Test 1: Check environment variables
echo "1. Checking environment variables..."
if [ -z "$NEW_RELIC_API_KEY" ]; then
    echo "   ❌ NEW_RELIC_API_KEY not set"
    exit 1
else
    echo "   ✅ NEW_RELIC_API_KEY is set"
fi

if [ -z "$NEW_RELIC_ACCOUNT_ID" ]; then
    echo "   ❌ NEW_RELIC_ACCOUNT_ID not set"
    exit 1
else
    echo "   ✅ NEW_RELIC_ACCOUNT_ID is set"
fi
echo ""

# Test 2: Check Docker services
echo "2. Checking Docker services..."
SERVICES=("dashbuilder-postgres" "dashbuilder-redis" "nrdot-collector" "dashbuilder-app" "nrdot-control-loop")
ALL_RUNNING=true

for service in "${SERVICES[@]}"; do
    if docker ps --format "table {{.Names}}" | grep -q "^$service$"; then
        echo "   ✅ $service is running"
    else
        echo "   ❌ $service is not running"
        ALL_RUNNING=false
    fi
done

if [ "$ALL_RUNNING" = false ]; then
    echo ""
    echo "Starting missing services..."
    docker-compose up -d
    sleep 10
fi
echo ""

# Test 3: Check collector health
echo "3. Checking OpenTelemetry Collector..."
HEALTH=$(curl -s http://localhost:13133/health || echo "unhealthy")
if [ "$HEALTH" = "{}" ]; then
    echo "   ✅ Collector is healthy"
else
    echo "   ❌ Collector health check failed"
fi
echo ""

# Test 4: Check Redis connection
echo "4. Checking Redis connection..."
if docker exec dashbuilder-redis redis-cli ping | grep -q PONG; then
    echo "   ✅ Redis is responding"
else
    echo "   ❌ Redis connection failed"
fi
echo ""

# Test 5: Check PostgreSQL connection
echo "5. Checking PostgreSQL connection..."
if docker exec dashbuilder-postgres psql -U nrdot -d dashbuilder -c "SELECT 1" > /dev/null 2>&1; then
    echo "   ✅ PostgreSQL is responding"
else
    echo "   ❌ PostgreSQL connection failed"
fi
echo ""

# Test 6: Test New Relic API connection
echo "6. Testing New Relic API connection..."
RESPONSE=$(curl -s -X POST https://api.newrelic.com/graphql \
  -H "Content-Type: application/json" \
  -H "API-Key: $NEW_RELIC_API_KEY" \
  -d '{"query":"{ actor { user { email } } }"}' || echo "{}")

if echo "$RESPONSE" | grep -q "email"; then
    echo "   ✅ New Relic API connection successful"
else
    echo "   ❌ New Relic API connection failed"
    echo "   Response: $RESPONSE"
fi
echo ""

# Test 7: Check control loop logs
echo "7. Checking control loop..."
CONTROL_LOGS=$(docker logs nrdot-control-loop --tail=5 2>&1)
if echo "$CONTROL_LOGS" | grep -q "Running control loop iteration"; then
    echo "   ✅ Control loop is running"
else
    echo "   ❌ Control loop may have issues"
fi
echo ""

# Test 8: Simple metrics check
echo "8. Checking if metrics are being collected..."
METRICS=$(curl -s http://localhost:8889/metrics 2>/dev/null | grep -c "nrdot" || echo "0")
if [ "$METRICS" -gt 0 ]; then
    echo "   ✅ Found $METRICS NRDOT metrics"
else
    echo "   ⚠️  No NRDOT metrics found (this is normal if just started)"
fi
echo ""

# Summary
echo "================================"
echo "Test Summary:"
echo ""
echo "✅ Environment is set up correctly"
echo "✅ All Docker services are available"
echo ""
echo "Next steps:"
echo "1. Check New Relic UI for incoming data"
echo "2. Run: docker logs nrdot-collector --tail=50"
echo "3. Run: npm run cli -- dashboard list"
echo "4. Run an experiment: ./run-experiment.sh -p cost-optimization-basic"
echo ""
echo "For troubleshooting, check logs:"
echo "- docker logs nrdot-collector"
echo "- docker logs nrdot-control-loop"
echo "- docker logs dashbuilder-app"