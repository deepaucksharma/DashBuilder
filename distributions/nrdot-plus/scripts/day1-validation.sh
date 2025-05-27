#!/bin/bash
# NRDOT-Plus Day 1 Validation Script
# Performs comprehensive health checks and validation for first 24h in production

set -euo pipefail

# Configuration
readonly SCRIPT_NAME="day1-validation"
readonly NR_ACCOUNT_ID="${NR_ACCOUNT_ID}"
readonly NR_API_KEY="${NR_API_KEY}"
readonly LOG_FILE="/var/log/nrdot-plus/day1-validation.log"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Validation thresholds
readonly MIN_ACCEPTANCE_RATIO=0.95
readonly MAX_CPU_PERCENT=2.0
readonly MIN_COVERAGE_CRITICAL=0.95
readonly MAX_PROFILE_CHANGES_PER_DAY=3
readonly MAX_FALSE_POSITIVE_RATE=0.15

# Logging function
log() {
    local level="$1"
    shift
    echo "$(date -Iseconds) [$level] $*" | tee -a "$LOG_FILE"
}

# Print colored status
print_status() {
    local status="$1"
    local message="$2"
    local details="${3:-}"
    
    case "$status" in
        PASS)
            echo -e "${GREEN}✓ PASS${NC} - ${message}"
            ;;
        FAIL)
            echo -e "${RED}✗ FAIL${NC} - ${message}"
            ;;
        WARN)
            echo -e "${YELLOW}⚠ WARN${NC} - ${message}"
            ;;
    esac
    
    if [[ -n "$details" ]]; then
        echo "         $details"
    fi
}

# Query New Relic
query_nrql() {
    local query="$1"
    
    curl -s -X POST "https://api.newrelic.com/graphql" \
        -H "Api-Key: ${NR_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{
            \"query\": \"{ actor { account(id: ${NR_ACCOUNT_ID}) { nrql(query: \\\"${query}\\\") { results } } } }\"
        }" | jq -r '.data.actor.account.nrql.results[0] // empty'
}

# Validation checks
check_collector_health() {
    echo -e "\n${GREEN}=== Collector Health Checks ===${NC}"
    
    # Check acceptance ratio
    local accepted=$(query_nrql "SELECT sum(otelcol_receiver_accepted_metric_points) FROM Metric WHERE service.name = 'nrdot-collector' SINCE 1 hour ago")
    local refused=$(query_nrql "SELECT sum(otelcol_receiver_refused_metric_points) FROM Metric WHERE service.name = 'nrdot-collector' SINCE 1 hour ago")
    
    if [[ -n "$accepted" && -n "$refused" ]]; then
        local total=$((accepted + refused))
        if [[ $total -gt 0 ]]; then
            local ratio=$(echo "scale=4; $accepted / $total" | bc)
            if (( $(echo "$ratio >= $MIN_ACCEPTANCE_RATIO" | bc -l) )); then
                print_status "PASS" "Metric acceptance ratio" "$(echo "scale=2; $ratio * 100" | bc)% (threshold: $(echo "scale=0; $MIN_ACCEPTANCE_RATIO * 100" | bc)%)"
            else
                print_status "FAIL" "Metric acceptance ratio too low" "$(echo "scale=2; $ratio * 100" | bc)% (threshold: $(echo "scale=0; $MIN_ACCEPTANCE_RATIO * 100" | bc)%)"
            fi
        fi
    else
        print_status "WARN" "No collector metrics found"
    fi
    
    # Check CPU usage
    local cpu_usage=$(query_nrql "SELECT average(system.cpu.utilization) FROM Metric WHERE process.executable.name = 'otelcol' SINCE 1 hour ago")
    if [[ -n "$cpu_usage" ]]; then
        if (( $(echo "$cpu_usage < $MAX_CPU_PERCENT" | bc -l) )); then
            print_status "PASS" "Collector CPU usage" "${cpu_usage}% (threshold: ${MAX_CPU_PERCENT}%)"
        else
            print_status "FAIL" "Collector CPU usage too high" "${cpu_usage}% (threshold: ${MAX_CPU_PERCENT}%)"
        fi
    fi
    
    # Check for dropped metrics
    local dropped=$(query_nrql "SELECT sum(otelcol_processor_dropped_metric_points) FROM Metric WHERE service.name = 'nrdot-collector' SINCE 1 hour ago")
    if [[ "$dropped" == "0" || -z "$dropped" ]]; then
        print_status "PASS" "No metrics dropped"
    else
        print_status "WARN" "Metrics dropped" "${dropped} metrics"
    fi
    
    # Check queue usage
    local queue_size=$(query_nrql "SELECT average(otelcol_exporter_queue_size) FROM Metric WHERE service.name = 'nrdot-collector' SINCE 1 hour ago")
    local queue_capacity=$(query_nrql "SELECT average(otelcol_exporter_queue_capacity) FROM Metric WHERE service.name = 'nrdot-collector' SINCE 1 hour ago")
    if [[ -n "$queue_size" && -n "$queue_capacity" ]]; then
        local queue_usage=$(echo "scale=2; ($queue_size / $queue_capacity) * 100" | bc)
        if (( $(echo "$queue_usage < 80" | bc -l) )); then
            print_status "PASS" "Export queue usage" "${queue_usage}%"
        else
            print_status "WARN" "Export queue usage high" "${queue_usage}%"
        fi
    fi
}

check_kpi_metrics() {
    echo -e "\n${GREEN}=== KPI Metrics Validation ===${NC}"
    
    # Series reduction
    local total_series=$(query_nrql "SELECT latest(nrdot.process.series.total) FROM Metric SINCE 1 hour ago")
    local kept_series=$(query_nrql "SELECT latest(nrdot.process.series.kept) FROM Metric SINCE 1 hour ago")
    
    if [[ -n "$total_series" && -n "$kept_series" && "$total_series" != "0" ]]; then
        local reduction=$(echo "scale=2; (($total_series - $kept_series) / $total_series) * 100" | bc)
        if (( $(echo "$reduction >= 70 && $reduction <= 85" | bc -l) )); then
            print_status "PASS" "Series reduction rate" "${reduction}% (expected: 70-85%)"
        else
            print_status "WARN" "Series reduction rate out of range" "${reduction}% (expected: 70-85%)"
        fi
    fi
    
    # Coverage check
    local coverage=$(query_nrql "SELECT average(nrdot.coverage.critical) FROM Metric SINCE 1 hour ago")
    if [[ -n "$coverage" ]]; then
        if (( $(echo "$coverage >= $MIN_COVERAGE_CRITICAL" | bc -l) )); then
            print_status "PASS" "Critical process coverage" "${coverage}%"
        else
            print_status "FAIL" "Critical process coverage too low" "${coverage}% (minimum: ${MIN_COVERAGE_CRITICAL}%)"
        fi
    fi
    
    # Profile changes
    local profile_changes=$(query_nrql "SELECT count(*) FROM Log WHERE message LIKE '%Profile change%' SINCE 24 hours ago")
    if [[ "$profile_changes" -le "$MAX_PROFILE_CHANGES_PER_DAY" ]]; then
        print_status "PASS" "Profile stability" "${profile_changes} changes in 24h"
    else
        print_status "WARN" "Too many profile changes" "${profile_changes} changes in 24h (max: ${MAX_PROFILE_CHANGES_PER_DAY})"
    fi
}

check_ewma_experiment() {
    echo -e "\n${GREEN}=== EWMA Experiment Validation ===${NC}"
    
    # Check treatment vs control
    local treatment_anomalies=$(query_nrql "SELECT count(*) FROM Metric WHERE experiment.group = 'treatment' AND process.is_anomaly = true SINCE 1 hour ago")
    local control_anomalies=$(query_nrql "SELECT count(*) FROM Metric WHERE experiment.group = 'control' AND process.is_anomaly = true SINCE 1 hour ago")
    
    if [[ -n "$treatment_anomalies" && -n "$control_anomalies" ]]; then
        print_status "PASS" "EWMA experiment running" "Treatment: ${treatment_anomalies} anomalies, Control: ${control_anomalies} anomalies"
    else
        print_status "WARN" "EWMA experiment data not found"
    fi
    
    # False positive check
    local total_anomalies=$(query_nrql "SELECT count(*) FROM Metric WHERE process.is_anomaly = true SINCE 1 hour ago")
    local confirmed_issues=$(query_nrql "SELECT count(*) FROM Alert WHERE condition_name LIKE '%process%' SINCE 1 hour ago")
    
    if [[ -n "$total_anomalies" && "$total_anomalies" != "0" ]]; then
        local false_positive_rate=$(echo "scale=2; ($total_anomalies - $confirmed_issues) / $total_anomalies" | bc)
        if (( $(echo "$false_positive_rate < $MAX_FALSE_POSITIVE_RATE" | bc -l) )); then
            print_status "PASS" "False positive rate" "$(echo "scale=2; $false_positive_rate * 100" | bc)%"
        else
            print_status "WARN" "High false positive rate" "$(echo "scale=2; $false_positive_rate * 100" | bc)%"
        fi
    fi
}

check_cost_tracking() {
    echo -e "\n${GREEN}=== Cost Tracking Validation ===${NC}"
    
    # Check cost by profile
    local aggressive_cost=$(query_nrql "SELECT sum(nrdot.estimated.cost) FROM Metric WHERE nrdot.profile = 'aggressive' SINCE 1 hour ago")
    local balanced_cost=$(query_nrql "SELECT sum(nrdot.estimated.cost) FROM Metric WHERE nrdot.profile = 'balanced' SINCE 1 hour ago")
    local conservative_cost=$(query_nrql "SELECT sum(nrdot.estimated.cost) FROM Metric WHERE nrdot.profile = 'conservative' SINCE 1 hour ago")
    
    echo "Cost by profile (hourly):"
    [[ -n "$aggressive_cost" ]] && echo "  Aggressive: \$${aggressive_cost}"
    [[ -n "$balanced_cost" ]] && echo "  Balanced: \$${balanced_cost}"
    [[ -n "$conservative_cost" ]] && echo "  Conservative: \$${conservative_cost}"
    
    # Validate cost relationships
    if [[ -n "$aggressive_cost" && -n "$conservative_cost" ]]; then
        if (( $(echo "$conservative_cost < $aggressive_cost" | bc -l) )); then
            print_status "PASS" "Cost optimization working" "Conservative < Aggressive"
        else
            print_status "FAIL" "Cost optimization issue" "Conservative >= Aggressive"
        fi
    fi
}

generate_report() {
    echo -e "\n${GREEN}=== Day 1 Validation Report ===${NC}"
    echo "Generated: $(date)"
    echo "Account: ${NR_ACCOUNT_ID}"
    
    # Summary stats
    local total_hosts=$(query_nrql "SELECT uniqueCount(host.name) FROM Metric WHERE service.name = 'nrdot-plus-host' SINCE 1 hour ago")
    local total_processes=$(query_nrql "SELECT uniqueCount(process.executable.name) FROM Metric WHERE service.name = 'nrdot-plus-host' SINCE 1 hour ago")
    local total_dpm=$(query_nrql "SELECT rate(count(*), 1 minute) FROM Metric WHERE service.name = 'nrdot-plus-host' SINCE 1 hour ago")
    
    echo -e "\nDeployment Summary:"
    echo "  Hosts monitored: ${total_hosts:-0}"
    echo "  Unique processes: ${total_processes:-0}"
    echo "  Data points/minute: ${total_dpm:-0}"
    
    # Action items
    echo -e "\n${YELLOW}Action Items:${NC}"
    echo "1. Review any FAIL items above"
    echo "2. Check New Relic UI for anomaly drill-downs"
    echo "3. Validate cost projections match budget"
    echo "4. Consider adjusting thresholds based on false positive rate"
}

# Main execution
main() {
    log "INFO" "Starting Day 1 validation"
    
    # Run all checks
    check_collector_health
    check_kpi_metrics
    check_ewma_experiment
    check_cost_tracking
    
    # Generate report
    generate_report
    
    log "INFO" "Day 1 validation complete"
}

# Run main
main "$@"