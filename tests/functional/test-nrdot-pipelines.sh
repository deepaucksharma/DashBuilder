#!/bin/bash
# Functional tests for NRDOT OpenTelemetry pipelines

set -euo pipefail

# Test configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/distributions/nrdot-plus/config"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
run_test() {
    local test_name="$1"
    local test_func="$2"
    
    echo -e "\n${BLUE}Testing: $test_name${NC}"
    
    if $test_func; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((TESTS_FAILED++))
    fi
}

# Test 1: Validate all pipeline processors exist
test_pipeline_processors() {
    local config_file="$CONFIG_DIR/config-functional-complete.yaml"
    
    echo "Checking pipeline processors in config..."
    
    # Required processors
    local processors=(
        "batch"
        "memory_limiter"
        "attributes/add_meta"
        "resource"
        "metricstransform/cpu_utilization"
        "metricstransform/memory_mb"
        "metricstransform/kpis"
        "metricstransform/ewma"
        "metricstransform/anomaly"
        "metricstransform/cost"
        "metricstransform/coverage"
        "metricstransform/tiers"
        "metricstransform/experiment"
        "filter/sampling"
    )
    
    local all_found=true
    for processor in "${processors[@]}"; do
        if grep -q "^  $processor:" "$config_file"; then
            echo "  ✓ Found processor: $processor"
        else
            echo "  ✗ Missing processor: $processor"
            all_found=false
        fi
    done
    
    $all_found
}

# Test 2: Validate metric transformations
test_metric_transforms() {
    local config_file="$CONFIG_DIR/config-functional-complete.yaml"
    
    echo "Checking metric transformations..."
    
    # Check CPU utilization transform
    if grep -A5 "metricstransform/cpu_utilization:" "$config_file" | \
       grep -q "process.cpu.utilization"; then
        echo "  ✓ CPU utilization transform configured"
    else
        echo "  ✗ CPU utilization transform missing"
        return 1
    fi
    
    # Check memory MB transform
    if grep -A5 "metricstransform/memory_mb:" "$config_file" | \
       grep -q "process.memory.physical_usage_mb"; then
        echo "  ✓ Memory MB transform configured"
    else
        echo "  ✗ Memory MB transform missing"
        return 1
    fi
    
    # Check KPI generation
    local kpis=(
        "nrdot_summary_total_series"
        "nrdot_coverage_percentage"
        "nrdot_cost_estimate_total"
        "nrdot_experiment_"
    )
    
    for kpi in "${kpis[@]}"; do
        if grep -q "$kpi" "$config_file"; then
            echo "  ✓ Found KPI metric: $kpi*"
        else
            echo "  ✗ Missing KPI metric: $kpi*"
            return 1
        fi
    done
    
    return 0
}

# Test 3: Validate pipeline connections
test_pipeline_flow() {
    local config_file="$CONFIG_DIR/config-functional-complete.yaml"
    
    echo "Checking pipeline flow..."
    
    # Extract pipeline definition
    local pipeline_section=$(awk '/^service:/{f=1} f' "$config_file" | \
                           awk '/pipelines:/{f=1} f')
    
    # Check metrics pipeline exists
    if echo "$pipeline_section" | grep -q "metrics:"; then
        echo "  ✓ Metrics pipeline defined"
    else
        echo "  ✗ Metrics pipeline missing"
        return 1
    fi
    
    # Check pipeline has all stages
    if echo "$pipeline_section" | grep -A20 "metrics:" | grep -q "receivers:"; then
        echo "  ✓ Pipeline has receivers"
    else
        echo "  ✗ Pipeline missing receivers"
        return 1
    fi
    
    if echo "$pipeline_section" | grep -A20 "metrics:" | grep -q "processors:"; then
        echo "  ✓ Pipeline has processors"
    else
        echo "  ✗ Pipeline missing processors"
        return 1
    fi
    
    if echo "$pipeline_section" | grep -A20 "metrics:" | grep -q "exporters:"; then
        echo "  ✓ Pipeline has exporters"
    else
        echo "  ✗ Pipeline missing exporters"
        return 1
    fi
    
    return 0
}

# Test 4: Validate EWMA configuration
test_ewma_config() {
    local config_file="$CONFIG_DIR/config-functional-complete.yaml"
    
    echo "Checking EWMA configuration..."
    
    # Check EWMA processor exists
    if ! grep -q "metricstransform/ewma:" "$config_file"; then
        echo "  ✗ EWMA processor not found"
        return 1
    fi
    
    # Check for alpha parameter (should be 0.1)
    if grep -A10 "metricstransform/ewma:" "$config_file" | \
       grep -q "math.Min(1.0, math.Max(0.0, 0.1))"; then
        echo "  ✓ EWMA alpha parameter configured"
    else
        echo "  ✗ EWMA alpha parameter missing"
        return 1
    fi
    
    # Check TTL implementation
    if grep -A20 "metricstransform/ewma:" "$config_file" | \
       grep -q "ttl_minutes"; then
        echo "  ✓ EWMA TTL configured"
    else
        echo "  ✗ EWMA TTL missing"
        return 1
    fi
    
    return 0
}

# Test 5: Validate experiment ring assignment
test_experiment_rings() {
    local config_file="$CONFIG_DIR/config-functional-complete.yaml"
    
    echo "Checking experiment ring configuration..."
    
    # Check experiment processor
    if ! grep -q "metricstransform/experiment:" "$config_file"; then
        echo "  ✗ Experiment processor not found"
        return 1
    fi
    
    # Check ring assignment logic
    if grep -A15 "metricstransform/experiment:" "$config_file" | \
       grep -q "hash.*% 4"; then
        echo "  ✓ Ring assignment using modulo 4"
    else
        echo "  ✗ Ring assignment logic missing"
        return 1
    fi
    
    # Check ring metrics generation
    local rings=("control" "treatment_1" "treatment_2" "treatment_3")
    for ring in "${rings[@]}"; do
        if grep -A20 "metricstransform/experiment:" "$config_file" | \
           grep -q "nrdot_experiment_${ring}"; then
            echo "  ✓ Found ring metric: $ring"
        else
            echo "  ✗ Missing ring metric: $ring"
            return 1
        fi
    done
    
    return 0
}

# Test 6: Validate tier classification
test_tier_classification() {
    local config_file="$CONFIG_DIR/config-functional-complete.yaml"
    
    echo "Checking tier classification..."
    
    # Check tiers processor
    if ! grep -q "metricstransform/tiers:" "$config_file"; then
        echo "  ✗ Tiers processor not found"
        return 1
    fi
    
    # Check tier thresholds
    local tiers=(
        "critical:80"
        "high:50"
        "medium:20"
        "low:5"
        "minimal:1"
    )
    
    for tier_spec in "${tiers[@]}"; do
        local tier="${tier_spec%:*}"
        local threshold="${tier_spec#*:}"
        
        if grep -A30 "metricstransform/tiers:" "$config_file" | \
           grep -q "> $threshold"; then
            echo "  ✓ Found tier threshold: $tier > $threshold%"
        else
            echo "  ✗ Missing tier threshold: $tier"
            return 1
        fi
    done
    
    return 0
}

# Test 7: Validate sampling configuration
test_sampling_config() {
    local config_file="$CONFIG_DIR/config-functional-complete.yaml"
    
    echo "Checking sampling configuration..."
    
    # Check filter/sampling processor
    if ! grep -q "filter/sampling:" "$config_file"; then
        echo "  ✗ Sampling filter not found"
        return 1
    fi
    
    # Check sampling is tier-based
    if grep -A10 "filter/sampling:" "$config_file" | \
       grep -q "process.tier"; then
        echo "  ✓ Tier-based sampling configured"
    else
        echo "  ✗ Tier-based sampling missing"
        return 1
    fi
    
    # Check optimization.yaml reference
    if grep -q "optimization.yaml" "$config_file"; then
        echo "  ✓ References optimization.yaml"
    else
        echo "  ✗ Missing optimization.yaml reference"
        return 1
    fi
    
    return 0
}

# Test 8: Validate cost calculation
test_cost_calculation() {
    local config_file="$CONFIG_DIR/config-functional-complete.yaml"
    
    echo "Checking cost calculation..."
    
    # Check cost processor
    if ! grep -q "metricstransform/cost:" "$config_file"; then
        echo "  ✗ Cost processor not found"
        return 1
    fi
    
    # Check cost formula (should be / 1000000 * 0.25)
    if grep -A10 "metricstransform/cost:" "$config_file" | \
       grep -E "1000000.*0\.25|0\.25.*1000000"; then
        echo "  ✓ Cost formula correct ($0.25 per million)"
    else
        echo "  ✗ Cost formula incorrect"
        return 1
    fi
    
    return 0
}

# Test 9: Validate exporter configuration
test_exporter_config() {
    local config_file="$CONFIG_DIR/config-functional-complete.yaml"
    
    echo "Checking exporter configuration..."
    
    # Check OTLP exporter
    if grep -q "otlp/newrelic:" "$config_file"; then
        echo "  ✓ New Relic OTLP exporter configured"
    else
        echo "  ✗ New Relic OTLP exporter missing"
        return 1
    fi
    
    # Check endpoint
    if grep -A5 "otlp/newrelic:" "$config_file" | \
       grep -q "otlp.nr-data.net"; then
        echo "  ✓ Correct New Relic endpoint"
    else
        echo "  ✗ Incorrect endpoint"
        return 1
    fi
    
    # Check headers configuration
    if grep -A10 "otlp/newrelic:" "$config_file" | \
       grep -q "Api-Key:.*NEW_RELIC_LICENSE_KEY"; then
        echo "  ✓ License key header configured"
    else
        echo "  ✗ License key header missing"
        return 1
    fi
    
    return 0
}

# Test 10: Validate complete pipeline
test_complete_pipeline() {
    echo "Validating complete pipeline with otel collector..."
    
    # Use Docker to validate the complete config
    if command -v docker &> /dev/null; then
        if docker run --rm \
            -v "$CONFIG_DIR:/etc/otel" \
            -e NEW_RELIC_LICENSE_KEY="dummy" \
            otel/opentelemetry-collector-contrib:0.91.0 \
            validate --config=/etc/otel/config-functional-complete.yaml \
            2>&1 | grep -q "Config validation succeeded"; then
            echo "  ✓ Configuration is valid"
            return 0
        else
            echo "  ✗ Configuration validation failed"
            return 1
        fi
    else
        echo "  ⚠ Docker not available, skipping validation"
        return 0
    fi
}

# Main test execution
main() {
    echo -e "${BLUE}NRDOT v2 Pipeline Functional Tests${NC}"
    echo "===================================="
    
    # Run all tests
    run_test "Pipeline Processors" test_pipeline_processors
    run_test "Metric Transformations" test_metric_transforms
    run_test "Pipeline Flow" test_pipeline_flow
    run_test "EWMA Configuration" test_ewma_config
    run_test "Experiment Rings" test_experiment_rings
    run_test "Tier Classification" test_tier_classification
    run_test "Sampling Configuration" test_sampling_config
    run_test "Cost Calculation" test_cost_calculation
    run_test "Exporter Configuration" test_exporter_config
    run_test "Complete Pipeline Validation" test_complete_pipeline
    
    # Summary
    echo -e "\n===================================="
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}Some tests failed!${NC}"
        return 1
    fi
}

# Run tests
main "$@"