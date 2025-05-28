#!/bin/bash
# NRDOT v2 Complete Startup Script - Ensures EVERYTHING Works
set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
COMPOSE_FILE="docker-compose-complete.yml"
MAX_WAIT_TIME=300  # 5 minutes
CHECK_INTERVAL=10  # 10 seconds

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE} NRDOT v2 Complete System Startup${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Functions
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

check_prerequisites() {
    log "${YELLOW}Checking prerequisites...${NC}"
    
    local missing=()
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        missing+=("Docker")
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        missing+=("Docker Compose")
    fi
    
    # Check .env file
    if [ ! -f .env ]; then
        missing+=(".env file")
    else
        # Validate critical variables
        source .env
        if [ -z "${NEW_RELIC_API_KEY:-}" ]; then
            missing+=("NEW_RELIC_API_KEY in .env")
        fi
        if [ -z "${NEW_RELIC_ACCOUNT_ID:-}" ]; then
            missing+=("NEW_RELIC_ACCOUNT_ID in .env")
        fi
        if [ -z "${NEW_RELIC_LICENSE_KEY:-}" ] && [ -z "${NEW_RELIC_INGEST_KEY:-}" ]; then
            log "${YELLOW}⚠ Neither NEW_RELIC_LICENSE_KEY nor NEW_RELIC_INGEST_KEY set${NC}"
            log "${YELLOW}  Using API key for ingestion (this might not work)${NC}"
        fi
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log "${RED}Missing prerequisites: ${missing[*]}${NC}"
        exit 1
    fi
    
    log "${GREEN}✓ All prerequisites satisfied${NC}"
}

prepare_configs() {
    log "${YELLOW}Preparing configurations...${NC}"
    
    # Create configs directory
    mkdir -p configs
    
    # Create Prometheus config if missing
    if [ ! -f configs/prometheus.yml ]; then
        cat > configs/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['nrdot-complete:8888']
    metrics_path: '/metrics'
    
  - job_name: 'otel-collector-dedicated'
    static_configs:
      - targets: ['nrdot-otel:8888']
    metrics_path: '/metrics'
EOF
        log "${GREEN}✓ Created prometheus.yml${NC}"
    fi
    
    # Create Grafana provisioning if missing
    mkdir -p configs/grafana-provisioning/{dashboards,datasources}
    
    if [ ! -f configs/grafana-provisioning/datasources/prometheus.yml ]; then
        cat > configs/grafana-provisioning/datasources/prometheus.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
    
  - name: NewRelic
    type: fifemon-graphql-datasource
    access: proxy
    jsonData:
      nrql_endpoint: https://api.newrelic.com/graphql
    secureJsonData:
      api_key: ${NEW_RELIC_API_KEY}
    editable: true
EOF
        log "${GREEN}✓ Created Grafana datasources${NC}"
    fi
}

start_services() {
    log "${YELLOW}Starting Docker services...${NC}"
    
    # Determine docker-compose command
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="docker compose"
    fi
    
    # Stop any existing containers
    log "Stopping existing containers..."
    $COMPOSE_CMD -f $COMPOSE_FILE down 2>/dev/null || true
    
    # Remove old volumes if requested
    if [ "${CLEAN_START:-false}" = "true" ]; then
        log "${YELLOW}Cleaning old volumes...${NC}"
        $COMPOSE_CMD -f $COMPOSE_FILE down -v 2>/dev/null || true
    fi
    
    # Build images
    log "Building Docker images..."
    $COMPOSE_CMD -f $COMPOSE_FILE build
    
    # Start main services
    log "Starting main services..."
    $COMPOSE_CMD -f $COMPOSE_FILE up -d nrdot-complete metrics-generator
    
    # Optionally start monitoring stack
    if [ "${WITH_MONITORING:-true}" = "true" ]; then
        log "Starting monitoring stack..."
        $COMPOSE_CMD -f $COMPOSE_FILE --profile monitoring up -d
    fi
    
    log "${GREEN}✓ Services started${NC}"
}

wait_for_health() {
    log "${YELLOW}Waiting for services to be healthy...${NC}"
    
    local elapsed=0
    local healthy=false
    
    while [ $elapsed -lt $MAX_WAIT_TIME ]; do
        # Check container health
        if docker inspect nrdot-complete --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy"; then
            healthy=true
            break
        fi
        
        log "  Services starting... ($elapsed/$MAX_WAIT_TIME seconds)"
        sleep $CHECK_INTERVAL
        elapsed=$((elapsed + CHECK_INTERVAL))
    done
    
    if [ "$healthy" = false ]; then
        log "${RED}✗ Services failed to become healthy${NC}"
        show_logs
        return 1
    fi
    
    log "${GREEN}✓ Services are healthy${NC}"
}

verify_data_ingestion() {
    log "${YELLOW}Verifying data ingestion...${NC}"
    
    # Wait a bit for initial data
    log "Waiting 60 seconds for initial data..."
    sleep 60
    
    # Run diagnostics
    log "Running ingestion diagnostics..."
    docker exec nrdot-complete /usr/local/bin/fix-ingestion > ingestion-diagnostic.log 2>&1 || true
    
    # Check for successful ingestion
    if grep -q "✓ Test metric found in New Relic" ingestion-diagnostic.log; then
        log "${GREEN}✓ Data ingestion verified!${NC}"
        return 0
    else
        log "${RED}✗ Data ingestion not working${NC}"
        log "Diagnostic output:"
        grep -E "(✓|✗|⚠)" ingestion-diagnostic.log || true
        return 1
    fi
}

run_validation() {
    log "${YELLOW}Running comprehensive validation...${NC}"
    
    # Run validation inside container
    docker exec nrdot-complete /usr/local/bin/validate-setup > validation-report.log 2>&1 || true
    
    # Check results
    if grep -q "All validation checks passed" validation-report.log; then
        log "${GREEN}✓ All validation checks passed!${NC}"
    else
        log "${YELLOW}⚠ Some validation checks failed:${NC}"
        grep -E "(PASS|FAIL|WARN)" validation-report.log | tail -10
    fi
}

show_access_info() {
    log ""
    log "${GREEN}================================================${NC}"
    log "${GREEN} NRDOT v2 System Successfully Started!${NC}"
    log "${GREEN}================================================${NC}"
    log ""
    log "${BLUE}Access Points:${NC}"
    log "  📊 Local Dashboard: ${GREEN}http://localhost:8080${NC}"
    log "  🔍 API Health: ${GREEN}http://localhost:3000/api/health${NC}"
    log "  📈 Metrics: ${GREEN}http://localhost:8888/metrics${NC}"
    log "  🔧 Diagnostics: ${GREEN}http://localhost:3000/api/diagnostics${NC}"
    
    if [ "${WITH_MONITORING:-true}" = "true" ]; then
        log "  📊 Prometheus: ${GREEN}http://localhost:9090${NC}"
        log "  📈 Grafana: ${GREEN}http://localhost:3002${NC} (admin/nrdot)"
    fi
    
    log ""
    log "${BLUE}Useful Commands:${NC}"
    log "  • View logs: ${YELLOW}docker logs -f nrdot-complete${NC}"
    log "  • Run diagnostics: ${YELLOW}docker exec nrdot-complete /usr/local/bin/fix-ingestion${NC}"
    log "  • Check validation: ${YELLOW}docker exec nrdot-complete /usr/local/bin/validate-setup${NC}"
    log "  • Monitor health: ${YELLOW}watch 'docker exec nrdot-complete curl -s localhost:3000/api/health | jq .'${NC}"
    log ""
    log "${BLUE}Troubleshooting:${NC}"
    log "  • If no data appears, check: ${YELLOW}cat ingestion-diagnostic.log${NC}"
    log "  • View container logs: ${YELLOW}docker logs nrdot-complete | grep ERROR${NC}"
    log "  • Check metrics generator: ${YELLOW}docker logs metrics-generator${NC}"
}

show_logs() {
    log "${YELLOW}Recent container logs:${NC}"
    docker logs --tail 50 nrdot-complete 2>&1 | grep -E "(ERROR|FAIL|WARN)" || true
}

handle_failure() {
    log "${RED}================================================${NC}"
    log "${RED} Startup Failed - Troubleshooting${NC}"
    log "${RED}================================================${NC}"
    
    # Show recent logs
    show_logs
    
    # Check common issues
    log ""
    log "${YELLOW}Common Issues:${NC}"
    log "1. Invalid API keys - check NEW_RELIC_LICENSE_KEY vs NEW_RELIC_API_KEY"
    log "2. Wrong region - ensure NEW_RELIC_REGION matches your account"
    log "3. Network issues - check firewall/proxy settings"
    log "4. Account permissions - ensure API key has data ingest permissions"
    log ""
    log "Run diagnostics: ${YELLOW}docker exec nrdot-complete /usr/local/bin/fix-ingestion${NC}"
}

# Main execution
main() {
    log "${BLUE}Starting NRDOT v2 Complete System${NC}"
    
    # Check prerequisites
    check_prerequisites
    
    # Prepare configurations
    prepare_configs
    
    # Start services
    start_services
    
    # Wait for health
    if ! wait_for_health; then
        handle_failure
        exit 1
    fi
    
    # Verify data ingestion
    if ! verify_data_ingestion; then
        log "${YELLOW}⚠ Data ingestion issues detected${NC}"
        log "Attempting automatic fix..."
        
        # Try to fix automatically
        docker exec nrdot-complete bash -c "
            supervisorctl restart otelcol
            supervisorctl restart test-data-generator
            supervisorctl restart metrics-generator
        "
        
        # Wait and retry
        sleep 30
        if ! verify_data_ingestion; then
            handle_failure
            exit 1
        fi
    fi
    
    # Run validation
    run_validation
    
    # Show access information
    show_access_info
    
    # Open browser if available
    if command -v open &> /dev/null; then
        log "${YELLOW}Opening dashboard in browser...${NC}"
        sleep 2
        open http://localhost:8080
    elif command -v xdg-open &> /dev/null; then
        log "${YELLOW}Opening dashboard in browser...${NC}"
        sleep 2
        xdg-open http://localhost:8080
    fi
    
    log ""
    log "${GREEN}✨ NRDOT v2 is ready for use!${NC}"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_START=true
            shift
            ;;
        --no-monitoring)
            WITH_MONITORING=false
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --clean          Clean start (remove old volumes)"
            echo "  --no-monitoring  Don't start Prometheus/Grafana"
            echo "  --help           Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main
main "$@"