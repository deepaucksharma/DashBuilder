#!/bin/bash
#
# Cleanup script to remove all resources created by deploy-web-stack.sh

set -e

PROJECT_NAME="${1:-web-app}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Source OpenStack credentials
if [ -f ~/openrc ]; then
    source ~/openrc
elif [ -f ./openrc ]; then
    source ./openrc
fi

log_info "Starting cleanup of ${PROJECT_NAME}"

# Delete load balancer resources
if openstack extension list | grep -q load-balancer; then
    # Delete load balancer
    LB_ID=$(openstack loadbalancer list --name ${PROJECT_NAME}-lb -f value -c id 2>/dev/null || true)
    if [ ! -z "$LB_ID" ]; then
        log_info "Deleting load balancer: ${PROJECT_NAME}-lb"
        openstack loadbalancer delete ${LB_ID} --cascade --wait
    fi
fi

# Delete servers
log_info "Deleting servers"
for server in $(openstack server list --name ${PROJECT_NAME}-instance -f value -c ID); do
    log_info "Deleting server: $(openstack server show $server -f value -c name)"
    openstack server delete $server --wait
done

# Delete floating IPs
log_info "Deleting unattached floating IPs"
for fip in $(openstack floating ip list --status DOWN -f value -c ID); do
    openstack floating ip delete $fip
done

# Delete router interfaces
ROUTER_ID=$(openstack router list --name ${PROJECT_NAME}-router -f value -c ID 2>/dev/null || true)
if [ ! -z "$ROUTER_ID" ]; then
    log_info "Removing router interfaces"
    for port in $(openstack port list --device-id ${ROUTER_ID} -f value -c ID); do
        PORT_INFO=$(openstack port show $port -f json)
        if echo "$PORT_INFO" | grep -q "network:router_interface"; then
            SUBNET_ID=$(echo "$PORT_INFO" | grep -oP '"subnet_id": "\K[^"]+' | head -1)
            openstack router remove subnet ${ROUTER_ID} ${SUBNET_ID} 2>/dev/null || true
        fi
    done
    
    log_info "Deleting router: ${PROJECT_NAME}-router"
    openstack router delete ${ROUTER_ID}
fi

# Delete subnet
SUBNET_ID=$(openstack subnet list --name ${PROJECT_NAME}-subnet -f value -c ID 2>/dev/null || true)
if [ ! -z "$SUBNET_ID" ]; then
    log_info "Deleting subnet: ${PROJECT_NAME}-subnet"
    openstack subnet delete ${SUBNET_ID}
fi

# Delete network
NETWORK_ID=$(openstack network list --name ${PROJECT_NAME}-network -f value -c ID 2>/dev/null || true)
if [ ! -z "$NETWORK_ID" ]; then
    log_info "Deleting network: ${PROJECT_NAME}-network"
    openstack network delete ${NETWORK_ID}
fi

# Delete security group
SG_ID=$(openstack security group list --name ${PROJECT_NAME}-sg -f value -c ID 2>/dev/null || true)
if [ ! -z "$SG_ID" ]; then
    log_info "Deleting security group: ${PROJECT_NAME}-sg"
    openstack security group delete ${SG_ID}
fi

# Delete keypair
if openstack keypair show ${PROJECT_NAME}-key &> /dev/null; then
    log_info "Deleting keypair: ${PROJECT_NAME}-key"
    openstack keypair delete ${PROJECT_NAME}-key
fi

log_info "Cleanup complete!"