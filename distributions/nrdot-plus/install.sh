#!/bin/bash
# NRDOT-Plus One-Line Installer
# Usage: curl -Ls https://download.newrelic.com/nrdot-plus/install.sh | sudo bash

set -euo pipefail

# Configuration
readonly INSTALLER_VERSION="2.0.0"
readonly DOWNLOAD_BASE="https://download.newrelic.com/nrdot-plus"
readonly GITHUB_RELEASES="https://github.com/newrelic/nrdot-plus/releases"
readonly MIN_OTEL_VERSION="0.104.0"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Global variables
OS=""
OS_VERSION=""
ARCH=""
PACKAGE_TYPE=""
INSTALL_OTEL_COLLECTOR=false

# Print functions
print_color() {
    local color=$1
    shift
    printf "${color}%s${NC}\n" "$*" >&2
}

print_header() {
    cat << 'EOF'

 _   _ ____  ____   ___ _____     ____  _
| \ | |  _ \|  _ \ / _ \_   _|   |  _ \| |_   _ ___
|  \| | |_) | | | | | | || |_____| |_) | | | | / __|
| |\  |  _ <| |_| | |_| || |_____|  __/| | |_| \__ \
|_| \_|_| \_\____/ \___/ |_|     |_|   |_|\__,_|___/

NRDOT-Plus: Process Optimization for OpenTelemetry
EOF
    echo
}

# Error handling
error_exit() {
    print_color "$RED" "ERROR: $1"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This installer must be run as root. Please use sudo."
    fi
}

# Detect OS and architecture
detect_system() {
    print_color "$BLUE" "Detecting system..."
    
    # Detect OS
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        error_exit "Cannot detect operating system"
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
        armv7l)
            ARCH="armhf"
            ;;
        *)
            error_exit "Unsupported architecture: $ARCH"
            ;;
    esac
    
    # Determine package type
    case $OS in
        ubuntu|debian|raspbian)
            PACKAGE_TYPE="deb"
            ;;
        centos|rhel|fedora|rocky|almalinux|amzn)
            PACKAGE_TYPE="rpm"
            ;;
        *)
            error_exit "Unsupported OS: $OS"
            ;;
    esac
    
    print_color "$GREEN" "✓ Detected: $OS $OS_VERSION ($ARCH) - Package type: $PACKAGE_TYPE"
}

# Check prerequisites
check_prerequisites() {
    print_color "$BLUE" "Checking prerequisites..."
    
    local missing=()
    
    # Check required commands
    for cmd in curl systemctl; do
        if ! command -v $cmd &>/dev/null; then
            missing+=($cmd)
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        error_exit "Missing required commands: ${missing[*]}"
    fi
    
    # Check optional but recommended commands
    for cmd in yq jq bc; do
        if ! command -v $cmd &>/dev/null; then
            print_color "$YELLOW" "⚠ Recommended tool '$cmd' not found. Some features may be limited."
        fi
    done
    
    # Check if otelcol is installed
    if command -v otelcol &>/dev/null; then
        local version=$(otelcol --version 2>&1 | grep -oP 'v\K[0-9.]+' || echo "0.0.0")
        if printf '%s\n' "$MIN_OTEL_VERSION" "$version" | sort -V -C; then
            print_color "$GREEN" "✓ OpenTelemetry Collector $version found"
        else
            print_color "$YELLOW" "⚠ OpenTelemetry Collector $version is older than recommended $MIN_OTEL_VERSION"
            INSTALL_OTEL_COLLECTOR=true
        fi
    else
        print_color "$YELLOW" "⚠ OpenTelemetry Collector not found"
        INSTALL_OTEL_COLLECTOR=true
    fi
}

# Install dependencies
install_dependencies() {
    print_color "$BLUE" "Installing dependencies..."
    
    case $PACKAGE_TYPE in
        deb)
            apt-get update -qq
            apt-get install -y -qq curl jq bc yq 2>/dev/null || true
            ;;
        rpm)
            yum install -y -q curl jq bc yq 2>/dev/null || \
            dnf install -y -q curl jq bc yq 2>/dev/null || true
            ;;
    esac
}

# Install OpenTelemetry Collector if needed
install_otel_collector() {
    if [[ "$INSTALL_OTEL_COLLECTOR" != "true" ]]; then
        return 0
    fi
    
    print_color "$BLUE" "Installing OpenTelemetry Collector..."
    
    # Use the standard NRDOT installer
    curl -Ls https://download.newrelic.com/install/otel/collector-installer.sh | bash || {
        print_color "$YELLOW" "⚠ Failed to install OpenTelemetry Collector"
        print_color "$YELLOW" "  NRDOT-Plus requires the collector binary to be available"
        print_color "$YELLOW" "  You can install it manually from: https://opentelemetry.io/docs/collector/getting-started/"
    }
}

# Download and install NRDOT-Plus
install_nrdot_plus() {
    print_color "$BLUE" "Installing NRDOT-Plus..."
    
    local package_name="nrdot-plus_${INSTALLER_VERSION}_${ARCH}.${PACKAGE_TYPE}"
    local download_url="${DOWNLOAD_BASE}/${package_name}"
    local temp_file="/tmp/${package_name}"
    
    # Download package
    print_color "$BLUE" "Downloading ${package_name}..."
    if ! curl -fsSL "$download_url" -o "$temp_file"; then
        # Fallback to GitHub releases
        download_url="${GITHUB_RELEASES}/download/v${INSTALLER_VERSION}/${package_name}"
        if ! curl -fsSL "$download_url" -o "$temp_file"; then
            error_exit "Failed to download NRDOT-Plus package"
        fi
    fi
    
    # Install package
    print_color "$BLUE" "Installing package..."
    case $PACKAGE_TYPE in
        deb)
            dpkg -i "$temp_file" || apt-get install -f -y
            ;;
        rpm)
            rpm -Uvh "$temp_file" || yum install -y "$temp_file" || dnf install -y "$temp_file"
            ;;
    esac
    
    # Clean up
    rm -f "$temp_file"
    
    print_color "$GREEN" "✓ NRDOT-Plus installed successfully"
}

# Configure license key
configure_license_key() {
    local license_key="${NEW_RELIC_LICENSE_KEY:-}"
    
    if [[ -z "$license_key" ]]; then
        # Check if already configured
        if grep -q "^NEW_RELIC_LICENSE_KEY=" /etc/default/nrdot-plus 2>/dev/null; then
            print_color "$GREEN" "✓ License key already configured"
            return 0
        fi
        
        # Prompt for license key
        print_color "$YELLOW" "Enter your New Relic License Key (or press Enter to skip):"
        read -r -s license_key
        echo
    fi
    
    if [[ -n "$license_key" ]]; then
        # Validate key format (40 characters)
        if [[ ${#license_key} -ne 40 ]]; then
            print_color "$YELLOW" "⚠ Warning: License key should be 40 characters"
        fi
        
        # Update configuration
        sed -i "s/^#*NEW_RELIC_LICENSE_KEY=.*/NEW_RELIC_LICENSE_KEY=\"$license_key\"/" /etc/default/nrdot-plus
        print_color "$GREEN" "✓ License key configured"
    else
        print_color "$YELLOW" "⚠ License key not configured. You'll need to set it manually:"
        print_color "$YELLOW" "  sudo nano /etc/default/nrdot-plus"
    fi
}

# Configure optimization profile
configure_profile() {
    local profile="${NRDOT_PROFILE:-balanced}"
    
    print_color "$BLUE" "Setting optimization profile: $profile"
    
    # Update profile in config
    if command -v yq &>/dev/null; then
        yq eval -i ".state.active_profile = \"$profile\"" /etc/nrdot-plus/optimization.yaml
    else
        sed -i "s/active_profile:.*/active_profile: \"$profile\"/" /etc/nrdot-plus/optimization.yaml
    fi
    
    print_color "$GREEN" "✓ Profile set to: $profile"
}

# Start services
start_services() {
    print_color "$BLUE" "Starting services..."
    
    # Enable and start main service
    systemctl enable nrdot-plus
    systemctl start nrdot-plus
    
    # Enable and start control loop
    systemctl enable nrdot-plus-control-loop
    systemctl start nrdot-plus-control-loop
    
    # Wait a moment for services to start
    sleep 2
    
    # Check status
    if systemctl is-active --quiet nrdot-plus; then
        print_color "$GREEN" "✓ NRDOT-Plus collector is running"
    else
        print_color "$RED" "✗ NRDOT-Plus collector failed to start"
        print_color "$RED" "  Check logs: sudo journalctl -u nrdot-plus -n 50"
    fi
    
    if systemctl is-active --quiet nrdot-plus-control-loop; then
        print_color "$GREEN" "✓ Control loop is running"
    else
        print_color "$YELLOW" "⚠ Control loop failed to start"
        print_color "$YELLOW" "  Check logs: sudo journalctl -u nrdot-plus-control-loop -n 50"
    fi
}

# Display summary
display_summary() {
    echo
    print_color "$GREEN" "═══════════════════════════════════════════════════════════════"
    print_color "$GREEN" "           NRDOT-Plus Installation Complete! 🎉"
    print_color "$GREEN" "═══════════════════════════════════════════════════════════════"
    echo
    
    # Show status
    /usr/bin/nrdot-plus-ctl status || true
    
    echo
    print_color "$BLUE" "Next Steps:"
    echo
    
    # Check if license key is set
    if ! grep -q "^NEW_RELIC_LICENSE_KEY=\"[^\"]\+\"" /etc/default/nrdot-plus 2>/dev/null; then
        print_color "$YELLOW" "1. Set your New Relic license key:"
        echo "   sudo nano /etc/default/nrdot-plus"
        echo "   # Set: NEW_RELIC_LICENSE_KEY=\"your-key-here\""
        echo "   sudo systemctl restart nrdot-plus"
        echo
    fi
    
    echo "2. View optimization metrics:"
    echo "   nrdot-plus-ctl metrics"
    echo
    echo "3. Check service logs:"
    echo "   nrdot-plus-ctl logs all -f"
    echo
    echo "4. View in New Relic:"
    echo "   https://one.newrelic.com"
    echo
    print_color "$BLUE" "Documentation: https://docs.newrelic.com/nrdot-plus"
    print_color "$BLUE" "Support: nrdot-plus@newrelic.com"
    echo
}

# Main installation process
main() {
    print_header
    
    # Pre-flight checks
    check_root
    detect_system
    check_prerequisites
    
    # Installation
    install_dependencies
    install_otel_collector
    install_nrdot_plus
    
    # Configuration
    configure_license_key
    configure_profile
    
    # Start services
    start_services
    
    # Show summary
    display_summary
}

# Handle errors
trap 'error_exit "Installation failed at line $LINENO"' ERR

# Run installer
main "$@"