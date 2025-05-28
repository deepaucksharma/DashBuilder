#!/bin/bash
# NRDOT-Plus Control Loop - Consolidated Version
# Combines best features from all control loop implementations

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
readonly ENABLE_SECURE_MODE=${NRDOT_SECURE_MODE:-false}

# Ensure directories exist
mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR"

# Logging function
log() {
    local level=$1
    shift
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [$level] $*" | tee -a "$LOG_FILE"
}

# Validate environment
validate_environment() {
    local errors=0
    
    # Check required commands
    for cmd in yq curl awk jq systemctl; do
        if ! command -v "$cmd" &>/dev/null; then
            log ERROR "Required command not found: $cmd"
            ((errors++))
        fi
    done
    
    # Check required files
    if [[ ! -f "$CONFIG_FILE" ]]; then
        log ERROR "Configuration file not found: $CONFIG_FILE"
        ((errors++))
    fi
    
    # Check if collector is running
    if ! systemctl is-active --quiet nrdot-plus; then
        log ERROR "NRDOT collector service is not running"
        ((errors++))
    fi
    
    # Check metrics endpoint
    if ! curl -s --max-time 5 "$METRICS_URL" >/dev/null 2>&1; then
        log ERROR "Cannot reach metrics endpoint: $METRICS_URL"
        ((errors++))
    fi
    
    return $errors
}

# Check if control loop is enabled
if [[ "$ENABLE_CONTROL_LOOP" != "true" ]]; then
    log INFO "Control loop disabled via NRDOT_ENABLE_CONTROL_LOOP"
    exit 0
fi

# Float comparison using awk (no bc dependency)
float_compare() {
    local a=$1
    local op=$2
    local b=$3
    
    awk -v a="$a" -v b="$b" "BEGIN { if (a $op b) exit 0; else exit 1 }"
}

# Get metric value from Prometheus endpoint
get_metric() {
    local metric=$1
    local default=${2:-0}
    
    # Convert dots to underscores for Prometheus format
    local prom_metric=${metric//./_}
    
    # Fetch with timeout
    local response
    if ! response=$(curl -s --max-time 5 "$METRICS_URL" 2>/dev/null); then
        log WARN "Failed to fetch metrics from $METRICS_URL"
        echo "$default"
        return 1
    fi
    
    # Extract metric value with precise matching
    local value
    value=$(echo "$response" | awk -v metric="^${prom_metric}\\s" '
        $0 ~ metric && $0 !~ /^#/ {
            # Extract the numeric value after the metric name
            for (i=2; i<=NF; i++) {
                if ($i ~ /^[0-9]+\.?[0-9]*$/) {
                    print $i
                    exit
                }
            }
        }
    ' | head -1)
    
    # Validate numeric value
    if [[ -z "$value" ]] || ! [[ "$value" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        log DEBUG "No valid value found for metric $metric, using default $default"
        echo "$default"
        return 1
    fi
    
    echo "$value"
}

# Calculate coverage metric
calculate_coverage() {
    # Get process counts by importance
    local critical_count=$(get_metric "nrdot_process_count{process_importance=\"1.0\"}" "0")
    local important_count=$(get_metric "nrdot_process_count{process_importance=\"0.9\"}" "0")
    local moderate_count=$(get_metric "nrdot_process_count{process_importance=\"0.8\"}" "0")
    
    # Total high-importance processes
    local total_important=$(awk "BEGIN { print $critical_count + $important_count + $moderate_count }")
    
    # Get kept series count
    local kept_series=$(get_metric "nrdot_process_series_kept" "0")
    
    # Calculate coverage (processes kept / total important)
    if float_compare "$total_important" ">" "0"; then
        awk "BEGIN { printf \"%.2f\", $kept_series / $total_important }"
    else
        echo "1.0"
    fi
}

# Validate YAML syntax
validate_yaml() {
    local file=$1
    
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
            -d "$payload" \
            --max-time 10 || log WARN "Failed to send webhook"
    fi
}

# Atomic configuration update with proper locking
update_config() {
    local new_profile=$1
    local reason=$2
    local lock_file="${CONFIG_FILE}.lock"
    
    # Acquire exclusive lock with timeout
    exec 200>"$lock_file"
    if ! flock -x -w 5 200; then
        log ERROR "Cannot acquire config lock"
        return 1
    fi
    
    # Verify collector is ready
    if ! systemctl is-active --quiet nrdot-plus; then
        log ERROR "Collector not running, cannot update config"
        flock -u 200
        return 1
    fi
    
    # Read current state
    local current_profile
    current_profile=$(yq eval '.state.active_profile' "$CONFIG_FILE")
    
    if [[ "$current_profile" == "$new_profile" ]]; then
        flock -u 200
        return 0
    fi
    
    # Validate new profile exists
    if ! yq eval ".profiles.$new_profile" "$CONFIG_FILE" &>/dev/null; then
        log ERROR "Profile $new_profile does not exist in configuration"
        flock -u 200
        return 1
    fi
    
    log INFO "Profile change: $current_profile -> $new_profile (Reason: $reason)"
    
    # Create backup
    local backup_file="${CONFIG_FILE}.backup.$(date +%s)"
    cp "$CONFIG_FILE" "$backup_file"
    
    # Create updated config
    local temp_file="${CONFIG_FILE}.tmp.$$"
    cp "$CONFIG_FILE" "$temp_file"
    
    # Update profile and metadata
    local timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    yq eval -i ".state.active_profile = \"$new_profile\"" "$temp_file"
    yq eval -i ".state.last_updated = \"$timestamp\"" "$temp_file"
    yq eval -i ".state.updated_by = \"$SCRIPT_NAME\"" "$temp_file"
    
    # Validate before applying
    if ! validate_yaml "$temp_file"; then
        rm -f "$temp_file"
        flock -u 200
        return 1
    fi
    
    # Wait for any ongoing config reads
    sleep 0.5
    
    # Atomic replace with sync
    mv -f "$temp_file" "$CONFIG_FILE"
    sync
    
    # Record state change
    local change_record=$(cat <<EOF
{
  "timestamp": "$timestamp",
  "from": "$current_profile",
  "to": "$new_profile",
  "reason": "$reason",
  "host": "$(hostname)"
}
EOF
)
    
    # Atomic append to state file
    echo "$change_record" >> "$STATE_DIR/profile_changes.jsonl"
    
    # Rotate state file if too large (10MB)
    if [[ -f "$STATE_DIR/profile_changes.jsonl" ]] && [[ $(stat -f%z "$STATE_DIR/profile_changes.jsonl" 2>/dev/null || stat -c%s "$STATE_DIR/profile_changes.jsonl") -gt 10485760 ]]; then
        mv "$STATE_DIR/profile_changes.jsonl" "$STATE_DIR/profile_changes.jsonl.$(date +%s)"
        touch "$STATE_DIR/profile_changes.jsonl"
    fi
    
    # Release lock
    flock -u 200
    
    # Send webhook
    send_webhook "profile_change" "$change_record"
    
    # Reload collector with retry
    local retry=0
    while ! systemctl reload nrdot-plus 2>/dev/null && [[ $retry -lt 3 ]]; do
        sleep 1
        ((retry++))
    done
    
    if [[ $retry -eq 3 ]]; then
        log ERROR "Failed to reload collector after 3 attempts"
        return 1
    fi
    
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
    recent_changes=$(jq -s "[.[] | select(.timestamp > \"$five_min_ago\")] | length" "$changes_file" 2>/dev/null || echo 0)
    
    if [[ $recent_changes -gt 3 ]]; then
        log WARN "Thrashing detected: $recent_changes changes in 5 minutes"
        return 1
    fi
    
    return 0
}

# Main control logic
control_decision() {
    # Gather metrics
    local total_series=$(get_metric "nrdot_process_series_total" "0")
    local kept_series=$(get_metric "nrdot_process_series_kept" "$total_series")
    local coverage=$(calculate_coverage)
    local cost_hour=$(get_metric "nrdot_estimated_cost_per_hour" "0")
    
    # Current profile
    local current_profile
    current_profile=$(yq eval '.state.active_profile' "$CONFIG_FILE")
    
    # Calculate derived metrics
    local reduction_pct=0
    if float_compare "$total_series" ">" "0"; then
        reduction_pct=$(awk "BEGIN { printf \"%.0f\", ($total_series - $kept_series) * 100 / $total_series }")
    fi
    
    log INFO "Metrics: series=$kept_series/$total_series (${reduction_pct}% reduction), coverage=$coverage, cost=\$$cost_hour/hr, profile=$current_profile"
    
    # Decision tree
    local new_profile="$current_profile"
    local reason=""
    
    # Priority 1: High cost control
    if float_compare "$cost_hour" ">" "$(awk "BEGIN { print $MAX_COST_HOUR * 2 }")"; then
        new_profile="aggressive"
        reason="Cost high: \$$cost_hour/hr exceeds 2x budget"
    
    # Priority 2: Coverage protection
    elif float_compare "$coverage" "<" "$MIN_COVERAGE"; then
        case "$current_profile" in
            aggressive)
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
    
    # Priority 4: Cost optimization
    elif float_compare "$cost_hour" ">" "$MAX_COST_HOUR" && float_compare "$coverage" ">=" "$MIN_COVERAGE"; then
        case "$current_profile" in
            conservative)
                new_profile="balanced"
                reason="Cost optimization needed: \$$cost_hour/hr > budget"
                ;;
            balanced)
                new_profile="aggressive"
                reason="Further cost optimization needed"
                ;;
        esac
    
    # Priority 5: Relaxation when possible
    elif float_compare "$kept_series" "<" "$(awk "BEGIN { print $TARGET_SERIES * 0.8 }")" && \
         float_compare "$cost_hour" "<" "$(awk "BEGIN { print $MAX_COST_HOUR * 0.8 }")"; then
        case "$current_profile" in
            aggressive)
                new_profile="balanced"
                reason="Have headroom: series=$kept_series, cost=\$$cost_hour"
                ;;
            balanced)
                if float_compare "$cost_hour" "<" "$(awk "BEGIN { print $MAX_COST_HOUR * 0.5 }")"; then
                    new_profile="conservative"
                    reason="Plenty of headroom for better visibility"
                fi
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
            log INFO "Current profile: $(yq eval '.state.active_profile' "$CONFIG_FILE" 2>/dev/null || echo 'unknown')"
            log INFO "Recent changes: $(tail -5 "$STATE_DIR/profile_changes.jsonl" 2>/dev/null || echo 'none')"
            ;;
        TERM|INT)
            log INFO "Received shutdown signal"
            rm -f "$LOCK_FILE"
            exit 0
            ;;
    esac
}

# Main loop
main() {
    log INFO "NRDOT-Plus control loop starting (PID: $$)"
    
    # Validate environment first
    if ! validate_environment; then
        log ERROR "Environment validation failed"
        exit 1
    fi
    
    # Acquire exclusive lock
    exec 200>"$LOCK_FILE"
    if ! flock -n 200; then
        log ERROR "Another instance is already running"
        exit 1
    fi
    
    # Clean up lock on exit
    trap 'exec 200>&-; rm -f "$LOCK_FILE"' EXIT
    
    # Set up signal handlers
    trap 'handle_signal USR1' USR1
    trap 'handle_signal USR2' USR2
    trap 'handle_signal TERM' TERM
    trap 'handle_signal INT' INT
    
    log INFO "Control loop initialized successfully"
    
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