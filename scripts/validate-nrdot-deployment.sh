#!/bin/bash
# NRDOT v2 Deployment Validation Script
# Comprehensive validation of the entire NRDOT pipeline

set -euo pipefail

# Configuration
CONFIG_DIR="/etc/nrdot-collector-host"
LIB_DIR="/var/lib/nrdot"
LOG_DIR="/var/log/nrdot"
COLLECTOR_ENDPOINT="${COLLECTOR_ENDPOINT:-http://localhost:8888/metrics}"
NR_API_ENDPOINT="${NR_API_ENDPOINT:-https://api.newrelic.com}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

# Logging functions
log_check() { echo -e "${BLUE}[CHECK]${NC} $*"; ((TOTAL_CHECKS++)); }
log_pass() { echo -e "${GREEN}[PASS]${NC} $*"; ((PASSED_CHECKS++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $*" >&2; ((FAILED_CHECKS++)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; ((WARNINGS++)); }
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }

# Check collector service status
check_collector_service() {
    log_check "Checking collector service status..."
    
    if systemctl is-active --quiet nrdot-collector-host.service 2>/dev/null; then
        log_pass "Collector service is running"
        
        # Check how long it's been running
        uptime=$(systemctl show -p ActiveEnterTimestamp nrdot-collector-host.service | cut -d= -f2-)
        log_info "Service started: $uptime"
    else
        log_fail "Collector service is not running"
        
        # Show recent logs if available
        if command -v journalctl >/dev/null 2>&1; then
            log_info "Recent logs:"
            journalctl -u nrdot-collector-host.service -n 10 --no-pager || true
        fi
    fi
}

# Check configuration files
check_configs() {
    log_check "Checking configuration files..."
    
    # Check optimization.yaml
    if [[ -f "$CONFIG_DIR/optimization.yaml" ]]; then
        log_pass "optimization.yaml exists"
        
        # Validate YAML syntax
        if yq eval '.' "$CONFIG_DIR/optimization.yaml" >/dev/null 2>&1; then
            log_pass "optimization.yaml has valid YAML syntax"
            
            # Check active profile
            active_profile=$(yq eval '.state.active_profile' "$CONFIG_DIR/optimization.yaml")
            log_info "Active profile: $active_profile"
            
            # Check if profile exists
            if yq eval ".profiles.$active_profile" "$CONFIG_DIR/optimization.yaml" | grep -q "null"; then
                log_fail "Active profile '$active_profile' not found in profiles"
            else
                log_pass "Active profile '$active_profile' is valid"
            fi
        else
            log_fail "optimization.yaml has invalid YAML syntax"
        fi
    else
        log_fail "optimization.yaml not found"
    fi
    
    # Check collector config
    if [[ -f "$CONFIG_DIR/config.yaml" ]]; then
        log_pass "config.yaml exists"
        
        # Basic validation
        if grep -q "receivers:" "$CONFIG_DIR/config.yaml" && \
           grep -q "processors:" "$CONFIG_DIR/config.yaml" && \
           grep -q "exporters:" "$CONFIG_DIR/config.yaml"; then
            log_pass "config.yaml has required sections"
        else
            log_fail "config.yaml missing required sections"
        fi
    else
        log_fail "config.yaml not found"
    fi
}

# Check environment variables
check_environment() {
    log_check "Checking collector environment..."
    
    if [[ -f "$LIB_DIR/collector.env" ]]; then
        log_pass "collector.env exists"
        
        # Source and check required variables
        source "$LIB_DIR/collector.env"
        
        required_vars=(
            "HOSTNAME"
            "OS_TYPE"
            "NRDOT_RING"
            "NRDOT_PROFILE"
            "NRDOT_VERSION"
        )
        
        for var in "${required_vars[@]}"; do
            if [[ -n "${!var:-}" ]]; then
                log_pass "$var is set: ${!var}"
            else
                log_fail "$var is not set"
            fi
        done
    else
        log_fail "collector.env not found"
    fi
}

# Check noise patterns
check_noise_patterns() {
    log_check "Checking noise patterns..."
    
    if [[ -f "$LIB_DIR/noise_patterns.yaml" ]]; then
        log_pass "noise_patterns.yaml exists"
        
        # Count patterns
        pattern_count=$(yq eval '. | length' "$LIB_DIR/noise_patterns.yaml" 2>/dev/null || echo "0")
        log_info "Number of noise patterns: $pattern_count"
        
        if [[ $pattern_count -gt 0 ]]; then
            log_pass "Noise patterns are configured"
        else
            log_warn "No noise patterns found"
        fi
    else
        log_fail "noise_patterns.yaml not found"
    fi
}

# Check collector metrics endpoint
check_metrics_endpoint() {
    log_check "Checking collector metrics endpoint..."
    
    if curl -s -f "$COLLECTOR_ENDPOINT" >/dev/null 2>&1; then
        log_pass "Collector metrics endpoint is accessible"
        
        # Check for NRDOT KPI metrics
        metrics=$(curl -s "$COLLECTOR_ENDPOINT" 2>/dev/null || echo "")
        
        kpi_metrics=(
            "nrdot_process_series_total"
            "nrdot_process_series_kept"
            "nrdot_process_coverage_critical"
            "nrdot_estimated_cost_per_hour"
        )
        
        for metric in "${kpi_metrics[@]}"; do
            if echo "$metrics" | grep -q "^$metric"; then
                value=$(echo "$metrics" | grep "^$metric" | head -1 | awk '{print $2}')
                log_pass "$metric is reporting: $value"
            else
                log_warn "$metric not found in metrics"
            fi
        done
    else
        log_fail "Collector metrics endpoint not accessible at $COLLECTOR_ENDPOINT"
    fi
}

# Check control loops
check_control_loops() {
    log_check "Checking control loops..."
    
    # Check autonomous control loop
    if systemctl is-enabled --quiet nrdot-control-loop.service 2>/dev/null; then
        log_info "Autonomous control loop is enabled"
        
        if systemctl is-active --quiet nrdot-control-loop.service; then
            log_pass "Autonomous control loop is running"
        else
            log_warn "Autonomous control loop is enabled but not running"
        fi
    else
        log_info "Autonomous control loop is not enabled"
    fi
    
    # Check UI-driven control loop
    if systemctl is-enabled --quiet nrdot-nr1-control-loop.service 2>/dev/null; then
        log_info "UI-driven control loop is enabled"
        
        if systemctl is-active --quiet nrdot-nr1-control-loop.service; then
            log_pass "UI-driven control loop is running"
            
            # Check if API key is configured
            if [[ -f /etc/nrdot/nr1-control-loop.env ]]; then
                if grep -q "NR_API_KEY=your_api_key_here" /etc/nrdot/nr1-control-loop.env; then
                    log_warn "NR_API_KEY not configured in /etc/nrdot/nr1-control-loop.env"
                else
                    log_pass "NR_API_KEY appears to be configured"
                fi
            fi
        else
            log_warn "UI-driven control loop is enabled but not running"
        fi
    else
        log_info "UI-driven control loop is not enabled"
    fi
}

# Check process scoring
check_process_scoring() {
    log_check "Checking process scoring implementation..."
    
    # Look for scoring processor in config
    if [[ -f "$CONFIG_DIR/config.yaml" ]]; then
        if grep -q "metricstransform/scoring" "$CONFIG_DIR/config.yaml"; then
            log_pass "Process scoring processor is configured"
            
            # Check if it's using the placeholder or real implementation
            if grep -A5 "metricstransform/scoring" "$CONFIG_DIR/config.yaml" | grep -q "default.*0.3"; then
                log_warn "Process scoring appears to use placeholder implementation"
            else
                log_info "Process scoring appears to have custom implementation"
            fi
        else
            log_fail "Process scoring processor not found in config"
        fi
    fi
}

# Check EWMA implementation
check_ewma() {
    log_check "Checking EWMA anomaly detection..."
    
    if [[ -f "$CONFIG_DIR/config.yaml" ]]; then
        if grep -q "metricstransform/ewma" "$CONFIG_DIR/config.yaml"; then
            log_pass "EWMA processor is configured"
            
            # Check if file storage is configured for state
            if grep -q "file_storage" "$CONFIG_DIR/config.yaml"; then
                log_pass "File storage extension configured for EWMA state"
                
                # Check if storage directory exists
                if [[ -d "$LIB_DIR/storage" ]]; then
                    log_pass "EWMA storage directory exists"
                else
                    log_fail "EWMA storage directory missing"
                fi
            else
                log_warn "File storage not configured for EWMA state persistence"
            fi
        else
            log_warn "EWMA processor not configured"
        fi
    fi
}

# Check New Relic connectivity
check_new_relic() {
    log_check "Checking New Relic connectivity..."
    
    # This is a basic check - in production you'd use the actual API
    if curl -s -f "https://api.newrelic.com" >/dev/null 2>&1; then
        log_pass "New Relic API is reachable"
    else
        log_warn "Cannot reach New Relic API"
    fi
    
    # Check if OTLP endpoint is configured
    if [[ -f "$CONFIG_DIR/config.yaml" ]]; then
        if grep -q "otlp/newrelic" "$CONFIG_DIR/config.yaml"; then
            log_pass "OTLP exporter configured for New Relic"
            
            # Check if API key is referenced
            if grep -q "api-key.*NEW_RELIC_API_KEY" "$CONFIG_DIR/config.yaml"; then
                if [[ -n "${NEW_RELIC_API_KEY:-}" ]]; then
                    log_pass "NEW_RELIC_API_KEY environment variable is set"
                else
                    log_fail "NEW_RELIC_API_KEY environment variable not set"
                fi
            fi
        else
            log_fail "OTLP exporter not configured for New Relic"
        fi
    fi
}

# Performance checks
check_performance() {
    log_check "Checking performance metrics..."
    
    if systemctl is-active --quiet nrdot-collector-host.service 2>/dev/null; then
        # Get memory usage
        mem_usage=$(systemctl show -p MemoryCurrent nrdot-collector-host.service | cut -d= -f2)
        if [[ -n "$mem_usage" ]] && [[ "$mem_usage" != "[not set]" ]]; then
            mem_mb=$((mem_usage / 1024 / 1024))
            log_info "Collector memory usage: ${mem_mb}MB"
            
            if [[ $mem_mb -gt 1024 ]]; then
                log_warn "Collector using more than 1GB of memory"
            else
                log_pass "Collector memory usage is reasonable"
            fi
        fi
        
        # Check CPU usage (if available)
        cpu_usage=$(systemctl show -p CPUUsageNSec nrdot-collector-host.service | cut -d= -f2)
        if [[ -n "$cpu_usage" ]] && [[ "$cpu_usage" != "[not set]" ]]; then
            log_info "Collector CPU time: $((cpu_usage / 1000000000))s"
        fi
    fi
}

# Run experiment validation
check_experiments() {
    log_check "Checking experiment configuration..."
    
    if [[ -f "$CONFIG_DIR/optimization.yaml" ]]; then
        # Check if experiments are defined
        if yq eval '.experiments' "$CONFIG_DIR/optimization.yaml" | grep -q "ewma_anomaly_detection"; then
            log_pass "EWMA experiment is configured"
            
            # Check experiment status
            exp_enabled=$(yq eval '.experiments[0].enabled' "$CONFIG_DIR/optimization.yaml")
            if [[ "$exp_enabled" == "true" ]]; then
                log_info "EWMA experiment is enabled"
                
                # Check ring assignments
                treatment_rings=$(yq eval '.experiments[0].treatment_groups[].name' "$CONFIG_DIR/optimization.yaml" | wc -l)
                control_rings=$(yq eval '.experiments[0].control_groups[].name' "$CONFIG_DIR/optimization.yaml" | wc -l)
                log_info "Treatment rings: $treatment_rings, Control rings: $control_rings"
            else
                log_info "EWMA experiment is disabled"
            fi
        else
            log_info "No experiments configured"
        fi
    fi
}

# Summary report
generate_summary() {
    echo
    echo "===== NRDOT v2 Deployment Validation Summary ====="
    echo
    echo "Total Checks: $TOTAL_CHECKS"
    echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
    echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
    echo
    
    success_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    echo "Success Rate: ${success_rate}%"
    
    if [[ $FAILED_CHECKS -eq 0 ]]; then
        echo -e "${GREEN}✓ Deployment validation PASSED${NC}"
        return 0
    elif [[ $success_rate -ge 80 ]]; then
        echo -e "${YELLOW}⚠ Deployment mostly functional but needs attention${NC}"
        return 1
    else
        echo -e "${RED}✗ Deployment validation FAILED${NC}"
        return 2
    fi
}

# Main execution
main() {
    echo "NRDOT v2 Deployment Validation"
    echo "=============================="
    echo "Started at: $(date)"
    echo
    
    # Run all checks
    check_collector_service
    check_configs
    check_environment
    check_noise_patterns
    check_metrics_endpoint
    check_control_loops
    check_process_scoring
    check_ewma
    check_new_relic
    check_performance
    check_experiments
    
    # Generate summary
    generate_summary
}

# Run validation
main "$@"