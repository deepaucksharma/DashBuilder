#!/bin/bash
# Comprehensive NRDOT Validation Script
# Auto-detects platform and validates accordingly
# Supports: Docker, Native, Full Stack validation with auto-fix

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_test() { echo -e "${BLUE}[TEST]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_fix() { echo -e "${YELLOW}[FIX]${NC} $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VALIDATION_MODE="auto"
AUTO_FIX=true
VERBOSE=false
OUTPUT_FORMAT="text"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FIXES_APPLIED=0

# Usage function
usage() {
    cat << EOF
NRDOT v2 Comprehensive Validation Script

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    deployment      Validate deployment and configuration
    services        Validate service status
    metrics         Validate metrics pipeline
    queries         Validate NRQL queries
    integration     Validate end-to-end integration
    all             Run all validations (default)
    quick           Run essential checks only

Options:
    --mode=MODE         Validation mode: auto, docker, native (default: auto)
    --no-fix           Disable automatic fixes
    --verbose          Enable verbose output
    --json             Output results in JSON format
    --help             Show this help message

Examples:
    $0                          # Run all validations with auto-detection
    $0 deployment --mode=docker # Validate Docker deployment only
    $0 metrics --verbose        # Validate metrics with verbose output
    $0 all --json              # Run all tests with JSON output

EOF
}

# Parse arguments
parse_args() {
    # Default command
    local command="all"
    
    # Parse command
    if [[ $# -gt 0 && ! "$1" =~ ^-- ]]; then
        command="$1"
        shift
    fi

    # Parse options
    while [[ $# -gt 0 ]]; do
        case $1 in
            --mode=*)
                VALIDATION_MODE="${1#*=}"
                shift
                ;;
            --no-fix)
                AUTO_FIX=false
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --json)
                OUTPUT_FORMAT="json"
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                log_warning "Unknown option: $1"
                shift
                ;;
        esac
    done

    # Validate command
    case $command in
        deployment|services|metrics|queries|integration|all|quick) 
            VALIDATION_COMMAND="$command"
            ;;
        *) 
            log_fail "Invalid command: $command"
            usage
            exit 1 
            ;;
    esac

    # Validate mode
    case $VALIDATION_MODE in
        auto|docker|native) ;;
        *) 
            log_fail "Invalid mode: $VALIDATION_MODE"
            exit 1 
            ;;
    esac
}

# Auto-detect deployment mode
detect_deployment_mode() {
    if [ "$VALIDATION_MODE" != "auto" ]; then
        return
    fi

    log_info "Auto-detecting deployment mode..."

    # Check for Docker containers
    if command -v docker >/dev/null 2>&1 && docker ps --format "{{.Names}}" 2>/dev/null | grep -q "dashbuilder\|nrdot"; then
        VALIDATION_MODE="docker"
        log_info "Detected Docker deployment"
        return
    fi

    # Check for systemd services
    if command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service 2>/dev/null | grep -q "nrdot"; then
        VALIDATION_MODE="native"
        log_info "Detected native systemd deployment"
        return
    fi

    # Default to Docker if no specific deployment detected
    VALIDATION_MODE="docker"
    log_warning "No specific deployment detected, defaulting to Docker mode"
}

# Run a test with optional auto-fix
run_test() {
    local test_name="$1"
    local test_command="$2"
    local fix_command="$3"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "$test_name"
    
    # Capture test output
    local test_output
    if test_output=$(eval "$test_command" 2>&1); then
        log_pass "$test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        if [ "$VERBOSE" = true ]; then
            echo "  Output: $test_output"
        fi
        return 0
    else
        log_fail "$test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        
        if [ "$VERBOSE" = true ]; then
            echo "  Error: $test_output"
        fi
        
        # Apply fix if available and auto-fix is enabled
        if [ -n "$fix_command" ] && [ "$AUTO_FIX" = true ]; then
            log_fix "Applying automatic fix..."
            if eval "$fix_command" 2>&1; then
                FIXES_APPLIED=$((FIXES_APPLIED + 1))
                log_info "Fix applied successfully"
                
                # Re-run test after fix
                if eval "$test_command" >/dev/null 2>&1; then
                    log_pass "$test_name (after fix)"
                    TESTS_FAILED=$((TESTS_FAILED - 1))
                    TESTS_PASSED=$((TESTS_PASSED + 1))
                fi
            else
                log_warning "Fix failed to apply"
            fi
        fi
        
        return 1
    fi
}

# Validate deployment
validate_deployment() {
    log_info "Validating deployment configuration..."

    # Check environment variables
    run_test "Environment Variables" \
        "[ -n \"$NEW_RELIC_API_KEY\" ] && [ -n \"$NEW_RELIC_ACCOUNT_ID\" ]" \
        "echo 'Please set NEW_RELIC_API_KEY and NEW_RELIC_ACCOUNT_ID in .env file'"

    # Check configuration files
    if [ "$VALIDATION_MODE" = "docker" ]; then
        run_test "Docker Compose File" \
            "[ -f \"$PROJECT_ROOT/docker-compose.yml\" ]" \
            ""

        run_test "NRDOT Configuration" \
            "[ -f \"$PROJECT_ROOT/distributions/nrdot-plus/config/config.yaml\" ]" \
            ""
    elif [ "$VALIDATION_MODE" = "native" ]; then
        run_test "NRDOT Configuration" \
            "[ -f \"/etc/nrdot-plus/config.yaml\" ]" \
            "sudo mkdir -p /etc/nrdot-plus && sudo cp \"$PROJECT_ROOT/distributions/nrdot-plus/config/config.yaml\" /etc/nrdot-plus/"

        run_test "OpenTelemetry Collector Binary" \
            "command -v otelcol-contrib" \
            "curl -L https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.96.0/otelcol-contrib_0.96.0_linux_amd64.tar.gz | sudo tar -xz -C /usr/local/bin/"
    fi
}

# Validate services
validate_services() {
    log_info "Validating service status..."

    if [ "$VALIDATION_MODE" = "docker" ]; then
        # Check Docker containers
        run_test "Docker Engine Running" \
            "docker info >/dev/null 2>&1" \
            "sudo systemctl start docker"

        run_test "DashBuilder Container" \
            "docker ps --format '{{.Names}}' | grep -q dashbuilder" \
            "cd \"$PROJECT_ROOT\" && docker-compose --profile dashbuilder up -d"

        run_test "NRDOT Container" \
            "docker ps --format '{{.Names}}' | grep -q nrdot" \
            "cd \"$PROJECT_ROOT\" && docker-compose --profile nrdot up -d"

        # Check container health
        run_test "Container Health Checks" \
            "docker ps --filter health=healthy --format '{{.Names}}' | wc -l | grep -q -v '^0$'" \
            ""

    elif [ "$VALIDATION_MODE" = "native" ]; then
        # Check systemd services
        run_test "NRDOT Collector Service" \
            "systemctl is-active --quiet nrdot-collector" \
            "sudo systemctl start nrdot-collector"

        run_test "NRDOT Control Loop Service" \
            "systemctl is-active --quiet nrdot-control-loop" \
            "sudo systemctl start nrdot-control-loop"
    fi
}

# Validate metrics pipeline
validate_metrics() {
    log_info "Validating metrics pipeline..."

    # Check OpenTelemetry collector metrics endpoint
    local metrics_url="http://localhost:8888/metrics"
    if [ "$VALIDATION_MODE" = "docker" ]; then
        # Docker may use different ports
        metrics_url="http://localhost:8888/metrics"
    fi

    run_test "Metrics Endpoint Available" \
        "curl -s -f \"$metrics_url\" | head -1 | grep -q 'TYPE'" \
        ""

    run_test "Metrics Being Collected" \
        "curl -s \"$metrics_url\" | grep -q 'otelcol_receiver_'" \
        ""

    run_test "Metrics Being Exported" \
        "curl -s \"$metrics_url\" | grep -q 'otelcol_exporter_'" \
        ""

    # Check for NRDOT-specific metrics
    run_test "NRDOT Metrics Present" \
        "curl -s \"$metrics_url\" | grep -q 'nrdot'" \
        ""
}

# Validate NRQL queries
validate_queries() {
    log_info "Validating NRQL queries..."

    # Test basic API connectivity
    run_test "New Relic API Connection" \
        "cd \"$PROJECT_ROOT/scripts\" && npm run --silent cli -- schema discover-event-types --limit 1 >/dev/null 2>&1" \
        ""

    # Test metric queries
    run_test "Metric Data Available" \
        "cd \"$PROJECT_ROOT/scripts\" && npm run --silent cli -- nrql validate 'SELECT count(*) FROM Metric SINCE 5 minutes ago' >/dev/null 2>&1" \
        ""

    # Test NRDOT-specific queries
    run_test "NRDOT Metrics in New Relic" \
        "cd \"$PROJECT_ROOT/scripts\" && npm run --silent cli -- nrql validate \"SELECT count(*) FROM Metric WHERE metricName LIKE 'nrdot%' SINCE 10 minutes ago\" >/dev/null 2>&1" \
        ""

    # Test process sample queries  
    run_test "Process Sample Data" \
        "cd \"$PROJECT_ROOT/scripts\" && npm run --silent cli -- nrql validate 'SELECT count(*) FROM ProcessSample SINCE 5 minutes ago' >/dev/null 2>&1" \
        ""
}

# Validate end-to-end integration
validate_integration() {
    log_info "Validating end-to-end integration..."

    # Check data flow: collector -> New Relic
    run_test "Data Ingestion Pipeline" \
        "sleep 30 && cd \"$PROJECT_ROOT/scripts\" && npm run --silent cli -- ingest get-data-volume --days 1 --json | jq -r '.datapoints' | grep -q -v '^0$'" \
        ""

    # Check control loop functionality
    if [ "$VALIDATION_MODE" = "docker" ]; then
        run_test "Control Loop Logs" \
            "docker logs nrdot-control-loop 2>&1 | tail -5 | grep -q 'METRIC\\|cpu_usage'" \
            ""
    elif [ "$VALIDATION_MODE" = "native" ]; then
        run_test "Control Loop Logs" \
            "journalctl -u nrdot-control-loop --since '5 minutes ago' | grep -q 'METRIC\\|cpu_usage'" \
            ""
    fi

    # Check dashboard functionality (if available)
    run_test "Dashboard List Available" \
        "cd \"$PROJECT_ROOT/scripts\" && npm run --silent cli -- dashboard list --limit 1 >/dev/null 2>&1" \
        ""
}

# Generate validation report
generate_report() {
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local report_file="$PROJECT_ROOT/validation-report-$(date +%Y%m%d-%H%M%S)"

    if [ "$OUTPUT_FORMAT" = "json" ]; then
        report_file="${report_file}.json"
        cat > "$report_file" << EOF
{
  "timestamp": "$timestamp",
  "validation_mode": "$VALIDATION_MODE",
  "command": "$VALIDATION_COMMAND",
  "summary": {
    "tests_run": $TESTS_RUN,
    "tests_passed": $TESTS_PASSED,
    "tests_failed": $TESTS_FAILED,
    "fixes_applied": $FIXES_APPLIED,
    "success_rate": $(echo "scale=2; $TESTS_PASSED * 100 / $TESTS_RUN" | bc -l 2>/dev/null || echo "0")
  },
  "deployment_status": {
    "mode": "$VALIDATION_MODE",
    "overall_health": "$([ $TESTS_FAILED -eq 0 ] && echo "healthy" || echo "degraded")"
  },
  "recommendations": [
    $([ $TESTS_FAILED -gt 0 ] && echo "\"Review failed tests and apply fixes\"" || echo "\"System is functioning properly\"")
  ]
}
EOF
    else
        report_file="${report_file}.md"
        cat > "$report_file" << EOF
# NRDOT v2 Validation Report

**Generated:** $timestamp  
**Mode:** $VALIDATION_MODE  
**Command:** $VALIDATION_COMMAND  

## Summary

- **Tests Run:** $TESTS_RUN
- **Tests Passed:** $TESTS_PASSED
- **Tests Failed:** $TESTS_FAILED
- **Fixes Applied:** $FIXES_APPLIED
- **Success Rate:** $(echo "scale=1; $TESTS_PASSED * 100 / $TESTS_RUN" | bc -l 2>/dev/null || echo "0")%

## Overall Status

$([ $TESTS_FAILED -eq 0 ] && echo "✅ **HEALTHY** - All tests passed" || echo "⚠️ **DEGRADED** - Some tests failed")

## Component Status

EOF

        # Add component-specific status
        if [ "$VALIDATION_MODE" = "docker" ]; then
            echo "### Docker Services" >> "$report_file"
            docker ps --format "| {{.Names}} | {{.Status}} | {{.State}} |" 2>/dev/null | head -10 >> "$report_file"
        elif [ "$VALIDATION_MODE" = "native" ]; then
            echo "### Systemd Services" >> "$report_file"
            systemctl list-units --type=service | grep nrdot | awk '{print "| " $1 " | " $3 " | " $4 " |"}' >> "$report_file"
        fi

        cat >> "$report_file" << EOF

## Recommendations

$(if [ $TESTS_FAILED -eq 0 ]; then
    echo "- System is functioning properly"
    echo "- Continue monitoring in New Relic dashboard"
    echo "- Consider running extended validation with \`--verbose\` flag"
else
    echo "- Review failed tests above"
    echo "- Check service logs for detailed error information"
    echo "- Re-run validation after applying fixes"
    echo "- Contact support if issues persist"
fi)

## Next Steps

1. Monitor metrics in New Relic dashboard
2. Run \`./scripts/validate-nrdot.sh metrics --verbose\` for detailed metrics analysis
3. Check cost reduction KPIs
4. Review control loop operation

---
*Generated by NRDOT v2 Validation Script*
EOF
    fi

    log_info "Validation report saved to: $report_file"
}

# Main validation function
main() {
    echo "======================================"
    echo " NRDOT v2 Comprehensive Validation"
    echo " Command: $VALIDATION_COMMAND | Mode: $VALIDATION_MODE"
    echo " $(date)"
    echo "======================================"
    echo ""

    # Auto-detect deployment if needed
    detect_deployment_mode

    # Load environment
    if [ -f "$PROJECT_ROOT/.env" ]; then
        set -a
        source "$PROJECT_ROOT/.env"
        set +a
    fi

    # Run validations based on command
    case $VALIDATION_COMMAND in
        deployment)
            validate_deployment
            ;;
        services)
            validate_services
            ;;
        metrics)
            validate_metrics
            ;;
        queries)
            validate_queries
            ;;
        integration)
            validate_integration
            ;;
        quick)
            validate_deployment
            validate_services
            ;;
        all)
            validate_deployment
            validate_services
            validate_metrics
            validate_queries
            validate_integration
            ;;
    esac

    # Generate report
    generate_report

    # Final summary
    echo ""
    echo "======================================"
    echo " Validation Complete"
    echo "======================================"
    echo ""
    echo "Results: $TESTS_PASSED/$TESTS_RUN tests passed"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        log_pass "All tests passed! System is fully functional."
        exit 0
    else
        log_warning "$TESTS_FAILED tests failed, but $FIXES_APPLIED fixes were applied."
        echo ""
        echo "To investigate further:"
        echo "  - Run with --verbose flag for detailed output"
        echo "  - Check service logs"
        echo "  - Review the validation report"
        exit 1
    fi
}

# Handle errors
trap 'log_fail "Validation failed! Check the error above."; exit 1' ERR

# Parse arguments and run
parse_args "$@"
main