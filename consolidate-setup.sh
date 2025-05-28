#!/bin/bash
# DashBuilder/NRDOT Consolidation Setup Script
# This script helps transition to the consolidated file structure

# Configuration
SOURCE_DIR=${1:-"."}
TARGET_DIR=${2:-"."}
BACKUP_DIR="./archive/pre-consolidation-backup-$(date +%Y%m%d%H%M%S)"

# Logging helpers
log_info() { echo -e "\033[0;34m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
log_warn() { echo -e "\033[0;33m[WARNING]\033[0m $1"; }

# Create backup directory
mkdir -p "$BACKUP_DIR"
log_info "Created backup directory: $BACKUP_DIR"

# Backup existing files
backup_files() {
  local files=("$@")
  
  for file in "${files[@]}"; do
    if [[ -f "$file" ]]; then
      local backup_path="$BACKUP_DIR/$(basename "$file")"
      cp "$file" "$backup_path"
      log_info "Backed up $file to $backup_path"
    fi
  done
}

# Create directory if it doesn't exist
ensure_dir() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    mkdir -p "$dir"
    log_info "Created directory: $dir"
  fi
}

# Backup Docker Compose files
log_info "Backing up Docker Compose files..."
backup_files docker-compose.yml docker-compose-experiments.yml

# Backup Dockerfiles
log_info "Backing up Dockerfiles..."
backup_files Dockerfile Dockerfile.nrdot Dockerfile.otel

# Backup scripts
log_info "Backing up scripts..."
backup_files scripts/control-loop.sh scripts/validate.sh scripts/generate-real-metrics.sh

# Backup configurations
log_info "Backing up configurations..."
backup_files configs/collector-*.yaml configs/otel-config-optimized.yaml

# Create consolidated directories
log_info "Creating consolidated directories..."
ensure_dir "lib/common"
ensure_dir "configs/collector-profiles"

# Copy consolidated files
log_info "Setting up consolidated structure..."

# Use the consolidated Docker Compose file
if [[ -f "docker-compose.consolidated.yml" ]]; then
  cp docker-compose.consolidated.yml docker-compose.yml
  log_success "Updated docker-compose.yml with consolidated version"
fi

# Use the consolidated Dockerfile
if [[ -f "Dockerfile.consolidated" ]]; then
  cp Dockerfile.consolidated Dockerfile
  log_success "Updated Dockerfile with consolidated version"
fi

# Create symbolic links for backward compatibility
log_info "Creating compatibility links..."
if [[ -f "scripts/control-loop.js" ]]; then
  ln -sf control-loop.js scripts/control-loop.sh
  log_success "Created symbolic link for control-loop.sh"
fi

log_success "Consolidation setup complete!"
log_info "Please check CONSOLIDATION.md for details on the new structure."
