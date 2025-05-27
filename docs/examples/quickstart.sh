#!/bin/bash
# NRDOT v2 Quick Start Script
# This script sets up NRDOT v2 optimization on a host

set -euo pipefail

# Configuration
NRDOT_VERSION="2.0.0"
COLLECTOR_VERSION="0.104.0"
INSTALL_DIR="/opt/nrdot"
CONFIG_DIR="/etc/nrdot-collector-host"
LOG_DIR="/var/log/nrdot"
STATE_DIR="/var/lib/nrdot"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
    fi
}

# Detect OS
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        log_error "Cannot detect OS"
    fi
    log_info "Detected OS: $OS $OS_VERSION"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_deps=()
    
    # Check required commands
    for cmd in curl yq jq bc systemctl; do
        if ! command -v $cmd &> /dev/null; then
            missing_deps+=($cmd)
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
    fi
    
    # Check if collector is installed
    if [[ ! -f /usr/bin/nrdot-collector-host ]]; then
        log_warn "NRDOT collector not found. Installing..."
        install_collector
    else
        log_info "NRDOT collector found"
    fi
}

# Install collector (placeholder - adapt to your installation method)
install_collector() {
    log_info "Installing NRDOT collector..."
    
    case $OS in
        ubuntu|debian)
            curl -s https://download.newrelic.com/install/newrelic-cli/nrdot-collector-host_${COLLECTOR_VERSION}_amd64.deb -o /tmp/collector.deb
            dpkg -i /tmp/collector.deb
            ;;
        centos|rhel|fedora)
            curl -s https://download.newrelic.com/install/newrelic-cli/nrdot-collector-host-${COLLECTOR_VERSION}.x86_64.rpm -o /tmp/collector.rpm
            rpm -i /tmp/collector.rpm
            ;;
        *)
            log_error "Unsupported OS: $OS"
            ;;
    esac
}

# Create directories
create_directories() {
    log_info "Creating directories..."
    
    mkdir -p "$CONFIG_DIR" "$LOG_DIR" "$STATE_DIR" "$INSTALL_DIR/scripts"
    
    # Set permissions
    chown -R nrdot-collector-host:nrdot-collector-host "$LOG_DIR" "$STATE_DIR"
}

# Download configuration files
download_configs() {
    log_info "Downloading configuration files..."
    
    # Download optimization config
    curl -s https://raw.githubusercontent.com/newrelic/nrdot-configs/main/optimization.yaml \
        -o "$CONFIG_DIR/optimization.yaml"
    
    # Download collector config
    curl -s https://raw.githubusercontent.com/newrelic/nrdot-configs/main/config.yaml \
        -o "$CONFIG_DIR/config.yaml"
    
    # Download control loop script
    curl -s https://raw.githubusercontent.com/newrelic/nrdot-configs/main/control-loop.sh \
        -o "$INSTALL_DIR/scripts/control-loop.sh"
    
    chmod +x "$INSTALL_DIR/scripts/control-loop.sh"
}

# Configure environment
configure_environment() {
    log_info "Configuring environment..."
    
    # Get New Relic license key
    if [[ -z "${NEW_RELIC_LICENSE_KEY:-}" ]]; then
        read -p "Enter your New Relic License Key: " -s NEW_RELIC_LICENSE_KEY
        echo
    fi
    
    # Calculate ring assignment
    RING=$(( $(hostname | cksum | cut -d' ' -f1) % 8 ))
    log_info "Host assigned to ring: $RING"
    
    # Create environment file
    cat > /etc/default/nrdot-collector-host <<EOF
# NRDOT Collector Environment Configuration
NEW_RELIC_LICENSE_KEY="$NEW_RELIC_LICENSE_KEY"
OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.nr-data.net"
NRDOT_RING="$RING"
NRDOT_PROFILE="balanced"
NRDOT_TARGET_SERIES="5000"
NRDOT_MAX_SERIES="10000"
NRDOT_MIN_COVERAGE="0.95"
NRDOT_MAX_COST_HOUR="0.10"
EOF
    
    chmod 600 /etc/default/nrdot-collector-host
}

# Create systemd services
create_services() {
    log_info "Creating systemd services..."
    
    # Control loop service
    cat > /etc/systemd/system/nrdot-control-loop.service <<'EOF'
[Unit]
Description=NRDOT Process Optimization Control Loop
After=network-online.target nrdot-collector-host.service
Wants=network-online.target
Requires=nrdot-collector-host.service

[Service]
Type=simple
ExecStart=/opt/nrdot/scripts/control-loop.sh
Restart=on-failure
RestartSec=30
User=nrdot-collector-host
Group=nrdot-collector-host
EnvironmentFile=/etc/default/nrdot-collector-host

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
}

# Validate configuration
validate_config() {
    log_info "Validating configuration..."
    
    # Test collector config
    if /usr/bin/nrdot-collector-host --config="$CONFIG_DIR/config.yaml" --dry-run &>/dev/null; then
        log_info "Collector configuration valid"
    else
        log_error "Collector configuration invalid"
    fi
    
    # Test optimization config
    if yq eval '.' "$CONFIG_DIR/optimization.yaml" &>/dev/null; then
        log_info "Optimization configuration valid"
    else
        log_error "Optimization configuration invalid"
    fi
}

# Start services
start_services() {
    log_info "Starting services..."
    
    # Restart collector with new config
    systemctl restart nrdot-collector-host
    sleep 5
    
    # Start control loop
    systemctl enable nrdot-control-loop
    systemctl start nrdot-control-loop
    
    # Check status
    if systemctl is-active --quiet nrdot-collector-host; then
        log_info "Collector is running"
    else
        log_error "Collector failed to start"
    fi
    
    if systemctl is-active --quiet nrdot-control-loop; then
        log_info "Control loop is running"
    else
        log_error "Control loop failed to start"
    fi
}

# Display summary
display_summary() {
    echo
    echo "======================================"
    echo "   NRDOT v2 Installation Complete!"
    echo "======================================"
    echo
    echo "Configuration:"
    echo "  - Profile: balanced"
    echo "  - Ring: $RING"
    echo "  - Config: $CONFIG_DIR"
    echo "  - Logs: $LOG_DIR"
    echo
    echo "Next steps:"
    echo "1. Monitor metrics at: http://localhost:8888/metrics"
    echo "2. Check logs: journalctl -u nrdot-control-loop -f"
    echo "3. View in New Relic: https://one.newrelic.com"
    echo
    echo "To change optimization profile:"
    echo "  yq eval -i '.state.active_profile = \"conservative\"' $CONFIG_DIR/optimization.yaml"
    echo "  systemctl restart nrdot-collector-host"
    echo
}

# Main installation flow
main() {
    echo "======================================"
    echo "   NRDOT v2 Quick Start Installer"
    echo "======================================"
    echo
    
    check_root
    detect_os
    check_prerequisites
    create_directories
    download_configs
    configure_environment
    create_services
    validate_config
    start_services
    display_summary
}

# Run main function
main "$@"