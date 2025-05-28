#!/bin/bash
# Master test runner for NRDOT v2
# Runs all test suites and generates a comprehensive report

set -euo pipefail

# Configuration
TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_ROOT/.." && pwd)"
REPORT_FILE="$TEST_ROOT/test-report-$(date +%Y%m%d-%H%M%S).txt"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Test suite tracking
SUITES_RUN=0
SUITES_PASSED=0
SUITES_FAILED=0

# Initialize report
init_report() {
    cat > "$REPORT_FILE" << EOF
NRDOT v2 Test Report
===================
Generated: $(date)
Project: $PROJECT_ROOT

Test Environment:
- OS: $(uname -s) $(uname -r)
- Docker: $(docker --version 2>/dev/null || echo "Not installed")
- Kubernetes: $(kubectl version --client --short 2>/dev/null || echo "Not installed")
- License Key: ${NEW_RELIC_LICENSE_KEY:+Set}${NEW_RELIC_LICENSE_KEY:-Not set}

EOF
}

# Run a test suite
run_suite() {
    local suite_name="$1"
    local suite_script="$2"
    
    echo -e "\n${BLUE}${BOLD}Running $suite_name${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    ((SUITES_RUN++))
    
    # Add to report
    {
        echo ""
        echo "Test Suite: $suite_name"
        echo "========================"
        echo "Started: $(date)"
    } >> "$REPORT_FILE"
    
    # Run the suite
    if [[ -f "$suite_script" && -x "$suite_script" ]]; then
        if "$suite_script" 2>&1 | tee -a "$REPORT_FILE"; then
            echo -e "${GREEN}✓ $suite_name PASSED${NC}"
            ((SUITES_PASSED++))
            echo "Status: PASSED" >> "$REPORT_FILE"
        else
            echo -e "${RED}✗ $suite_name FAILED${NC}"
            ((SUITES_FAILED++))
            echo "Status: FAILED" >> "$REPORT_FILE"
        fi
    else
        echo -e "${YELLOW}⚠ $suite_name SKIPPED (script not found or not executable)${NC}"
        echo "Status: SKIPPED" >> "$REPORT_FILE"
    fi
    
    echo "Completed: $(date)" >> "$REPORT_FILE"
}

# Pre-flight checks
preflight_checks() {
    echo -e "${BLUE}${BOLD}Pre-flight Checks${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local ready=true
    
    # Check for required tools
    for tool in bash awk grep sed; do
        if command -v "$tool" &> /dev/null; then
            echo -e "${GREEN}✓${NC} $tool found"
        else
            echo -e "${RED}✗${NC} $tool not found"
            ready=false
        fi
    done
    
    # Check for optional tools
    for tool in docker kubectl jq nc curl; do
        if command -v "$tool" &> /dev/null; then
            echo -e "${GREEN}✓${NC} $tool found (optional)"
        else
            echo -e "${YELLOW}⚠${NC} $tool not found (some tests may be skipped)"
        fi
    done
    
    # Check project structure
    if [[ -d "$PROJECT_ROOT/distributions/nrdot-plus" ]]; then
        echo -e "${GREEN}✓${NC} NRDOT distribution found"
    else
        echo -e "${RED}✗${NC} NRDOT distribution not found"
        ready=false
    fi
    
    if ! $ready; then
        echo -e "\n${RED}Pre-flight checks failed. Please install missing requirements.${NC}"
        exit 1
    fi
    
    echo -e "\n${GREEN}All required checks passed!${NC}"
}

# Run validation scripts
run_validation_tests() {
    echo -e "\n${BLUE}${BOLD}Validation Tests${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Run the master validation script
    if [[ -x "$PROJECT_ROOT/scripts/validation/validate-complete-setup.sh" ]]; then
        run_suite "Complete Validation" "$PROJECT_ROOT/scripts/validation/validate-complete-setup.sh"
    fi
}

# Generate summary
generate_summary() {
    local total_tests=$SUITES_RUN
    local pass_rate=0
    if [[ $total_tests -gt 0 ]]; then
        pass_rate=$(awk -v p="$SUITES_PASSED" -v t="$total_tests" 'BEGIN { printf "%.1f", (p/t)*100 }')
    fi
    
    {
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "TEST SUMMARY"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Total Test Suites: $total_tests"
        echo "Passed: $SUITES_PASSED"
        echo "Failed: $SUITES_FAILED"
        echo "Pass Rate: ${pass_rate}%"
        echo ""
        echo "Report saved to: $REPORT_FILE"
    } | tee -a "$REPORT_FILE"
    
    # Console summary with colors
    echo -e "\n${BLUE}${BOLD}═══════════════════════════════════════${NC}"
    echo -e "${BLUE}${BOLD}           FINAL RESULTS               ${NC}"
    echo -e "${BLUE}${BOLD}═══════════════════════════════════════${NC}"
    
    if [[ $SUITES_FAILED -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}✓ ALL TESTS PASSED! (${pass_rate}%)${NC}"
        echo -e "${GREEN}Great job! NRDOT v2 is functioning correctly.${NC}"
    else
        echo -e "${RED}${BOLD}✗ SOME TESTS FAILED (${pass_rate}% pass rate)${NC}"
        echo -e "${YELLOW}Please review the failing tests in the report.${NC}"
    fi
    
    echo -e "\n${BOLD}Full report: $REPORT_FILE${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}${BOLD}╔═══════════════════════════════════════╗${NC}"
    echo -e "${BLUE}${BOLD}║      NRDOT v2 Test Suite Runner       ║${NC}"
    echo -e "${BLUE}${BOLD}╚═══════════════════════════════════════╝${NC}"
    
    # Initialize
    init_report
    
    # Pre-flight checks
    preflight_checks
    
    # Run test suites
    echo -e "\n${BLUE}${BOLD}Starting Test Execution${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Unit tests
    run_suite "Unit Tests - Calculations" "$TEST_ROOT/unit/test-nrdot-calculations.sh"
    
    # Functional tests
    run_suite "Functional Tests - Pipelines" "$TEST_ROOT/functional/test-nrdot-pipelines.sh"
    
    # Integration tests
    run_suite "Integration Tests" "$TEST_ROOT/integration/nrdot-integration-test.sh"
    
    # Validation tests
    run_validation_tests
    
    # Generate summary
    generate_summary
    
    # Exit with appropriate code
    if [[ $SUITES_FAILED -eq 0 ]]; then
        exit 0
    else
        exit 1
    fi
}

# Handle arguments
case "${1:-all}" in
    unit)
        run_suite "Unit Tests" "$TEST_ROOT/unit/test-nrdot-calculations.sh"
        ;;
    functional)
        run_suite "Functional Tests" "$TEST_ROOT/functional/test-nrdot-pipelines.sh"
        ;;
    integration)
        run_suite "Integration Tests" "$TEST_ROOT/integration/nrdot-integration-test.sh"
        ;;
    validation)
        run_validation_tests
        ;;
    all)
        main
        ;;
    *)
        echo "Usage: $0 [all|unit|functional|integration|validation]"
        echo "  all         - Run all test suites (default)"
        echo "  unit        - Run only unit tests"
        echo "  functional  - Run only functional tests"
        echo "  integration - Run only integration tests"
        echo "  validation  - Run only validation tests"
        exit 1
        ;;
esac