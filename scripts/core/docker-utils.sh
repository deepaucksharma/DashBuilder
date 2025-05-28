#!/bin/bash

# Docker Utilities - Consolidated Docker operations for DashBuilder
# This script consolidates all Docker-related operations

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Docker operations
docker_start() {
    log_info "Starting Docker services..."
    cd "$PROJECT_ROOT"
    
    if [ ! -f docker-compose.yml ]; then
        log_error "docker-compose.yml not found!"
        exit 1
    fi
    
    docker-compose up -d
    log_success "Docker services started"
}

docker_stop() {
    log_info "Stopping Docker services..."
    cd "$PROJECT_ROOT"
    docker-compose down
    log_success "Docker services stopped"
}

docker_restart() {
    log_info "Restarting Docker services..."
    docker_stop
    sleep 2
    docker_start
}

docker_status() {
    log_info "Docker services status:"
    cd "$PROJECT_ROOT"
    docker-compose ps
}

docker_logs() {
    local service="${1:-}"
    if [ -z "$service" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f "$service"
    fi
}

docker_setup() {
    log_info "Setting up Docker environment..."
    
    # Check Docker installation
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed!"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed!"
        exit 1
    fi
    
    # Create necessary directories
    mkdir -p "$PROJECT_ROOT/data/prometheus"
    mkdir -p "$PROJECT_ROOT/data/grafana"
    mkdir -p "$PROJECT_ROOT/logs"
    
    # Apply Docker best practices
    apply_docker_best_practices
    
    log_success "Docker environment setup complete"
}

docker_validate() {
    log_info "Validating Docker setup..."
    
    # Check if services are running
    if ! docker-compose ps | grep -q "Up"; then
        log_error "No Docker services are running!"
        return 1
    fi
    
    # Check OTEL collector
    if docker-compose ps | grep -q "otel-collector.*Up"; then
        log_success "OTEL Collector is running"
    else
        log_error "OTEL Collector is not running"
    fi
    
    # Check health endpoints
    if curl -s http://localhost:13133/health > /dev/null; then
        log_success "OTEL Collector health check passed"
    else
        log_warning "OTEL Collector health check failed"
    fi
    
    log_success "Docker validation complete"
}

apply_docker_best_practices() {
    log_info "Applying Docker best practices..."
    
    # Ensure proper file permissions
    chmod 600 "$PROJECT_ROOT"/.env* 2>/dev/null || true
    
    # Create Docker daemon config for logging
    if [ ! -f "$PROJECT_ROOT/configs/docker-logging.json" ]; then
        cat > "$PROJECT_ROOT/configs/docker-logging.json" <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
    fi
    
    log_success "Docker best practices applied"
}

docker_clean() {
    log_info "Cleaning Docker resources..."
    
    # Stop all containers
    docker_stop
    
    # Remove stopped containers
    docker container prune -f
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes (careful!)
    read -p "Remove unused volumes? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker volume prune -f
    fi
    
    log_success "Docker cleanup complete"
}

docker_exec() {
    local service="${1:-otel-collector}"
    shift
    docker-compose exec "$service" "$@"
}

# Main command handler
case "${1:-help}" in
    start)
        docker_start
        ;;
    stop)
        docker_stop
        ;;
    restart)
        docker_restart
        ;;
    status)
        docker_status
        ;;
    logs)
        docker_logs "${2:-}"
        ;;
    setup)
        docker_setup
        ;;
    validate)
        docker_validate
        ;;
    clean)
        docker_clean
        ;;
    exec)
        shift
        docker_exec "$@"
        ;;
    help|*)
        echo "Docker Utilities for DashBuilder"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  start      - Start all Docker services"
        echo "  stop       - Stop all Docker services"
        echo "  restart    - Restart all Docker services"
        echo "  status     - Show status of Docker services"
        echo "  logs       - Show logs (optionally specify service)"
        echo "  setup      - Initial Docker setup"
        echo "  validate   - Validate Docker setup"
        echo "  clean      - Clean up Docker resources"
        echo "  exec       - Execute command in container"
        echo "  help       - Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 start"
        echo "  $0 logs otel-collector"
        echo "  $0 exec otel-collector sh"
        ;;
esac