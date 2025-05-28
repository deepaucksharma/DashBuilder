#!/bin/bash
#
# Setup DevStack in Multipass VM with NRDOT integration
# This is the most reliable way to run DevStack on macOS

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Load environment
source ./load-env.sh

# Check prerequisites
log_section "Checking Prerequisites"

if ! command -v multipass &> /dev/null; then
    log_error "Multipass not installed. Installing..."
    brew install --cask multipass || {
        log_error "Failed to install Multipass"
        echo "Please install manually from: https://multipass.run/install"
        exit 1
    }
fi

if [ -z "$NEW_RELIC_LICENSE_KEY" ]; then
    log_error "NEW_RELIC_LICENSE_KEY not set in .env file!"
    exit 1
fi

# VM Configuration
VM_NAME="devstack-vm"
VM_CPUS="4"
VM_MEMORY="8G"
VM_DISK="40G"

log_section "Creating Multipass VM"

# Check if VM exists
if multipass list | grep -q $VM_NAME; then
    log_info "VM $VM_NAME already exists"
    multipass start $VM_NAME 2>/dev/null || true
else
    log_info "Creating new VM: $VM_NAME"
    multipass launch --name $VM_NAME \
        --cpus $VM_CPUS \
        --memory $VM_MEMORY \
        --disk $VM_DISK \
        22.04
fi

# Get VM IP
VM_IP=$(multipass info $VM_NAME | grep IPv4 | awk '{print $2}')
log_info "VM IP: $VM_IP"

log_section "Installing DevStack in VM"

# Create DevStack installation script
cat > /tmp/install-devstack.sh << 'DEVSTACK_SCRIPT'
#!/bin/bash
set -e

echo "Updating system..."
sudo apt-get update
sudo apt-get upgrade -y

echo "Installing dependencies..."
sudo apt-get install -y git python3-pip

echo "Creating stack user..."
sudo useradd -s /bin/bash -d /opt/stack -m stack
echo "stack ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/stack

echo "Cloning DevStack..."
sudo -u stack -i bash -c '
cd /opt/stack
git clone https://opendev.org/openstack/devstack
cd devstack
'

echo "Creating local.conf..."
HOST_IP=$(hostname -I | awk "{print \$1}")
sudo -u stack -i bash -c "cat > /opt/stack/devstack/local.conf << EOF
[[local|localrc]]
# Passwords
ADMIN_PASSWORD=secret
DATABASE_PASSWORD=secret
RABBIT_PASSWORD=secret
SERVICE_PASSWORD=secret

# Network
HOST_IP=$HOST_IP
FLOATING_RANGE=172.24.4.0/24
FIXED_RANGE=10.0.0.0/24
FIXED_NETWORK_SIZE=256
FLAT_INTERFACE=ens3

# Enable services
enable_service n-novnc n-xvnc
enable_service neutron q-svc q-agt q-dhcp q-l3 q-meta
enable_service tempest

# Images
DOWNLOAD_DEFAULT_IMAGES=True
IMAGE_URLS+=",https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64.img"

# Logging
LOGFILE=/opt/stack/logs/stack.sh.log
LOGDAYS=2
VERBOSE=True
LOG_COLOR=False

# Nova
LIBVIRT_TYPE=qemu
NOVA_VNC_ENABLED=True
NOVNCPROXY_URL=\"http://$HOST_IP:6080/vnc_lite.html\"

# Enable Heat
enable_plugin heat https://opendev.org/openstack/heat master

# Set proper permissions
FORCE=yes
EOF"

echo "DevStack configuration created!"
DEVSTACK_SCRIPT

# Copy and run installation script
multipass transfer /tmp/install-devstack.sh $VM_NAME:/tmp/
multipass exec $VM_NAME -- bash /tmp/install-devstack.sh

log_section "Running DevStack Installation"
log_info "This will take 20-30 minutes..."

# Run stack.sh
multipass exec $VM_NAME -- sudo -u stack -i bash -c '
cd /opt/stack/devstack
./stack.sh
'

log_section "Creating Local Configuration"

# Create local openrc
cat > openrc << EOF
#!/usr/bin/env bash
# OpenStack credentials
export OS_AUTH_URL=http://$VM_IP:5000/v3
export OS_PROJECT_NAME="admin"
export OS_USER_DOMAIN_NAME=Default
export OS_PROJECT_DOMAIN_NAME=Default
export OS_USERNAME="admin"
export OS_PASSWORD="secret"
export OS_REGION_NAME="RegionOne"
export OS_INTERFACE="public"
export OS_IDENTITY_API_VERSION=3
EOF

chmod +x openrc
log_info "OpenStack credentials saved to ./openrc"

# Create SSH config
cat >> ~/.ssh/config << EOF

Host devstack-vm
    HostName $VM_IP
    User ubuntu
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
EOF

log_section "Installing NRDOT Tools in VM"

# Create NRDOT installation script
cat > /tmp/install-nrdot-tools.sh << 'NRDOT_SCRIPT'
#!/bin/bash
# Install NRDOT collector binary for testing
cd /home/ubuntu
wget https://github.com/newrelic/nrdot-collector-releases/releases/download/v1.1.0/nrdot-collector-host_1.1.0_linux_amd64.deb
sudo dpkg -i nrdot-collector-host_1.1.0_linux_amd64.deb || sudo apt-get install -f -y
NRDOT_SCRIPT

multipass transfer /tmp/install-nrdot-tools.sh $VM_NAME:/tmp/
multipass exec $VM_NAME -- bash /tmp/install-nrdot-tools.sh

log_section "Setup Complete!"

echo -e "${GREEN}DevStack is running in Multipass VM${NC}"
echo ""
echo "Access methods:"
echo "1. OpenStack Dashboard: http://$VM_IP/dashboard"
echo "   Username: admin"
echo "   Password: secret"
echo ""
echo "2. SSH to VM:"
echo "   multipass shell $VM_NAME"
echo "   OR"
echo "   ssh devstack-vm"
echo ""
echo "3. OpenStack CLI:"
echo "   source ./openrc"
echo "   openstack server list"
echo ""
echo "4. Deploy with NRDOT:"
echo "   cd automation/terraform"
echo "   terraform apply -var=\"new_relic_license_key=\$NEW_RELIC_LICENSE_KEY\""
echo ""
echo "5. Monitor VM:"
echo "   multipass info $VM_NAME"
echo ""
echo "6. Stop VM:"
echo "   multipass stop $VM_NAME"
echo ""
echo "7. Delete VM:"
echo "   multipass delete $VM_NAME && multipass purge"

# Cleanup temp files
rm -f /tmp/install-devstack.sh /tmp/install-nrdot-tools.sh