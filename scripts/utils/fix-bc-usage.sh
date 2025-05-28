#!/bin/bash
# Script to replace bc usage with awk in shell scripts

echo "Replacing bc usage with awk in day1-validation.sh..."

# Create the fixed version
cat > /tmp/day1-validation-fixed.sh << 'EOF'
#!/bin/bash
# Day 1 Validation Script for NRDOT v2
# Runs comprehensive checks to ensure NRDOT is functioning correctly

set -euo pipefail

# Configuration
readonly NRDOT_HOME="${NRDOT_HOME:-/opt/nrdot}"
readonly CONFIG_DIR="/etc/nrdot-collector-host"
readonly SERVICE_NAME="nrdot-collector-host"
readonly CONTROL_LOOP_SERVICE="nrdot-control-loop"
readonly METRICS_ENDPOINT="http://localhost:8888/metrics"
readonly NR_ENDPOINT="${NEW_RELIC_API_ENDPOINT:-https://api.newrelic.com/graphql}"

# Validation thresholds
readonly MIN_SERIES_EXPECTED=100
readonly MAX_SERIES_EXPECTED=10000
readonly MIN_ACCEPTANCE_RATIO=0.95
readonly MAX_CPU_PERCENT=50
readonly MAX_MEMORY_MB=500
readonly MIN_COVERAGE_CRITICAL=0.90

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Helper functions
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_status() {
    local status=$1
    local check=$2
    local details=$3
    
    case $status in
        PASS)
            echo -e "${GREEN}[✓]${NC} $check: $details"
            ;;
        FAIL)
            echo -e "${RED}[✗]${NC} $check: $details"
            return 1
            ;;
        WARN)
            echo -e "${YELLOW}[!]${NC} $check: $details"
            ;;
        INFO)
            echo -e "${BLUE}[i]${NC} $check: $details"
            ;;
    esac
}

# Fixed validation functions using awk instead of bc
validate_metrics_acceptance() {
    print_header "Metrics Acceptance Rate"
    
    local accepted=$(curl -s "$METRICS_ENDPOINT" | grep -E '^otelcol_receiver_accepted_metric_points' | awk '{print $2}')
    local refused=$(curl -s "$METRICS_ENDPOINT" | grep -E '^otelcol_receiver_refused_metric_points' | awk '{print $2}')
    
    if [[ -n "$accepted" ]] && [[ -n "$refused" ]]; then
        local total=$(awk "BEGIN {print $accepted + $refused}")
        if (( $(awk "BEGIN {print ($total > 0)}") )); then
            local ratio=$(awk "BEGIN {print $accepted / $total}")
            if (( $(awk "BEGIN {print ($ratio >= $MIN_ACCEPTANCE_RATIO)}") )); then
                print_status "PASS" "Metric acceptance ratio" "$(awk "BEGIN {printf \"%.2f%%\", $ratio * 100}") (threshold: $(awk "BEGIN {printf \"%.0f%%\", $MIN_ACCEPTANCE_RATIO * 100}"))"
            else
                print_status "FAIL" "Metric acceptance ratio too low" "$(awk "BEGIN {printf \"%.2f%%\", $ratio * 100}") (threshold: $(awk "BEGIN {printf \"%.0f%%\", $MIN_ACCEPTANCE_RATIO * 100}"))"
            fi
        fi
    else
        print_status "WARN" "Cannot calculate acceptance ratio" "Missing metrics"
    fi
}

validate_resource_usage() {
    print_header "Resource Usage"
    
    local cpu_usage=$(ps aux | grep -E "otelcol|nrdot" | grep -v grep | awk '{sum+=$3} END {print sum}')
    if [[ -n "$cpu_usage" ]]; then
        if (( $(awk "BEGIN {print ($cpu_usage < $MAX_CPU_PERCENT)}") )); then
            print_status "PASS" "CPU usage" "${cpu_usage}% (threshold: ${MAX_CPU_PERCENT}%)"
        else
            print_status "FAIL" "High CPU usage" "${cpu_usage}% (threshold: ${MAX_CPU_PERCENT}%)"
        fi
    fi
    
    local memory_mb=$(ps aux | grep -E "otelcol|nrdot" | grep -v grep | awk '{sum+=$6} END {print sum/1024}')
    if [[ -n "$memory_mb" ]]; then
        if (( $(awk "BEGIN {print ($memory_mb < $MAX_MEMORY_MB)}") )); then
            print_status "PASS" "Memory usage" "$(printf "%.0f" "$memory_mb")MB (threshold: ${MAX_MEMORY_MB}MB)"
        else
            print_status "FAIL" "High memory usage" "$(printf "%.0f" "$memory_mb")MB (threshold: ${MAX_MEMORY_MB}MB)"
        fi
    fi
}

validate_queue_status() {
    print_header "Queue Status"
    
    local queue_size=$(curl -s "$METRICS_ENDPOINT" | grep -E '^otelcol_exporter_queue_size' | awk '{print $2}')
    local queue_capacity=$(curl -s "$METRICS_ENDPOINT" | grep -E '^otelcol_exporter_queue_capacity' | awk '{print $2}')
    
    if [[ -n "$queue_size" ]] && [[ -n "$queue_capacity" ]] && [[ "$queue_capacity" -gt 0 ]]; then
        local queue_usage=$(awk "BEGIN {printf \"%.2f\", ($queue_size / $queue_capacity) * 100}")
        if (( $(awk "BEGIN {print ($queue_usage < 80)}") )); then
            print_status "PASS" "Queue usage" "${queue_usage}%"
        else
            print_status "WARN" "High queue usage" "${queue_usage}%"
        fi
    fi
}

validate_process_filtering() {
    print_header "Process Filtering"
    
    local total_series=$(curl -s "$METRICS_ENDPOINT" | grep -E '^nrdot_process_series_total' | awk '{print $2}')
    local kept_series=$(curl -s "$METRICS_ENDPOINT" | grep -E '^nrdot_process_series_kept' | awk '{print $2}')
    
    if [[ -n "$total_series" ]] && [[ -n "$kept_series" ]] && [[ "$total_series" -gt 0 ]]; then
        local reduction=$(awk "BEGIN {printf \"%.2f\", (($total_series - $kept_series) / $total_series) * 100}")
        if (( $(awk "BEGIN {print ($reduction >= 70 && $reduction <= 85)}") )); then
            print_status "PASS" "Process filtering" "Reduced by ${reduction}%"
        else
            print_status "WARN" "Process filtering out of range" "Reduced by ${reduction}%"
        fi
    fi
}

validate_critical_coverage() {
    print_header "Critical Process Coverage"
    
    local coverage=$(curl -s "$METRICS_ENDPOINT" | grep -E '^nrdot_critical_process_coverage' | awk '{print $2}')
    
    if [[ -n "$coverage" ]]; then
        if (( $(awk "BEGIN {print ($coverage >= $MIN_COVERAGE_CRITICAL)}") )); then
            print_status "PASS" "Critical process coverage" "$(awk "BEGIN {printf \"%.1f%%\", $coverage * 100}")"
        else
            print_status "FAIL" "Low critical process coverage" "$(awk "BEGIN {printf \"%.1f%%\", $coverage * 100}")"
        fi
    fi
}

# Run all validations
main() {
    echo "NRDOT v2 Day 1 Validation"
    echo "========================="
    date
    
    validate_metrics_acceptance
    validate_resource_usage
    validate_queue_status
    validate_process_filtering
    validate_critical_coverage
    
    echo -e "\n${GREEN}Validation complete!${NC}"
}

main "$@"
EOF

# Copy the fixed version back
cp /tmp/day1-validation-fixed.sh /Users/deepaksharma/DashBuilder/distributions/nrdot-plus/scripts/day1-validation.sh
chmod +x /Users/deepaksharma/DashBuilder/distributions/nrdot-plus/scripts/day1-validation.sh

echo "Fixed day1-validation.sh - replaced all bc usage with awk"