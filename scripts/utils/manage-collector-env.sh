#!/bin/bash
# Collector Environment Management Script
# Handles dynamic environment variable updates for OTel collector profile changes
# Used by control loops to propagate profile changes to the collector

set -euo pipefail

# Configuration
ENV_FILE="${ENV_FILE:-/var/lib/nrdot/collector.env}"
OPTIMIZATION_FILE="${OPTIMIZATION_FILE:-/etc/nrdot-collector-host/optimization.yaml}"
COLLECTOR_SERVICE="${COLLECTOR_SERVICE:-nrdot-collector-host.service}"
LOCK_FILE="/var/lock/nrdot-collector-env.lock"
LOG_FILE="/var/log/nrdot/collector-env-manager.log"

# Ensure we have required tools
for tool in yq systemctl flock; do
    if ! command -v "$tool" &> /dev/null; then
        echo "Error: $tool is required but not installed" >&2
        exit 1
    fi
done

# Logging function
log() {
    local level="$1"
    shift
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [$level] $*" | tee -a "$LOG_FILE"
}

# Create necessary directories
mkdir -p "$(dirname "$ENV_FILE")" "$(dirname "$LOCK_FILE")" "$(dirname "$LOG_FILE")"

# Function to read current environment
read_env() {
    local key="$1"
    if [[ -f "$ENV_FILE" ]]; then
        grep "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '"' || echo ""
    else
        echo ""
    fi
}

# Function to write environment variable
write_env() {
    local key="$1"
    local value="$2"
    
    # Create temp file
    local temp_file=$(mktemp)
    
    # Copy existing env vars except the one we're updating
    if [[ -f "$ENV_FILE" ]]; then
        grep -v "^${key}=" "$ENV_FILE" > "$temp_file" || true
    fi
    
    # Add the new value
    echo "${key}=\"${value}\"" >> "$temp_file"
    
    # Atomic replace
    mv -f "$temp_file" "$ENV_FILE"
    chmod 644 "$ENV_FILE"
}

# Function to detect OS type
detect_os() {
    local os_type=""
    if [[ -f /etc/os-release ]]; then
        os_type=$(grep -E "^ID=" /etc/os-release | cut -d'=' -f2 | tr -d '"')
    fi
    
    case "$os_type" in
        ubuntu|debian|rhel|centos|fedora|arch|opensuse*)
            echo "linux"
            ;;
        windows*)
            echo "windows"
            ;;
        darwin*)
            echo "darwin"
            ;;
        *)
            echo "linux"  # Default fallback
            ;;
    esac
}

# Function to calculate NRDOT ring
calculate_ring() {
    local hostname="${HOSTNAME:-$(hostname)}"
    local ring=0
    
    # Simple hash-based ring assignment (0-3)
    if command -v md5sum &> /dev/null; then
        ring=$(echo -n "$hostname" | md5sum | tr -d -c '0-9' | cut -c1-8)
        ring=$((ring % 4))
    elif command -v cksum &> /dev/null; then
        ring=$(echo -n "$hostname" | cksum | cut -d' ' -f1)
        ring=$((ring % 4))
    fi
    
    echo "$ring"
}

# Function to sync environment from optimization.yaml
sync_from_optimization() {
    if [[ ! -f "$OPTIMIZATION_FILE" ]]; then
        log "ERROR" "Optimization file not found: $OPTIMIZATION_FILE"
        return 1
    fi
    
    # Read active profile from optimization.yaml
    local active_profile=$(yq eval '.state.active_profile // "conservative"' "$OPTIMIZATION_FILE")
    log "INFO" "Active profile from optimization.yaml: $active_profile"
    
    # Update NRDOT_PROFILE
    local current_profile=$(read_env "NRDOT_PROFILE")
    if [[ "$current_profile" != "$active_profile" ]]; then
        write_env "NRDOT_PROFILE" "$active_profile"
        log "INFO" "Updated NRDOT_PROFILE: $current_profile -> $active_profile"
        return 0  # Changed
    fi
    
    return 1  # No change
}

# Function to initialize environment
init_env() {
    log "INFO" "Initializing collector environment"
    
    # Set HOSTNAME
    write_env "HOSTNAME" "${HOSTNAME:-$(hostname)}"
    
    # Set OS_TYPE
    local os_type=$(detect_os)
    write_env "OS_TYPE" "$os_type"
    log "INFO" "Detected OS type: $os_type"
    
    # Set NRDOT_RING
    local ring=$(calculate_ring)
    write_env "NRDOT_RING" "$ring"
    log "INFO" "Calculated NRDOT ring: $ring"
    
    # Set NRDOT_VERSION
    write_env "NRDOT_VERSION" "2.0.0"
    
    # Sync initial profile from optimization.yaml
    sync_from_optimization || true
    
    # Set any additional static variables
    write_env "NRDOT_COLLECTOR_PORT" "8888"
    write_env "NRDOT_STORAGE_PATH" "/var/lib/nrdot/storage"
    
    log "INFO" "Environment initialization complete"
}

# Function to reload collector
reload_collector() {
    log "INFO" "Reloading collector service: $COLLECTOR_SERVICE"
    
    # First try reload, fall back to restart if needed
    if systemctl reload "$COLLECTOR_SERVICE" 2>/dev/null; then
        log "INFO" "Collector reloaded successfully"
    else
        log "WARN" "Reload not supported, restarting collector"
        if systemctl try-restart "$COLLECTOR_SERVICE"; then
            log "INFO" "Collector restarted successfully"
        else
            log "ERROR" "Failed to restart collector"
            return 1
        fi
    fi
    
    # Give collector time to stabilize
    sleep 5
    
    # Verify collector is running
    if systemctl is-active --quiet "$COLLECTOR_SERVICE"; then
        log "INFO" "Collector is running"
        return 0
    else
        log "ERROR" "Collector is not running after reload/restart"
        return 1
    fi
}

# Main command processing
case "${1:-help}" in
    init)
        # Initialize environment
        (
            flock -x -w 30 200 || {
                log "ERROR" "Could not acquire lock"
                exit 1
            }
            init_env
        ) 200>"$LOCK_FILE"
        ;;
        
    sync)
        # Sync from optimization.yaml and reload if changed
        (
            flock -x -w 30 200 || {
                log "ERROR" "Could not acquire lock"
                exit 1
            }
            
            if sync_from_optimization; then
                reload_collector
            else
                log "INFO" "No profile change detected"
            fi
        ) 200>"$LOCK_FILE"
        ;;
        
    set)
        # Set a specific environment variable
        if [[ $# -lt 3 ]]; then
            echo "Usage: $0 set <key> <value>"
            exit 1
        fi
        
        (
            flock -x -w 30 200 || {
                log "ERROR" "Could not acquire lock"
                exit 1
            }
            
            write_env "$2" "$3"
            log "INFO" "Set $2=$3"
        ) 200>"$LOCK_FILE"
        ;;
        
    get)
        # Get a specific environment variable
        if [[ $# -lt 2 ]]; then
            echo "Usage: $0 get <key>"
            exit 1
        fi
        
        read_env "$2"
        ;;
        
    reload)
        # Just reload the collector
        reload_collector
        ;;
        
    show)
        # Show current environment
        if [[ -f "$ENV_FILE" ]]; then
            cat "$ENV_FILE"
        else
            echo "Environment file not found: $ENV_FILE"
            exit 1
        fi
        ;;
        
    *)
        cat <<EOF
Collector Environment Manager

Usage: $0 <command> [args]

Commands:
  init              Initialize collector environment variables
  sync              Sync profile from optimization.yaml and reload if changed
  set <key> <val>   Set an environment variable
  get <key>         Get an environment variable value
  reload            Reload/restart the collector service
  show              Display current environment

Environment:
  ENV_FILE          Path to collector environment file (default: /var/lib/nrdot/collector.env)
  OPTIMIZATION_FILE Path to optimization.yaml (default: /etc/nrdot-collector-host/optimization.yaml)
  COLLECTOR_SERVICE Systemd service name (default: nrdot-collector-host.service)

This script manages environment variables for the OTel collector and handles
dynamic profile updates from the optimization.yaml file. It's designed to be
called by control loops when profile changes are detected.

Example workflow:
  1. Initialize on first setup: $0 init
  2. Control loop updates optimization.yaml
  3. Control loop calls: $0 sync
  4. Script detects profile change and reloads collector
EOF
        ;;
esac