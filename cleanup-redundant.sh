#!/bin/bash
# Cleanup script for DashBuilder/NRDOT
# Moves redundant files to archive directory after consolidation

# Configuration
ARCHIVE_DIR="./archive/redundant-files-$(date +%Y%m%d%H%M%S)"

# Logging helpers
log_info() { echo -e "\033[0;34m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }
log_warn() { echo -e "\033[0;33m[WARNING]\033[0m $1"; }

# Create archive directory
mkdir -p "$ARCHIVE_DIR"
log_info "Created archive directory: $ARCHIVE_DIR"

# Function to safely move files to archive
archive_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    # Create target directory structure in archive
    local dir_path=$(dirname "$file")
    mkdir -p "$ARCHIVE_DIR/$dir_path"
    
    # Move file to archive
    mv "$file" "$ARCHIVE_DIR/$file"
    log_success "Archived: $file"
  else
    log_warn "File not found: $file"
  fi
}

# Function to safely move directories to archive
archive_dir() {
  local dir="$1"
  if [[ -d "$dir" ]]; then
    # Create target directory structure in archive
    local parent_dir=$(dirname "$dir")
    mkdir -p "$ARCHIVE_DIR/$parent_dir"
    
    # Move directory to archive
    mv "$dir" "$ARCHIVE_DIR/$parent_dir/"
    log_success "Archived directory: $dir"
  else
    log_warn "Directory not found: $dir"
  fi
}

# Ask for confirmation
confirm() {
  local message="$1"
  read -p "$message (y/n): " response
  case "$response" in
    [yY][eE][sS]|[yY]) 
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

log_info "Starting cleanup of redundant files..."

# ===== 1. Docker Compose files =====
log_info "Cleaning up redundant Docker Compose files..."
if confirm "Archive docker-compose-complete.yml?"; then
  archive_file "docker-compose-complete.yml"
fi

if confirm "Archive docker-compose-experiments.yml?"; then
  archive_file "docker-compose-experiments.yml"
fi

# ===== 2. Dockerfile redundancies =====
log_info "Cleaning up redundant Dockerfiles..."
if confirm "Archive Dockerfile.multistage?"; then
  archive_file "Dockerfile.multistage"
fi

if confirm "Archive Dockerfile.nrdot?"; then
  archive_file "Dockerfile.nrdot"
fi

# ===== 3. Redundant script files =====
log_info "Cleaning up redundant script files..."
if confirm "Archive nrdot-config/control-loop.sh?"; then
  archive_file "nrdot-config/control-loop.sh"
fi

if confirm "Archive nrdot-config/control-loop-working.sh?"; then
  archive_file "nrdot-config/control-loop-working.sh"
fi

if [[ -f "nrdot-nr1-app/scripts/nrdot-nr1-control-loop.sh" ]]; then
  if confirm "Archive nrdot-nr1-app/scripts/nrdot-nr1-control-loop.sh?"; then
    archive_file "nrdot-nr1-app/scripts/nrdot-nr1-control-loop.sh"
  fi
fi

if [[ -f "distributions/nrdot-plus/scripts/control-loop.sh" ]]; then
  if confirm "Archive distributions/nrdot-plus/scripts/control-loop.sh?"; then
    archive_file "distributions/nrdot-plus/scripts/control-loop.sh"
  fi
fi

# ===== 4. Redundant validation scripts =====
log_info "Cleaning up redundant validation scripts..."
if [[ -f "scripts/validation/validate-complete-setup.sh" ]]; then
  if confirm "Archive scripts/validation/validate-complete-setup.sh?"; then
    archive_file "scripts/validation/validate-complete-setup.sh"
  fi
fi

if [[ -f "scripts/validation/validate-nrdot.sh" ]]; then
  if confirm "Archive scripts/validation/validate-nrdot.sh?"; then
    archive_file "scripts/validation/validate-nrdot.sh"
  fi
fi

if [[ -f "scripts/validation/validate-otel-config.sh" ]]; then
  if confirm "Archive scripts/validation/validate-otel-config.sh?"; then
    archive_file "scripts/validation/validate-otel-config.sh"
  fi
fi

# ===== 5. Redundant metric generators =====
log_info "Cleaning up redundant metric generators..."
if [[ -f "scripts/generate-real-metrics.sh" && -f "scripts/metrics-generator.sh" ]]; then
  if confirm "Archive scripts/generate-real-metrics.sh?"; then
    archive_file "scripts/generate-real-metrics.sh"
  fi
fi

if [[ -f "scripts/generate-test-metrics.sh" ]]; then
  if confirm "Archive scripts/generate-test-metrics.sh?"; then
    archive_file "scripts/generate-test-metrics.sh"
  fi
fi

# ===== 6. Optional: Redundant configuration files =====
log_info "Checking for redundant configuration files..."
if [[ -f "configs/collector-baseline-simple.yaml" ]]; then
  if confirm "Archive configs/collector-baseline-simple.yaml?"; then
    archive_file "configs/collector-baseline-simple.yaml"
  fi
fi

# ===== Summary =====
log_success "Cleanup complete! All redundant files have been moved to: $ARCHIVE_DIR"
log_info "If you need to restore any files, you can find them in the archive directory."
log_info "To complete the cleanup, update any references to the archived files."
