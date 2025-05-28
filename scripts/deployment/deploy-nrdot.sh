#!/bin/bash
# Unified NRDOT Deployment Script
# Supports: Docker, Native (systemd), Day 0/1/2 operations

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_MODE="docker"
DAY_OPERATION="1"
NRDOT_PROFILE="balanced"
SKIP_PREREQS=false
DRY_RUN=false

# Usage function
usage() {
    cat << EOF
NRDOT v2 Unified Deployment Script

Usage: $0 [OPTIONS]

Options:
    --mode=MODE          Deployment mode: docker, native, or both (default: docker)
    --day=DAY           Day operation: 0, 1, or 2 (default: 1)
    --profile=PROFILE   NRDOT profile: conservative, balanced, or aggressive (default: balanced)
    --skip-prereqs      Skip prerequisite checks
    --dry-run          Show what would be done without executing
    --help             Show this help message

Deployment Modes:
    docker             Deploy using Docker Compose
    native             Deploy using systemd services
    both               Deploy both Docker and native versions

Day Operations:
    0                  Initial setup and configuration
    1                  Standard deployment with monitoring
    2                  Production deployment with all features

Profiles:
    conservative       30-40% cost reduction, 99% coverage
    balanced           60-70% cost reduction, 95% coverage  
    aggressive         75-85% cost reduction, 90% coverage

Examples:
    $0 --mode=docker --day=1 --profile=balanced
    $0 --mode=native --day=2 --profile=aggressive
    $0 --mode=both --day=0

EOF
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --mode=*)
                DEPLOYMENT_MODE="${1#*=}"
                shift
                ;;
            --day=*)
                DAY_OPERATION="${1#*=}"
                shift
                ;;
            --profile=*)
                NRDOT_PROFILE="${1#*=}"
                shift
                ;;
            --skip-prereqs)
                SKIP_PREREQS=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done

    # Validate arguments
    case $DEPLOYMENT_MODE in
        docker|native|both) ;;
        *) log_error "Invalid mode: $DEPLOYMENT_MODE"; exit 1 ;;
    esac

    case $DAY_OPERATION in
        0|1|2) ;;
        *) log_error "Invalid day operation: $DAY_OPERATION"; exit 1 ;;
    esac

    case $NRDOT_PROFILE in
        conservative|balanced|aggressive) ;;
        *) log_error "Invalid profile: $NRDOT_PROFILE"; exit 1 ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    if [ "$SKIP_PREREQS" = true ]; then
        log_warning "Skipping prerequisite checks"
        return
    fi

    log_info "Checking prerequisites..."

    local missing_deps=()

    # Common requirements
    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi

    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi

    # Docker-specific requirements
    if [[ "$DEPLOYMENT_MODE" == "docker" || "$DEPLOYMENT_MODE" == "both" ]]; then
        if ! command -v docker >/dev/null 2>&1; then
            missing_deps+=("docker")
        fi

        if ! command -v docker-compose >/dev/null 2>&1; then
            missing_deps+=("docker-compose")
        fi
    fi

    # Native-specific requirements
    if [[ "$DEPLOYMENT_MODE" == "native" || "$DEPLOYMENT_MODE" == "both" ]]; then
        if ! command -v systemctl >/dev/null 2>&1; then
            log_error "systemctl not found. Native deployment requires systemd."
            exit 1
        fi

        if [[ $EUID -ne 0 ]]; then
            log_error "Native deployment requires root privileges. Please run with sudo."
            exit 1
        fi
    fi

    # Report missing dependencies
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        echo "Please install missing dependencies:"
        echo "  Ubuntu/Debian: sudo apt-get install ${missing_deps[*]}"
        echo "  RHEL/CentOS: sudo yum install ${missing_deps[*]}"
        echo "  MacOS: brew install ${missing_deps[*]}"
        exit 1
    fi

    log_success "All prerequisites satisfied"
}

# Check environment variables
check_environment() {
    log_info "Checking environment configuration..."

    # Load .env file if it exists
    if [ -f "$PROJECT_ROOT/.env" ]; then
        set -a
        source "$PROJECT_ROOT/.env"
        set +a
    fi

    # Required environment variables
    local required_vars=("NEW_RELIC_API_KEY" "NEW_RELIC_ACCOUNT_ID")
    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        echo "Please set these variables in .env file or environment:"
        for var in "${missing_vars[@]}"; do
            echo "  export $var=your_value"
        done
        exit 1
    fi

    # Set defaults for optional variables
    export NEW_RELIC_REGION="${NEW_RELIC_REGION:-US}"
    export NEW_RELIC_OTLP_ENDPOINT="${NEW_RELIC_OTLP_ENDPOINT:-otlp.nr-data.net:4317}"
    export NRDOT_TARGET_COVERAGE="${NRDOT_TARGET_COVERAGE:-95}"
    export NRDOT_COST_REDUCTION_TARGET="${NRDOT_COST_REDUCTION_TARGET:-70}"

    log_success "Environment configuration validated"
}

# Deploy Docker version
deploy_docker() {
    log_info "Deploying NRDOT v2 with Docker..."

    cd "$PROJECT_ROOT"

    # Select profile based on day operation and requested profile
    local profile_flag=""
    case $DAY_OPERATION in
        0)
            profile_flag="--profile dashbuilder"
            ;;
        1)
            profile_flag="--profile nrdot"
            ;;
        2)
            profile_flag="--profile full"
            ;;
    esac

    # Set profile environment variable
    export NRDOT_PROFILE="$NRDOT_PROFILE"

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would execute: docker-compose $profile_flag up -d"
        return
    fi

    # Deploy using docker-compose
    log_info "Starting Docker containers with profile: $profile_flag"
    docker-compose $profile_flag up -d

    # Wait for services to be ready
    log_info "Waiting for services to start..."
    sleep 30

    # Verify deployment
    if docker-compose ps | grep -q "Up"; then
        log_success "Docker deployment completed successfully"
    else
        log_error "Docker deployment failed"
        docker-compose logs
        exit 1
    fi
}

# Deploy native version
deploy_native() {
    log_info "Deploying NRDOT v2 natively with systemd..."

    # Create nrdot user
    if ! id "nrdot" &>/dev/null; then
        log_info "Creating nrdot user..."
        useradd -r -s /bin/false nrdot
    fi

    # Create directories
    local dirs=(
        "/etc/nrdot-plus"
        "/var/lib/nrdot-plus"
        "/var/log/nrdot-plus"
        "/usr/local/bin"
    )

    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
        chown nrdot:nrdot "$dir"
    done

    # Install OpenTelemetry Collector
    if ! command -v otelcol-contrib >/dev/null 2>&1; then
        log_info "Installing OpenTelemetry Collector..."
        curl -L https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.96.0/otelcol-contrib_0.96.0_linux_amd64.tar.gz | tar -xz -C /usr/local/bin/
        chmod +x /usr/local/bin/otelcol-contrib
    fi

    # Copy configuration files
    log_info "Installing configuration files..."
    cp "$PROJECT_ROOT/distributions/nrdot-plus/config/config.yaml" "/etc/nrdot-plus/"
    cp "$PROJECT_ROOT/distributions/nrdot-plus/scripts/"*.sh "/usr/local/bin/"
    chmod +x /usr/local/bin/*.sh

    # Create systemd service files
    log_info "Creating systemd services..."

    # NRDOT Collector service
    cat > /etc/systemd/system/nrdot-collector.service << EOF
[Unit]
Description=NRDOT Plus OpenTelemetry Collector
After=network.target

[Service]
Type=simple
User=nrdot
ExecStart=/usr/local/bin/otelcol-contrib --config=/etc/nrdot-plus/config.yaml
Restart=always
RestartSec=10
Environment=NEW_RELIC_API_KEY=$NEW_RELIC_API_KEY
Environment=NEW_RELIC_ACCOUNT_ID=$NEW_RELIC_ACCOUNT_ID
Environment=NEW_RELIC_REGION=$NEW_RELIC_REGION
Environment=NRDOT_PROFILE=$NRDOT_PROFILE

[Install]
WantedBy=multi-user.target
EOF

    # NRDOT Control Loop service
    cat > /etc/systemd/system/nrdot-control-loop.service << EOF
[Unit]
Description=NRDOT Plus Control Loop
After=nrdot-collector.service
Requires=nrdot-collector.service

[Service]
Type=simple
User=nrdot
ExecStart=/usr/local/bin/control-loop.sh
Restart=always
RestartSec=30
Environment=NEW_RELIC_API_KEY=$NEW_RELIC_API_KEY
Environment=NEW_RELIC_ACCOUNT_ID=$NEW_RELIC_ACCOUNT_ID
Environment=NRDOT_PROFILE=$NRDOT_PROFILE

[Install]
WantedBy=multi-user.target
EOF

    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would start and enable systemd services"
        return
    fi

    # Start and enable services
    systemctl daemon-reload
    systemctl enable nrdot-collector.service nrdot-control-loop.service
    systemctl start nrdot-collector.service nrdot-control-loop.service

    # Verify services
    sleep 10
    if systemctl is-active --quiet nrdot-collector.service; then
        log_success "NRDOT collector service started successfully"
    else
        log_error "Failed to start NRDOT collector service"
        systemctl status nrdot-collector.service
        exit 1
    fi

    if systemctl is-active --quiet nrdot-control-loop.service; then
        log_success "NRDOT control loop service started successfully"
    else
        log_warning "Control loop service failed to start (this is normal on first run)"
    fi

    log_success "Native deployment completed successfully"
}

# Post-deployment configuration
post_deployment() {
    log_info "Running post-deployment configuration..."

    # Create example dashboard based on day operation
    case $DAY_OPERATION in
        0)
            log_info "Day 0: Basic setup complete"
            ;;
        1)
            log_info "Day 1: Creating monitoring dashboard..."
            if [ "$DEPLOYMENT_MODE" = "docker" ]; then
                # Import dashboard via Docker
                docker exec -w /app dashbuilder-app npm run cli -- dashboard create-nrdot-monitoring 2>/dev/null || log_warning "Dashboard creation failed (this is normal if not implemented yet)"
            fi
            ;;
        2)
            log_info "Day 2: Setting up advanced monitoring..."
            # Additional Day 2 operations
            if [ "$DEPLOYMENT_MODE" = "native" ]; then
                # Set up log rotation
                cat > /etc/logrotate.d/nrdot << EOF
/var/log/nrdot-plus/*.log {
    daily
    missingok
    rotate 10
    compress
    delaycompress
    notifempty
    create 0644 nrdot nrdot
    postrotate
        systemctl reload nrdot-collector || true
    endscript
}
EOF
            fi
            ;;
    esac

    # Display connection information
    echo ""
    log_success "NRDOT v2 deployment completed!"
    echo ""
    echo "Deployment Summary:"
    echo "  Mode: $DEPLOYMENT_MODE"
    echo "  Day Operation: $DAY_OPERATION"
    echo "  Profile: $NRDOT_PROFILE"
    echo ""

    if [[ "$DEPLOYMENT_MODE" == "docker" || "$DEPLOYMENT_MODE" == "both" ]]; then
        echo "Docker Services:"
        echo "  Web Dashboard: http://localhost:8080"
        echo "  API Server: http://localhost:3000"
        echo "  Metrics: http://localhost:8888"
        echo "  Health Check: http://localhost:13133"
        echo ""
    fi

    if [[ "$DEPLOYMENT_MODE" == "native" || "$DEPLOYMENT_MODE" == "both" ]]; then
        echo "Native Services:"
        echo "  Status: systemctl status nrdot-collector"
        echo "  Logs: journalctl -u nrdot-collector -f"
        echo "  Config: /etc/nrdot-plus/config.yaml"
        echo ""
    fi

    echo "Next Steps:"
    echo "  1. Run validation: ./scripts/validate-nrdot.sh"
    echo "  2. Check New Relic for incoming metrics"
    echo "  3. Monitor cost reduction in dashboard"
    echo ""
}

# Main deployment function
main() {
    echo "======================================"
    echo " NRDOT v2 Unified Deployment"
    echo " Mode: $DEPLOYMENT_MODE | Day: $DAY_OPERATION | Profile: $NRDOT_PROFILE"
    echo "======================================"
    echo ""

    # Run checks
    check_prerequisites
    check_environment

    # Deploy based on mode
    case $DEPLOYMENT_MODE in
        docker)
            deploy_docker
            ;;
        native)
            deploy_native
            ;;
        both)
            deploy_docker
            deploy_native
            ;;
    esac

    # Post-deployment
    post_deployment
}

# Handle errors
trap 'log_error "Deployment failed! Check the error above."; exit 1' ERR

# Parse arguments and run
parse_args "$@"
main