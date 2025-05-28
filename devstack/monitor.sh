#!/bin/bash
#
# Master monitoring script for NRDOT deployments
# Consolidates monitoring, verification, and troubleshooting functions

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function: show_help
show_help() {
    echo -e "${BLUE}=== NRDOT Monitoring Tool ===${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  status           Check NRDOT deployment status"
    echo "  test [target]    Run tests against a specific target"
    echo "                   Targets: local, docker, openstack, all (default: all)"
    echo "  verify           Verify New Relic connectivity and data flow"
    echo "  quick            Run a quick connectivity test"
    echo "  dashboard        Show New Relic dashboard links"
    echo "  logs [name]      Show logs for a specific container or VM"
    echo "  fix              Fix common NRDOT deployment issues"
    echo "  help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 status       # Check deployment status"
    echo "  $0 test docker  # Test Docker containers"
    echo "  $0 verify       # Verify data flow to New Relic"
}

# Function: load_environment
load_environment() {
    # Check if .env exists and source it
    if [ -f .env ]; then
        source .env
    fi
    
    # Check for required variables
    if [ -z "$NEW_RELIC_LICENSE_KEY" ] || [ "$NEW_RELIC_LICENSE_KEY" == "your_new_relic_license_key_here" ]; then
        echo -e "${YELLOW}Warning: NEW_RELIC_LICENSE_KEY not set or using default value${NC}"
        echo "Some functionality may be limited."
        echo "Run: ./setup.sh license YOUR_LICENSE_KEY"
    fi
}

# Function: check_status
check_status() {
    echo -e "${BLUE}=== NRDOT Collector Status Check ===${NC}"
    echo ""
    
    # Check Docker containers
    echo -e "${BLUE}Checking Docker containers...${NC}"
    
    local running_count=0
    local total_count=$(docker ps -q --filter "name=nrdot-vm-" | wc -l)
    
    for container in $(docker ps -q --filter "name=nrdot-vm-"); do
        name=$(docker inspect --format '{{.Name}}' $container | sed 's/\///')
        echo -e "${GREEN}✓ $name is running${NC}"
        ((running_count++))
        
        # Check for recent logs
        if docker logs --since 1m $container 2>&1 | grep -q "Exporting metrics"; then
            echo -e "  ${GREEN}↳ Actively exporting metrics${NC}"
        fi
        
        # Check for errors
        if docker logs --since 5m $container 2>&1 | grep -qi "error\|failed\|unauthorized\|403"; then
            echo -e "  ${RED}↳ Recent errors detected${NC}"
            docker logs --since 5m $container 2>&1 | grep -i "error\|failed\|unauthorized\|403" | head -3
        fi
    done
    
    echo ""
    echo -e "Summary: ${running_count}/${total_count} containers running"
    
    # Test connectivity to New Relic
    if [ -n "$NEW_RELIC_LICENSE_KEY" ] && [ "$NEW_RELIC_LICENSE_KEY" != "your_new_relic_license_key_here" ]; then
        echo ""
        echo -e "${BLUE}Testing New Relic connectivity...${NC}"
        response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
            -H "Content-Type: application/json" \
            https://otlp.nr-data.net/v1/traces \
            -d '{"resourceSpans":[]}' 2>&1)
            
        HTTP_CODE=$(echo "$response" | tail -1)
        if [[ $HTTP_CODE == "400" || $HTTP_CODE == "200" || $HTTP_CODE == "202" ]]; then
            echo -e "${GREEN}✓ New Relic endpoint is reachable and responding${NC}"
        elif [[ $HTTP_CODE == "403" ]]; then
            echo -e "${RED}✗ Authentication failed (403)${NC}"
            echo -e "${RED}  Your License Key may be invalid or wrong type${NC}"
        else
            echo -e "${YELLOW}⚠ Unexpected response: $HTTP_CODE${NC}"
        fi
    fi
    
    # Check OpenStack VMs
    if command -v openstack >/dev/null 2>&1 && openstack token issue >/dev/null 2>&1; then
        echo ""
        echo -e "${BLUE}Checking OpenStack VMs...${NC}"
        openstack server list --name "*nrdot*" -f table 2>/dev/null || echo "  None found"
    fi
    
    # Check Multipass VMs
    if command -v multipass >/dev/null 2>&1; then
        echo ""
        echo -e "${BLUE}Checking Multipass VMs...${NC}"
        multipass list | grep -E "(nrdot|Name)" || echo "  None found"
    fi
    
    # Check metrics generation
    echo ""
    echo -e "${BLUE}Checking metrics generation...${NC}"
    
    # Check if containers are generating metrics
    for i in {1..5}; do
        if docker ps | grep -q "nrdot-vm-$i"; then
            # Get container stats
            stats=$(docker stats --no-stream nrdot-vm-$i 2>/dev/null | tail -n 1)
            if [ -n "$stats" ]; then
                echo -e "Container nrdot-vm-$i resource usage:"
                echo "  $stats"
            fi
        fi
    done
    
    # Show dashboard links
    show_dashboard_links
    
    # Check for issues that need troubleshooting
    check_for_issues
}

# Function to check for common issues
check_for_issues() {
    echo ""
    echo -e "${BLUE}Checking for common issues...${NC}"
    
    # Check for authentication errors
    auth_errors=false
    for i in {1..5}; do
        if docker ps -q --filter "name=nrdot-vm-$i" >/dev/null 2>&1; then
            if docker logs nrdot-vm-$i 2>&1 | grep -q "403\|Unauthorized"; then
                auth_errors=true
                break
            fi
        fi
    done
    
    if [ "$auth_errors" = true ]; then
        echo -e "${RED}Authentication errors detected!${NC}"
        echo ""
        echo "Steps to fix:"
        echo "1. Get a License Key (not User API Key) from New Relic"
        echo "2. Update .env file with: ./setup.sh license YOUR_LICENSE_KEY"
        echo "3. Restart containers with: ./deploy.sh docker"
    else
        echo -e "${GREEN}✓ No authentication errors detected${NC}"
    fi
    
    # Check for network issues
    if ! curl -s -m 5 https://otlp.nr-data.net > /dev/null 2>&1; then
        echo -e "${RED}Cannot reach New Relic OTLP endpoint${NC}"
        echo "Check your internet connection and firewall settings"
    else
        echo -e "${GREEN}✓ New Relic endpoints are reachable${NC}"
    fi
}

# Function: run_tests
run_tests() {
    local target=${1:-all}
    
    echo -e "${BLUE}=== Running NRDOT Tests (Target: $target) ===${NC}"
    
    # Test license key validity
    if [ "$target" = "all" ] || [ "$target" = "local" ]; then
        echo ""
        echo -e "${BLUE}Testing license key...${NC}"
        if [ -z "$NEW_RELIC_LICENSE_KEY" ] || [ "$NEW_RELIC_LICENSE_KEY" = "your_new_relic_license_key_here" ]; then
            echo -e "${RED}✗ License key not set${NC}"
        else
            # Test key format
            if [[ $NEW_RELIC_LICENSE_KEY == NRAK-* ]]; then
                echo -e "${YELLOW}⚠ Using User API Key (NRAK-) - may have limited permissions${NC}"
            elif [[ $NEW_RELIC_LICENSE_KEY == *NRAL ]]; then
                echo -e "${GREEN}✓ License Key format is valid (ends with NRAL)${NC}"
            else
                echo -e "${YELLOW}⚠ License key format is unusual${NC}"
            fi
            
            # Test connectivity
            response=$(curl -s -w "\n%{http_code}" -X POST \
                -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
                -H "Content-Type: application/json" \
                https://otlp.nr-data.net/v1/traces \
                -d '{"resourceSpans":[]}' 2>&1)
                
            HTTP_CODE=$(echo "$response" | tail -1)
            if [[ $HTTP_CODE == "400" || $HTTP_CODE == "200" || $HTTP_CODE == "202" ]]; then
                echo -e "${GREEN}✓ New Relic connectivity successful${NC}"
            elif [[ $HTTP_CODE == "403" ]]; then
                echo -e "${RED}✗ Authentication failed (403)${NC}"
            else
                echo -e "${YELLOW}⚠ Unexpected response: $HTTP_CODE${NC}"
            fi
        fi
    fi
    
    # Test Docker containers
    if [ "$target" = "all" ] || [ "$target" = "docker" ]; then
        echo ""
        echo -e "${BLUE}Testing Docker containers...${NC}"
        
        # Check running containers
        container_count=$(docker ps -q --filter "name=nrdot" | wc -l)
        if [ "$container_count" -gt 0 ]; then
            echo -e "${GREEN}✓ Found $container_count running NRDOT containers${NC}"
            
            # Test local connectivity
            for container in $(docker ps -q --filter "name=nrdot"); do
                name=$(docker inspect --format '{{.Name}}' $container | sed 's/\///')
                ports=$(docker port $container)
                
                echo -e "\nContainer: ${YELLOW}$name${NC}"
                echo "$ports"
                
                # Find HTTP port
                http_port=$(echo "$ports" | grep 4318/tcp | awk '{print $3}' | cut -d':' -f2)
                
                if [ -n "$http_port" ]; then
                    echo "Testing HTTP endpoint on port $http_port..."
                    response=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:$http_port/v1/traces" \
                        -H "Content-Type: application/json" \
                        -d '{"resourceSpans":[]}' 2>&1)
                        
                    HTTP_CODE=$(echo "$response" | tail -1)
                    if [[ $HTTP_CODE == "2"* || $HTTP_CODE == "4"* ]]; then
                        echo -e "${GREEN}✓ OTLP endpoint is responding${NC}"
                    else
                        echo -e "${RED}✗ OTLP endpoint is not responding correctly: $HTTP_CODE${NC}"
                    fi
                fi
            done
        else
            echo -e "${YELLOW}⚠ No NRDOT containers found${NC}"
        fi
    fi
    
    # Test OpenStack VMs
    if [ "$target" = "all" ] || [ "$target" = "openstack" ]; then
        echo ""
        echo -e "${BLUE}Testing OpenStack VMs...${NC}"
        
        if command -v openstack >/dev/null 2>&1 && openstack token issue >/dev/null 2>&1; then
            vm_count=$(openstack server list --name "*nrdot*" -f value | wc -l)
            if [ "$vm_count" -gt 0 ]; then
                echo -e "${GREEN}✓ Found $vm_count NRDOT VMs in OpenStack${NC}"
                
                # List VMs with status
                echo -e "\nVM Status:"
                openstack server list --name "*nrdot*" -f table -c ID -c Name -c Status -c Networks
                
                # Get a floating IP if available
                floating_ips=$(openstack floating ip list --status ACTIVE -f value -c "Floating IP Address" | head -1)
                if [ -n "$floating_ips" ]; then
                    echo -e "\nTesting VM with floating IP: $floating_ips"
                    ping -c 1 "$floating_ips" >/dev/null 2>&1
                    if [ $? -eq 0 ]; then
                        echo -e "${GREEN}✓ VM is reachable${NC}"
                    else
                        echo -e "${RED}✗ VM is not reachable${NC}"
                    fi
                fi
            else
                echo -e "${YELLOW}⚠ No NRDOT VMs found in OpenStack${NC}"
            fi
        else
            echo -e "${RED}✗ Cannot access OpenStack or not authenticated${NC}"
        fi
    fi
}

# Function: verify_newrelic
verify_newrelic() {
    echo -e "${BLUE}=== Verifying New Relic Data Flow ===${NC}"
    
    if [ -z "$NEW_RELIC_LICENSE_KEY" ] || [ "$NEW_RELIC_LICENSE_KEY" = "your_new_relic_license_key_here" ]; then
        echo -e "${RED}✗ License key not set - cannot verify${NC}"
        return 1
    fi
    
    # Test connectivity to New Relic
    echo -e "\n${BLUE}Testing New Relic connectivity...${NC}"
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
        -H "Content-Type: application/json" \
        https://otlp.nr-data.net/v1/traces \
        -d '{"resourceSpans":[]}' 2>&1)
        
    HTTP_CODE=$(echo "$response" | tail -1)
    if [[ $HTTP_CODE == "400" || $HTTP_CODE == "200" || $HTTP_CODE == "202" ]]; then
        echo -e "${GREEN}✓ New Relic endpoint is reachable and responding${NC}"
        
        # Send test data
        echo -e "\n${BLUE}Sending test data...${NC}"
        TEST_ID=$(date +%s)
        
        # Check if we have a local container running
        if docker ps | grep -q "nrdot"; then
            container=$(docker ps -q --filter "name=nrdot" | head -1)
            http_port=$(docker port $container | grep 4318/tcp | awk '{print $3}' | cut -d':' -f2 || echo "4318")
            
            TEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:$http_port/v1/traces" \
                -H "Content-Type: application/json" \
                -d "{
                    \"resourceSpans\": [{
                        \"resource\": {
                            \"attributes\": [
                                {\"key\": \"service.name\", \"value\": {\"stringValue\": \"verify-test\"}},
                                {\"key\": \"test.id\", \"value\": {\"stringValue\": \"$TEST_ID\"}}
                            ]
                        },
                        \"scopeSpans\": [{
                            \"spans\": [{
                                \"name\": \"verification-span\",
                                \"kind\": 1,
                                \"traceId\": \"01020304050607080910111213141516\",
                                \"spanId\": \"0102030405060708\",
                                \"status\": {}
                            }]
                        }]
                    }]
                }" 2>&1)
                
            HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -1)
            if [[ "$HTTP_CODE" == "2"* ]]; then
                echo -e "${GREEN}✓ Test data sent successfully${NC}"
                
                echo -e "\n${BLUE}Waiting for data to appear in New Relic...${NC}"
                echo -e "${YELLOW}This typically takes 2-3 minutes${NC}"
                echo ""
                echo "To verify in New Relic, run this query:"
                echo "FROM Span SELECT * WHERE test.id = '$TEST_ID' SINCE 10 minutes ago"
            else
                echo -e "${RED}✗ Failed to send test data: $HTTP_CODE${NC}"
            fi
        else
            echo -e "${YELLOW}⚠ No local NRDOT container found to send test data${NC}"
            echo "To test with local container, run: ./deploy.sh test"
        fi
        
        # Show New Relic dashboards
        show_dashboard_links
        
        return 0
    elif [[ $HTTP_CODE == "403" ]]; then
        echo -e "${RED}✗ Authentication failed (403)${NC}"
        echo -e "${RED}  Your License Key may be invalid or wrong type${NC}"
        
        if [[ $NEW_RELIC_LICENSE_KEY == NRAK-* ]]; then
            echo -e "${RED}  You're using a User API Key (NRAK-)${NC}"
            echo -e "${RED}  NRDOT requires a License Key ending in 'NRAL'${NC}"
        fi
        
        return 1
    else
        echo -e "${YELLOW}⚠ Unexpected response: $HTTP_CODE${NC}"
        return 1
    fi
}

# Function: quick_test
quick_test() {
    echo -e "${BLUE}=== Running Quick NRDOT Test ===${NC}"
    
    # Load environment
    load_environment
    
    # Check license key
    if [ -z "$NEW_RELIC_LICENSE_KEY" ] || [ "$NEW_RELIC_LICENSE_KEY" == "your_new_relic_license_key_here" ]; then
        echo -e "${RED}✗ License key not set${NC}"
        return 1
    fi
    
    # Check key format
    echo -n "1. License Key Format: "
    if [[ $NEW_RELIC_LICENSE_KEY == NRAK-* ]]; then
        echo -e "${YELLOW}⚠ Using User API Key (NRAK-)${NC}"
    elif [[ $NEW_RELIC_LICENSE_KEY == *NRAL ]]; then
        echo -e "${GREEN}✓ Valid (ends with NRAL)${NC}"
    else
        echo -e "${YELLOW}⚠ Unusual format${NC}"
    fi
    
    # Check New Relic connectivity
    echo -n "2. New Relic Connectivity: "
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
        -H "Content-Type: application/json" \
        https://otlp.nr-data.net/v1/traces \
        -d '{"resourceSpans":[]}' 2>&1)
        
    HTTP_CODE=$(echo "$response" | tail -1)
    if [[ "$HTTP_CODE" == "400" || "$HTTP_CODE" == "202" || "$HTTP_CODE" == "200" ]]; then
        echo -e "${GREEN}✓ Success${NC}"
    elif [[ "$HTTP_CODE" == "403" ]]; then
        echo -e "${RED}✗ Authentication Failed${NC}"
    else
        echo -e "${YELLOW}⚠ Unexpected: $HTTP_CODE${NC}"
    fi
    
    # Check Docker
    echo -n "3. Docker: "
    if command -v docker >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Installed${NC}"
        
        # Check running containers
        echo -n "   Running NRDOT Containers: "
        container_count=$(docker ps -q --filter "name=nrdot" | wc -l)
        if [ "$container_count" -gt 0 ]; then
            echo -e "${GREEN}$container_count${NC}"
        else
            echo -e "${YELLOW}None${NC}"
        fi
    else
        echo -e "${RED}✗ Not installed${NC}"
    fi
    
    # Test successful
    echo ""
    echo -e "${GREEN}Quick test complete!${NC}"
    echo -e "Run '${YELLOW}$0 verify${NC}' for a more comprehensive verification."
}

# Function: show_dashboard_links
show_dashboard_links() {
    echo ""
    echo -e "${BLUE}=== New Relic Dashboard Links ===${NC}"
    echo ""
    echo "Check your data in New Relic:"
    echo "1. Infrastructure: https://one.newrelic.com/infra"
    echo "2. APM & Services: https://one.newrelic.com/apm"
    echo "3. Logs: https://one.newrelic.com/logs"
    echo "4. Metrics Explorer: https://one.newrelic.com/metrics"
    echo ""
    echo "Look for:"
    echo "- Hosts named 'openstack-vm-1' through 'openstack-vm-5'"
    echo "- Service named 'openstack-vm'"
    echo "- Resource attributes: environment=production, cloud.provider=openstack"
    echo ""
    echo "5. Useful NRQL Queries:"
    echo "   FROM SystemSample SELECT * WHERE instrumentation.provider = 'opentelemetry' SINCE 30 minutes ago"
    echo "   FROM Span SELECT * WHERE service.name LIKE '%nrdot%' SINCE 30 minutes ago"
    echo "   FROM Log SELECT * WHERE collector.name = 'nrdot-collector-host' SINCE 30 minutes ago"
}

# Function: show_logs
show_logs() {
    local name=$1
    
    if [ -z "$name" ]; then
        # List all containers and let user select one
        echo -e "${BLUE}=== NRDOT Container List ===${NC}"
        docker ps --filter "name=nrdot" --format "{{.Names}}"
        echo ""
        read -p "Enter container name to view logs: " name
    fi
    
    if [ -z "$name" ]; then
        echo -e "${RED}No container name provided${NC}"
        return 1
    fi
    
    echo -e "${BLUE}=== Logs for $name ===${NC}"
    
    # Check if container exists
    if ! docker ps --filter "name=$name" --format "{{.Names}}" | grep -q "$name"; then
        echo -e "${RED}Container $name not found${NC}"
        return 1
    fi
    
    # Show logs
    docker logs --tail 50 "$name"
    
    # Prompt for following logs
    echo ""
    read -p "Follow logs in real-time? (y/n): " follow
    
    if [[ "$follow" == "y" || "$follow" == "Y" ]]; then
        docker logs -f "$name"
    fi
}

# Function: fix_deployment
fix_deployment() {
    echo -e "${BLUE}=== Fixing NRDOT Deployment ===${NC}"
    
    # Check for issues
    check_for_issues
    
    # Ask what to fix
    echo ""
    echo "What would you like to fix?"
    echo "1) Restart all containers"
    echo "2) Update license key"
    echo "3) Fix container endpoints"
    echo "4) Reset everything and redeploy"
    
    read -p "Enter choice (1-4): " choice
    
    case $choice in
        1)
            echo "Restarting all containers..."
            for container in $(docker ps -q --filter "name=nrdot-vm-"); do
                name=$(docker inspect --format '{{.Name}}' $container | sed 's/\///')
                echo -n "Restarting $name... "
                docker restart $container >/dev/null
                echo -e "${GREEN}done${NC}"
            done
            echo -e "${GREEN}✓ All containers restarted${NC}"
            ;;
        2)
            echo "Updating license key..."
            ./setup.sh license
            echo "Redeploying with new key..."
            ./deploy.sh docker
            ;;
        3)
            echo "Fixing container endpoints..."
            
            # Stop all containers
            docker stop $(docker ps -q --filter "name=nrdot-vm-") 2>/dev/null || true
            
            # Start with correct endpoint
            echo "Redeploying with correct endpoints..."
            ./deploy.sh docker
            ;;
        4)
            echo "Resetting everything and redeploying..."
            
            # Remove all containers
            docker stop $(docker ps -q --filter "name=nrdot") 2>/dev/null || true
            docker rm $(docker ps -aq --filter "name=nrdot") 2>/dev/null || true
            
            # Update license key
            ./setup.sh license
            
            # Deploy fresh
            ./deploy.sh docker
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            ;;
    esac
}

# Main execution
if [[ $# -eq 0 ]]; then
    show_help
    exit 0
fi

# Load environment variables
load_environment

# Process commands
case "$1" in
    status)
        check_status
        ;;
    test)
        run_tests "${2:-all}"
        ;;
    verify)
        verify_newrelic
        ;;
    quick)
        quick_test
        ;;
    dashboard)
        show_dashboard_links
        ;;
    logs)
        show_logs "$2"
        ;;
    fix)
        fix_deployment
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        show_help
        exit 1
        ;;
esac
