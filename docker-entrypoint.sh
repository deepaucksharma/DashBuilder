#!/bin/bash

# Docker Entrypoint for DashBuilder
# Comprehensive logging and validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Banner
echo "======================================"
echo " DashBuilder Docker Container"
echo " Version: 1.0.0"
echo " Started: $(date)"
echo "======================================"
echo ""

# Environment validation
log_info "Validating environment configuration..."

# Check required environment variables
REQUIRED_VARS=(
    "NEW_RELIC_API_KEY"
    "NEW_RELIC_ACCOUNT_ID"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    log_error "Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    log_warning "Please configure these in your .env file"
else
    log_success "All required environment variables are set"
fi

# Display configuration (masked)
log_info "Current configuration:"
echo "  NEW_RELIC_ACCOUNT_ID: ${NEW_RELIC_ACCOUNT_ID}"
echo "  NEW_RELIC_REGION: ${NEW_RELIC_REGION:-US}"
echo "  NEW_RELIC_API_KEY: ${NEW_RELIC_API_KEY:0:10}...${NEW_RELIC_API_KEY: -4}"
echo "  NRDOT_PROFILE: ${NRDOT_PROFILE:-Conservative}"
echo "  NRDOT_TARGET_COVERAGE: ${NRDOT_TARGET_COVERAGE:-95}%"
echo "  NRDOT_COST_REDUCTION_TARGET: ${NRDOT_COST_REDUCTION_TARGET:-40}%"
echo ""

# Check Node.js version
log_info "Checking Node.js version..."
NODE_VERSION=$(node --version)
log_success "Node.js version: $NODE_VERSION"

# Check npm version
NPM_VERSION=$(npm --version)
log_success "npm version: $NPM_VERSION"

# Validate file structure
log_info "Validating project structure..."
REQUIRED_DIRS=(
    "/app/scripts"
    "/app/orchestrator"
    "/app/configs"
    "/app/distributions"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        log_success "Directory exists: $dir"
    else
        log_error "Missing directory: $dir"
    fi
done

# Test CLI functionality
log_info "Testing nr-guardian CLI..."
cd /app/scripts
if node src/cli.js --version > /dev/null 2>&1; then
    log_success "nr-guardian CLI is functional"
    
    # Show available commands
    log_info "Available nr-guardian commands:"
    node src/cli.js --help 2>/dev/null | grep -E "^\s+[a-z-]+" | head -10 || true
else
    log_error "nr-guardian CLI test failed"
fi

# Test New Relic connection if API key is set
if [ -n "$NEW_RELIC_API_KEY" ] && [ -n "$NEW_RELIC_ACCOUNT_ID" ]; then
    log_info "Testing New Relic API connection..."
    cd /app
    
    # Use the test:connection script
    if npm run test:connection > /tmp/connection_test.log 2>&1; then
        log_success "New Relic API connection successful"
        # Show first few event types
        grep -E "EventType|ProcessSample|SystemSample" /tmp/connection_test.log | head -5 || true
    else
        log_warning "New Relic API connection test failed"
        log_warning "Error details:"
        tail -5 /tmp/connection_test.log || true
    fi
fi

# Show available npm scripts
log_info "Available npm scripts:"
cd /app
npm run 2>&1 | grep -E "^\s+(setup|deploy|validate|test|cli|monitor)" | head -10 || true

echo ""
log_info "Container startup complete!"
echo ""
echo "Quick Start Commands:"
echo "  Test connection:     npm run test:connection"
echo "  List dashboards:     npm run cli -- dashboard list"
echo "  Deploy NRDOT:        npm run deploy:nrdot"
echo "  Run validation:      npm run validate:all"
echo "  Access CLI help:     npm run cli -- --help"
echo ""
echo "For detailed logs, check /app/logs/ directory"
echo "======================================"
echo ""

# Create logs directory if it doesn't exist
mkdir -p /app/logs

# If no command provided, keep container running
if [ $# -eq 0 ]; then
    log_info "No command provided, keeping container alive..."
    log_info "Use 'docker exec' to run commands in this container"
    # Keep container running
    tail -f /dev/null
else
    # Execute provided command
    log_info "Executing command: $@"
    exec "$@"
fi