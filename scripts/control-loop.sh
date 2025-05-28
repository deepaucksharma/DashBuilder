#!/bin/bash
# Unified NRDOT Control Loop Script
# Supports multiple backends: docker, native, and NR1 integration
# 
# Usage: control-loop.sh [options]
#   --mode=MODE       Set the operation mode (docker, native, nr1)
#   --profile=PROFILE Set the initial profile (conservative, balanced, aggressive)
#   --interval=SEC    Set the check interval in seconds
#   --help            Show this help message

set -euo pipefail

# Source common functions if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/lib/common.sh" ]; then
    source "$SCRIPT_DIR/lib/common.sh"
fi

# =================================================
# Configuration
# =================================================

# Operation mode (docker, native, nr1)
MODE="${MODE:-docker}"

# Profile settings
PROFILE="${PROFILE:-balanced}"
HIGH_CPU_THRESHOLD=80
LOW_CPU_THRESHOLD=30
CHECK_INTERVAL="${CHECK_INTERVAL:-60}"

# NR1 specific settings
NERDSTORAGE_URL="${NERDSTORAGE_URL:-https://api.newrelic.com/graphql}"
API_KEY="${NEW_RELIC_API_KEY:-}"
ACCOUNT_ID="${NEW_RELIC_ACCOUNT_ID:-}"

# File paths
CONFIG_FILE="/etc/nrdot-collector/config.yaml"
OPTIMIZATION_FILE="/etc/nrdot-collector/optimization.yaml"
LOG_FILE="/var/log/nrdot/control-loop.log"

# =================================================
# Helper functions
# =================================================

# Log function
if ! command -v log_info > /dev/null 2>&1; then
    log_info() { echo "[INFO] $(date -u '+%Y-%m-%d %H:%M:%S') - $*"; }
    log_error() { echo "[ERROR] $(date -u '+%Y-%m-%d %H:%M:%S') - $*" >&2; }
    log_metric() { echo "[METRIC] $(date -u '+%Y-%m-%d %H:%M:%S') - $*"; }
fi

# Ensure log directory exists
ensure_log_dir() {
    local log_dir
    log_dir=$(dirname "$LOG_FILE")
    if [ ! -d "$log_dir" ]; then
        mkdir -p "$log_dir"
    fi
}

# Log with redirection to file
log() {
    log_info "$@" | tee -a "$LOG_FILE"
}

# Log a metric value
log_metric() {
    local metric_name="$1"
    local metric_value="$2"
    local timestamp
    timestamp=$(date +%s)
    echo "[METRIC] $timestamp - $metric_name: $metric_value" | tee -a "$LOG_FILE"
}

# Show usage information
usage() {
    cat << EOF
Unified NRDOT Control Loop Script

Usage: $(basename "$0") [options]

Options:
  --mode=MODE       Set the operation mode (docker, native, nr1)
  --profile=PROFILE Set the initial profile (conservative, balanced, aggressive)
  --interval=SEC    Set the check interval in seconds
  --help            Show this help message

Examples:
  $(basename "$0") --mode=docker --profile=balanced
  $(basename "$0") --mode=nr1 --interval=30

EOF
}

# Parse command line arguments
parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --mode=*)
                MODE="${1#*=}"
                shift
                ;;
            --profile=*)
                PROFILE="${1#*=}"
                shift
                ;;
            --interval=*)
                CHECK_INTERVAL="${1#*=}"
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

    # Validate mode
    case "$MODE" in
        docker|native|nr1) ;;
        *)
            log_error "Invalid mode: $MODE. Must be one of: docker, native, nr1"
            exit 1
            ;;
    esac

    # Validate profile
    case "$PROFILE" in
        conservative|balanced|aggressive) ;;
        *)
            log_error "Invalid profile: $PROFILE. Must be one of: conservative, balanced, aggressive"
            exit 1
            ;;
    esac
}

# =================================================
# Mode-specific resource monitoring functions
# =================================================

# Get CPU and memory usage for Docker mode
get_docker_metrics() {
    # Get current CPU usage across all containers
    CPU_USAGE=$(docker stats --no-stream --format "{{.CPUPerc}}" | sed 's/%//' | awk '{sum+=$1} END {print int(sum/NR)}')
    
    # Get current memory usage across all containers
    MEM_USAGE=$(docker stats --no-stream --format "{{.MemPerc}}" | sed 's/%//' | awk '{sum+=$1} END {print int(sum/NR)}')
    
    log_metric "cpu_usage" "$CPU_USAGE"
    log_metric "mem_usage" "$MEM_USAGE"
}

# Get CPU and memory usage for native mode
get_native_metrics() {
    # Get current CPU usage
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
    CPU_USAGE=${CPU_USAGE%.*}
    
    # Get current memory usage
    MEM_TOTAL=$(free -m | awk '/Mem:/ {print $2}')
    MEM_USED=$(free -m | awk '/Mem:/ {print $3}')
    MEM_USAGE=$((MEM_USED * 100 / MEM_TOTAL))
    
    log_metric "cpu_usage" "$CPU_USAGE"
    log_metric "mem_usage" "$MEM_USAGE"
}

# Get metrics from New Relic for NR1 mode
get_nr1_metrics() {
    if [ -z "$API_KEY" ] || [ -z "$ACCOUNT_ID" ]; then
        log_error "NR1 mode requires API_KEY and ACCOUNT_ID to be set"
        return 1
    fi
    
    # Query for CPU and memory metrics
    NRQL_QUERY="SELECT average(cpuPercent) as 'cpu', average(memoryPercent) as 'memory' FROM SystemSample WHERE entityGuid IN (SELECT entityGuid FROM SystemSample FACET entityGuid LIMIT 10) SINCE 5 minutes ago"
    
    # Escape the query for curl
    ESCAPED_QUERY=$(echo "$NRQL_QUERY" | sed 's/"/\\"/g')
    
    # GraphQL query for NerdGraph
    QUERY="{\"query\":\"{actor {account(id: $ACCOUNT_ID) {nrql(query: \\\"$ESCAPED_QUERY\\\") {results}}}}\"}"
    
    # Make the API call
    RESPONSE=$(curl -s -X POST "$NERDSTORAGE_URL" \
        -H "Content-Type: application/json" \
        -H "API-Key: $API_KEY" \
        -d "$QUERY")
    
    # Extract CPU and memory values
    CPU_USAGE=$(echo "$RESPONSE" | grep -o '"cpu":[0-9]*\.[0-9]*' | cut -d':' -f2 | cut -d'.' -f1)
    MEM_USAGE=$(echo "$RESPONSE" | grep -o '"memory":[0-9]*\.[0-9]*' | cut -d':' -f2 | cut -d'.' -f1)
    
    if [ -z "$CPU_USAGE" ] || [ -z "$MEM_USAGE" ]; then
        log_error "Failed to get metrics from New Relic"
        CPU_USAGE=50
        MEM_USAGE=50
    fi
    
    log_metric "cpu_usage" "$CPU_USAGE"
    log_metric "mem_usage" "$MEM_USAGE"
}

# =================================================
# Profile switching logic
# =================================================

# Update the profile based on system load
update_profile() {
    local cpu_usage="$1"
    local mem_usage="$2"
    local current_profile="$3"
    local new_profile="$current_profile"
    
    # Simple decision logic
    if [ "$cpu_usage" -gt "$HIGH_CPU_THRESHOLD" ] || [ "$mem_usage" -gt "$HIGH_CPU_THRESHOLD" ]; then
        # High load - switch to aggressive profile for maximum optimization
        new_profile="aggressive"
    elif [ "$cpu_usage" -lt "$LOW_CPU_THRESHOLD" ] && [ "$mem_usage" -lt "$LOW_CPU_THRESHOLD" ]; then
        # Low load - switch to conservative profile
        new_profile="conservative"
    else
        # Moderate load - use balanced profile
        new_profile="balanced"
    fi
    
    # Only log if profile changed
    if [ "$new_profile" != "$current_profile" ]; then
        log "Switching profile from $current_profile to $new_profile (CPU: $cpu_usage%, Memory: $mem_usage%)"
    fi
    
    echo "$new_profile"
}

# Apply the profile to the system based on mode
apply_profile() {
    local profile="$1"
    
    case "$MODE" in
        docker)
            apply_docker_profile "$profile"
            ;;
        native)
            apply_native_profile "$profile"
            ;;
        nr1)
            apply_nr1_profile "$profile"
            ;;
    esac
}

# Apply profile for Docker mode
apply_docker_profile() {
    local profile="$1"
    
    # Update config file for Docker environment
    if [ -f "$CONFIG_FILE" ]; then
        # Find the Docker container running NRDOT
        CONTAINER_ID=$(docker ps --filter "name=nrdot" --format "{{.ID}}")
        
        if [ -n "$CONTAINER_ID" ]; then
            # Create a temporary config file
            TMP_CONFIG="/tmp/nrdot-config-$$.yaml"
            
            # Update the config file with the new profile
            cat "$CONFIG_FILE" | sed "s/^profile:.*/profile: $profile/" > "$TMP_CONFIG"
            
            # Copy the config file to the container
            docker cp "$TMP_CONFIG" "$CONTAINER_ID:$CONFIG_FILE"
            
            # Remove temporary file
            rm -f "$TMP_CONFIG"
            
            # Reload the collector configuration
            docker exec "$CONTAINER_ID" /usr/local/bin/reload-collector.sh
            
            log "Applied $profile profile to Docker container $CONTAINER_ID"
        else
            log_error "No NRDOT Docker container found"
        fi
    else
        log_error "Config file not found: $CONFIG_FILE"
    fi
}

# Apply profile for native mode
apply_native_profile() {
    local profile="$1"
    
    # Update config file for native environment
    if [ -f "$CONFIG_FILE" ]; then
        # Create a backup
        cp "$CONFIG_FILE" "$CONFIG_FILE.bak"
        
        # Update the config file with the new profile
        sed -i "s/^profile:.*/profile: $profile/" "$CONFIG_FILE"
        
        # Reload the collector configuration
        if command -v systemctl > /dev/null 2>&1; then
            systemctl reload nrdot-collector
        else
            killall -HUP otelcol-contrib 2>/dev/null || true
        fi
        
        log "Applied $profile profile to native system"
    else
        log_error "Config file not found: $CONFIG_FILE"
    fi
}

# Apply profile for NR1 mode
apply_nr1_profile() {
    local profile="$1"
    
    if [ -z "$API_KEY" ] || [ -z "$ACCOUNT_ID" ]; then
        log_error "NR1 mode requires API_KEY and ACCOUNT_ID to be set"
        return 1
    fi
    
    # Update optimization file
    if [ -f "$OPTIMIZATION_FILE" ]; then
        # Create a backup
        cp "$OPTIMIZATION_FILE" "$OPTIMIZATION_FILE.bak"
        
        # Update the optimization file
        cat > "$OPTIMIZATION_FILE" << EOF
# NRDOT Optimization Configuration
# Updated: $(date -u)
profile: $profile
target_coverage: 95
cost_reduction_target: $(case "$profile" in
                            conservative) echo "40" ;;
                            balanced) echo "60" ;;
                            aggressive) echo "80" ;;
                        esac)
EOF
        
        # Store configuration in NerdStorage
        MUTATION="{\"query\":\"mutation {nerdStorageWriteDocument(collection: \\\"nrdot\\\", documentId: \\\"profile\\\", document: {profile: \\\"$profile\\\"}) {success}}\"}"
        
        curl -s -X POST "$NERDSTORAGE_URL" \
             -H "Content-Type: application/json" \
             -H "API-Key: $API_KEY" \
             -d "$MUTATION" > /dev/null
        
        log "Applied $profile profile to NR1 integration"
    else
        log_error "Optimization file not found: $OPTIMIZATION_FILE"
    fi
}

# =================================================
# Main control loop
# =================================================

main() {
    parse_args "$@"
    ensure_log_dir
    
    log "Starting NRDOT Control Loop in $MODE mode"
    log "Initial profile: $PROFILE"
    log "Check interval: $CHECK_INTERVAL seconds"
    
    # Apply initial profile
    apply_profile "$PROFILE"
    
    # Main control loop
    while true; do
        log "Checking system metrics..."
        
        # Get metrics based on mode
        case "$MODE" in
            docker)
                get_docker_metrics
                ;;
            native)
                get_native_metrics
                ;;
            nr1)
                get_nr1_metrics
                ;;
        esac
        
        # Update profile based on metrics
        NEW_PROFILE=$(update_profile "$CPU_USAGE" "$MEM_USAGE" "$PROFILE")
        
        # Apply new profile if it changed
        if [ "$NEW_PROFILE" != "$PROFILE" ]; then
            PROFILE="$NEW_PROFILE"
            apply_profile "$PROFILE"
        fi
        
        log "Current profile: $PROFILE (CPU: $CPU_USAGE%, Memory: $MEM_USAGE%)"
        log "Sleeping for $CHECK_INTERVAL seconds..."
        sleep "$CHECK_INTERVAL"
    done
}

# Run the main function
main "$@"
