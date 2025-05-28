#!/bin/bash
# NRDOT Experiments Runner
# Starts multiple NRDOT collectors with different optimization profiles

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Check for .env file
if [ ! -f .env ]; then
    log_error ".env file not found. Please create it with your New Relic credentials."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Validate required variables
if [ -z "${NEW_RELIC_API_KEY:-}" ]; then
    log_error "NEW_RELIC_API_KEY not set in .env file"
    exit 1
fi

# Command line arguments
COMMAND="${1:-start}"

case "$COMMAND" in
    start)
        log_info "Starting NRDOT experiments..."
        
        # Build images
        log_info "Building Docker images..."
        docker-compose -f docker-compose-experiments.yml build
        
        # Start baseline and optimized by default
        log_info "Starting baseline and optimized collectors..."
        docker-compose -f docker-compose-experiments.yml up -d dashbuilder nrdot-baseline nrdot-optimized
        
        # Optional: Start all experiments
        if [ "${2:-}" == "all" ]; then
            log_info "Starting all experiment profiles..."
            docker-compose -f docker-compose-experiments.yml --profile experiments up -d
        fi
        
        log_success "Experiments started!"
        echo ""
        log_info "Collector endpoints:"
        echo "  Baseline:     http://localhost:8881/metrics"
        echo "  Optimized:    http://localhost:8882/metrics"
        if [ "${2:-}" == "all" ]; then
            echo "  Conservative: http://localhost:8883/metrics"
            echo "  Aggressive:   http://localhost:8884/metrics"
        fi
        echo ""
        log_info "Health checks:"
        echo "  Baseline:     http://localhost:13133/health"
        echo "  Optimized:    http://localhost:13134/health"
        ;;
        
    stop)
        log_info "Stopping NRDOT experiments..."
        docker-compose -f docker-compose-experiments.yml down
        log_success "Experiments stopped!"
        ;;
        
    status)
        log_info "Checking experiment status..."
        docker-compose -f docker-compose-experiments.yml ps
        
        echo ""
        log_info "Checking collector health..."
        
        # Check baseline
        if curl -s http://localhost:13133/health > /dev/null 2>&1; then
            log_success "Baseline collector: HEALTHY"
            echo "  Metrics: $(curl -s http://localhost:8881/metrics | grep -c '^process' || echo 0) process metrics"
        else
            log_error "Baseline collector: NOT RESPONDING"
        fi
        
        # Check optimized
        if curl -s http://localhost:13134/health > /dev/null 2>&1; then
            log_success "Optimized collector: HEALTHY"
            echo "  Metrics: $(curl -s http://localhost:8882/metrics | grep -c '^process' || echo 0) process metrics"
        else
            log_error "Optimized collector: NOT RESPONDING"
        fi
        ;;
        
    logs)
        EXPERIMENT="${2:-all}"
        if [ "$EXPERIMENT" == "all" ]; then
            docker-compose -f docker-compose-experiments.yml logs -f
        else
            docker-compose -f docker-compose-experiments.yml logs -f "nrdot-$EXPERIMENT"
        fi
        ;;
        
    verify)
        log_info "Verifying data in New Relic..."
        cd scripts
        
        # Check baseline experiment
        log_info "Checking baseline experiment data..."
        node src/cli.js nrql validate "SELECT count(*) FROM Metric WHERE experiment.name = 'baseline' SINCE 5 minutes ago"
        
        # Check optimized experiment
        log_info "Checking optimized experiment data..."
        node src/cli.js nrql validate "SELECT count(*) FROM Metric WHERE experiment.name = 'optimized' SINCE 5 minutes ago"
        
        # Compare process counts
        log_info "Comparing process metrics between experiments..."
        node src/cli.js nrql validate "SELECT uniqueCount(dimensions.process.executable.name) FROM Metric WHERE metricName LIKE 'process.%' FACET experiment.name SINCE 5 minutes ago"
        ;;
        
    *)
        echo "Usage: $0 {start|stop|status|logs|verify} [all|baseline|optimized|conservative|aggressive]"
        echo ""
        echo "Commands:"
        echo "  start [all]  - Start experiments (default: baseline + optimized)"
        echo "  stop         - Stop all experiments"
        echo "  status       - Check experiment status"
        echo "  logs [name]  - View logs for specific experiment or all"
        echo "  verify       - Verify data in New Relic"
        exit 1
        ;;
esac