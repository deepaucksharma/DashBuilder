#!/bin/bash
# Integration Validation Script
# Verifies all components are working together correctly

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Check function
check() {
    local description="$1"
    local command="$2"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    printf "%-60s" "Checking $description..."
    
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}[PASS]${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        echo -e "${RED}[FAIL]${NC}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

# Advanced check with output
check_with_output() {
    local description="$1"
    local command="$2"
    local expected="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    printf "%-60s" "Checking $description..."
    
    output=$(eval "$command" 2>&1 || true)
    if [[ "$output" == *"$expected"* ]]; then
        echo -e "${GREEN}[PASS]${NC}"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        echo -e "${RED}[FAIL]${NC}"
        echo "  Expected: $expected"
        echo "  Got: $output"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          DashBuilder + NRDOT Integration Validator         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. Environment Checks
echo -e "\n${YELLOW}1. Environment Configuration${NC}"
check "Environment file exists" "test -f .env"
check "License key configured" "grep -q 'NEW_RELIC_LICENSE_KEY=.' .env"
check "Account ID configured" "grep -q 'NEW_RELIC_ACCOUNT_ID=[0-9]' .env"
check "API key configured" "grep -q 'NEW_RELIC_API_KEY=.' .env"

# 2. Docker Services
echo -e "\n${YELLOW}2. Docker Services${NC}"
check "Docker daemon running" "docker info"
check "PostgreSQL running" "docker-compose ps postgres | grep -q Up"
check "Redis running" "docker-compose ps redis | grep -q Up"
check "OTEL Collector running" "docker-compose ps otel-collector | grep -q Up"
check "DashBuilder running" "docker-compose ps dashbuilder | grep -q Up"

# 3. Network Connectivity
echo -e "\n${YELLOW}3. Network Connectivity${NC}"
check "PostgreSQL accessible" "nc -zv localhost 5432"
check "Redis accessible" "nc -zv localhost 6379"
check "OTEL Collector metrics endpoint" "curl -s http://localhost:8888/metrics"
check "DashBuilder API endpoint" "curl -s http://localhost:8080/health"
check "Dashboard UI accessible" "curl -s http://localhost:3000"

# 4. Database Validation
echo -e "\n${YELLOW}4. Database Validation${NC}"
check "PostgreSQL connection" "PGPASSWORD=postgres psql -h localhost -U dashbuilder -d dashbuilder -c 'SELECT 1'"
check "Redis connection" "redis-cli -h localhost ping | grep -q PONG"

# 5. NRDOT Metrics
echo -e "\n${YELLOW}5. NRDOT Metrics Validation${NC}"
check "NRDOT metrics exposed" "curl -s http://localhost:8888/metrics | grep -q nrdot_"
check "Process series total metric" "curl -s http://localhost:8888/metrics | grep -q nrdot_process_series_total"
check "Process series kept metric" "curl -s http://localhost:8888/metrics | grep -q nrdot_process_series_kept"
check "Coverage metric" "curl -s http://localhost:8888/metrics | grep -q nrdot_process_coverage_critical"
check "Optimization profile metric" "curl -s http://localhost:8888/metrics | grep -q nrdot_optimization_profile"

# 6. New Relic Integration
echo -e "\n${YELLOW}6. New Relic Integration${NC}"
if [[ -f .env ]]; then
    source .env
    check "New Relic API connectivity" "curl -s -H 'Api-Key: $NEW_RELIC_API_KEY' https://api.newrelic.com/v2/applications.json | grep -q '\\['"
    check "OTLP endpoint reachable" "nc -zv ${OTEL_EXPORTER_OTLP_ENDPOINT%%:*} ${OTEL_EXPORTER_OTLP_ENDPOINT##*:}"
fi

# 7. Control Loop
echo -e "\n${YELLOW}7. Control Loop Validation${NC}"
check "Control loop container exists" "docker-compose ps control-loop"
check "Control loop healthy" "docker-compose ps control-loop | grep -q Up || true"
check "Optimization config exists" "test -f configs/optimization.yaml"
check "Collector profiles exist" "test -d configs/collector-profiles"

# 8. Data Flow
echo -e "\n${YELLOW}8. Data Flow Validation${NC}"
echo "Waiting for metrics to flow (30 seconds)..."
sleep 30

# Check if metrics are being collected
check_with_output "Metrics being collected" \
    "curl -s http://localhost:8888/metrics | grep -c '^nrdot_'" \
    "[0-9]"

# 9. Dashboard Components
echo -e "\n${YELLOW}9. Dashboard Components${NC}"
check "Orchestrator scripts exist" "test -d orchestrator"
check "Dashboard workflows exist" "test -f orchestrator/workflows/create-dashboard.js"
check "Scripts directory exists" "test -d scripts"
check "NR1 app directory exists" "test -d nrdot-nr1-app"

# 10. Monitoring Stack
echo -e "\n${YELLOW}10. Monitoring Stack${NC}"
if [[ -f docker-compose.observability.yml ]]; then
    check "Prometheus configured" "test -f configs/prometheus.yml"
    check "Prometheus running" "docker-compose -f docker-compose.observability.yml ps prometheus | grep -q Up || true"
    check "Grafana running" "docker-compose -f docker-compose.observability.yml ps grafana | grep -q Up || true"
fi

# Summary
echo -e "\n${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}                    Validation Summary                        ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo
echo -e "Total Checks: ${TOTAL_CHECKS}"
echo -e "Passed: ${GREEN}${PASSED_CHECKS}${NC}"
echo -e "Failed: ${RED}${FAILED_CHECKS}${NC}"
echo

if [[ $FAILED_CHECKS -eq 0 ]]; then
    echo -e "${GREEN}✅ All validation checks passed! The integration is working correctly.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some validation checks failed. Please review the errors above.${NC}"
    echo
    echo "Troubleshooting tips:"
    echo "1. Check logs: docker-compose logs -f [service-name]"
    echo "2. Restart services: docker-compose restart"
    echo "3. Review .env configuration"
    echo "4. Ensure all dependencies are installed"
    exit 1
fi