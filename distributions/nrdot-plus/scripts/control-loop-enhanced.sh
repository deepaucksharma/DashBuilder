#!/bin/bash
# NRDOT-Plus Enhanced Control Loop with Hysteresis and GitOps Support
# Version: 2.1.0

set -euo pipefail

# Configuration
readonly SCRIPT_NAME="nrdot-control-loop"
readonly CONFIG_DIR="${CONFIG_DIR:-/etc/nrdot-plus}"
readonly STATE_DIR="${STATE_DIR:-/var/lib/nrdot-plus}"
readonly LOG_DIR="${LOG_DIR:-/var/log/nrdot-plus}"
readonly OPTIMIZATION_FILE="${CONFIG_DIR}/optimization.yaml"
readonly STATE_FILE="${STATE_DIR}/control-state.json"
readonly COLLECTOR_SERVICE="${COLLECTOR_SERVICE:-nrdot-collector.service}"

# Hysteresis configuration (Day 1 improvement)
readonly HYSTERESIS_WINDOW=300  # 5 minutes
readonly MIN_DWELL_TIME=300     # 5 minutes minimum per profile level
readonly PROFILE_HISTORY_SIZE=10

# Logging
log() {
    local level="$1"
    shift
    echo "$(date -Iseconds) [$level] $SCRIPT_NAME: $*" | tee -a "${LOG_DIR}/control-loop.log"
}

# State management functions
init_state() {
    if [[ ! -f "$STATE_FILE" ]]; then
        cat > "$STATE_FILE" <<EOF
{
    "current_profile": "balanced",
    "last_profile_change": "$(date -Iseconds)",
    "profile_history": [],
    "anomaly_count": 0,
    "last_anomaly_time": null,
    "collector_restarts": 0,
    "last_restart_time": null
}
EOF
        log "INFO" "Initialized control loop state"
    fi
}

read_state() {
    local key="$1"
    jq -r ".$key // empty" "$STATE_FILE" 2>/dev/null || echo ""
}

update_state() {
    local key="$1"
    local value="$2"
    local temp_file=$(mktemp)
    
    jq --arg k "$key" --arg v "$value" '
        . + {($k): (if ($v | test("^[0-9]+$")) then ($v | tonumber) else $v end)}
    ' "$STATE_FILE" > "$temp_file"
    
    mv "$temp_file" "$STATE_FILE"
}

add_to_history() {
    local profile="$1"
    local timestamp="$(date -Iseconds)"
    local temp_file=$(mktemp)
    
    jq --arg p "$profile" --arg t "$timestamp" '
        .profile_history = ([{profile: $p, timestamp: $t}] + .profile_history)[0:10]
    ' "$STATE_FILE" > "$temp_file"
    
    mv "$temp_file" "$STATE_FILE"
}

# Check if profile change is allowed (hysteresis)
can_change_profile() {
    local new_profile="$1"
    local current_profile=$(read_state "current_profile")
    local last_change=$(read_state "last_profile_change")
    
    # Same profile, no change needed
    [[ "$new_profile" == "$current_profile" ]] && return 1
    
    # Check minimum dwell time
    if [[ -n "$last_change" ]]; then
        local elapsed=$(( $(date +%s) - $(date -d "$last_change" +%s) ))
        if [[ $elapsed -lt $MIN_DWELL_TIME ]]; then
            log "INFO" "Profile change blocked: minimum dwell time not met (${elapsed}s < ${MIN_DWELL_TIME}s)"
            return 1
        fi
    fi
    
    # Check for profile flapping (rapid changes)
    local recent_changes=$(jq -r '
        .profile_history | 
        map(select(.timestamp > (now - 600 | strftime("%Y-%m-%dT%H:%M:%S")))) | 
        length
    ' "$STATE_FILE")
    
    if [[ $recent_changes -gt 3 ]]; then
        log "WARN" "Profile change blocked: too many recent changes (${recent_changes} in 10 min)"
        return 1
    fi
    
    return 0
}

# Query metrics from New Relic
query_metrics() {
    local nrql="$1"
    local account_id="${NR_ACCOUNT_ID}"
    local api_key="${NR_API_KEY}"
    
    curl -s -H "Api-Key: ${api_key}" \
        -H "Content-Type: application/json" \
        -d "{\"nrql\": \"${nrql}\", \"accountId\": ${account_id}}" \
        "https://api.newrelic.com/graphql" | \
        jq -r '.data.nrqlQuery.results[0] // empty'
}

# Calculate current metrics
get_current_metrics() {
    local metrics_json=$(mktemp)
    
    # Coverage metric
    local coverage=$(query_metrics "SELECT average(nrdot.coverage.score) FROM Metric WHERE service.name = 'nrdot-plus-host' SINCE 5 minutes ago")
    
    # Cost metric
    local cost=$(query_metrics "SELECT sum(nrdot.estimated.cost) FROM Metric WHERE service.name = 'nrdot-plus-host' SINCE 5 minutes ago")
    
    # Anomaly count
    local anomalies=$(query_metrics "SELECT count(*) FROM Metric WHERE process.is_anomaly = true AND service.name = 'nrdot-plus-host' SINCE 5 minutes ago")
    
    # Series count
    local series=$(query_metrics "SELECT uniqueCount(dimensions()) FROM Metric WHERE service.name = 'nrdot-plus-host' SINCE 5 minutes ago")
    
    cat > "$metrics_json" <<EOF
{
    "coverage": ${coverage:-0},
    "cost": ${cost:-0},
    "anomalies": ${anomalies:-0},
    "series": ${series:-0},
    "timestamp": "$(date -Iseconds)"
}
EOF
    
    echo "$metrics_json"
}

# Determine optimal profile based on metrics
determine_profile() {
    local metrics_file="$1"
    local current_profile=$(read_state "current_profile")
    
    local coverage=$(jq -r '.coverage' "$metrics_file")
    local cost=$(jq -r '.cost' "$metrics_file")
    local anomalies=$(jq -r '.anomalies' "$metrics_file")
    
    # Profile decision logic with hysteresis thresholds
    local new_profile="$current_profile"
    
    case "$current_profile" in
        aggressive)
            # Only back off if cost is very high or coverage is excessive
            if (( $(echo "$cost > 100" | bc -l) )); then
                new_profile="balanced"
            fi
            ;;
        balanced)
            # Move to aggressive if coverage is low, conservative if cost is high
            if (( $(echo "$coverage < 0.85" | bc -l) )); then
                new_profile="aggressive"
            elif (( $(echo "$cost > 80" | bc -l) )); then
                new_profile="conservative"
            fi
            ;;
        conservative)
            # Only increase if coverage is critically low
            if (( $(echo "$coverage < 0.70" | bc -l) )); then
                new_profile="balanced"
            fi
            ;;
    esac
    
    # Check for anomaly surge (emergency response)
    if (( anomalies > 50 )); then
        log "WARN" "Anomaly surge detected: ${anomalies} anomalies"
        new_profile="aggressive"
    fi
    
    echo "$new_profile"
}

# Apply profile change with hot-reload
apply_profile() {
    local new_profile="$1"
    
    log "INFO" "Applying profile: ${new_profile}"
    
    # Update optimization file
    yq eval ".state.active_profile = \"${new_profile}\"" -i "$OPTIMIZATION_FILE"
    
    # Hot-reload collector (Day 0 improvement)
    if systemctl reload "$COLLECTOR_SERVICE"; then
        log "INFO" "Collector reloaded successfully with profile: ${new_profile}"
        update_state "current_profile" "$new_profile"
        update_state "last_profile_change" "$(date -Iseconds)"
        add_to_history "$new_profile"
    else
        log "ERROR" "Failed to reload collector"
        # Fall back to restart if reload fails
        if systemctl restart "$COLLECTOR_SERVICE"; then
            log "WARN" "Collector restarted (reload failed)"
            local restart_count=$(( $(read_state "collector_restarts") + 1 ))
            update_state "collector_restarts" "$restart_count"
            update_state "last_restart_time" "$(date -Iseconds)"
        else
            log "ERROR" "Failed to restart collector"
            exit 1
        fi
    fi
}

# Git operations for configuration tracking (Day 0 improvement)
commit_config_change() {
    local profile="$1"
    local metrics_file="$2"
    
    if [[ -d "${CONFIG_DIR}/.git" ]]; then
        cd "$CONFIG_DIR"
        git add optimization.yaml
        git commit -m "Profile change: ${profile} - Coverage: $(jq -r '.coverage' "$metrics_file")%, Cost: \$$(jq -r '.cost' "$metrics_file")" || true
        cd - > /dev/null
    fi
}

# Main control loop
main() {
    log "INFO" "Starting enhanced control loop"
    
    # Initialize state
    init_state
    
    # Main loop
    while true; do
        log "INFO" "Control loop iteration starting"
        
        # Get current metrics
        local metrics_file=$(get_current_metrics)
        
        # Determine optimal profile
        local new_profile=$(determine_profile "$metrics_file")
        local current_profile=$(read_state "current_profile")
        
        log "INFO" "Current profile: ${current_profile}, Recommended: ${new_profile}"
        
        # Apply profile if changed and allowed
        if can_change_profile "$new_profile"; then
            apply_profile "$new_profile"
            commit_config_change "$new_profile" "$metrics_file"
        fi
        
        # Cleanup
        rm -f "$metrics_file"
        
        # Sleep before next iteration
        sleep "${POLL_INTERVAL:-60}"
    done
}

# Signal handlers
trap 'log "INFO" "Control loop stopped"; exit 0' SIGTERM SIGINT

# Run main loop
main