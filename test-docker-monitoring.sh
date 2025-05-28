#!/bin/bash
set -euo pipefail

# Test script to verify Docker monitoring setup

echo "🔍 Testing DashBuilder Docker Monitoring Setup"
echo "============================================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_check() {
    local test_name="$1"
    local test_command="$2"
    
    echo -n "Testing $test_name... "
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# 1. Check Docker
test_check "Docker installation" "docker --version"
test_check "Docker Compose" "docker-compose --version"

# 2. Check environment file
test_check ".env file exists" "[ -f .env ]"

# 3. Check required environment variables
if [ -f .env ]; then
    source .env
    
    if [ "$NEW_RELIC_LICENSE_KEY" != "your_license_key_here" ] && [ -n "$NEW_RELIC_LICENSE_KEY" ]; then
        echo -e "New Relic License Key: ${GREEN}✓ Set${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "New Relic License Key: ${RED}✗ Not configured${NC}"
        ((TESTS_FAILED++))
    fi
    
    if [ "$NEW_RELIC_API_KEY" != "your_api_key_here" ] && [ -n "$NEW_RELIC_API_KEY" ]; then
        echo -e "New Relic API Key: ${GREEN}✓ Set${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "New Relic API Key: ${RED}✗ Not configured${NC}"
        ((TESTS_FAILED++))
    fi
    
    if [ "$NEW_RELIC_ACCOUNT_ID" != "your_account_id_here" ] && [ -n "$NEW_RELIC_ACCOUNT_ID" ]; then
        echo -e "New Relic Account ID: ${GREEN}✓ Set${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "New Relic Account ID: ${YELLOW}⚠ Not configured (optional but recommended)${NC}"
    fi
fi

# 4. Check configuration files
test_check "OpenTelemetry comprehensive config" "[ -f configs/collector-comprehensive.yaml ]"
test_check "Prometheus config" "[ -f configs/prometheus.yml ]"
test_check "Tempo config" "[ -f configs/tempo.yaml ]"
test_check "Docker logging config" "[ -f configs/docker-logging.json ]"

# 5. Check enhanced scripts
test_check "Enhanced control loop" "[ -f scripts/control-loop-enhanced.js ]"
test_check "Enhanced monitor" "[ -f orchestrator/monitor-enhanced.js ]"
test_check "Telemetry library" "[ -f lib/telemetry.js ]"

# 6. Check dashboards
test_check "NRDOT comprehensive dashboard" "[ -f dashboards/nrdot-comprehensive.json ]"

# 7. Check Docker images availability
echo ""
echo "Checking Docker images..."
IMAGES=("otel/opentelemetry-collector-contrib:0.91.0" "prom/prometheus:v2.45.0" "grafana/grafana:10.2.0" "jaegertracing/all-in-one:1.50")

for image in "${IMAGES[@]}"; do
    echo -n "Checking $image... "
    if docker image inspect "$image" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Available${NC}"
    else
        echo -e "${YELLOW}⚠ Will be pulled on first run${NC}"
    fi
done

# 8. Check ports availability
echo ""
echo "Checking port availability..."
PORTS=(3000 3001 4317 4318 8080 8888 9090 9091 9100 16686)

for port in "${PORTS[@]}"; do
    echo -n "Port $port... "
    if ! lsof -i :$port > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Available${NC}"
    else
        echo -e "${RED}✗ In use${NC}"
        ((TESTS_FAILED++))
    fi
done

# Summary
echo ""
echo "============================================"
echo "Test Summary:"
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All tests passed! Ready to run with:${NC}"
    echo "   ./start-comprehensive-monitoring.sh"
else
    echo ""
    echo -e "${YELLOW}⚠ Some tests failed. Please fix the issues above.${NC}"
    
    if [ "$NEW_RELIC_ACCOUNT_ID" = "your_account_id_here" ]; then
        echo ""
        echo "Note: You need to set NEW_RELIC_ACCOUNT_ID in .env file"
        echo "You can find it in your New Relic URL or account settings"
    fi
fi

echo ""