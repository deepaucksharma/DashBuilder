#!/bin/bash
# NRDOT Deep Diagnostics Script - Comprehensive automated checks
# Performs all troubleshooting steps with detailed logging

set -euo pipefail

# Constants
readonly SCRIPT_NAME="nrdot-deep-diagnostics"
readonly LOG_DIR="/var/log/nrdot"
readonly TIMESTAMP=$(date -u '+%Y%m%d_%H%M%S')
readonly LOG_FILE="${LOG_DIR}/${SCRIPT_NAME}_${TIMESTAMP}.log"
readonly REPORT_FILE="${LOG_DIR}/${SCRIPT_NAME}_report_${TIMESTAMP}.txt"
readonly COLLECTOR_CONFIG="/etc/nrdot/collector-config.yaml"
readonly OPTIMIZATION_CONFIG="/etc/nrdot/optimization.yaml"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Create log directory if it doesn't exist
mkdir -p "${LOG_DIR}"

# Logging functions
log() {
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[ERROR] $*${NC}" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}[WARNING] $*${NC}" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS] $*${NC}" | tee -a "${LOG_FILE}"
}

log_info() {
    echo -e "${BLUE}[INFO] $*${NC}" | tee -a "${LOG_FILE}"
}

# Result tracking
declare -A CHECK_RESULTS
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

record_check() {
    local check_name="$1"
    local status="$2"  # PASS, FAIL, WARN
    local message="$3"
    
    CHECK_RESULTS["${check_name}"]="${status}:${message}"
    ((TOTAL_CHECKS++))
    
    case "${status}" in
        PASS) ((PASSED_CHECKS++)); log_success "${check_name}: ${message}" ;;
        FAIL) ((FAILED_CHECKS++)); log_error "${check_name}: ${message}" ;;
        WARN) ((WARNING_CHECKS++)); log_warning "${check_name}: ${message}" ;;
    esac
}

# Check functions
check_collector_running() {
    log_info "Checking if collector is running..."
    
    if pgrep -f "otelcol" > /dev/null 2>&1; then
        local pid=$(pgrep -f "otelcol")
        record_check "collector_process" "PASS" "Collector is running (PID: ${pid})"
    else
        record_check "collector_process" "FAIL" "Collector is NOT running"
        
        # Check if it's a systemd service
        if systemctl is-active --quiet nrdot-collector 2>/dev/null; then
            record_check "collector_systemd" "WARN" "Systemd shows active but no process found"
        fi
    fi
}

check_metrics_endpoint() {
    log_info "Checking metrics endpoint..."
    
    local endpoints=("8888" "8889" "13133")
    for port in "${endpoints[@]}"; do
        if curl -s "http://localhost:${port}/metrics" > /dev/null 2>&1; then
            local metric_count=$(curl -s "http://localhost:${port}/metrics" | grep -c "^[^#]" || echo "0")
            record_check "metrics_endpoint_${port}" "PASS" "Port ${port} responding (${metric_count} metrics)"
        else
            record_check "metrics_endpoint_${port}" "FAIL" "Port ${port} not responding"
        fi
    done
}

check_recent_errors() {
    log_info "Checking for recent errors in logs..."
    
    local error_count=0
    if command -v journalctl >/dev/null 2>&1; then
        error_count=$(journalctl -u nrdot-collector -n 1000 --since "1 hour ago" 2>/dev/null | grep -i error | wc -l || echo "0")
    fi
    
    if [[ -f "/var/log/nrdot/collector.log" ]]; then
        local file_errors=$(tail -n 1000 /var/log/nrdot/collector.log | grep -i error | wc -l || echo "0")
        error_count=$((error_count + file_errors))
    fi
    
    if [[ ${error_count} -eq 0 ]]; then
        record_check "recent_errors" "PASS" "No recent errors found"
    elif [[ ${error_count} -lt 10 ]]; then
        record_check "recent_errors" "WARN" "${error_count} errors in last hour"
    else
        record_check "recent_errors" "FAIL" "${error_count} errors in last hour (high)"
    fi
}

check_newrelic_connectivity() {
    log_info "Checking New Relic connectivity..."
    
    # Check OTLP endpoint
    if curl -s --max-time 5 https://otlp.nr-data.net > /dev/null 2>&1; then
        record_check "nr_otlp_connectivity" "PASS" "Can reach OTLP endpoint"
    else
        record_check "nr_otlp_connectivity" "FAIL" "Cannot reach OTLP endpoint"
    fi
    
    # Check API endpoint
    if curl -s --max-time 5 https://api.newrelic.com > /dev/null 2>&1; then
        record_check "nr_api_connectivity" "PASS" "Can reach API endpoint"
    else
        record_check "nr_api_connectivity" "FAIL" "Cannot reach API endpoint"
    fi
}

check_environment_variables() {
    log_info "Checking environment variables..."
    
    # Check license key
    if [[ -n "${NEW_RELIC_LICENSE_KEY:-}" ]]; then
        local key_length=${#NEW_RELIC_LICENSE_KEY}
        if [[ ${key_length} -eq 40 ]]; then
            record_check "license_key" "PASS" "License key present and correct length"
        else
            record_check "license_key" "FAIL" "License key wrong length (${key_length}, expected 40)"
        fi
    else
        record_check "license_key" "FAIL" "NEW_RELIC_LICENSE_KEY not set"
    fi
    
    # Check API key
    if [[ -n "${NEW_RELIC_API_KEY:-}" ]]; then
        record_check "api_key" "PASS" "API key present"
    else
        record_check "api_key" "WARN" "NEW_RELIC_API_KEY not set (needed for control loop)"
    fi
    
    # Check account ID
    if [[ -n "${NEW_RELIC_ACCOUNT_ID:-}" ]]; then
        record_check "account_id" "PASS" "Account ID present"
    else
        record_check "account_id" "WARN" "NEW_RELIC_ACCOUNT_ID not set"
    fi
}

check_export_metrics() {
    log_info "Checking export metrics..."
    
    if ! curl -s http://localhost:8888/metrics > /dev/null 2>&1; then
        record_check "export_metrics" "FAIL" "Cannot access metrics endpoint"
        return
    fi
    
    # Check sent metrics
    local sent_points=$(curl -s http://localhost:8888/metrics | grep "otelcol_exporter_sent_metric_points" | grep -v "#" | awk '{print $2}' | head -1 || echo "0")
    if [[ "${sent_points}" == "0" || -z "${sent_points}" ]]; then
        record_check "export_sent" "FAIL" "No metrics sent to New Relic"
    else
        record_check "export_sent" "PASS" "Sent ${sent_points} metric points"
    fi
    
    # Check export failures
    local failed_points=$(curl -s http://localhost:8888/metrics | grep "otelcol_exporter_send_failed_metric_points" | grep -v "#" | awk '{print $2}' | head -1 || echo "0")
    if [[ "${failed_points}" != "0" && -n "${failed_points}" ]]; then
        record_check "export_failures" "WARN" "${failed_points} metric points failed to send"
    else
        record_check "export_failures" "PASS" "No export failures"
    fi
}

check_collector_configuration() {
    log_info "Checking collector configuration..."
    
    if [[ ! -f "${COLLECTOR_CONFIG}" ]]; then
        record_check "collector_config" "FAIL" "Config file not found: ${COLLECTOR_CONFIG}"
        return
    fi
    
    # Validate YAML syntax
    if command -v yq >/dev/null 2>&1; then
        if yq eval . "${COLLECTOR_CONFIG}" > /dev/null 2>&1; then
            record_check "config_syntax" "PASS" "YAML syntax valid"
        else
            record_check "config_syntax" "FAIL" "YAML syntax invalid"
        fi
    else
        record_check "config_syntax" "WARN" "yq not installed, cannot validate YAML"
    fi
    
    # Check critical sections
    local has_receivers=$(grep -q "^receivers:" "${COLLECTOR_CONFIG}" && echo "yes" || echo "no")
    local has_processors=$(grep -q "^processors:" "${COLLECTOR_CONFIG}" && echo "yes" || echo "no")
    local has_exporters=$(grep -q "^exporters:" "${COLLECTOR_CONFIG}" && echo "yes" || echo "no")
    local has_pipelines=$(grep -q "^service:" "${COLLECTOR_CONFIG}" && echo "yes" || echo "no")
    
    if [[ "${has_receivers}" == "yes" && "${has_processors}" == "yes" && 
          "${has_exporters}" == "yes" && "${has_pipelines}" == "yes" ]]; then
        record_check "config_structure" "PASS" "All required sections present"
    else
        record_check "config_structure" "FAIL" "Missing config sections"
    fi
}

check_process_metrics() {
    log_info "Checking process metrics collection..."
    
    # Get process count from system
    local system_processes=$(ps aux | wc -l)
    
    # Get process count from collector
    if curl -s http://localhost:8889/metrics > /dev/null 2>&1; then
        local collected_processes=$(curl -s http://localhost:8889/metrics | grep "process_cpu_time" | cut -d'{' -f2 | cut -d'}' -f1 | sort -u | wc -l || echo "0")
        
        if [[ ${collected_processes} -gt 0 ]]; then
            local coverage=$((collected_processes * 100 / system_processes))
            record_check "process_collection" "PASS" "Collecting ${collected_processes}/${system_processes} processes (${coverage}%)"
        else
            record_check "process_collection" "FAIL" "No process metrics being collected"
        fi
    else
        record_check "process_collection" "FAIL" "Cannot access process metrics"
    fi
}

check_memory_usage() {
    log_info "Checking collector memory usage..."
    
    local pid=$(pgrep -f "otelcol" | head -1)
    if [[ -n "${pid}" ]]; then
        local mem_usage=$(ps -p "${pid}" -o %mem= | tr -d ' ')
        local mem_mb=$(ps -p "${pid}" -o rss= | awk '{print int($1/1024)}')
        
        if (( $(echo "${mem_usage} < 5.0" | bc -l 2>/dev/null || echo 1) )); then
            record_check "memory_usage" "PASS" "Memory usage OK: ${mem_usage}% (${mem_mb}MB)"
        elif (( $(echo "${mem_usage} < 10.0" | bc -l 2>/dev/null || echo 0) )); then
            record_check "memory_usage" "WARN" "Memory usage high: ${mem_usage}% (${mem_mb}MB)"
        else
            record_check "memory_usage" "FAIL" "Memory usage critical: ${mem_usage}% (${mem_mb}MB)"
        fi
    else
        record_check "memory_usage" "FAIL" "Cannot check - collector not running"
    fi
}

check_data_in_newrelic() {
    log_info "Checking data in New Relic..."
    
    if [[ -z "${NEW_RELIC_API_KEY:-}" || -z "${NEW_RELIC_ACCOUNT_ID:-}" ]]; then
        record_check "nr_data_check" "WARN" "Cannot check - API key or account ID not set"
        return
    fi
    
    # Query for recent metrics
    local query='SELECT count(*) FROM Metric WHERE service.name LIKE '\''nrdot%'\'' SINCE 5 minutes ago'
    local response=$(curl -s -X POST "https://api.newrelic.com/graphql" \
        -H "Content-Type: application/json" \
        -H "Api-Key: ${NEW_RELIC_API_KEY}" \
        -d "{\"query\": \"{ actor { account(id: ${NEW_RELIC_ACCOUNT_ID}) { nrql(query: \\\"${query}\\\") { results } } } }\"}" 2>/dev/null)
    
    if [[ "${response}" =~ \"count\":([0-9]+) ]]; then
        local count="${BASH_REMATCH[1]}"
        if [[ ${count} -gt 0 ]]; then
            record_check "nr_data_check" "PASS" "Found ${count} metrics in last 5 minutes"
        else
            record_check "nr_data_check" "FAIL" "No metrics found in New Relic"
        fi
    else
        record_check "nr_data_check" "FAIL" "Failed to query New Relic"
    fi
}

check_cardinality() {
    log_info "Checking metric cardinality..."
    
    if curl -s http://localhost:8889/metrics > /dev/null 2>&1; then
        local total_series=$(curl -s http://localhost:8889/metrics | grep -c "^[^#]" || echo "0")
        
        if [[ ${total_series} -lt 10000 ]]; then
            record_check "cardinality" "PASS" "Series count OK: ${total_series}"
        elif [[ ${total_series} -lt 50000 ]]; then
            record_check "cardinality" "WARN" "Series count high: ${total_series}"
        else
            record_check "cardinality" "FAIL" "Series count excessive: ${total_series}"
        fi
        
        # Check for high cardinality metrics
        local high_card_metrics=$(curl -s http://localhost:8889/metrics | awk -F'{' '{print $1}' | sort | uniq -c | sort -rn | head -5)
        echo "Top 5 metrics by series count:" >> "${LOG_FILE}"
        echo "${high_card_metrics}" >> "${LOG_FILE}"
    else
        record_check "cardinality" "FAIL" "Cannot check cardinality"
    fi
}

check_control_loop() {
    log_info "Checking control loop..."
    
    if pgrep -f "control-loop" > /dev/null 2>&1; then
        record_check "control_loop_process" "PASS" "Control loop is running"
        
        # Check profile file
        if [[ -f "/var/lib/nrdot/current_profile.json" ]]; then
            local current_profile=$(jq -r '.profile' /var/lib/nrdot/current_profile.json 2>/dev/null || echo "unknown")
            record_check "control_loop_profile" "PASS" "Current profile: ${current_profile}"
        else
            record_check "control_loop_profile" "WARN" "No profile file found"
        fi
    else
        record_check "control_loop_process" "WARN" "Control loop not running"
    fi
}

check_docker_specific() {
    log_info "Checking Docker-specific issues..."
    
    if [[ -f /.dockerenv ]]; then
        # Running in Docker
        record_check "docker_environment" "PASS" "Running in Docker container"
        
        # Check if running with host PID namespace
        if [[ -d /host/proc ]]; then
            record_check "docker_host_pid" "PASS" "Host PID namespace accessible"
        else
            record_check "docker_host_pid" "FAIL" "Host PID namespace not accessible - process metrics will be limited"
        fi
        
        # Check volume mounts
        if [[ -d /host/sys ]]; then
            record_check "docker_host_sys" "PASS" "Host /sys mounted"
        else
            record_check "docker_host_sys" "WARN" "Host /sys not mounted - some metrics may be missing"
        fi
    else
        record_check "docker_environment" "INFO" "Not running in Docker"
    fi
}

check_kubernetes_specific() {
    log_info "Checking Kubernetes-specific issues..."
    
    if [[ -n "${KUBERNETES_SERVICE_HOST:-}" ]]; then
        record_check "k8s_environment" "PASS" "Running in Kubernetes"
        
        # Check service account
        if [[ -f "/var/run/secrets/kubernetes.io/serviceaccount/token" ]]; then
            record_check "k8s_service_account" "PASS" "Service account token present"
        else
            record_check "k8s_service_account" "WARN" "No service account token - may limit functionality"
        fi
        
        # Check if running as DaemonSet (hostPID needed)
        if [[ "${HOSTNAME:-}" =~ -[0-9a-z]{5}$ ]]; then
            record_check "k8s_deployment_type" "INFO" "Appears to be running as DaemonSet"
        fi
    else
        record_check "k8s_environment" "INFO" "Not running in Kubernetes"
    fi
}

generate_report() {
    log_info "Generating diagnostic report..."
    
    {
        echo "======================================"
        echo "NRDOT Deep Diagnostics Report"
        echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
        echo "======================================"
        echo
        echo "SUMMARY:"
        echo "Total Checks: ${TOTAL_CHECKS}"
        echo "Passed: ${PASSED_CHECKS}"
        echo "Failed: ${FAILED_CHECKS}"
        echo "Warnings: ${WARNING_CHECKS}"
        echo
        echo "======================================"
        echo "DETAILED RESULTS:"
        echo "======================================"
        
        for check in "${!CHECK_RESULTS[@]}"; do
            IFS=':' read -r status message <<< "${CHECK_RESULTS[${check}]}"
            printf "%-30s [%-4s] %s\n" "${check}" "${status}" "${message}"
        done
        
        echo
        echo "======================================"
        echo "RECOMMENDATIONS:"
        echo "======================================"
        
        if [[ ${FAILED_CHECKS} -gt 0 ]]; then
            echo "CRITICAL ISSUES TO ADDRESS:"
            
            if [[ "${CHECK_RESULTS[collector_process]}" =~ ^FAIL ]]; then
                echo "1. Start the collector:"
                echo "   systemctl start nrdot-collector"
            fi
            
            if [[ "${CHECK_RESULTS[license_key]}" =~ ^FAIL ]]; then
                echo "2. Set license key:"
                echo "   export NEW_RELIC_LICENSE_KEY='your-key-here'"
            fi
            
            if [[ "${CHECK_RESULTS[nr_data_check]}" =~ ^FAIL ]]; then
                echo "3. Check exporter configuration and network connectivity"
            fi
        fi
        
        echo
        echo "Full log available at: ${LOG_FILE}"
        
    } > "${REPORT_FILE}"
    
    cat "${REPORT_FILE}"
}

# Main execution
main() {
    log "Starting NRDOT deep diagnostics..."
    
    # Basic checks
    check_collector_running
    check_metrics_endpoint
    check_recent_errors
    check_newrelic_connectivity
    check_environment_variables
    
    # Data flow checks
    check_export_metrics
    check_collector_configuration
    check_process_metrics
    
    # Performance checks
    check_memory_usage
    check_cardinality
    
    # Integration checks
    check_data_in_newrelic
    check_control_loop
    
    # Environment-specific checks
    check_docker_specific
    check_kubernetes_specific
    
    # Generate report
    generate_report
    
    # Exit with appropriate code
    if [[ ${FAILED_CHECKS} -gt 0 ]]; then
        exit 1
    elif [[ ${WARNING_CHECKS} -gt 0 ]]; then
        exit 2
    else
        exit 0
    fi
}

# Run main
main "$@"