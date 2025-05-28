#!/bin/bash
# Quick Start Script for DashBuilder/NRDOT Consolidated
# Demonstrates the consolidated functionality

# Logging helpers
log_info() { echo -e "\033[0;34m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
log_section() { echo -e "\n\033[1;36m=== $1 ===\033[0m\n"; }

# Check environment variables
check_environment() {
  local missing=0
  
  if [[ -z "$NEW_RELIC_API_KEY" ]]; then
    log_error "NEW_RELIC_API_KEY is not set"
    missing=1
  fi
  
  if [[ -z "$NEW_RELIC_ACCOUNT_ID" ]]; then
    log_error "NEW_RELIC_ACCOUNT_ID is not set"
    missing=1
  fi
  
  if [[ $missing -eq 1 ]]; then
    log_error "Please set the required environment variables and try again"
    exit 1
  fi
}

# Main execution
log_section "DashBuilder/NRDOT Quick Start"

# 1. Check environment
log_info "Checking environment..."
check_environment

# 2. Generate configurations
log_section "Generating Configurations"
./scripts/generate-configs.sh
echo ""

# 3. Start services with Docker Compose
log_section "Starting Services"
log_info "Starting DashBuilder and NRDOT services..."

# Ask which profile to use
echo "Select a profile to use:"
echo "1) dashbuilder - Just the DashBuilder app"
echo "2) cli - CLI-only mode"
echo "3) nrdot - NRDOT service only"
echo "4) full - Complete stack deployment"
echo "5) experiments - Run experiments"
read -p "Enter your choice (1-5): " profile_choice

case $profile_choice in
  1) profile="dashbuilder" ;;
  2) profile="cli" ;;
  3) profile="nrdot" ;;
  4) profile="full" ;;
  5) profile="experiments" ;;
  *) 
    log_error "Invalid choice. Using 'dashbuilder' as default."
    profile="dashbuilder"
    ;;
esac

log_info "Using profile: $profile"
docker compose --profile $profile up -d

echo ""
log_success "Services started successfully!"

# 4. Run a control loop iteration
log_section "Running Control Loop"
log_info "Running a control loop iteration..."

# Ask which mode to use
echo "Select a mode for the control loop:"
echo "1) local - Use local filesystem"
echo "2) docker - Use Docker containers"
echo "3) nr1 - Use New Relic One API"
read -p "Enter your choice (1-3): " mode_choice

case $mode_choice in
  1) mode="local" ;;
  2) mode="docker" ;;
  3) mode="nr1" ;;
  *) 
    log_error "Invalid choice. Using 'local' as default."
    mode="local"
    ;;
esac

# Ask which profile to use for control loop
echo "Select a profile for the control loop:"
echo "1) baseline - No optimizations"
echo "2) conservative - Moderate optimizations"
echo "3) balanced - Balanced optimizations"
echo "4) aggressive - Maximum optimizations"
read -p "Enter your choice (1-4): " cl_profile_choice

case $cl_profile_choice in
  1) cl_profile="baseline" ;;
  2) cl_profile="conservative" ;;
  3) cl_profile="balanced" ;;
  4) cl_profile="aggressive" ;;
  *) 
    log_error "Invalid choice. Using 'balanced' as default."
    cl_profile="balanced"
    ;;
esac

log_info "Running control loop with mode: $mode, profile: $cl_profile"
node scripts/control-loop.js $mode $cl_profile

echo ""
log_success "Quick start completed successfully!"
log_info "Use 'docker compose --profile $profile ps' to check running services"
