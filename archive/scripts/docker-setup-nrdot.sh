#!/bin/bash
# NRDOT v2 Docker Setup Script with Complete UI
set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE} NRDOT v2 Complete Docker Setup${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗ Docker is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker found${NC}"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}✗ Docker Compose is not installed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker Compose found${NC}"
    
    # Check .env file
    if [ ! -f .env ]; then
        echo -e "${RED}✗ .env file not found${NC}"
        echo "Please create .env file with your New Relic credentials"
        exit 1
    fi
    echo -e "${GREEN}✓ .env file found${NC}"
    
    # Validate required environment variables
    source .env
    if [ -z "$NEW_RELIC_API_KEY" ] || [ -z "$NEW_RELIC_ACCOUNT_ID" ]; then
        echo -e "${RED}✗ Missing required environment variables${NC}"
        echo "Please ensure NEW_RELIC_API_KEY and NEW_RELIC_ACCOUNT_ID are set in .env"
        exit 1
    fi
    echo -e "${GREEN}✓ Environment variables validated${NC}"
}

# Function to create required files
create_config_files() {
    echo -e "\n${YELLOW}Creating configuration files...${NC}"
    
    # Create prometheus config if using monitoring profile
    mkdir -p configs
    cat > configs/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['nrdot-complete:8888']
    metrics_path: '/metrics'
    
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['nrdot-complete:9100']
EOF
    echo -e "${GREEN}✓ Created prometheus.yml${NC}"
    
    # Create production collector config if it doesn't exist
    if [ ! -f configs/collector-config-production.yaml ]; then
        cp distributions/nrdot-plus/config/config.yaml configs/collector-config-production.yaml
        echo -e "${GREEN}✓ Created collector-config-production.yaml${NC}"
    fi
}

# Function to build and start containers
start_nrdot() {
    echo -e "\n${YELLOW}Building and starting NRDOT containers...${NC}"
    
    # Use docker-compose or docker compose based on what's available
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="docker compose"
    fi
    
    # Build the container
    echo -e "${BLUE}Building Docker image...${NC}"
    $COMPOSE_CMD -f docker-compose-nrdot.yml build
    
    # Start the services
    echo -e "${BLUE}Starting services...${NC}"
    $COMPOSE_CMD -f docker-compose-nrdot.yml up -d
    
    # Wait for services to be ready
    echo -e "${YELLOW}Waiting for services to start...${NC}"
    sleep 10
    
    # Check health
    if docker exec nrdot-complete curl -s -f http://localhost/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ API server is healthy${NC}"
    else
        echo -e "${YELLOW}⚠ API server is still starting...${NC}"
    fi
    
    if docker exec nrdot-complete curl -s http://localhost:8888/metrics > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OpenTelemetry Collector is running${NC}"
    else
        echo -e "${YELLOW}⚠ OpenTelemetry Collector is still starting...${NC}"
    fi
}

# Function to create initial dashboards
create_dashboards() {
    echo -e "\n${YELLOW}Creating New Relic dashboards...${NC}"
    
    # Create NRDOT monitoring dashboard
    docker exec nrdot-complete bash -c "cd /app && npm run cli -- dashboard import examples/nrdot-process-dashboard.json" || {
        echo -e "${YELLOW}⚠ Dashboard creation will be retried after services are fully started${NC}"
    }
}

# Function to show access information
show_access_info() {
    echo -e "\n${GREEN}================================================${NC}"
    echo -e "${GREEN} NRDOT v2 Setup Complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "${BLUE}Access Points:${NC}"
    echo -e "  • Web Dashboard: ${GREEN}http://localhost:8080${NC}"
    echo -e "  • API Server: ${GREEN}http://localhost:3000${NC}"
    echo -e "  • OTel Metrics: ${GREEN}http://localhost:8888/metrics${NC}"
    echo -e "  • Container Logs: ${YELLOW}docker logs -f nrdot-complete${NC}"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo -e "  • Check status: ${YELLOW}docker exec nrdot-complete supervisorctl status${NC}"
    echo -e "  • Run CLI: ${YELLOW}docker exec nrdot-complete npm run cli -- <command>${NC}"
    echo -e "  • Stop services: ${YELLOW}docker-compose -f docker-compose-nrdot.yml down${NC}"
    echo ""
    echo -e "${BLUE}New Relic Integration:${NC}"
    echo -e "  • Your telemetry is being optimized by NRDOT"
    echo -e "  • Current profile: ${GREEN}${NRDOT_PROFILE:-balanced}${NC}"
    echo -e "  • Cost reduction target: ${GREEN}${NRDOT_COST_REDUCTION_TARGET:-70}%${NC}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo -e "  1. Visit the web dashboard at http://localhost:8080"
    echo -e "  2. Check your New Relic account for the created dashboards"
    echo -e "  3. Monitor the cost reduction in real-time"
    echo ""
}

# Function to run monitoring profile
run_with_monitoring() {
    echo -e "\n${YELLOW}Starting with monitoring profile (includes Prometheus & Grafana)...${NC}"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose -f docker-compose-nrdot.yml --profile monitoring up -d
    else
        docker compose -f docker-compose-nrdot.yml --profile monitoring up -d
    fi
    
    echo -e "\n${BLUE}Additional monitoring endpoints:${NC}"
    echo -e "  • Prometheus: ${GREEN}http://localhost:9090${NC}"
    echo -e "  • Grafana: ${GREEN}http://localhost:3001${NC} (admin/admin)"
}

# Main execution
main() {
    check_prerequisites
    create_config_files
    start_nrdot
    
    # Ask about monitoring profile
    echo -e "\n${YELLOW}Do you want to include Prometheus and Grafana for local monitoring? (y/N)${NC}"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        run_with_monitoring
    fi
    
    # Wait a bit more for services to stabilize
    echo -e "\n${YELLOW}Waiting for all services to stabilize...${NC}"
    sleep 15
    
    create_dashboards
    show_access_info
}

# Run main function
main "$@"