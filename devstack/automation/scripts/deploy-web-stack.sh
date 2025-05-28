#!/bin/bash
#
# Deploy a complete web application stack using OpenStack CLI
# This script creates network, security groups, instances, and load balancer

set -e

# Configuration
PROJECT_NAME="${PROJECT_NAME:-web-app}"
INSTANCE_COUNT="${INSTANCE_COUNT:-3}"
IMAGE_NAME="${IMAGE_NAME:-cirros-0.5.2-x86_64-disk}"
FLAVOR_NAME="${FLAVOR_NAME:-m1.small}"
KEY_NAME="${KEY_NAME:-${PROJECT_NAME}-key}"
NETWORK_CIDR="10.0.50.0/24"
NEW_RELIC_LICENSE_KEY="${NEW_RELIC_LICENSE_KEY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if OpenStack CLI is available
if ! command -v openstack &> /dev/null; then
    log_error "OpenStack CLI not found. Please install python-openstackclient"
    exit 1
fi

# Source OpenStack credentials
if [ -f ~/openrc ]; then
    source ~/openrc
elif [ -f ./openrc ]; then
    source ./openrc
else
    log_warn "OpenRC file not found. Using environment variables"
fi

log_info "Starting deployment of ${PROJECT_NAME}"

# Create SSH keypair if it doesn't exist
if ! openstack keypair show ${KEY_NAME} &> /dev/null; then
    log_info "Creating SSH keypair: ${KEY_NAME}"
    if [ -f ~/.ssh/id_rsa.pub ]; then
        openstack keypair create --public-key ~/.ssh/id_rsa.pub ${KEY_NAME}
    else
        openstack keypair create ${KEY_NAME} > ${KEY_NAME}.pem
        chmod 600 ${KEY_NAME}.pem
        log_info "Private key saved to ${KEY_NAME}.pem"
    fi
else
    log_info "Using existing keypair: ${KEY_NAME}"
fi

# Create network
log_info "Creating network: ${PROJECT_NAME}-network"
NETWORK_ID=$(openstack network create \
    --enable \
    ${PROJECT_NAME}-network \
    -f value -c id)

# Create subnet
log_info "Creating subnet: ${PROJECT_NAME}-subnet"
SUBNET_ID=$(openstack subnet create \
    --network ${NETWORK_ID} \
    --subnet-range ${NETWORK_CIDR} \
    --dhcp \
    --dns-nameserver 8.8.8.8 \
    --dns-nameserver 8.8.4.4 \
    ${PROJECT_NAME}-subnet \
    -f value -c id)

# Get external network
EXTERNAL_NET=$(openstack network list --external -f value -c Name | head -1)
if [ -z "$EXTERNAL_NET" ]; then
    log_error "No external network found"
    exit 1
fi

# Create router
log_info "Creating router: ${PROJECT_NAME}-router"
ROUTER_ID=$(openstack router create \
    --enable \
    --external-gateway ${EXTERNAL_NET} \
    ${PROJECT_NAME}-router \
    -f value -c id)

# Add subnet to router
log_info "Connecting subnet to router"
openstack router add subnet ${ROUTER_ID} ${SUBNET_ID}

# Create security group
log_info "Creating security group: ${PROJECT_NAME}-sg"
SG_ID=$(openstack security group create \
    --description "Security group for ${PROJECT_NAME}" \
    ${PROJECT_NAME}-sg \
    -f value -c id)

# Add security group rules
log_info "Adding security group rules"
# SSH
openstack security group rule create \
    --ingress \
    --protocol tcp \
    --dst-port 22 \
    --remote-ip 0.0.0.0/0 \
    ${SG_ID}

# HTTP
openstack security group rule create \
    --ingress \
    --protocol tcp \
    --dst-port 80 \
    --remote-ip 0.0.0.0/0 \
    ${SG_ID}

# HTTPS
openstack security group rule create \
    --ingress \
    --protocol tcp \
    --dst-port 443 \
    --remote-ip 0.0.0.0/0 \
    ${SG_ID}

# ICMP
openstack security group rule create \
    --ingress \
    --protocol icmp \
    --remote-ip 0.0.0.0/0 \
    ${SG_ID}

# Create user data for NRDOT if license key is provided
USER_DATA_FILE=""
if [ ! -z "$NEW_RELIC_LICENSE_KEY" ]; then
    log_info "Creating NRDOT collector user data"
    USER_DATA_FILE=$(mktemp /tmp/userdata.XXXXXX)
    cat > $USER_DATA_FILE << 'EOF'
#!/bin/bash
# Install NRDOT Collector
NRDOT_VERSION="1.1.0"
NEW_RELIC_LICENSE_KEY="NEW_RELIC_LICENSE_KEY_PLACEHOLDER"
HOSTNAME="HOSTNAME_PLACEHOLDER"

# Install dependencies
apt-get update && apt-get install -y wget ca-certificates || yum install -y wget ca-certificates

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64) ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
esac

# Download and install NRDOT
if command -v apt-get >/dev/null; then
    DEB_FILE="nrdot-collector-host_${NRDOT_VERSION}_linux_${ARCH}.deb"
    wget -q -O "/tmp/${DEB_FILE}" "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${NRDOT_VERSION}/${DEB_FILE}"
    dpkg -i "/tmp/${DEB_FILE}" || apt-get install -f -y
else
    RPM_FILE="nrdot-collector-host_${NRDOT_VERSION}_linux_${ARCH}.rpm"
    wget -q -O "/tmp/${RPM_FILE}" "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${NRDOT_VERSION}/${RPM_FILE}"
    rpm -i "/tmp/${RPM_FILE}" || yum install -y "/tmp/${RPM_FILE}"
fi

# Configure NRDOT
mkdir -p /etc/nrdot-collector-host
cat > /etc/nrdot-collector-host/nrdot-collector-host.env << EOFENV
NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY}
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net
OTEL_RESOURCE_ATTRIBUTES="service.name=openstack-vm,environment=production,host.id=${HOSTNAME},cloud.provider=openstack"
NEW_RELIC_MEMORY_LIMIT_MIB=100
EOFENV

# Update systemd service
sed -i '/\[Service\]/a EnvironmentFile=/etc/nrdot-collector-host/nrdot-collector-host.env' \
    /lib/systemd/system/nrdot-collector-host.service

# Start service
systemctl daemon-reload
systemctl enable nrdot-collector-host
systemctl start nrdot-collector-host
EOF
fi

# Launch instances
log_info "Launching ${INSTANCE_COUNT} instances"
INSTANCE_IDS=()
for i in $(seq 1 ${INSTANCE_COUNT}); do
    log_info "Creating instance: ${PROJECT_NAME}-instance-${i}"
    
    # Prepare user data if NRDOT is enabled
    if [ ! -z "$USER_DATA_FILE" ]; then
        # Create instance-specific user data
        INSTANCE_USER_DATA=$(mktemp /tmp/userdata-instance.XXXXXX)
        sed "s/NEW_RELIC_LICENSE_KEY_PLACEHOLDER/${NEW_RELIC_LICENSE_KEY}/g" $USER_DATA_FILE | \
        sed "s/HOSTNAME_PLACEHOLDER/${PROJECT_NAME}-instance-${i}/g" > $INSTANCE_USER_DATA
        
        INSTANCE_ID=$(openstack server create \
            --image ${IMAGE_NAME} \
            --flavor ${FLAVOR_NAME} \
            --network ${NETWORK_ID} \
            --security-group ${SG_ID} \
            --key-name ${KEY_NAME} \
            --user-data ${INSTANCE_USER_DATA} \
            --wait \
            ${PROJECT_NAME}-instance-${i} \
            -f value -c id)
        rm -f $INSTANCE_USER_DATA
    else
        INSTANCE_ID=$(openstack server create \
            --image ${IMAGE_NAME} \
            --flavor ${FLAVOR_NAME} \
            --network ${NETWORK_ID} \
            --security-group ${SG_ID} \
            --key-name ${KEY_NAME} \
            --wait \
            ${PROJECT_NAME}-instance-${i} \
            -f value -c id)
    fi
    INSTANCE_IDS+=($INSTANCE_ID)
done

# Cleanup temp files
[ ! -z "$USER_DATA_FILE" ] && rm -f $USER_DATA_FILE

# Allocate floating IPs
log_info "Allocating floating IPs"
for i in $(seq 0 $((${#INSTANCE_IDS[@]} - 1))); do
    INSTANCE_ID=${INSTANCE_IDS[$i]}
    INSTANCE_NAME="${PROJECT_NAME}-instance-$((i + 1))"
    
    # Create floating IP
    FIP=$(openstack floating ip create ${EXTERNAL_NET} -f value -c floating_ip_address)
    
    # Associate floating IP
    openstack server add floating ip ${INSTANCE_ID} ${FIP}
    log_info "Instance ${INSTANCE_NAME} accessible at ${FIP}"
done

# Create load balancer (if Octavia is available)
if openstack extension list | grep -q load-balancer; then
    log_info "Creating load balancer: ${PROJECT_NAME}-lb"
    
    # Create load balancer
    LB_ID=$(openstack loadbalancer create \
        --name ${PROJECT_NAME}-lb \
        --vip-subnet-id ${SUBNET_ID} \
        --wait \
        -f value -c id)
    
    # Create listener
    LISTENER_ID=$(openstack loadbalancer listener create \
        --name ${PROJECT_NAME}-listener \
        --protocol HTTP \
        --protocol-port 80 \
        --loadbalancer ${LB_ID} \
        --wait \
        -f value -c id)
    
    # Create pool
    POOL_ID=$(openstack loadbalancer pool create \
        --name ${PROJECT_NAME}-pool \
        --lb-algorithm ROUND_ROBIN \
        --listener ${LISTENER_ID} \
        --protocol HTTP \
        --wait \
        -f value -c id)
    
    # Add members to pool
    for i in $(seq 0 $((${#INSTANCE_IDS[@]} - 1))); do
        INSTANCE_ID=${INSTANCE_IDS[$i]}
        INSTANCE_IP=$(openstack server show ${INSTANCE_ID} -f value -c addresses | grep -oE '10\.[0-9]+\.[0-9]+\.[0-9]+')
        
        openstack loadbalancer member create \
            --name member-$((i + 1)) \
            --address ${INSTANCE_IP} \
            --protocol-port 80 \
            --subnet ${SUBNET_ID} \
            --wait \
            ${POOL_ID}
    done
    
    # Create floating IP for load balancer
    LB_VIP_PORT=$(openstack loadbalancer show ${LB_ID} -f value -c vip_port_id)
    LB_FIP=$(openstack floating ip create \
        --port ${LB_VIP_PORT} \
        ${EXTERNAL_NET} \
        -f value -c floating_ip_address)
    
    log_info "Load balancer accessible at ${LB_FIP}"
else
    log_warn "Octavia (Load Balancer service) not available"
fi

# Summary
log_info "Deployment complete!"
echo ""
echo "=== Deployment Summary ==="
echo "Project: ${PROJECT_NAME}"
echo "Instances: ${INSTANCE_COUNT}"
echo "Network: ${PROJECT_NAME}-network (${NETWORK_CIDR})"
echo "Security Group: ${PROJECT_NAME}-sg"
echo "SSH Key: ${KEY_NAME}"
echo ""
echo "To SSH into instances:"
echo "ssh -i ${KEY_NAME}.pem cirros@<floating-ip>"
echo ""
echo "To delete all resources:"
echo "./cleanup-stack.sh ${PROJECT_NAME}"