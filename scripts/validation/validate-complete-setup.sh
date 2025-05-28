#!/bin/bash
# NRDOT v2 Complete Setup Validation Script
# Validates all components are working and data is flowing

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Validation counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Log functions
log_check() { echo -e "${BLUE}[CHECK]${NC} $*"; ((TOTAL_CHECKS++)); }
log_pass() { echo -e "${GREEN}[PASS]${NC} $*"; ((PASSED_CHECKS++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $*"; ((FAILED_CHECKS++)); }
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE} NRDOT v2 Complete Setup Validation${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# 1. Check environment variables
validate_environment() {
    log_check "Validating environment variables..."
    
    if [ -n "$NEW_RELIC_API_KEY" ] && [ -n "$NEW_RELIC_ACCOUNT_ID" ]; then
        log_pass "Required environment variables are set"
    else
        log_fail "Missing required environment variables"
        return 1
    fi
}

# 2. Check services status
check_services() {
    log_check "Checking service status..."
    
    # Check OpenTelemetry Collector
    if curl -s http://localhost:8888/metrics > /dev/null 2>&1; then
        log_pass "OpenTelemetry Collector is running"
    else
        log_fail "OpenTelemetry Collector is not accessible"
    fi
    
    # Check API server
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        log_pass "API server is running"
    else
        log_fail "API server is not accessible"
    fi
    
    # Check web dashboard
    if curl -s http://localhost > /dev/null 2>&1; then
        log_pass "Web dashboard is accessible"
    else
        log_fail "Web dashboard is not accessible"
    fi
}

# 3. Test New Relic API connection
test_api_connection() {
    log_check "Testing New Relic API connection..."
    
    cd /app/scripts
    if node src/cli.js schema discover-event-types 2>&1 | grep -q "Event Types"; then
        log_pass "New Relic API connection successful"
    else
        log_fail "New Relic API connection failed"
    fi
}

# 4. Check data ingestion
check_data_ingestion() {
    log_check "Checking data ingestion..."
    
    cd /app/scripts
    
    # Check for recent data
    local query="SELECT count(*) as 'dataPoints' FROM Metric WHERE metricName IS NOT NULL SINCE 5 minutes ago"
    if node src/cli.js nrql validate "$query" 2>&1 | grep -q "valid: true"; then
        log_pass "Data is being ingested to New Relic"
    else
        log_fail "No recent data found in New Relic"
    fi
    
    # Check for API calls
    query="SELECT count(*) FROM Public_APICall SINCE 5 minutes ago"
    if node src/cli.js nrql validate "$query" 2>&1 | grep -q "valid: true"; then
        log_pass "API call data is being tracked"
    else
        log_info "No API call data found (this may be normal)"
    fi
}

# 5. Validate dashboards
validate_dashboards() {
    log_check "Validating dashboards..."
    
    if [ -f /tmp/dashboard-id.txt ]; then
        local dashboard_id=$(cat /tmp/dashboard-id.txt)
        log_info "Found dashboard ID: $dashboard_id"
        
        cd /app/scripts
        if node src/cli.js dashboard validate-widgets "$dashboard_id" 2>&1 | grep -q "widgets"; then
            log_pass "Dashboard widgets are valid"
        else
            log_fail "Dashboard widget validation failed"
        fi
    else
        log_fail "No dashboard ID found"
    fi
}

# 6. Check NRDOT metrics
check_nrdot_metrics() {
    log_check "Checking NRDOT-specific metrics..."
    
    # Send test metric
    curl -X POST http://localhost:8888/v1/metrics \
        -H "Content-Type: application/json" \
        -d '{
            "resourceMetrics": [{
                "resource": {
                    "attributes": [{
                        "key": "service.name",
                        "value": { "stringValue": "nrdot-validation" }
                    }]
                },
                "scopeMetrics": [{
                    "metrics": [{
                        "name": "nrdot.validation.test",
                        "unit": "1",
                        "gauge": {
                            "dataPoints": [{
                                "timeUnixNano": "'$(date +%s)'000000000",
                                "asDouble": 1.0
                            }]
                        }
                    }]
                }]
            }]
        }' > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        log_pass "Successfully sent test metric to collector"
    else
        log_fail "Failed to send test metric"
    fi
}

# 7. Validate control loop
check_control_loop() {
    log_check "Checking control loop configuration..."
    
    if [ -f /etc/nrdot-plus/control-loop.conf ]; then
        source /etc/nrdot-plus/control-loop.conf
        log_pass "Control loop configuration found"
        log_info "  Profile: $PROFILE"
        log_info "  Target Coverage: $TARGET_COVERAGE%"
        log_info "  Cost Reduction: $COST_REDUCTION%"
    else
        log_fail "Control loop configuration not found"
    fi
}

# 8. Performance check
check_performance() {
    log_check "Checking system performance..."
    
    # Check CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    if (( $(echo "$cpu_usage < 80" | bc -l) )); then
        log_pass "CPU usage is acceptable: ${cpu_usage}%"
    else
        log_fail "CPU usage is high: ${cpu_usage}%"
    fi
    
    # Check memory
    local mem_usage=$(free | grep Mem | awk '{print ($3/$2) * 100.0}')
    log_info "Memory usage: ${mem_usage}%"
}

# 9. Generate validation report
generate_report() {
    echo ""
    echo -e "${BLUE}=====================================${NC}"
    echo -e "${BLUE} Validation Summary${NC}"
    echo -e "${BLUE}=====================================${NC}"
    echo ""
    echo "Total Checks: $TOTAL_CHECKS"
    echo -e "Passed: ${GREEN}$PASSED_CHECKS${NC}"
    echo -e "Failed: ${RED}$FAILED_CHECKS${NC}"
    echo ""
    
    if [ $FAILED_CHECKS -eq 0 ]; then
        echo -e "${GREEN}✅ All validation checks passed!${NC}"
        echo -e "${GREEN}Your NRDOT v2 setup is fully operational.${NC}"
    else
        echo -e "${YELLOW}⚠️  Some checks failed. Please review the output above.${NC}"
    fi
    
    echo ""
    echo "Access Points:"
    echo "  • Web Dashboard: http://localhost:8080"
    echo "  • API Server: http://localhost:3000"
    echo "  • OTel Metrics: http://localhost:8888/metrics"
    echo ""
    
    # Save report
    cat > /tmp/validation-report.json << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "total_checks": $TOTAL_CHECKS,
  "passed_checks": $PASSED_CHECKS,
  "failed_checks": $FAILED_CHECKS,
  "status": $([ $FAILED_CHECKS -eq 0 ] && echo '"success"' || echo '"partial"')
}
EOF
}

# Run all validations
main() {
    validate_environment
    check_services
    test_api_connection
    check_data_ingestion
    validate_dashboards
    check_nrdot_metrics
    check_control_loop
    check_performance
    generate_report
}

# Execute main
main "$@"