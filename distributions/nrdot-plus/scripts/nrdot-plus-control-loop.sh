#!/bin/bash
# NRDOT-Plus Control Loop
# Automatically manages optimization profiles based on metrics

set -euo pipefail

# Constants
readonly SCRIPT_NAME=$(basename "$0")
readonly CONFIG_FILE="/etc/nrdot-plus/optimization.yaml"
readonly COLLECTOR_CONFIG="/etc/nrdot-plus/config.yaml"
readonly METRICS_URL="http://localhost:8888/metrics"
readonly LOCK_FILE="/var/run/nrdot-plus-control-loop.lock"
readonly STATE_DIR="/var/lib/nrdot-plus/state"
readonly LOG_FILE="/var/log/nrdot-plus/control-loop.log"

# Load environment
if [[ -f /etc/default/nrdot-plus ]]; then
    source /etc/default/nrdot-plus
fi

# Configuration parameters with defaults
readonly TARGET_SERIES=${NRDOT_TARGET_SERIES:-5000}
readonly MAX_SERIES=${NRDOT_MAX_SERIES:-10000}
readonly MIN_COVERAGE=${NRDOT_MIN_COVERAGE:-0.95}
readonly MAX_COST_HOUR=${NRDOT_MAX_COST_HOUR:-0.10}
readonly CHECK_INTERVAL=${NRDOT_CHECK_INTERVAL:-30}
readonly ENABLE_CONTROL_LOOP=${NRDOT_ENABLE_CONTROL_LOOP:-true}

# Ensure directories exist
mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR"

# Logging function
log() {
    local level=$1
    shift
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] [$level] $*" | tee -a "$LOG_FILE"
}

# Check if control loop is enabled
if [[ "$ENABLE_CONTROL_LOOP" != "true" ]]; then
    log INFO "Control loop disabled via NRDOT_ENABLE_CONTROL_LOOP"
    exit 0
fi

# Get metric value from Prometheus endpoint
get_metric() {
    local metric=$1
    local default=${2:-0}
    
    # Convert dots to underscores for Prometheus format
    local prom_metric=${metric//./_}
    
    local value
    value=$(curl -s "$METRICS_URL" 2>/dev/null | \
            awk -v metric="^${prom_metric}" '$0 ~ metric && $0 !~ /^#/ {print $2}' | \
            head -1)
    
    echo "${value:-$default}"
}

# Validate YAML syntax
validate_yaml() {
    local file=$1
    
    if ! command -v yq &>/dev/null; then
        log ERROR "yq not found - cannot validate YAML"
        return 1
    fi
    
    if ! yq eval '.' "$file" >/dev/null 2>&1; then
        log ERROR "Invalid YAML in $file"
        return 1
    fi
    
    return 0
}

# Send webhook notification
send_webhook() {
    local event=$1
    local payload=$2
    
    if [[ -n "${NRDOT_WEBHOOK_URL:-}" ]]; then
        curl -s -X POST "$NRDOT_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -H "X-NRDOT-Event: $event" \
            -d "$payload" || log WARN "Failed to send webhook"
    fi
}

# Atomic configuration update
update_config() {
    local new_profile=$1
    local reason=$2
    local temp_file="${CONFIG_FILE}.tmp.$$"
    
    # Read current state
    local current_profile
    current_profile=$(yq eval '.state.active_profile' "$CONFIG_FILE")
    
    if [[ "$current_profile" == "$new_profile" ]]; then
        return 0
    fi
    
    log INFO "Profile change: $current_profile -> $new_profile (Reason: $reason)"
    
    # Create updated config
    cp "$CONFIG_FILE" "$temp_file"
    
    # Update profile and metadata
    yq eval -i ".state.active_profile = \"$new_profile\"" "$temp_file"
    yq eval -i ".state.last_updated = \"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"" "$temp_file"
    yq eval -i ".state.updated_by = \"$SCRIPT_NAME\"" "$temp_file"
    
    # Validate before applying
    if ! validate_yaml "$temp_file"; then
        rm -f "$temp_file"
        return 1
    fi
    
    # Atomic replace
    mv -f "$temp_file" "$CONFIG_FILE"
    
    # Record state change
    local change_record=$(cat <<EOF
{
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "from": "$current_profile",
  "to": "$new_profile",
  "reason": "$reason",
  "host": "$(hostname)"
}
EOF
)
    echo "$change_record" >> "$STATE_DIR/profile_changes.jsonl"
    
    # Send webhook
    send_webhook "profile_change" "$change_record"
    
    # Reload collector
    systemctl reload nrdot-plus || log ERROR "Failed to reload collector"
    
    return 0
}

# Anti-thrashing logic
check_thrashing() {
    local changes_file="$STATE_DIR/profile_changes.jsonl"
    
    if [[ ! -f "$changes_file" ]]; then
        return 0
    fi
    
    # Count changes in last 5 minutes
    local five_min_ago=$(date -u -d '5 minutes ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || \
                        date -u -v-5M '+%Y-%m-%dT%H:%M:%SZ')
    
    local recent_changes
    if command -v jq &>/dev/null; then
        recent_changes=$(jq -s "[.[] | select(.timestamp > \"$five_min_ago\")] | length" "$changes_file" 2>/dev/null || echo 0)
    else
        # Fallback without jq
        recent_changes=$(grep -c "$five_min_ago" "$changes_file" || echo 0)
    fi
    
    if [[ $recent_changes -gt 3 ]]; then
        log WARN "Thrashing detected: $recent_changes changes in 5 minutes"
        return 1
    fi
    
    return 0
}

# Main control logic
control_decision() {
    # Gather metrics
    local total_series=$(get_metric "nrdot_process_series_total")
    local kept_series=$(get_metric "nrdot_process_series_kept" "$total_series")
    local coverage=$(get_metric "nrdot_process_coverage_critical" "1.0")
    local cost_hour=$(get_metric "nrdot_estimated_cost_per_hour" "0")
    
    # Current profile
    local current_profile
    current_profile=$(yq eval '.state.active_profile' "$CONFIG_FILE")
    
    # Calculate derived metrics
    local reduction_pct=0
    if [[ $total_series -gt 0 ]]; then
        reduction_pct=$(( (total_series - kept_series) * 100 / total_series ))
    fi
    
    log INFO "Metrics: series=$kept_series/$total_series (${reduction_pct}% reduction), coverage=$coverage, cost=\$$cost_hour/hr"
    
    # Decision tree
    local new_profile="$current_profile"
    local reason=""
    
    # Priority 1: Emergency cost control
    if (( $(echo "$cost_hour > $MAX_COST_HOUR * 2" | bc -l 2>/dev/null || echo 0) )); then
        new_profile="emergency"
        reason="Cost emergency: \$$cost_hour/hr exceeds 2x budget"
    
    # Priority 2: Coverage protection
    elif (( $(echo "$coverage < $MIN_COVERAGE" | bc -l 2>/dev/null || echo 0) )); then
        case "$current_profile" in
            aggressive|emergency)
                new_profile="balanced"
                reason="Coverage dropped below ${MIN_COVERAGE}"
                ;;
            balanced)
                new_profile="conservative"
                reason="Coverage still below ${MIN_COVERAGE}"
                ;;
        esac
    
    # Priority 3: Series count management
    elif [[ $kept_series -gt $MAX_SERIES ]]; then
        case "$current_profile" in
            conservative)
                new_profile="balanced"
                reason="Series count too high: $kept_series > $MAX_SERIES"
                ;;
            balanced)
                new_profile="aggressive"
                reason="Series count still too high: $kept_series"
                ;;
        esac
    
    # Priority 4: Relaxation when possible
    elif [[ $kept_series -lt $(( TARGET_SERIES * 80 / 100 )) ]] && \
         (( $(echo "$cost_hour < $MAX_COST_HOUR * 0.8" | bc -l 2>/dev/null || echo 0) )); then
        case "$current_profile" in
            emergency|aggressive)
                new_profile="balanced"
                reason="Have headroom: series=$kept_series, cost=\$$cost_hour"
                ;;
            balanced)
                new_profile="conservative"
                reason="Plenty of headroom for better visibility"
                ;;
        esac
    fi
    
    echo "$new_profile|$reason"
}

# Signal handlers
handle_signal() {
    local signal=$1
    case $signal in
        USR1)
            log INFO "Received SIGUSR1 - forcing re-evaluation"
            FORCE_CHECK=true
            ;;
        USR2)
            log INFO "Received SIGUSR2 - dumping state"
            log INFO "Current profile: $(yq eval '.state.active_profile' "$CONFIG_FILE")"
            log INFO "Recent changes: $(tail -5 "$STATE_DIR/profile_changes.jsonl" 2>/dev/null || echo 'none')"
            ;;
        TERM|INT)
            log INFO "Received shutdown signal"
            exit 0
            ;;
    esac
}

# Main loop
main() {
    log INFO "NRDOT-Plus control loop starting (PID: $$)"
    
    # Acquire exclusive lock
    exec 200>"$LOCK_FILE"
    if ! flock -n 200; then
        log ERROR "Another instance is already running"
        exit 1
    fi
    
    # Set up signal handlers
    trap 'handle_signal USR1' USR1
    trap 'handle_signal USR2' USR2
    trap 'handle_signal TERM' TERM
    trap 'handle_signal INT' INT
    trap 'log INFO "Control loop shutting down"' EXIT
    
    # Main control loop
    while true; do
        # Check for thrashing before making changes
        if ! check_thrashing; then
            log WARN "Skipping iteration due to thrashing protection"
            sleep 300  # 5 minute backoff
            continue
        fi
        
        # Make control decision
        local decision
        decision=$(control_decision)
        
        local new_profile="${decision%%|*}"
        local reason="${decision#*|}"
        
        # Apply if changed
        if [[ -n "$reason" ]]; then
            if update_config "$new_profile" "$reason"; then
                # Wait for changes to propagate
                sleep 60
            else
                log ERROR "Failed to update configuration"
            fi
        fi
        
        # Check for forced re-evaluation
        if [[ "${FORCE_CHECK:-false}" == "true" ]]; then
            FORCE_CHECK=false
            continue
        fi
        
        # Normal operation sleep
        sleep "$CHECK_INTERVAL"
    done
}

# Start control loop
main "$@"