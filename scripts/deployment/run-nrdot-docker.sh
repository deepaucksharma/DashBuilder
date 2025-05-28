#!/bin/bash
# NRDOT Docker Deployment Script
# Run NRDOT Plus in Docker with all features

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
COMPOSE_FILE="distributions/nrdot-plus/docker-compose.yaml"
ENV_FILE=".env.nrdot"

# Logging
log() {
    local level=$1
    shift
    case $level in
        INFO) echo -e "${BLUE}[INFO]${NC} $*" ;;
        PASS) echo -e "${GREEN}[PASS]${NC} $*" ;;
        FAIL) echo -e "${RED}[FAIL]${NC} $*" ;;
        WARN) echo -e "${YELLOW}[WARN]${NC} $*" ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log INFO "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &>/dev/null; then
        log FAIL "Docker not found. Please install Docker."
        exit 1
    fi
    
    # Check Docker Compose
    if ! docker compose version &>/dev/null && ! docker-compose --version &>/dev/null; then
        log FAIL "Docker Compose not found. Please install Docker Compose."
        exit 1
    fi
    
    # Check for license key
    if [[ -z "${NEW_RELIC_LICENSE_KEY:-}" ]]; then
        log WARN "NEW_RELIC_LICENSE_KEY not set in environment"
        
        # Check .env file
        if [[ -f "$ENV_FILE" ]] && grep -q "NEW_RELIC_LICENSE_KEY=" "$ENV_FILE"; then
            log INFO "Found license key in $ENV_FILE"
        else
            log FAIL "NEW_RELIC_LICENSE_KEY must be set"
            log INFO "Set it in environment or create $ENV_FILE"
            exit 1
        fi
    fi
    
    log PASS "Prerequisites check passed"
}

# Create environment file
create_env_file() {
    if [[ -f "$ENV_FILE" ]]; then
        log INFO "Using existing $ENV_FILE"
        return
    fi
    
    log INFO "Creating $ENV_FILE..."
    
    cat > "$ENV_FILE" << EOF
# NRDOT Docker Environment Configuration
# Generated: $(date)

# REQUIRED - New Relic License Key
NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY:-your-license-key-here}

# Optional - OTLP Endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net

# NRDOT Configuration
NRDOT_COLLECTION_INTERVAL=60s
NRDOT_RING=0
NRDOT_ACTIVE_PROFILE=balanced
NRDOT_MIN_IMPORTANCE=0.5
NRDOT_CPU_THRESHOLD=10.0
NRDOT_MEMORY_THRESHOLD_MB=100
NRDOT_TARGET_SERIES=5000
NRDOT_MAX_SERIES=10000

# Control Loop
NRDOT_ENABLE_CONTROL_LOOP=false

# Experiments
NRDOT_EXPERIMENT_ENABLED=false

# Host Information
HOSTNAME=$(hostname)
EOF
    
    log INFO "Created $ENV_FILE - please update NEW_RELIC_LICENSE_KEY"
}

# Build images
build_images() {
    log INFO "Building NRDOT Docker image..."
    
    cd distributions/nrdot-plus
    
    if docker compose build; then
        log PASS "Image built successfully"
    else
        log FAIL "Failed to build image"
        exit 1
    fi
    
    cd - >/dev/null
}

# Start services
start_services() {
    log INFO "Starting NRDOT services..."
    
    cd distributions/nrdot-plus
    
    # Use appropriate compose command
    if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
    
    # Start with env file
    if $COMPOSE_CMD --env-file "../../$ENV_FILE" up -d; then
        log PASS "Services started successfully"
    else
        log FAIL "Failed to start services"
        exit 1
    fi
    
    cd - >/dev/null
}

# Wait for health
wait_for_health() {
    log INFO "Waiting for services to be healthy..."
    
    local retries=30
    local count=0
    
    while [[ $count -lt $retries ]]; do
        if docker exec nrdot-plus-collector curl -sf http://localhost:13133/health >/dev/null 2>&1; then
            log PASS "Collector is healthy"
            return 0
        fi
        
        ((count++))
        log INFO "Waiting... ($count/$retries)"
        sleep 2
    done
    
    log FAIL "Collector failed to become healthy"
    return 1
}

# Show status
show_status() {
    log INFO "NRDOT Status:"
    
    # Container status
    docker ps --filter "name=nrdot-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    # Check metrics endpoint
    echo
    log INFO "Metrics endpoint: http://localhost:8888/metrics"
    
    # Sample metrics
    if curl -s http://localhost:8888/metrics | grep -q "nrdot_"; then
        log PASS "Metrics are being generated"
        
        # Show some key metrics
        echo
        log INFO "Sample metrics:"
        curl -s http://localhost:8888/metrics | grep -E "^(nrdot_|otelcol_)" | head -10
    else
        log WARN "No NRDOT metrics found yet"
    fi
    
    # Show logs
    echo
    log INFO "Recent logs:"
    docker logs --tail 20 nrdot-plus-collector 2>&1 | grep -v "^time=" || true
}

# Stop services
stop_services() {
    log INFO "Stopping NRDOT services..."
    
    cd distributions/nrdot-plus
    
    if docker compose down; then
        log PASS "Services stopped"
    else
        log WARN "Failed to stop services cleanly"
    fi
    
    cd - >/dev/null
}

# Main menu
show_menu() {
    echo
    echo "NRDOT Docker Management"
    echo "======================="
    echo "1. Start NRDOT"
    echo "2. Stop NRDOT"
    echo "3. Restart NRDOT"
    echo "4. Show Status"
    echo "5. View Logs"
    echo "6. Enable Control Loop"
    echo "7. Enable Experiments"
    echo "8. Run Validation"
    echo "9. Clean Up"
    echo "0. Exit"
    echo
}

# Handle menu choice
handle_choice() {
    local choice=$1
    
    case $choice in
        1) # Start
            check_prerequisites
            create_env_file
            build_images
            start_services
            wait_for_health
            show_status
            ;;
        2) # Stop
            stop_services
            ;;
        3) # Restart
            stop_services
            sleep 2
            start_services
            wait_for_health
            show_status
            ;;
        4) # Status
            show_status
            ;;
        5) # Logs
            log INFO "Showing logs (Ctrl+C to exit)..."
            docker logs -f nrdot-plus-collector
            ;;
        6) # Enable Control Loop
            log INFO "Enabling control loop..."
            sed -i.bak 's/NRDOT_ENABLE_CONTROL_LOOP=false/NRDOT_ENABLE_CONTROL_LOOP=true/' "$ENV_FILE"
            log INFO "Restart services to apply change"
            ;;
        7) # Enable Experiments
            log INFO "Enabling experiments..."
            sed -i.bak 's/NRDOT_EXPERIMENT_ENABLED=false/NRDOT_EXPERIMENT_ENABLED=true/' "$ENV_FILE"
            cd distributions/nrdot-plus
            docker compose --profile experiments up -d
            cd - >/dev/null
            ;;
        8) # Validation
            log INFO "Running validation..."
            docker exec nrdot-plus-collector curl -s http://localhost:13133/health
            echo
            curl -s http://localhost:8888/metrics | grep -c "^nrdot_" || echo "0 NRDOT metrics"
            curl -s http://localhost:8888/metrics | grep -c "^otelcol_" || echo "0 collector metrics"
            ;;
        9) # Clean up
            log WARN "This will remove all NRDOT containers and volumes!"
            read -p "Continue? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                cd distributions/nrdot-plus
                docker compose down -v
                cd - >/dev/null
                log INFO "Cleanup complete"
            fi
            ;;
        0) # Exit
            exit 0
            ;;
        *)
            log WARN "Invalid choice"
            ;;
    esac
}

# Quick start mode
quick_start() {
    log INFO "NRDOT Docker Quick Start"
    
    check_prerequisites
    create_env_file
    
    # Check if license key is set
    if grep -q "your-license-key-here" "$ENV_FILE"; then
        log FAIL "Please update NEW_RELIC_LICENSE_KEY in $ENV_FILE"
        exit 1
    fi
    
    build_images
    start_services
    wait_for_health
    show_status
    
    echo
    log PASS "NRDOT is running!"
    log INFO "View metrics: http://localhost:8888/metrics"
    log INFO "Health check: http://localhost:13133/health"
    log INFO "Stop with: $0 stop"
}

# Main execution
main() {
    case "${1:-menu}" in
        start)
            quick_start
            ;;
        stop)
            stop_services
            ;;
        restart)
            stop_services
            sleep 2
            quick_start
            ;;
        status)
            show_status
            ;;
        logs)
            docker logs -f nrdot-plus-collector
            ;;
        menu|*)
            while true; do
                show_menu
                read -p "Choice: " choice
                handle_choice "$choice"
                [[ "$choice" != "0" ]] && read -p "Press Enter to continue..."
            done
            ;;
    esac
}

# Run main
main "$@"