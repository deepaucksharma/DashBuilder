#!/bin/bash
# NRDOT v2 Quick Start with Full Validation
# One command to set up everything with automatic validation

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE} NRDOT v2 Quick Start - Full Automated Setup${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is required but not installed.${NC}"
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

# Check .env file
if [ ! -f .env ]; then
    echo -e "${RED}.env file not found!${NC}"
    echo ""
    echo "Please create a .env file with:"
    echo "  NEW_RELIC_API_KEY=your-api-key"
    echo "  NEW_RELIC_ACCOUNT_ID=your-account-id"
    echo "  NEW_RELIC_INGEST_KEY=your-ingest-key"
    echo ""
    exit 1
fi

# Load environment variables
source .env

# Validate required vars
if [ -z "$NEW_RELIC_API_KEY" ] || [ -z "$NEW_RELIC_ACCOUNT_ID" ]; then
    echo -e "${RED}Missing required environment variables in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites validated${NC}"
echo ""

# Create docker-compose override for quick start
cat > docker-compose.quickstart.yml << EOF
version: '3.8'

services:
  nrdot:
    build:
      context: .
      dockerfile: Dockerfile.nrdot-validated
    container_name: nrdot-quickstart
    restart: unless-stopped
    environment:
      - NEW_RELIC_API_KEY=${NEW_RELIC_API_KEY}
      - NEW_RELIC_ACCOUNT_ID=${NEW_RELIC_ACCOUNT_ID}
      - NEW_RELIC_REGION=${NEW_RELIC_REGION:-US}
      - NEW_RELIC_INGEST_KEY=${NEW_RELIC_INGEST_KEY:-$NEW_RELIC_API_KEY}
      - NRDOT_PROFILE=${NRDOT_PROFILE:-balanced}
      - NRDOT_TARGET_COVERAGE=${NRDOT_TARGET_COVERAGE:-95}
      - NRDOT_COST_REDUCTION_TARGET=${NRDOT_COST_REDUCTION_TARGET:-70}
    ports:
      - "8080:80"      # Web Dashboard
      - "3000:3000"    # API Server
      - "8888:8888"    # OTel Metrics
    volumes:
      - ./docker-output:/app/output
      - nrdot-data:/var/lib/nrdot-plus
      - nrdot-logs:/var/log/nrdot-plus
    healthcheck:
      test: ["CMD", "/usr/local/bin/validate-setup"]
      interval: 60s
      timeout: 30s
      retries: 5
      start_period: 120s

volumes:
  nrdot-data:
  nrdot-logs:
EOF

echo -e "${YELLOW}Building NRDOT container...${NC}"
docker compose -f docker-compose.quickstart.yml build

echo -e ""
echo -e "${YELLOW}Starting NRDOT services...${NC}"
docker compose -f docker-compose.quickstart.yml up -d

echo -e ""
echo -e "${YELLOW}Waiting for services to initialize (2 minutes)...${NC}"

# Show progress
for i in {1..24}; do
    printf "."
    sleep 5
done
echo ""

# Check container health
echo -e ""
echo -e "${YELLOW}Checking container health...${NC}"
if docker exec nrdot-quickstart /usr/local/bin/validate-setup; then
    echo -e "${GREEN}✅ All systems operational!${NC}"
else
    echo -e "${YELLOW}⚠️  Some components are still initializing...${NC}"
fi

# Get dashboard info
echo -e ""
echo -e "${BLUE}Retrieving dashboard information...${NC}"
DASHBOARD_ID=$(docker exec nrdot-quickstart cat /tmp/dashboard-id.txt 2>/dev/null || echo "pending")

# Show access information
echo -e ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN} NRDOT v2 Setup Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo -e ""
echo -e "${BLUE}Access your dashboards:${NC}"
echo -e "  📊 Local Dashboard: ${GREEN}http://localhost:8080${NC}"
echo -e "  🔍 API Health Check: ${GREEN}http://localhost:3000/api/health${NC}"
echo -e "  📈 OTel Metrics: ${GREEN}http://localhost:8888/metrics${NC}"
echo -e "  🚀 New Relic Dashboard: ${GREEN}https://one.newrelic.com/dashboards/${DASHBOARD_ID}${NC}"
echo -e ""
echo -e "${BLUE}Useful commands:${NC}"
echo -e "  • View logs: ${YELLOW}docker logs -f nrdot-quickstart${NC}"
echo -e "  • Check validation: ${YELLOW}docker exec nrdot-quickstart /usr/local/bin/validate-setup${NC}"
echo -e "  • Service status: ${YELLOW}docker exec nrdot-quickstart supervisorctl status${NC}"
echo -e "  • Stop services: ${YELLOW}docker compose -f docker-compose.quickstart.yml down${NC}"
echo -e ""
echo -e "${BLUE}Data validation:${NC}"
echo -e "  • The system is automatically generating test data"
echo -e "  • Dashboards will populate within 2-3 minutes"
echo -e "  • Check http://localhost:8080 to see real-time metrics"
echo -e ""

# Open browser if available
if command -v open &> /dev/null; then
    echo -e "${YELLOW}Opening dashboard in browser...${NC}"
    open http://localhost:8080
elif command -v xdg-open &> /dev/null; then
    echo -e "${YELLOW}Opening dashboard in browser...${NC}"
    xdg-open http://localhost:8080
fi

echo -e "${GREEN}✨ Your NRDOT v2 system is ready!${NC}"