#!/bin/bash
#
# Install NRDOT Collector Host on Linux systems
# Supports Ubuntu/Debian and RHEL/CentOS

set -e

# Configuration
NRDOT_VERSION="${NRDOT_VERSION:-1.1.0}"
NEW_RELIC_LICENSE_KEY="${NEW_RELIC_LICENSE_KEY}"
NRDOT_REPO="https://github.com/newrelic/nrdot-collector-releases/releases"

# Colors
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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# Check for license key
if [ -z "$NEW_RELIC_LICENSE_KEY" ]; then
    log_error "NEW_RELIC_LICENSE_KEY environment variable is required"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    log_error "Cannot detect OS"
    exit 1
fi

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        ARCH="amd64"
        ;;
    aarch64)
        ARCH="arm64"
        ;;
    *)
        log_error "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

log_info "Installing NRDOT Collector Host v${NRDOT_VERSION} on ${OS} ${VER} (${ARCH})"

# Install based on OS
case $OS in
    ubuntu|debian)
        # Download and install .deb package
        DEB_FILE="nrdot-collector-host_${NRDOT_VERSION}_linux_${ARCH}.deb"
        DEB_URL="${NRDOT_REPO}/download/v${NRDOT_VERSION}/${DEB_FILE}"
        
        log_info "Downloading ${DEB_FILE}"
        wget -q -O "/tmp/${DEB_FILE}" "${DEB_URL}" || {
            log_error "Failed to download NRDOT collector"
            exit 1
        }
        
        log_info "Installing NRDOT collector"
        dpkg -i "/tmp/${DEB_FILE}" || apt-get install -f -y
        rm -f "/tmp/${DEB_FILE}"
        ;;
        
    centos|rhel|fedora|amazon)
        # Download and install .rpm package
        if [ "$ARCH" = "amd64" ]; then
            RPM_ARCH="x86_64"
        else
            RPM_ARCH="$ARCH"
        fi
        
        RPM_FILE="nrdot-collector-host_${NRDOT_VERSION}_linux_${RPM_ARCH}.rpm"
        RPM_URL="${NRDOT_REPO}/download/v${NRDOT_VERSION}/${RPM_FILE}"
        
        log_info "Downloading ${RPM_FILE}"
        wget -q -O "/tmp/${RPM_FILE}" "${RPM_URL}" || {
            log_error "Failed to download NRDOT collector"
            exit 1
        }
        
        log_info "Installing NRDOT collector"
        rpm -i "/tmp/${RPM_FILE}" || yum install -y "/tmp/${RPM_FILE}"
        rm -f "/tmp/${RPM_FILE}"
        ;;
        
    *)
        log_error "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Configure NRDOT collector
log_info "Configuring NRDOT collector"

# Set environment variables
cat > /etc/nrdot-collector-host/nrdot-collector-host.env << EOF
# New Relic configuration
NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY}
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net

# Resource attributes
OTEL_RESOURCE_ATTRIBUTES="service.name=openstack-vm,environment=production,host.id=$(hostname)"

# Memory limit
NEW_RELIC_MEMORY_LIMIT_MIB=100
EOF

# Update systemd service to use environment file
if systemctl is-enabled nrdot-collector-host &>/dev/null; then
    # Add environment file to systemd service
    sed -i '/\[Service\]/a EnvironmentFile=/etc/nrdot-collector-host/nrdot-collector-host.env' \
        /lib/systemd/system/nrdot-collector-host.service
    
    # Reload systemd
    systemctl daemon-reload
fi

# Enable and start service
log_info "Starting NRDOT collector service"
systemctl enable nrdot-collector-host
systemctl start nrdot-collector-host

# Check status
if systemctl is-active nrdot-collector-host &>/dev/null; then
    log_info "NRDOT collector is running"
    log_info "Check logs: journalctl -u nrdot-collector-host -f"
else
    log_error "NRDOT collector failed to start"
    journalctl -u nrdot-collector-host -n 50 --no-pager
    exit 1
fi

log_info "NRDOT collector installation complete!"