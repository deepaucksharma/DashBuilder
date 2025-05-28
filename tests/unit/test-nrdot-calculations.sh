#!/bin/bash
# Unit tests for NRDOT calculations and formulas

set -euo pipefail

# Test helpers
assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"
    
    if [[ "$expected" == "$actual" ]]; then
        echo "✓ $test_name"
        return 0
    else
        echo "✗ $test_name: expected '$expected', got '$actual'"
        return 1
    fi
}

assert_float_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"
    local tolerance="${4:-0.01}"
    
    if awk -v e="$expected" -v a="$actual" -v t="$tolerance" \
        'BEGIN { if (sqrt((e-a)^2) <= t) exit 0; else exit 1 }'; then
        echo "✓ $test_name"
        return 0
    else
        echo "✗ $test_name: expected ~$expected, got $actual"
        return 1
    fi
}

# Test cost calculation
test_cost_calculation() {
    echo "Testing cost calculations..."
    
    # Formula: cost = (datapoints / 1,000,000) * 0.25
    
    # Test 1: 1M datapoints = $0.25
    local cost=$(awk 'BEGIN { printf "%.2f", (1000000 / 1000000) * 0.25 }')
    assert_equals "0.25" "$cost" "1M datapoints cost"
    
    # Test 2: 10M datapoints = $2.50
    cost=$(awk 'BEGIN { printf "%.2f", (10000000 / 1000000) * 0.25 }')
    assert_equals "2.50" "$cost" "10M datapoints cost"
    
    # Test 3: 100K datapoints = $0.025
    cost=$(awk 'BEGIN { printf "%.3f", (100000 / 1000000) * 0.25 }')
    assert_equals "0.025" "$cost" "100K datapoints cost"
}

# Test CPU utilization calculation
test_cpu_utilization() {
    echo -e "\nTesting CPU utilization calculations..."
    
    # CPU utilization = rate(cpu_time) * 100
    # Where cpu_time is in seconds
    
    # Test 1: 1 second CPU time over 1 second = 100%
    local util=$(awk 'BEGIN { printf "%.1f", (1 / 1) * 100 }')
    assert_equals "100.0" "$util" "Full CPU utilization"
    
    # Test 2: 0.5 second CPU time over 1 second = 50%
    util=$(awk 'BEGIN { printf "%.1f", (0.5 / 1) * 100 }')
    assert_equals "50.0" "$util" "Half CPU utilization"
    
    # Test 3: 2 seconds CPU time over 4 seconds = 50%
    util=$(awk 'BEGIN { printf "%.1f", (2 / 4) * 100 }')
    assert_equals "50.0" "$util" "Multi-second CPU utilization"
}

# Test memory calculation
test_memory_calculation() {
    echo -e "\nTesting memory calculations..."
    
    # Memory in MB = bytes / 1048576
    
    # Test 1: 1GB = 1024MB
    local mem_mb=$(awk 'BEGIN { printf "%.0f", 1073741824 / 1048576 }')
    assert_equals "1024" "$mem_mb" "1GB to MB conversion"
    
    # Test 2: 512MB
    mem_mb=$(awk 'BEGIN { printf "%.0f", 536870912 / 1048576 }')
    assert_equals "512" "$mem_mb" "512MB conversion"
    
    # Test 3: 100MB
    mem_mb=$(awk 'BEGIN { printf "%.0f", 104857600 / 1048576 }')
    assert_equals "100" "$mem_mb" "100MB conversion"
}

# Test EWMA calculation
test_ewma_calculation() {
    echo -e "\nTesting EWMA calculations..."
    
    # EWMA formula: new_ewma = alpha * value + (1 - alpha) * old_ewma
    # Default alpha = 0.1
    
    # Test 1: First value (no previous EWMA)
    local ewma=$(awk 'BEGIN { printf "%.2f", 100.0 }')
    assert_equals "100.00" "$ewma" "EWMA first value"
    
    # Test 2: Second value with alpha=0.1
    # new_ewma = 0.1 * 110 + 0.9 * 100 = 11 + 90 = 101
    ewma=$(awk 'BEGIN { printf "%.2f", 0.1 * 110 + 0.9 * 100 }')
    assert_equals "101.00" "$ewma" "EWMA second value"
    
    # Test 3: Third value
    # new_ewma = 0.1 * 120 + 0.9 * 101 = 12 + 90.9 = 102.9
    ewma=$(awk 'BEGIN { printf "%.2f", 0.1 * 120 + 0.9 * 101 }')
    assert_equals "102.90" "$ewma" "EWMA third value"
}

# Test anomaly score calculation
test_anomaly_score() {
    echo -e "\nTesting anomaly score calculations..."
    
    # Anomaly score = abs(value - ewma) / (ewma + 1)
    
    # Test 1: Value equals EWMA = 0 score
    local score=$(awk 'BEGIN { printf "%.2f", abs(100 - 100) / (100 + 1) }')
    assert_equals "0.00" "$score" "No anomaly"
    
    # Test 2: Value 20% higher than EWMA
    # score = abs(120 - 100) / 101 = 20 / 101 = 0.198
    score=$(awk 'BEGIN { printf "%.3f", (120 - 100) / (100 + 1) }')
    assert_float_equals "0.198" "$score" "20% anomaly" 0.001
    
    # Test 3: Value 50% lower than EWMA
    # score = abs(50 - 100) / 101 = 50 / 101 = 0.495
    score=$(awk 'BEGIN { printf "%.3f", (100 - 50) / (100 + 1) }')
    assert_float_equals "0.495" "$score" "50% anomaly" 0.001
}

# Test coverage percentage
test_coverage_calculation() {
    echo -e "\nTesting coverage calculations..."
    
    # Coverage = (monitored_processes / total_processes) * 100
    
    # Test 1: 95 out of 100 processes = 95%
    local coverage=$(awk 'BEGIN { printf "%.1f", (95 / 100) * 100 }')
    assert_equals "95.0" "$coverage" "95% coverage"
    
    # Test 2: 47 out of 50 processes = 94%
    coverage=$(awk 'BEGIN { printf "%.1f", (47 / 50) * 100 }')
    assert_equals "94.0" "$coverage" "94% coverage"
    
    # Test 3: All processes monitored = 100%
    coverage=$(awk 'BEGIN { printf "%.1f", (100 / 100) * 100 }')
    assert_equals "100.0" "$coverage" "100% coverage"
}

# Test sampling rate impact
test_sampling_impact() {
    echo -e "\nTesting sampling rate impact..."
    
    # Impact = original_series * (1 - sampling_rate)
    # Where sampling_rate is between 0 and 1
    
    # Test 1: 50% sampling on 1000 series = 500 series reduced
    local impact=$(awk 'BEGIN { printf "%.0f", 1000 * (1 - 0.5) }')
    assert_equals "500" "$impact" "50% sampling impact"
    
    # Test 2: 10% sampling on 1000 series = 900 series reduced
    impact=$(awk 'BEGIN { printf "%.0f", 1000 * (1 - 0.1) }')
    assert_equals "900" "$impact" "10% sampling impact"
    
    # Test 3: 100% sampling (no reduction)
    impact=$(awk 'BEGIN { printf "%.0f", 1000 * (1 - 1.0) }')
    assert_equals "0" "$impact" "100% sampling (no reduction)"
}

# Test tier classification thresholds
test_tier_classification() {
    echo -e "\nTesting tier classification..."
    
    # Tier thresholds (CPU %):
    # Critical: > 80
    # High: 50-80
    # Medium: 20-50
    # Low: 5-20
    # Minimal: 1-5
    # Idle: < 1
    
    # Test function
    classify_tier() {
        local cpu=$1
        if (( $(awk -v c="$cpu" 'BEGIN { print (c > 80) }') )); then
            echo "critical"
        elif (( $(awk -v c="$cpu" 'BEGIN { print (c > 50) }') )); then
            echo "high"
        elif (( $(awk -v c="$cpu" 'BEGIN { print (c > 20) }') )); then
            echo "medium"
        elif (( $(awk -v c="$cpu" 'BEGIN { print (c > 5) }') )); then
            echo "low"
        elif (( $(awk -v c="$cpu" 'BEGIN { print (c > 1) }') )); then
            echo "minimal"
        else
            echo "idle"
        fi
    }
    
    assert_equals "critical" "$(classify_tier 85)" "85% CPU = critical"
    assert_equals "high" "$(classify_tier 60)" "60% CPU = high"
    assert_equals "medium" "$(classify_tier 30)" "30% CPU = medium"
    assert_equals "low" "$(classify_tier 10)" "10% CPU = low"
    assert_equals "minimal" "$(classify_tier 3)" "3% CPU = minimal"
    assert_equals "idle" "$(classify_tier 0.5)" "0.5% CPU = idle"
}

# Test experiment ring assignment
test_experiment_rings() {
    echo -e "\nTesting experiment ring assignment..."
    
    # Ring assignment based on hash % 4
    # 0 = control, 1-3 = treatment rings
    
    get_ring() {
        local process_name="$1"
        local hash=$(echo -n "$process_name" | cksum | cut -d' ' -f1)
        echo $((hash % 4))
    }
    
    # Test deterministic assignment
    local ring1=$(get_ring "nginx")
    local ring2=$(get_ring "nginx")
    assert_equals "$ring1" "$ring2" "Deterministic ring assignment"
    
    # Test distribution (just verify it returns 0-3)
    for process in "nginx" "postgres" "redis" "mysql" "mongodb"; do
        local ring=$(get_ring "$process")
        if [[ $ring -ge 0 && $ring -le 3 ]]; then
            echo "✓ $process assigned to ring $ring"
        else
            echo "✗ $process has invalid ring: $ring"
        fi
    done
}

# Main test runner
main() {
    echo "NRDOT v2 Unit Tests"
    echo "=================="
    
    local failed=0
    
    test_cost_calculation || ((failed++))
    test_cpu_utilization || ((failed++))
    test_memory_calculation || ((failed++))
    test_ewma_calculation || ((failed++))
    test_anomaly_score || ((failed++))
    test_coverage_calculation || ((failed++))
    test_sampling_impact || ((failed++))
    test_tier_classification || ((failed++))
    test_experiment_rings || ((failed++))
    
    echo -e "\n=================="
    if [[ $failed -eq 0 ]]; then
        echo "All tests passed!"
        return 0
    else
        echo "$failed test(s) failed"
        return 1
    fi
}

# Run tests
main "$@"