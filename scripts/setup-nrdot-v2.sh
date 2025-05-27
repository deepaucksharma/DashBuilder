#!/bin/bash
# NRDOT v2 Comprehensive Setup Script
# Handles complete setup, validation, and operational lifecycle management

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NRDOT_HOME="${NRDOT_HOME:-/opt/nrdot}"
CONFIG_DIR="/etc/nrdot-collector-host"
LIB_DIR="/var/lib/nrdot"
LOG_DIR="/var/log/nrdot"
SYSTEMD_DIR="/etc/systemd/system"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Create nrdot user and group
create_user() {
    log_info "Creating nrdot user and group..."
    
    if ! getent group nrdot >/dev/null 2>&1; then
        groupadd -r nrdot
        log_success "Created nrdot group"
    else
        log_info "nrdot group already exists"
    fi
    
    if ! getent passwd nrdot >/dev/null 2>&1; then
        useradd -r -g nrdot -d /var/lib/nrdot -s /sbin/nologin -c "NRDOT Service User" nrdot
        log_success "Created nrdot user"
    else
        log_info "nrdot user already exists"
    fi
}

# Create directory structure
create_directories() {
    log_info "Creating directory structure..."
    
    directories=(
        "$NRDOT_HOME"
        "$CONFIG_DIR"
        "$LIB_DIR"
        "$LIB_DIR/storage"
        "$LIB_DIR/backups"
        "$LOG_DIR"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        chown nrdot:nrdot "$dir"
        chmod 755 "$dir"
        log_success "Created $dir"
    done
    
    # Special permissions for storage
    chmod 700 "$LIB_DIR/storage"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Detect package manager
    if command -v apt-get >/dev/null 2>&1; then
        PKG_MANAGER="apt-get"
        PKG_UPDATE="apt-get update"
        PKG_INSTALL="apt-get install -y"
    elif command -v yum >/dev/null 2>&1; then
        PKG_MANAGER="yum"
        PKG_UPDATE="yum makecache"
        PKG_INSTALL="yum install -y"
    else
        log_error "Unsupported package manager"
        exit 1
    fi
    
    # Update package cache
    log_info "Updating package cache..."
    $PKG_UPDATE >/dev/null 2>&1
    
    # Install required packages
    packages=(
        "curl"
        "jq"
        "bc"
        "flock"
    )
    
    # Install yq based on architecture
    if ! command -v yq >/dev/null 2>&1; then
        log_info "Installing yq..."
        YQ_VERSION="v4.35.1"
        ARCH=$(uname -m)
        case $ARCH in
            x86_64) YQ_ARCH="amd64" ;;
            aarch64) YQ_ARCH="arm64" ;;
            *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
        esac
        
        curl -sL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${YQ_ARCH}" -o /usr/local/bin/yq
        chmod +x /usr/local/bin/yq
        log_success "Installed yq"
    fi
    
    for pkg in "${packages[@]}"; do
        if ! command -v "$pkg" >/dev/null 2>&1; then
            log_info "Installing $pkg..."
            $PKG_INSTALL "$pkg" >/dev/null 2>&1
            log_success "Installed $pkg"
        else
            log_info "$pkg already installed"
        fi
    done
}

# Deploy configuration files
deploy_configs() {
    log_info "Deploying configuration files..."
    
    # Copy optimization template
    if [[ -f "$SCRIPT_DIR/../docs/templates/optimization-template.yaml" ]]; then
        cp "$SCRIPT_DIR/../docs/templates/optimization-template.yaml" "$CONFIG_DIR/optimization.yaml"
        log_success "Deployed optimization.yaml"
    else
        log_error "optimization-template.yaml not found"
        exit 1
    fi
    
    # Copy collector config template
    if [[ -f "$SCRIPT_DIR/../docs/templates/collector-config-template.yaml" ]]; then
        cp "$SCRIPT_DIR/../docs/templates/collector-config-template.yaml" "$CONFIG_DIR/config.yaml"
        log_success "Deployed config.yaml"
    else
        log_error "collector-config-template.yaml not found"
        exit 1
    fi
    
    # Set permissions
    chown -R nrdot:nrdot "$CONFIG_DIR"
    chmod 640 "$CONFIG_DIR"/*.yaml
}

# Deploy scripts
deploy_scripts() {
    log_info "Deploying management scripts..."
    
    # Deploy noise pattern generator
    cp "$SCRIPT_DIR/generate-noise-patterns.sh" /usr/local/bin/
    chmod +x /usr/local/bin/generate-noise-patterns.sh
    log_success "Deployed generate-noise-patterns.sh"
    
    # Deploy collector env manager
    cp "$SCRIPT_DIR/manage-collector-env.sh" /usr/local/bin/
    chmod +x /usr/local/bin/manage-collector-env.sh
    log_success "Deployed manage-collector-env.sh"
    
    # Deploy control loops
    if [[ -f "$SCRIPT_DIR/../nrdot-nr1-app/scripts/nrdot-nr1-control-loop.sh" ]]; then
        cp "$SCRIPT_DIR/../nrdot-nr1-app/scripts/nrdot-nr1-control-loop.sh" "$NRDOT_HOME/"
        chmod +x "$NRDOT_HOME/nrdot-nr1-control-loop.sh"
        chown nrdot:nrdot "$NRDOT_HOME/nrdot-nr1-control-loop.sh"
        log_success "Deployed nrdot-nr1-control-loop.sh"
    fi
}

# Initialize environment
initialize_environment() {
    log_info "Initializing collector environment..."
    
    # Initialize environment variables
    /usr/local/bin/manage-collector-env.sh init
    log_success "Initialized collector environment"
    
    # Generate noise patterns
    log_info "Generating noise patterns..."
    OS_TYPE=$(uname -s | tr '[:upper:]' '[:lower:]') \
    OPTIMIZATION_FILE="$CONFIG_DIR/optimization.yaml" \
    OUTPUT_FILE="$LIB_DIR/noise_patterns.yaml" \
        /usr/local/bin/generate-noise-patterns.sh
    
    chown nrdot:nrdot "$LIB_DIR/noise_patterns.yaml"
    log_success "Generated noise patterns"
}

# Deploy systemd units
deploy_systemd_units() {
    log_info "Deploying systemd unit files..."
    
    # Deploy NR1 control loop unit
    if [[ -f "$SCRIPT_DIR/systemd/nrdot-nr1-control-loop.service" ]]; then
        cp "$SCRIPT_DIR/systemd/nrdot-nr1-control-loop.service" "$SYSTEMD_DIR/"
        log_success "Deployed nrdot-nr1-control-loop.service"
    fi
    
    # Create environment file directory
    mkdir -p /etc/nrdot
    if [[ -f "$SCRIPT_DIR/systemd/nrdot-nr1-control-loop.env" ]]; then
        cp "$SCRIPT_DIR/systemd/nrdot-nr1-control-loop.env" /etc/nrdot/nr1-control-loop.env.example
        log_warn "Created /etc/nrdot/nr1-control-loop.env.example - please configure with your API keys"
    fi
    
    # Reload systemd
    systemctl daemon-reload
    log_success "Reloaded systemd configuration"
}

# Validate setup
validate_setup() {
    log_info "Validating setup..."
    
    errors=0
    
    # Check directories
    for dir in "$NRDOT_HOME" "$CONFIG_DIR" "$LIB_DIR" "$LOG_DIR"; do
        if [[ ! -d "$dir" ]]; then
            log_error "Directory missing: $dir"
            ((errors++))
        fi
    done
    
    # Check files
    files=(
        "$CONFIG_DIR/optimization.yaml"
        "$CONFIG_DIR/config.yaml"
        "$LIB_DIR/noise_patterns.yaml"
        "$LIB_DIR/collector.env"
        "/usr/local/bin/manage-collector-env.sh"
        "/usr/local/bin/generate-noise-patterns.sh"
    )
    
    for file in "${files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "File missing: $file"
            ((errors++))
        fi
    done
    
    # Check commands
    commands=(yq jq bc curl flock)
    for cmd in "${commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            log_error "Command not found: $cmd"
            ((errors++))
        fi
    done
    
    if [[ $errors -eq 0 ]]; then
        log_success "All validations passed!"
        return 0
    else
        log_error "Validation failed with $errors errors"
        return 1
    fi
}

# Day 0 operations
day0_operations() {
    log_info "=== Day 0: Initial Deployment ==="
    
    # Set baseline profile
    log_info "Setting baseline profile..."
    yq eval -i '.state.active_profile = "conservative"' "$CONFIG_DIR/optimization.yaml"
    /usr/local/bin/manage-collector-env.sh sync
    
    log_info "Day 0 setup complete. Next steps:"
    echo "  1. Install OpenTelemetry Collector"
    echo "  2. Configure collector to use $CONFIG_DIR/config.yaml"
    echo "  3. Start collector service"
    echo "  4. Verify metrics in New Relic"
    echo "  5. Deploy NR1 app to your account"
}

# Day 1 operations
day1_operations() {
    log_info "=== Day 1: Enable Optimization ==="
    
    # Check if collector is running
    if ! systemctl is-active --quiet nrdot-collector-host.service; then
        log_error "Collector service is not running"
        return 1
    fi
    
    # Enable control loops
    log_info "To enable control loops:"
    echo "  1. Configure /etc/nrdot/nr1-control-loop.env with your API keys"
    echo "  2. Enable autonomous control: systemctl enable --now nrdot-control-loop.service"
    echo "  3. Enable UI control: systemctl enable --now nrdot-nr1-control-loop.service"
    
    # Switch to balanced profile
    log_info "Switching to balanced profile..."
    yq eval -i '.state.active_profile = "balanced"' "$CONFIG_DIR/optimization.yaml"
    /usr/local/bin/manage-collector-env.sh sync
    
    log_success "Day 1 optimization enabled"
}

# Day 2 operations
day2_operations() {
    log_info "=== Day 2: Stabilization & Tuning ==="
    
    # Check control loop status
    for service in nrdot-control-loop nrdot-nr1-control-loop; do
        if systemctl is-enabled --quiet "$service.service" 2>/dev/null; then
            if systemctl is-active --quiet "$service.service"; then
                log_success "$service is running"
            else
                log_warn "$service is enabled but not running"
            fi
        else
            log_info "$service is not enabled"
        fi
    done
    
    # Display current state
    log_info "Current optimization state:"
    yq eval '.state' "$CONFIG_DIR/optimization.yaml"
    
    log_info "Day 2 tasks:"
    echo "  1. Monitor KPI metrics in New Relic"
    echo "  2. Adjust profile thresholds if needed"
    echo "  3. Review process classifications"
    echo "  4. Enable experiments if desired"
}

# Main menu
show_menu() {
    echo
    echo "NRDOT v2 Setup & Operations"
    echo "=========================="
    echo "1) Full Setup (First Time)"
    echo "2) Day 0: Initial Deployment"
    echo "3) Day 1: Enable Optimization"
    echo "4) Day 2: Stabilization & Tuning"
    echo "5) Validate Setup"
    echo "6) Update Configurations"
    echo "7) Exit"
    echo
}

# Main execution
main() {
    check_root
    
    if [[ $# -eq 0 ]]; then
        # Interactive mode
        while true; do
            show_menu
            read -rp "Select an option: " choice
            
            case $choice in
                1)
                    log_info "Starting full setup..."
                    create_user
                    create_directories
                    install_dependencies
                    deploy_configs
                    deploy_scripts
                    initialize_environment
                    deploy_systemd_units
                    validate_setup
                    log_success "Setup complete!"
                    ;;
                2)
                    day0_operations
                    ;;
                3)
                    day1_operations
                    ;;
                4)
                    day2_operations
                    ;;
                5)
                    validate_setup
                    ;;
                6)
                    deploy_configs
                    initialize_environment
                    log_success "Configurations updated"
                    ;;
                7)
                    log_info "Exiting..."
                    exit 0
                    ;;
                *)
                    log_error "Invalid option"
                    ;;
            esac
        done
    else
        # Command line mode
        case "$1" in
            setup)
                create_user
                create_directories
                install_dependencies
                deploy_configs
                deploy_scripts
                initialize_environment
                deploy_systemd_units
                validate_setup
                ;;
            day0)
                day0_operations
                ;;
            day1)
                day1_operations
                ;;
            day2)
                day2_operations
                ;;
            validate)
                validate_setup
                ;;
            *)
                log_error "Unknown command: $1"
                echo "Usage: $0 [setup|day0|day1|day2|validate]"
                exit 1
                ;;
        esac
    fi
}

# Run main
main "$@"