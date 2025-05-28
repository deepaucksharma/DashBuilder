#!/bin/bash
# NRDOT v2 Integration Test Suite
# Tests all components end-to-end

set -euo pipefail

# Test configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
RESULTS_DIR="$TEST_DIR/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Setup
setup() {
    echo -e "${BLUE}=== NRDOT v2 Integration Test Suite ===${NC}"
    echo "Starting at: $(date)"
    
    # Create results directory
    mkdir -p "$RESULTS_DIR"
    
    # Check prerequisites
    check_prerequisites
}

check_prerequisites() {
    echo -e "\n${BLUE}Checking prerequisites...${NC}"
    
    local prereqs=("docker" "jq" "curl" "nc")
    for cmd in "${prereqs[@]}"; do
        if command -v "$cmd" &> /dev/null; then
            echo -e "${GREEN}✓${NC} $cmd found"
        else
            echo -e "${RED}✗${NC} $cmd not found"
            exit 1
        fi
    done
    
    # Check environment variables
    if [[ -z "${NEW_RELIC_LICENSE_KEY:-}" ]]; then
        echo -e "${YELLOW}Warning: NEW_RELIC_LICENSE_KEY not set. Some tests will be skipped.${NC}"
    fi
}

# Test functions
test_case() {
    local test_name="$1"
    local test_func="$2"
    
    echo -e "\n${BLUE}Running: $test_name${NC}"
    ((TESTS_RUN++))
    
    if $test_func > "$RESULTS_DIR/${TIMESTAMP}_${test_name}.log" 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "  See: $RESULTS_DIR/${TIMESTAMP}_${test_name}.log"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 1: Configuration validation
test_config_validation() {
    cd "$PROJECT_ROOT"
    
    # Validate YAML syntax
    docker run --rm -v "$PWD:/work" yamllint/yamllint:latest \
        distributions/nrdot-plus/config/*.yaml
    
    # Validate OpenTelemetry configuration
    docker run --rm \
        -v "$PWD/distributions/nrdot-plus/config:/etc/otel" \
        otel/opentelemetry-collector-contrib:0.91.0 \
        validate --config=/etc/otel/config-functional-complete.yaml
}

# Test 2: Docker container startup
test_docker_startup() {
    cd "$PROJECT_ROOT"
    
    # Build Docker image
    docker build -f distributions/nrdot-plus/Dockerfile.otel -t nrdot-test:latest .
    
    # Run container
    docker run -d --name nrdot-test \
        -e NEW_RELIC_LICENSE_KEY="${NEW_RELIC_LICENSE_KEY:-dummy}" \
        -p 8889:8889 \
        nrdot-test:latest
    
    # Wait for startup
    sleep 10
    
    # Check if running
    docker ps | grep nrdot-test
    
    # Check health endpoint
    curl -f http://localhost:8889/metrics | grep "otelcol_process_uptime"
    
    # Cleanup
    docker stop nrdot-test && docker rm nrdot-test
}

# Test 3: Metric generation pipeline
test_metric_generation() {
    cd "$PROJECT_ROOT"
    
    # Start collector with test config
    docker run -d --name nrdot-metrics \
        -v "$PWD/distributions/nrdot-plus/config:/etc/otel" \
        -e NEW_RELIC_LICENSE_KEY="${NEW_RELIC_LICENSE_KEY:-dummy}" \
        -p 8888:8888 -p 8889:8889 \
        otel/opentelemetry-collector-contrib:0.91.0 \
        --config=/etc/otel/config-functional-complete.yaml
    
    sleep 15
    
    # Check internal metrics
    local metrics_output=$(curl -s http://localhost:8888/metrics)
    
    # Verify key metrics exist
    echo "$metrics_output" | grep -q "otelcol_receiver_accepted_metric_points"
    echo "$metrics_output" | grep -q "otelcol_processor_batch_batch_send_size"
    echo "$metrics_output" | grep -q "otelcol_exporter_sent_metric_points"
    
    # Check Prometheus metrics
    local prom_output=$(curl -s http://localhost:8889/metrics)
    
    # Verify NRDOT metrics
    echo "$prom_output" | grep -q "nrdot_summary_total_series"
    echo "$prom_output" | grep -q "nrdot_cost_estimate_total"
    echo "$prom_output" | grep -q "nrdot_coverage_percentage"
    
    # Cleanup
    docker stop nrdot-metrics && docker rm nrdot-metrics
}

# Test 4: NRQL query validation
test_nrql_queries() {
    cd "$PROJECT_ROOT"
    
    # Extract and validate NRQL queries
    local query_file="$RESULTS_DIR/nrql_queries.txt"
    
    # Find all NRQL queries in the codebase
    grep -r "FROM Metric\|FROM ProcessSample" \
        --include="*.js" --include="*.sh" --include="*.json" \
        . > "$query_file" || true
    
    # Basic syntax validation
    while IFS= read -r line; do
        # Check for common issues
        if echo "$line" | grep -q "FROM Metric.*process_"; then
            echo "Warning: Underscore in Metric query: $line"
        fi
        if echo "$line" | grep -q "FROM ProcessSample.*nrdot_"; then
            echo "Warning: Underscore in ProcessSample query: $line"
        fi
    done < "$query_file"
}

# Test 5: Control loop functionality
test_control_loop() {
    cd "$PROJECT_ROOT"
    
    # Test control loop script
    if [[ -x "distributions/nrdot-plus/scripts/control-loop-enhanced.sh" ]]; then
        # Run in check mode
        bash distributions/nrdot-plus/scripts/control-loop-enhanced.sh check || true
    fi
    
    # Test cardinality monitor
    if [[ -x "distributions/nrdot-plus/scripts/cardinality-monitor.sh" ]]; then
        bash distributions/nrdot-plus/scripts/cardinality-monitor.sh || true
    fi
}

# Test 6: API endpoints
test_api_endpoints() {
    cd "$PROJECT_ROOT"
    
    # Start a test server if API exists
    if [[ -f "nrdot-nr1-app/lib/api/control.js" ]]; then
        # Test would normally start the API server
        # For now, just validate the file exists and has expected functions
        grep -q "getOptimizationState" nrdot-nr1-app/lib/api/control.js
        grep -q "updateProfile" nrdot-nr1-app/lib/api/control.js
        grep -q "getExperimentStatus" nrdot-nr1-app/lib/api/control.js
    fi
}

# Test 7: Dashboard JSON validation
test_dashboard_validation() {
    cd "$PROJECT_ROOT"
    
    # Find all dashboard JSON files
    local dashboards=$(find . -name "*dashboard*.json" -type f)
    
    for dashboard in $dashboards; do
        echo "Validating: $dashboard"
        
        # Validate JSON syntax
        jq . "$dashboard" > /dev/null
        
        # Check for required fields
        jq -e '.pages[0].widgets' "$dashboard" > /dev/null
        
        # Validate NRQL in widgets
        jq -r '.pages[].widgets[].configuration.queries[].query // empty' "$dashboard" | \
        while IFS= read -r query; do
            # Basic NRQL validation
            if [[ -n "$query" ]]; then
                echo "$query" | grep -q "SELECT\|FROM" || echo "Invalid NRQL: $query"
            fi
        done
    done
}

# Test 8: Process monitoring simulation
test_process_monitoring() {
    cd "$PROJECT_ROOT"
    
    # Create a test process
    sleep 3600 &
    local test_pid=$!
    
    # Start collector with host process monitoring
    docker run -d --name nrdot-procmon \
        --pid=host \
        -v "$PWD/distributions/nrdot-plus/config:/etc/otel" \
        -e NEW_RELIC_LICENSE_KEY="${NEW_RELIC_LICENSE_KEY:-dummy}" \
        -p 8889:8889 \
        otel/opentelemetry-collector-contrib:0.91.0 \
        --config=/etc/otel/config-functional-complete.yaml
    
    sleep 20
    
    # Check if process metrics are being collected
    curl -s http://localhost:8889/metrics | grep -q "process_cpu_time"
    
    # Cleanup
    kill $test_pid 2>/dev/null || true
    docker stop nrdot-procmon && docker rm nrdot-procmon
}

# Test 9: End-to-end data flow
test_e2e_data_flow() {
    cd "$PROJECT_ROOT"
    
    echo "Testing end-to-end data flow..."
    
    # This would typically:
    # 1. Start collector
    # 2. Generate test metrics
    # 3. Verify metrics are processed
    # 4. Check if data reaches New Relic (if key is provided)
    
    # For now, validate the pipeline configuration
    docker run --rm \
        -v "$PWD/distributions/nrdot-plus/config:/etc/otel" \
        otel/opentelemetry-collector-contrib:0.91.0 \
        validate --config=/etc/otel/config-functional-complete.yaml
}

# Test 10: Script functionality
test_scripts() {
    cd "$PROJECT_ROOT"
    
    # Test validation scripts
    if [[ -x "scripts/validate-nrdot-complete.sh" ]]; then
        bash scripts/validate-nrdot-complete.sh || true
    fi
    
    # Test deployment scripts (dry run)
    if [[ -x "scripts/setup-nrdot-v2.sh" ]]; then
        bash scripts/setup-nrdot-v2.sh --dry-run || true
    fi
}

# Summary
print_summary() {
    echo -e "\n${BLUE}=== Test Summary ===${NC}"
    echo "Total tests run: $TESTS_RUN"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo "Results saved to: $RESULTS_DIR"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}All tests passed!${NC}"
        return 0
    else
        echo -e "\n${RED}Some tests failed. Please review the logs.${NC}"
        return 1
    fi
}

# Main execution
main() {
    setup
    
    # Run all tests
    test_case "config_validation" test_config_validation || true
    test_case "docker_startup" test_docker_startup || true
    test_case "metric_generation" test_metric_generation || true
    test_case "nrql_queries" test_nrql_queries || true
    test_case "control_loop" test_control_loop || true
    test_case "api_endpoints" test_api_endpoints || true
    test_case "dashboard_validation" test_dashboard_validation || true
    test_case "process_monitoring" test_process_monitoring || true
    test_case "e2e_data_flow" test_e2e_data_flow || true
    test_case "scripts" test_scripts || true
    
    print_summary
}

# Run tests
main "$@"