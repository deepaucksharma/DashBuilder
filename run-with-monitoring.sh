#!/bin/bash
set -euo pipefail

# Run DashBuilder with comprehensive monitoring
# This script sets up full observability stack

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        exit 1
    fi
    
    # Check docker-compose
    if ! command -v docker-compose &> /dev/null; then
        error "docker-compose is not installed"
        exit 1
    fi
    
    # Check .env file
    if [ ! -f .env ]; then
        error ".env file not found. Please create one from .env.example"
        exit 1
    fi
    
    # Source .env file
    source .env
    
    # Check required environment variables
    REQUIRED_VARS=(
        "NEW_RELIC_LICENSE_KEY"
        "NEW_RELIC_API_KEY"
        "NEW_RELIC_ACCOUNT_ID"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if [ -z "${!var:-}" ]; then
            error "$var is not set in .env file"
            exit 1
        fi
    done
    
    log "Prerequisites check passed"
}

# Setup directories
setup_directories() {
    log "Setting up directories..."
    
    # Create necessary directories
    mkdir -p logs/{dashbuilder,otel,control-loop}
    mkdir -p data/{prometheus,grafana,tempo}
    mkdir -p configs/grafana-provisioning/{dashboards,datasources,notifiers}
    
    # Set permissions
    chmod -R 755 logs data
    
    log "Directories created"
}

# Setup Docker secrets
setup_secrets() {
    log "Setting up Docker secrets..."
    
    if [ -f scripts/setup-docker-secrets.sh ]; then
        bash scripts/setup-docker-secrets.sh
    else
        warning "Docker secrets script not found, using environment variables"
    fi
}

# Generate Grafana provisioning
generate_grafana_provisioning() {
    log "Generating Grafana provisioning configuration..."
    
    # Create datasources provisioning
    cat > configs/grafana-provisioning/datasources/all.yml << EOF
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    basicAuth: false
    isDefault: true
    editable: true
    
  - name: Jaeger
    type: jaeger
    access: proxy
    url: http://jaeger:16686
    basicAuth: false
    editable: true
    
  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    basicAuth: false
    editable: true
    
  - name: New Relic
    type: newrelic-datasource
    access: proxy
    jsonData:
      accountId: ${NEW_RELIC_ACCOUNT_ID}
    secureJsonData:
      apiKey: ${NEW_RELIC_API_KEY}
    editable: true
EOF

    # Create dashboards provisioning
    cat > configs/grafana-provisioning/dashboards/all.yml << EOF
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
EOF

    log "Grafana provisioning configured"
}

# Start monitoring stack
start_monitoring() {
    local MODE="${1:-comprehensive}"
    
    log "Starting DashBuilder with $MODE monitoring..."
    
    # Stop any existing containers
    docker-compose down
    
    # Pull latest images
    log "Pulling latest images..."
    docker-compose pull
    
    # Build custom images
    log "Building custom images..."
    docker-compose build
    
    # Start services
    log "Starting services..."
    
    # Export monitoring mode
    export OPTIMIZATION_MODE="$MODE"
    
    # Start services
    docker-compose up -d
    
    # Wait for services to be healthy
    log "Waiting for services to be healthy..."
    sleep 10
    
    # Check service health
    check_service_health
}

# Check service health
check_service_health() {
    log "Checking service health..."
    
    SERVICES=(
        "dashbuilder:3000/health"
        "nrdot-collector:13133/health"
        "prometheus:9091/api/v1/query?query=up"
        "grafana:3001/api/health"
        "jaeger:16686/api/services"
    )
    
    for service in "${SERVICES[@]}"; do
        SERVICE_NAME="${service%%:*}"
        SERVICE_URL="${service#*:}"
        
        if curl -sf "http://localhost:${SERVICE_URL}" > /dev/null 2>&1; then
            info "✓ $SERVICE_NAME is healthy"
        else
            warning "✗ $SERVICE_NAME is not responding"
        fi
    done
}

# Show logs
show_logs() {
    local SERVICE="${1:-all}"
    
    if [ "$SERVICE" = "all" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f "$SERVICE"
    fi
}

# Show metrics
show_metrics() {
    log "Current metrics endpoints:"
    echo ""
    echo "  DashBuilder:         http://localhost:3000"
    echo "  Prometheus:          http://localhost:9091"
    echo "  Grafana:             http://localhost:3001 (admin/changeme)"
    echo "  Jaeger UI:           http://localhost:16686"
    echo "  OTEL Collector:      http://localhost:8888/metrics"
    echo "  Node Exporter:       http://localhost:9100/metrics"
    echo "  cAdvisor:            http://localhost:8080"
    echo ""
    
    # Show quick metrics
    log "Quick metrics check:"
    
    # Check OTEL collector metrics
    if curl -sf http://localhost:8888/metrics | grep -q "otelcol_"; then
        info "✓ OTEL Collector is reporting metrics"
    fi
    
    # Check Prometheus targets
    TARGETS=$(curl -sf http://localhost:9091/api/v1/targets | jq -r '.data.activeTargets | length' 2>/dev/null || echo "0")
    info "✓ Prometheus is scraping $TARGETS targets"
}

# Run experiments
run_experiments() {
    log "Running NRDOT experiments with full monitoring..."
    
    docker exec nrdot-control-loop node scripts/control-loop.js experiment all
}

# Stop monitoring
stop_monitoring() {
    log "Stopping monitoring stack..."
    docker-compose down
}

# Main menu
show_menu() {
    echo ""
    echo "DashBuilder Monitoring Control"
    echo "=============================="
    echo "1. Start with comprehensive monitoring"
    echo "2. Start with balanced monitoring"
    echo "3. Check service health"
    echo "4. Show metrics endpoints"
    echo "5. View logs (all services)"
    echo "6. View specific service logs"
    echo "7. Run experiments"
    echo "8. Stop all services"
    echo "9. Exit"
    echo ""
}

# Main function
main() {
    check_prerequisites
    setup_directories
    setup_secrets
    generate_grafana_provisioning
    
    # Parse command line arguments
    case "${1:-menu}" in
        start)
            start_monitoring "${2:-comprehensive}"
            show_metrics
            ;;
        stop)
            stop_monitoring
            ;;
        logs)
            show_logs "${2:-all}"
            ;;
        health)
            check_service_health
            ;;
        metrics)
            show_metrics
            ;;
        experiment)
            run_experiments
            ;;
        menu|*)
            while true; do
                show_menu
                read -p "Select an option: " choice
                
                case $choice in
                    1) start_monitoring "comprehensive"; show_metrics ;;
                    2) start_monitoring "balanced"; show_metrics ;;
                    3) check_service_health ;;
                    4) show_metrics ;;
                    5) show_logs "all" ;;
                    6)
                        read -p "Enter service name: " service
                        show_logs "$service"
                        ;;
                    7) run_experiments ;;
                    8) stop_monitoring ;;
                    9) exit 0 ;;
                    *) warning "Invalid option" ;;
                esac
                
                echo ""
                read -p "Press Enter to continue..."
            done
            ;;
    esac
}

# Run main function
main "$@"