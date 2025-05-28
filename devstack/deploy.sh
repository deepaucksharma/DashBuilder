#!/bin/bash
#
# Master deployment script for NRDOT across different environments
# Consolidates multiple deployment scripts into a single utility

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function: show_help
show_help() {
    echo -e "${BLUE}=== NRDOT Deployment Tool ===${NC}"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  docker [count]   Deploy NRDOT in Docker containers (default count: 5)"
    echo "  openstack [count] Deploy NRDOT on OpenStack VMs (default count: 5)"
    echo "  multipass [count] Deploy NRDOT on Multipass VMs (default count: 5)"
    echo "  test             Deploy a single test container"
    echo "  user-key [key]   Deploy using a User API Key (NRAK format)"
    echo "  validate         Validate license key and then deploy"
    echo "  status           Check deployment status"
    echo "  help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 docker 3     # Deploy 3 Docker containers"
    echo "  $0 openstack    # Deploy 5 OpenStack VMs"
    echo "  $0 test         # Deploy a test container"
}

# Function: load_environment
load_environment() {
    # Check if .env exists and source it
    if [ -f .env ]; then
        source .env
    fi
    
    # Check for required variables
    if [ -z "$NEW_RELIC_LICENSE_KEY" ] || [ "$NEW_RELIC_LICENSE_KEY" == "your_new_relic_license_key_here" ]; then
        echo -e "${RED}ERROR: NEW_RELIC_LICENSE_KEY not set!${NC}"
        echo "Please run: ./setup.sh license YOUR_LICENSE_KEY"
        exit 1
    fi
    
    # Project name with timestamp
    PROJECT_NAME="nrdot-$(date +%Y%m%d-%H%M%S)"
    
    # Validate license key format
    if [[ ! "$NEW_RELIC_LICENSE_KEY" == *NRAL ]]; then
        echo -e "${YELLOW}Warning: License key doesn't end with NRAL. This may not be a valid license key.${NC}"
    else
        echo -e "${GREEN}✓ License key format validated${NC}"
    fi
}

# Function: deploy_docker_containers
deploy_docker_containers() {
    local count=${1:-5}
    
    echo -e "${BLUE}Deploying $count NRDOT Docker containers...${NC}"
    
    # Stop any existing containers
    echo "Cleaning up existing containers..."
    docker stop $(docker ps -q --filter "name=nrdot-vm-") 2>/dev/null || true
    docker rm $(docker ps -aq --filter "name=nrdot-vm-") 2>/dev/null || true
    
    # Deploy new containers
    for i in $(seq 1 $count); do
        GRPC_PORT=$((4317 + i - 1))
        HTTP_PORT=$((4318 + i - 1))
        
        echo -e "${YELLOW}Starting NRDOT container $i...${NC}"
        
        docker run -d \
            --name nrdot-vm-$i \
            --hostname openstack-vm-$i \
            -e OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.nr-data.net" \
            -e OTEL_EXPORTER_OTLP_HEADERS="api-key=$NEW_RELIC_LICENSE_KEY" \
            -e OTEL_RESOURCE_ATTRIBUTES="service.name=openstack-vm,environment=production,cloud.provider=openstack,deployment.type=container" \
            -e NEW_RELIC_MEMORY_LIMIT_MIB=100 \
            -p ${GRPC_PORT}:4317 \
            -p ${HTTP_PORT}:4318 \
            newrelic/nrdot-collector-host:latest
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Container nrdot-vm-$i started${NC}"
        else
            echo -e "${RED}✗ Failed to start container nrdot-vm-$i${NC}"
        fi
    done
    
    # Wait for initialization
    echo -e "\n${YELLOW}Waiting for containers to initialize...${NC}"
    sleep 5
    
    # Check status
    echo -e "\n${BLUE}=== Container Status ===${NC}"
    docker ps | grep "nrdot-vm-"
    
    echo -e "\n${GREEN}Deployment complete! ${count} containers running.${NC}"
    echo "Check New Relic for data in 2-3 minutes."
    echo "Dashboard: https://one.newrelic.com/launcher/infrastructure.hosts"
}

# Function: deploy_openstack_vms
deploy_openstack_vms() {
    local count=${1:-5}
    
    echo -e "${BLUE}Deploying $count NRDOT VMs on OpenStack...${NC}"
    
    # Check OpenStack access
    if ! openstack token issue >/dev/null 2>&1; then
        echo -e "${RED}Cannot access OpenStack!${NC}"
        echo "Please run: source ./openrc"
        exit 1
    fi
    
    # Create cloud-init data with NRDOT installation
    cat > cloud-init.yaml << EOF
#cloud-config
packages:
  - curl
  - tar
runcmd:
  - export NEW_RELIC_LICENSE_KEY="${NEW_RELIC_LICENSE_KEY}"
  - export COLLECTOR_VERSION="1.1.0"
  - curl -L -o /tmp/collector.tar.gz "https://github.com/newrelic/nrdot-collector-releases/releases/download/v\${COLLECTOR_VERSION}/nrdot-collector-host_\${COLLECTOR_VERSION}_linux_amd64.tar.gz"
  - mkdir -p /opt/nrdot
  - tar -xzf /tmp/collector.tar.gz -C /opt/nrdot
  - cd /opt/nrdot
  - cat > /opt/nrdot/config.yaml << EOC
receivers:
  hostmetrics:
    collection_interval: 60s
  filelog:
    include: [ /var/log/**/*.log ]
    exclude: [ /var/log/lastlog ]
EOC
  - cat > /etc/systemd/system/nrdot.service << EOC
[Unit]
Description=NRDOT Collector Host
After=network.target

[Service]
ExecStart=/opt/nrdot/nrdot-collector-host --config /opt/nrdot/config.yaml
Environment=NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY}
Environment=OTEL_RESOURCE_ATTRIBUTES=service.name=openstack-vm,environment=production,cloud.provider=openstack,deployment.type=vm
Restart=always

[Install]
WantedBy=multi-user.target
EOC
  - systemctl daemon-reload
  - systemctl enable nrdot
  - systemctl start nrdot
EOF

    # Deploy VMs
    for i in $(seq 1 $count); do
        VM_NAME="nrdot-vm-$i"
        
        echo -e "${YELLOW}Creating VM $VM_NAME...${NC}"
        
        # Create VM with cloud-init
        openstack server create \
            --flavor m1.small \
            --image ubuntu-20.04 \
            --key-name default \
            --user-data cloud-init.yaml \
            --network private \
            --wait \
            $VM_NAME
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ VM $VM_NAME created${NC}"
            
            # Add floating IP if available
            if floating_ip=$(openstack floating ip create public -f value -c floating_ip_address 2>/dev/null); then
                openstack server add floating ip $VM_NAME $floating_ip
                echo -e "${GREEN}  Added floating IP: $floating_ip${NC}"
            fi
        else
            echo -e "${RED}✗ Failed to create VM $VM_NAME${NC}"
        fi
    done
    
    # Show summary
    echo -e "\n${BLUE}=== Deployment Summary ===${NC}"
    openstack server list --name "nrdot-vm-"
    
    echo -e "\n${GREEN}Deployment complete! VMs are starting.${NC}"
    echo "Check New Relic for data in 3-5 minutes."
    echo "Dashboard: https://one.newrelic.com/launcher/infrastructure.hosts"
}

# Function: deploy_multipass_vms
deploy_multipass_vms() {
    local count=${1:-5}
    
    echo -e "${BLUE}Deploying $count NRDOT VMs on Multipass (macOS)...${NC}"
    
    # Check if multipass is installed
    if ! command -v multipass &>/dev/null; then
        echo -e "${RED}Error: Multipass is not installed.${NC}"
        echo "Install it with: brew install --cask multipass"
        exit 1
    fi
    
    # Create cloud-init data with NRDOT installation
    cat > cloud-init-multipass.yaml << EOF
#cloud-config
packages:
  - curl
  - tar
runcmd:
  - export NEW_RELIC_LICENSE_KEY="${NEW_RELIC_LICENSE_KEY}"
  - export COLLECTOR_VERSION="1.1.0"
  - curl -L -o /tmp/collector.tar.gz "https://github.com/newrelic/nrdot-collector-releases/releases/download/v\${COLLECTOR_VERSION}/nrdot-collector-host_\${COLLECTOR_VERSION}_linux_amd64.tar.gz"
  - mkdir -p /opt/nrdot
  - tar -xzf /tmp/collector.tar.gz -C /opt/nrdot
  - cd /opt/nrdot
  - cat > /opt/nrdot/config.yaml << EOC
receivers:
  hostmetrics:
    collection_interval: 60s
  filelog:
    include: [ /var/log/**/*.log ]
    exclude: [ /var/log/lastlog ]
EOC
  - cat > /etc/systemd/system/nrdot.service << EOC
[Unit]
Description=NRDOT Collector Host
After=network.target

[Service]
ExecStart=/opt/nrdot/nrdot-collector-host --config /opt/nrdot/config.yaml
Environment=NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY}
Environment=OTEL_RESOURCE_ATTRIBUTES=service.name=openstack-vm,environment=production,cloud.provider=multipass,deployment.type=vm
Restart=always

[Install]
WantedBy=multi-user.target
EOC
  - systemctl daemon-reload
  - systemctl enable nrdot
  - systemctl start nrdot
EOF

    # Deploy VMs
    for i in $(seq 1 $count); do
        VM_NAME="nrdot-multipass-$i"
        
        echo -e "${YELLOW}Creating Multipass VM $VM_NAME...${NC}"
        
        # Create VM with cloud-init
        multipass launch --name $VM_NAME --cloud-init cloud-init-multipass.yaml --memory 512M --disk 2G
        
        if [ $? -eq 0 ]; then
            IP=$(multipass info $VM_NAME | grep IPv4 | awk '{print $2}')
            echo -e "${GREEN}✓ VM $VM_NAME created with IP: $IP${NC}"
        else
            echo -e "${RED}✗ Failed to create VM $VM_NAME${NC}"
        fi
    done
    
    # Show summary
    echo -e "\n${BLUE}=== Deployment Summary ===${NC}"
    multipass list | grep "nrdot-multipass-"
    
    echo -e "\n${GREEN}Deployment complete! VMs are running.${NC}"
    echo "Check New Relic for data in 2-3 minutes."
    echo "Dashboard: https://one.newrelic.com/launcher/infrastructure.hosts"
}

# Function: deploy_test_container
deploy_test_container() {
    echo -e "${BLUE}Deploying a test NRDOT container...${NC}"
    
    # Stop any existing test container
    docker stop nrdot-test 2>/dev/null || true
    docker rm nrdot-test 2>/dev/null || true
    
    # Deploy test container
    docker run -d \
        --name nrdot-test \
        -e OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.nr-data.net" \
        -e OTEL_EXPORTER_OTLP_HEADERS="api-key=$NEW_RELIC_LICENSE_KEY" \
        -e OTEL_RESOURCE_ATTRIBUTES="service.name=nrdot-test,environment=test,deployment.type=test" \
        -p 4317:4317 \
        -p 4318:4318 \
        newrelic/nrdot-collector-host:latest
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Test container deployed!${NC}"
        
        # Try to send test data
        echo -e "\n${YELLOW}Sending test data...${NC}"
        TEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:4318/v1/traces \
            -H "Content-Type: application/json" \
            -d '{
                "resourceSpans": [{
                    "resource": {
                        "attributes": [
                            {"key": "service.name", "value": {"stringValue": "test-send"}}
                        ]
                    },
                    "scopeSpans": [{
                        "spans": [{
                            "name": "test-span",
                            "kind": 1,
                            "traceId": "01020304050607080910111213141516",
                            "spanId": "0102030405060708",
                            "status": {}
                        }]
                    }]
                }]
            }' 2>&1)
            
        HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -1)
        if [[ "$HTTP_CODE" == "2"* ]]; then
            echo -e "${GREEN}✓ Test data sent successfully${NC}"
        else
            echo -e "${YELLOW}⚠ Test data response: $HTTP_CODE${NC}"
        fi
        
        echo -e "\n${GREEN}Test container running at:${NC}"
        echo "OTLP gRPC: localhost:4317"
        echo "OTLP HTTP: localhost:4318"
        
        echo -e "\nCheck New Relic for data in 1-2 minutes."
        echo "Dashboard: https://one.newrelic.com/launcher/infrastructure.hosts"
    else
        echo -e "${RED}✗ Failed to deploy test container${NC}"
    fi
}

# Function: deploy_with_user_key
deploy_with_user_key() {
    local api_key=$1
    
    if [ -z "$api_key" ]; then
        echo -e "${RED}Error: No API key provided${NC}"
        echo "Usage: $0 user-key YOUR_NRAK_KEY"
        exit 1
    fi
    
    echo -e "${BLUE}=== Deploying NRDOT with User API Key ===${NC}"
    
    # Validate key format
    if [[ ! "$api_key" =~ ^NRAK- ]]; then
        echo -e "${RED}Error: Expected User API Key starting with 'NRAK-'${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Using API Key: ${api_key:0:15}...${NC}"
    
    # Stop existing containers
    echo "Cleaning up existing containers..."
    docker stop $(docker ps -q --filter "name=nrdot") 2>/dev/null || true
    docker rm $(docker ps -aq --filter "name=nrdot") 2>/dev/null || true
    
    # Deploy containers
    for i in {1..5}; do
        GRPC_PORT=$((4317 + i - 1))
        HTTP_PORT=$((4318 + i - 1))
        
        echo -n "Starting NRDOT container $i... "
        
        docker run -d \
            --name nrdot-vm-$i \
            --hostname openstack-vm-$i \
            -e OTEL_RESOURCE_ATTRIBUTES="service.name=openstack-vm,environment=production,cloud.provider=openstack,auth.type=user-key" \
            -e NEW_RELIC_MEMORY_LIMIT_MIB=100 \
            -p ${GRPC_PORT}:4317 \
            -p ${HTTP_PORT}:4318 \
            newrelic/nrdot-collector-host:latest \
            --config /etc/nrdot-collector-host/config.yaml \
            --config "yaml:exporters::otlphttp::headers::api-key: $api_key"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Started${NC}"
        else
            echo -e "${RED}✗ Failed${NC}"
        fi
    done
    
    # Wait for initialization
    echo -e "\n${YELLOW}Waiting for containers to initialize...${NC}"
    sleep 15
    
    # Check status
    echo -e "\n${BLUE}=== Container Status ===${NC}"
    docker ps | grep "nrdot-vm-"
    
    echo -e "\n${GREEN}Deployment with User API Key complete!${NC}"
    echo "Check New Relic for data in 2-3 minutes."
    echo "Dashboard: https://one.newrelic.com/launcher/infrastructure.hosts"
}

# Function: check_deployment_status
check_deployment_status() {
    echo -e "${BLUE}=== NRDOT Deployment Status ===${NC}"
    
    # Check Docker containers
    echo -e "\n${BLUE}Docker containers:${NC}"
    if docker ps | grep -q "nrdot-vm"; then
        docker ps | grep "nrdot-vm"
        
        # Check container logs
        echo -e "\n${BLUE}Recent container logs:${NC}"
        for container in $(docker ps -q --filter "name=nrdot-vm"); do
            name=$(docker inspect --format '{{.Name}}' $container | sed 's/\///')
            echo -e "${YELLOW}$name:${NC}"
            docker logs --tail 5 $container
            echo ""
        done
    else
        echo "No NRDOT containers running"
    fi
    
    # Check Multipass VMs
    if command -v multipass >/dev/null 2>&1; then
        echo -e "\n${BLUE}Multipass VMs:${NC}"
        multipass list | grep -E "(nrdot|Name)" || echo "  None found"
    fi
    
    # Check OpenStack VMs
    if command -v openstack >/dev/null 2>&1 && openstack token issue >/dev/null 2>&1; then
        echo -e "\n${BLUE}OpenStack VMs:${NC}"
        openstack server list --name "*nrdot*" -f table 2>/dev/null || echo "  None found"
    fi
    
    echo -e "\n${GREEN}New Relic Queries:${NC}"
    echo "1. All NRDOT hosts:"
    echo "   FROM SystemSample SELECT uniqueCount(host.id) WHERE instrumentation.provider = 'opentelemetry' SINCE 30 minutes ago"
    echo ""
    echo "2. By deployment type:"
    echo "   FROM SystemSample SELECT uniqueCount(host.id) WHERE deployment.type IN ('container', 'vm', 'multipass') FACET deployment.type SINCE 30 minutes ago"
}

# Main execution
if [[ $# -eq 0 ]]; then
    show_help
    exit 0
fi

# Always load environment first
load_environment

# Process commands
case "$1" in
    docker)
        deploy_docker_containers "${2:-5}"
        ;;
    openstack)
        deploy_openstack_vms "${2:-5}"
        ;;
    multipass)
        deploy_multipass_vms "${2:-5}"
        ;;
    test)
        deploy_test_container
        ;;
    user-key)
        deploy_with_user_key "$2"
        ;;
    validate)
        # We already validated the license key in load_environment
        echo -e "${BLUE}Choose deployment method:${NC}"
        echo "1) Docker containers (recommended for testing)"
        echo "2) OpenStack VMs (requires OpenStack environment)"
        echo "3) Multipass VMs (best for macOS)"
        echo "4) Test container only"
        read -p "Enter choice (1-4): " choice
        
        case $choice in
            1) deploy_docker_containers 5 ;;
            2) deploy_openstack_vms 5 ;;
            3) deploy_multipass_vms 5 ;;
            4) deploy_test_container ;;
            *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
        esac
        ;;
    status)
        check_deployment_status
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
