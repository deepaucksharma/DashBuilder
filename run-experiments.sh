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
    log_error ".env file not found!"
    exit 1
fi

# Source .env file
set -a
source .env
set +a

# Commands
start() {
    log_info "Starting NRDOT experiments..."
    
    # Create logs directory
    mkdir -p logs/{baseline,optimized,conservative,aggressive}
    
    # Build images
    log_info "Building Docker images..."
    if [ -f docker-compose-experiments.yml ]; then
        docker-compose -f docker-compose-experiments.yml build
    else
        log_error "docker-compose-experiments.yml not found!"
        exit 1
    fi
    
    # Start containers
    if [ "$1" = "all" ]; then
        log_info "Starting all experiments..."
        docker-compose -f docker-compose-experiments.yml --profile experiments up -d
    else
        log_info "Starting baseline and optimized collectors..."
        docker-compose -f docker-compose-experiments.yml up -d dashbuilder nrdot-baseline nrdot-optimized
    fi
    
    log_success "Experiments started!"
    
    echo ""
    log_info "Collector endpoints:"
    echo "  Baseline:     http://localhost:8881/metrics"
    echo "  Optimized:    http://localhost:8882/metrics"
    if [ "$1" = "all" ]; then
        echo "  Conservative: http://localhost:8883/metrics"
        echo "  Aggressive:   http://localhost:8884/metrics"
    fi
    
    echo ""
    log_info "Health checks:"
    echo "  Baseline:     http://localhost:13133/health"
    echo "  Optimized:    http://localhost:13134/health"
    if [ "$1" = "all" ]; then
        echo "  Conservative: http://localhost:13135/health"
        echo "  Aggressive:   http://localhost:13136/health"
    fi
}

stop() {
    log_info "Stopping NRDOT experiments..."
    docker-compose -f docker-compose-experiments.yml down
    log_success "Experiments stopped!"
}

status() {
    log_info "Checking experiment status..."
    docker-compose -f docker-compose-experiments.yml ps
    
    echo ""
    log_info "Checking collector health..."
    
    # Check baseline
    if curl -sf http://localhost:13133/health > /dev/null 2>&1; then
        log_success "Baseline collector: HEALTHY"
    else
        log_error "Baseline collector: NOT RESPONDING"
    fi
    
    # Check optimized
    if curl -sf http://localhost:13134/health > /dev/null 2>&1; then
        log_success "Optimized collector: HEALTHY"
    else
        log_error "Optimized collector: NOT RESPONDING"
    fi
}

logs() {
    if [ -z "${1:-}" ]; then
        docker-compose -f docker-compose-experiments.yml logs -f
    else
        EXPERIMENT="$1"
        docker-compose -f docker-compose-experiments.yml logs -f "nrdot-$EXPERIMENT"
    fi
}

metrics() {
    EXPERIMENT="${1:-baseline}"
    PORT="${2:-8881}"
    
    log_info "Fetching metrics from $EXPERIMENT collector..."
    curl -s "http://localhost:$PORT/metrics" | head -50
}

# Main
case "${1:-}" in
    start)
        start "${2:-}"
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        sleep 2
        start "${2:-}"
        ;;
    status)
        status
        ;;
    logs)
        logs "${2:-}"
        ;;
    metrics)
        metrics "${2:-}" "${3:-}"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|metrics} [experiment]"
        echo ""
        echo "Commands:"
        echo "  start [all]     - Start experiments (default: baseline & optimized)"
        echo "  stop            - Stop all experiments"
        echo "  restart [all]   - Restart experiments"
        echo "  status          - Check experiment status"
        echo "  logs [name]     - View logs (name: baseline, optimized, etc)"
        echo "  metrics [name]  - View Prometheus metrics"
        exit 1
        ;;
esac