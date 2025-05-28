#!/bin/bash
# OpenTelemetry Configuration Validation Script
# Tests the fixed configuration for syntax and functional issues

set -euo pipefail

# Configuration
CONFIG_DIR="distributions/nrdot-plus/config"
CONFIG_FILE="$CONFIG_DIR/config.yaml"
TEST_LICENSE_KEY="test-key-12345678901234567890123456789012345678"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
run_test() {
    local test_name="$1"
    local test_func="$2"
    
    echo -e "\n${BLUE}Testing: $test_name${NC}"
    ((TESTS_RUN++))
    
    if $test_func; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 1: YAML syntax validation
test_yaml_syntax() {
    echo "Checking YAML syntax..."
    
    # Basic YAML validation
    if command -v yq &> /dev/null; then
        yq eval '.' "$CONFIG_FILE" > /dev/null
    elif command -v python3 &> /dev/null; then
        python3 -c "import yaml; yaml.safe_load(open('$CONFIG_FILE'))"
    else
        echo "Warning: No YAML validator found, skipping syntax check"
        return 0
    fi
}

# Test 2: OpenTelemetry configuration validation
test_otel_validation() {
    echo "Validating OpenTelemetry configuration..."
    
    if ! command -v docker &> /dev/null; then
        echo "Docker not found, skipping OTel validation"
        return 0
    fi
    
    # Create temporary config with test license key
    local temp_config=$(mktemp)
    sed "s/\${env:NEW_RELIC_LICENSE_KEY}/$TEST_LICENSE_KEY/g" "$CONFIG_FILE" > "$temp_config"
    
    # Validate using official OTel collector
    if docker run --rm \
        -v "$temp_config:/tmp/config.yaml" \
        -e NEW_RELIC_LICENSE_KEY="$TEST_LICENSE_KEY" \
        otel/opentelemetry-collector-contrib:0.91.0 \
        validate --config=/tmp/config.yaml 2>&1 | grep -q "Config validation succeeded"; then
        echo "Configuration is valid"
        rm -f "$temp_config"
        return 0
    else
        echo "Configuration validation failed"
        rm -f "$temp_config"
        return 1
    fi
}

# Test 3: Required sections present
test_required_sections() {
    echo "Checking required configuration sections..."
    
    local required_sections=(
        "receivers"
        "processors"
        "exporters"
        "service"
        "service.pipelines"
        "service.pipelines.metrics"
    )
    
    for section in "${required_sections[@]}"; do
        if ! grep -q "^${section//./\\.}:" "$CONFIG_FILE"; then
            echo "Missing required section: $section"
            return 1
        fi
    done
    
    echo "All required sections present"
    return 0
}

# Test 4: Processor ordering
test_processor_ordering() {
    echo "Checking processor ordering..."
    
    # Extract processor order from pipeline
    local processors=$(grep -A20 "processors:" "$CONFIG_FILE" | 
                      grep "^        -" | 
                      head -10 | 
                      awk '{print $2}')
    
    # First processor should be memory_limiter
    local first_processor=$(echo "$processors" | head -1)
    if [[ "$first_processor" != "memory_limiter" ]]; then
        echo "First processor should be memory_limiter, got: $first_processor"
        return 1
    fi
    
    # Last processor should be batch
    local last_processor=$(echo "$processors" | tail -1)
    if [[ "$last_processor" != "batch" ]]; then
        echo "Last processor should be batch, got: $last_processor"
        return 1
    fi
    
    echo "Processor ordering is correct"
    return 0
}

# Test 5: Environment variable validation
test_env_variables() {
    echo "Checking environment variable usage..."
    
    # Find all environment variables used
    local env_vars=$(grep -o '\${env:[^}]*}' "$CONFIG_FILE" | sort -u)
    
    echo "Environment variables found:"
    echo "$env_vars"
    
    # Check for required variables
    if ! echo "$env_vars" | grep -q "NEW_RELIC_LICENSE_KEY"; then
        echo "Missing required environment variable: NEW_RELIC_LICENSE_KEY"
        return 1
    fi
    
    echo "Environment variables look good"
    return 0
}

# Test 6: Exporter configuration
test_exporter_config() {
    echo "Checking exporter configuration..."
    
    # Check New Relic exporter
    if ! grep -q "otlphttp/newrelic:" "$CONFIG_FILE"; then
        echo "Missing New Relic OTLP exporter"
        return 1
    fi
    
    # Check endpoint
    if ! grep -A10 "otlphttp/newrelic:" "$CONFIG_FILE" | grep -q "otlp.nr-data.net"; then
        echo "Incorrect New Relic endpoint"
        return 1
    fi
    
    # Check headers
    if ! grep -A10 "otlphttp/newrelic:" "$CONFIG_FILE" | grep -q "api-key:"; then
        echo "Missing API key header"
        return 1
    fi
    
    echo "Exporter configuration is correct"
    return 0
}

# Test 7: Metric generation
test_metric_generation() {
    echo "Checking metric generation configuration..."
    
    # Check for KPI metrics
    local kpi_metrics=(
        "nrdot_summary_total_processes"
        "nrdot_summary_total_series"
        "nrdot_cost_estimate_total"
        "nrdot_coverage_percentage"
    )
    
    for metric in "${kpi_metrics[@]}"; do
        if ! grep -q "$metric" "$CONFIG_FILE"; then
            echo "Missing KPI metric: $metric"
            return 1
        fi
    done
    
    echo "All KPI metrics are configured"
    return 0
}

# Test 8: Process classification
test_process_classification() {
    echo "Checking process classification..."
    
    # Check for tier classification
    if ! grep -q "process.tier" "$CONFIG_FILE"; then
        echo "Missing process tier classification"
        return 1
    fi
    
    # Check for importance scoring
    if ! grep -q "process.importance" "$CONFIG_FILE"; then
        echo "Missing process importance scoring"
        return 1
    fi
    
    echo "Process classification is configured"
    return 0
}

# Test 9: Docker compatibility
test_docker_compatibility() {
    echo "Checking Docker compatibility..."
    
    # Check for host path references
    if ! grep -q "HOST_PROC" "$CONFIG_FILE"; then
        echo "Missing HOST_PROC environment variable reference"
        return 1
    fi
    
    # Check for health check endpoint
    if ! grep -q "health_check:" "$CONFIG_FILE"; then
        echo "Missing health check configuration"
        return 1
    fi
    
    echo "Docker compatibility looks good"
    return 0
}

# Test 10: Complete pipeline test
test_complete_pipeline() {
    echo "Testing complete pipeline..."
    
    # Check that pipeline includes all necessary components
    local pipeline_section=$(grep -A20 "metrics/main:" "$CONFIG_FILE")
    
    if ! echo "$pipeline_section" | grep -q "receivers:.*hostmetrics"; then
        echo "Pipeline missing hostmetrics receiver"
        return 1
    fi
    
    if ! echo "$pipeline_section" | grep -q "exporters:.*newrelic"; then
        echo "Pipeline missing New Relic exporter"
        return 1
    fi
    
    echo "Complete pipeline test passed"
    return 0
}

# Summary function
print_summary() {
    echo -e "\n${BLUE}=== Test Summary ===${NC}"
    echo "Total tests: $TESTS_RUN"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}✓ All tests passed! Configuration is ready for deployment.${NC}"
        return 0
    else
        echo -e "\n${RED}✗ Some tests failed. Please fix the issues before deployment.${NC}"
        return 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}OpenTelemetry Configuration Validation${NC}"
    echo "===================================="
    echo "Config file: $CONFIG_FILE"
    
    # Check if config file exists
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo -e "${RED}Configuration file not found: $CONFIG_FILE${NC}"
        exit 1
    fi
    
    # Run all tests
    run_test "YAML Syntax" test_yaml_syntax
    run_test "OpenTelemetry Validation" test_otel_validation
    run_test "Required Sections" test_required_sections
    run_test "Processor Ordering" test_processor_ordering
    run_test "Environment Variables" test_env_variables
    run_test "Exporter Configuration" test_exporter_config
    run_test "Metric Generation" test_metric_generation
    run_test "Process Classification" test_process_classification
    run_test "Docker Compatibility" test_docker_compatibility
    run_test "Complete Pipeline" test_complete_pipeline
    
    # Print summary and exit with appropriate code
    print_summary
}

# Run main function
main "$@"