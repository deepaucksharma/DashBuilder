#!/bin/bash
# Master Setup Script - One command to rule them all
# This is the ONLY script you need to run for complete setup
# Integrates NRDOT v2 + DashBuilder + Experiment Framework

set -euo pipefail

# Ensure we're in the right directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

clear

echo -e "${BLUE}"
cat << "EOF"
███████╗ █████╗ ███████╗██╗  ██╗██████╗ ██╗   ██╗██╗██╗     ██████╗ ███████╗██████╗ 
██╔════╝██╔══██╗██╔════╝██║  ██║██╔══██╗██║   ██║██║██║     ██╔══██╗██╔════╝██╔══██╗
█████╗  ███████║███████╗███████║██████╔╝██║   ██║██║██║     ██║  ██║█████╗  ██████╔╝
██╔══╝  ██╔══██║╚════██║██╔══██║██╔══██╗██║   ██║██║██║     ██║  ██║██╔══╝  ██╔══██╗
███████╗██║  ██║███████║██║  ██║██████╔╝╚██████╔╝██║███████╗██████╔╝███████╗██║  ██║
╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝ ╚══════╝╚═╝  ╚═╝
                            + NRDOT v2 Integration                                     
EOF
echo -e "${NC}"

echo -e "${GREEN}Welcome to DashBuilder + NRDOT v2 Master Setup${NC}"
echo -e "${GREEN}This will set up the complete integrated solution${NC}"
echo
echo -e "${YELLOW}What this script will do:${NC}"
echo "  1. Check all prerequisites"
echo "  2. Configure New Relic credentials"
echo "  3. Set up NRDOT telemetry optimization"
echo "  4. Deploy dashboard components"
echo "  5. Start all services"
echo "  6. Create initial dashboards"
echo "  7. Set up experiment framework"
echo "  8. Validate the complete setup"
echo

read -p "Ready to begin? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 0
fi

# Function to handle errors
handle_error() {
    echo -e "\n${RED}❌ An error occurred during setup${NC}"
    echo -e "${RED}Error on line $1${NC}"
    echo
    echo "Troubleshooting steps:"
    echo "1. Check the error message above"
    echo "2. Review logs: docker-compose logs"
    echo "3. Run validation: ./validate-integration.sh"
    echo "4. Check troubleshooting guide: TROUBLESHOOTING.md"
    exit 1
}

trap 'handle_error $LINENO' ERR

# Step 1: Run integrated setup
echo -e "\n${BLUE}Step 1: Running integrated setup...${NC}"
if [[ -x ./integrated-setup.sh ]]; then
    ./integrated-setup.sh
else
    echo -e "${RED}Error: integrated-setup.sh not found or not executable${NC}"
    exit 1
fi

# Step 2: Use the integrated docker-compose
echo -e "\n${BLUE}Step 2: Switching to integrated Docker Compose...${NC}"
if [[ -f docker-compose.integrated.yml ]]; then
    # Backup original if exists
    [[ -f docker-compose.yml ]] && cp docker-compose.yml docker-compose.yml.backup
    cp docker-compose.integrated.yml docker-compose.yml
    echo -e "${GREEN}✓ Integrated docker-compose.yml activated${NC}"
fi

# Step 3: Run validation
echo -e "\n${BLUE}Step 3: Running integration validation...${NC}"
sleep 5  # Give services time to stabilize
if [[ -x ./validate-integration.sh ]]; then
    ./validate-integration.sh || {
        echo -e "${YELLOW}⚠ Some validation checks failed, but continuing...${NC}"
    }
fi

# Step 4: Set up experiment framework
echo -e "\n${BLUE}Step 4: Setting up experiment framework...${NC}"

# Create experiment directories
mkdir -p experiment-results
mkdir -p experiments/profiles
mkdir -p logs

# Ensure experiment runner is executable
if [[ -f ./run-experiment.sh ]]; then
    chmod +x ./run-experiment.sh
    echo -e "${GREEN}✓ Experiment runner ready${NC}"
fi

# Create experiment quick start script
cat > experiment-quick.sh << 'EOF'
#!/bin/bash
echo "Running 5-minute NRDOT optimization experiment..."
npm run experiment:quick
EOF
chmod +x experiment-quick.sh

# Step 5: Create quick access scripts
echo -e "\n${BLUE}Step 5: Creating quick access scripts...${NC}"

# Create status script
cat > status.sh << 'EOF'
#!/bin/bash
echo "=== DashBuilder + NRDOT Status ==="
docker-compose ps
echo
echo "=== NRDOT Metrics ==="
curl -s http://localhost:8888/metrics | grep -E "^nrdot_" | head -10
echo
echo "=== Experiment Status ==="
cd scripts && npm run cli -- experiment status 2>/dev/null || echo "No experiments running"
cd ..
echo
echo "=== Recent Logs ==="
docker-compose logs --tail=10
EOF
chmod +x status.sh

# Create restart script
cat > restart.sh << 'EOF'
#!/bin/bash
echo "Restarting all services..."
docker-compose restart
echo "Waiting for services to be ready..."
sleep 10
./validate-integration.sh
EOF
chmod +x restart.sh

# Create dashboard script
cat > open-dashboards.sh << 'EOF'
#!/bin/bash
echo "Opening dashboards..."
if command -v xdg-open > /dev/null; then
    xdg-open http://localhost:3000 &
    xdg-open http://localhost:9090 &
    xdg-open http://localhost:3001 &
elif command -v open > /dev/null; then
    open http://localhost:3000 &
    open http://localhost:9090 &
    open http://localhost:3001 &
else
    echo "Dashboard UI: http://localhost:3000"
    echo "Prometheus: http://localhost:9090"
    echo "Grafana: http://localhost:3001"
fi
EOF
chmod +x open-dashboards.sh

echo -e "${GREEN}✓ Quick access scripts created${NC}"

# Step 5: Final summary
echo -e "\n${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}           🎉 Setup Complete! 🎉                             ${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo

echo -e "${BLUE}Quick Access Commands:${NC}"
echo "  ./status.sh              - Check system status"
echo "  ./restart.sh             - Restart all services"
echo "  ./open-dashboards.sh     - Open all dashboards"
echo "  ./validate-integration.sh - Run validation checks"
echo "  ./run-experiment.sh      - Run NRDOT experiments"
echo "  ./experiment-quick.sh    - Run 5-minute test"
echo

echo -e "${BLUE}Service URLs:${NC}"
echo "  Dashboard: http://localhost:3000"
echo "  API: http://localhost:8080"
echo "  Metrics: http://localhost:8888/metrics"
echo "  Prometheus: http://localhost:9090"
echo "  Grafana: http://localhost:3001 (admin/admin)"
echo

echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Run: ./open-dashboards.sh"
echo "  2. Check New Relic One for NRDOT metrics"
echo "  3. Run: ./experiment-quick.sh to test optimizations"
echo "  4. View results: npm run experiment:results"
echo "  5. Monitor cost reduction in real-time"
echo "  6. Adjust NRDOT_PROFILE based on experiment results"
echo

echo -e "${GREEN}Thank you for using DashBuilder + NRDOT v2!${NC}"
echo

# Create a setup completion file with timestamp
echo "Setup completed at: $(date)" > .setup_complete
echo "Version: DashBuilder + NRDOT v2 Integrated" >> .setup_complete

exit 0