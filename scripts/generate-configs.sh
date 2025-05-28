#!/bin/bash
# Configuration Generator for NRDOT
# Combines base config with profile-specific overlays

# Configuration
BASE_CONFIG=${BASE_CONFIG:-"/Users/deepaksharma/DashBuilder/configs/collector-base.yaml"}
PROFILES_DIR=${PROFILES_DIR:-"/Users/deepaksharma/DashBuilder/configs/collector-profiles"}
OUTPUT_DIR=${OUTPUT_DIR:-"/Users/deepaksharma/DashBuilder/configs"}

# Logging helpers
log_info() { echo -e "\033[0;34m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[0;32m[SUCCESS]\033[0m $1"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }

# Check dependencies
if ! command -v yq &> /dev/null; then
  log_error "Required command not found: yq"
  log_info "Please install yq using 'brew install yq' or equivalent"
  exit 1
fi

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Function to merge base config with overlay
merge_configs() {
  local profile="$1"
  local overlay_file="${PROFILES_DIR}/${profile}.yaml"
  local output_file="${OUTPUT_DIR}/collector-${profile}.yaml"
  
  if [[ ! -f "$overlay_file" ]]; then
    log_error "Overlay file not found: $overlay_file"
    return 1
  fi
  
  log_info "Merging base config with $profile overlay..."
  
  # Merge configs using yq
  yq eval-all 'select(fileIndex == 0) * select(fileIndex == 1)' "$BASE_CONFIG" "$overlay_file" > "$output_file"
  
  if [[ $? -eq 0 ]]; then
    log_success "Generated ${profile} configuration: $output_file"
    return 0
  else
    log_error "Failed to generate ${profile} configuration"
    return 1
  fi
}

# Generate all profiles or specific profile
if [[ $# -eq 0 ]]; then
  # Generate all profiles
  log_info "Generating all profiles from base config: $BASE_CONFIG"
  
  # Find all profile overlays
  profiles=$(find "$PROFILES_DIR" -name "*.yaml" -exec basename {} \; | sed 's/\.yaml$//')
  
  for profile in $profiles; do
    merge_configs "$profile"
  done
else
  # Generate specific profile
  profile="$1"
  log_info "Generating $profile configuration from base config: $BASE_CONFIG"
  merge_configs "$profile"
fi

log_success "Configuration generation completed"
