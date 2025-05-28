#!/bin/bash
# NRDOT KPI-Based Automation Script
# Automatically adjusts profiles based on real-time KPIs

set -euo pipefail

# Configuration
readonly SCRIPT_NAME=$(basename "$0")
readonly STATE_DIR="/var/lib/nrdot-plus/state"
readonly LOG_FILE="/var/log/nrdot-plus/kpi-automation.log"
readonly METRICS_URL="http://localhost:8888/metrics"
readonly CHECK_INTERVAL=${NRDOT_KPI_CHECK_INTERVAL:-300}  # 5 minutes

# KPI Targets
readonly TARGET_COVERAGE=95.0      # Minimum coverage percentage
readonly TARGET_COST_MAX=0.10      # Maximum cost per hour
readonly TARGET_SERIES_MAX=10000   # Maximum series count
readonly TARGET_CPU_MAX=80.0       # Maximum CPU utilization
readonly TARGET_MEMORY_MAX=1024    # Maximum memory in MB

# Create directories
mkdir -p "$STATE_DIR" "$(dirname "$LOG_FILE")"

# Logging
log() {
    local level=$1
    shift
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [$level] $*" | tee -a "$LOG_FILE"
}

# Fetch current KPIs from collector
fetch_kpis() {
    local response=$(curl -s --max-time 10 "$METRICS_URL" 2>/dev/null || echo "")
    
    if [[ -z "$response" ]]; then
        log ERROR "Failed to fetch metrics"
        return 1
    fi
    
    # Parse KPIs from Prometheus metrics
    local kpis=$(cat <<EOF
{
    "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
    "total_series": $(echo "$response" | grep '^nrdot_summary_total_series' | awk '{print $2}' | head -1 || echo 0),
    "coverage": $(echo "$response" | grep '^nrdot_summary_coverage' | awk '{print $2}' | head -1 || echo 0),
    "cost_per_hour": $(echo "$response" | grep '^nrdot_kpi_cost_total' | awk '{print $2}' | head -1 || echo 0),
    "cpu_utilization": $(echo "$response" | grep '^nrdot_kpi_cpu_by_class' | awk '{sum+=$2; count++} END {print sum/count}' || echo 0),
    "memory_mb": $(echo "$response" | grep '^nrdot_kpi_memory_by_tier' | awk '{sum+=$2} END {print sum/1048576}' || echo 0),
    "anomaly_count": $(echo "$response" | grep 'nrdot_anomaly_detected="true"' | wc -l || echo 0),
    "process_count": {
        "critical": $(echo "$response" | grep 'process_tier="1"' | grep 'nrdot_kpi_process_count' | awk '{print $2}' | head -1 || echo 0),
        "database": $(echo "$response" | grep 'process_tier="2"' | grep 'nrdot_kpi_process_count' | awk '{print $2}' | head -1 || echo 0),
        "web_server": $(echo "$response" | grep 'process_tier="3"' | grep 'nrdot_kpi_process_count' | awk '{print $2}' | head -1 || echo 0),
        "application": $(echo "$response" | grep 'process_tier="5"' | grep 'nrdot_kpi_process_count' | awk '{print $2}' | head -1 || echo 0),
        "other": $(echo "$response" | grep 'process_tier="6"' | grep 'nrdot_kpi_process_count' | awk '{print $2}' | head -1 || echo 0)
    }
}
EOF
)
    
    echo "$kpis"
}

# Get current profile
get_current_profile() {
    grep -E '^NRDOT_ACTIVE_PROFILE=' /etc/default/nrdot-plus 2>/dev/null | cut -d'"' -f2 || echo "balanced"
}

# Update profile
update_profile() {
    local new_profile=$1
    local reason=$2
    
    log INFO "Updating profile to '$new_profile': $reason"
    
    # Update environment file
    sed -i "s/^NRDOT_ACTIVE_PROFILE=.*/NRDOT_ACTIVE_PROFILE=\"$new_profile\"/" /etc/default/nrdot-plus
    
    # Apply profile-specific settings
    case $new_profile in
        conservative)
            cat >> /etc/default/nrdot-plus <<EOF
NRDOT_MIN_IMPORTANCE="0.2"
NRDOT_CPU_THRESHOLD="5.0"
NRDOT_MEMORY_THRESHOLD_MB="50"
EOF
            ;;
        balanced)
            cat >> /etc/default/nrdot-plus <<EOF
NRDOT_MIN_IMPORTANCE="0.5"
NRDOT_CPU_THRESHOLD="10.0"
NRDOT_MEMORY_THRESHOLD_MB="100"
EOF
            ;;
        aggressive)
            cat >> /etc/default/nrdot-plus <<EOF
NRDOT_MIN_IMPORTANCE="0.7"
NRDOT_CPU_THRESHOLD="20.0"
NRDOT_MEMORY_THRESHOLD_MB="200"
EOF
            ;;
    esac
    
    # Record change
    local change_record=$(cat <<EOF
{
    "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
    "from": "$(get_current_profile)",
    "to": "$new_profile",
    "reason": "$reason",
    "automated": true
}
EOF
)
    
    echo "$change_record" >> "$STATE_DIR/profile_changes.jsonl"
    
    # Reload collector
    systemctl reload nrdot-plus || log ERROR "Failed to reload collector"
}

# Decide profile based on KPIs
decide_profile() {
    local kpis=$1
    local current_profile=$(get_current_profile)
    
    # Extract values
    local coverage=$(echo "$kpis" | jq -r '.coverage')
    local cost=$(echo "$kpis" | jq -r '.cost_per_hour')
    local series=$(echo "$kpis" | jq -r '.total_series')
    local cpu=$(echo "$kpis" | jq -r '.cpu_utilization')
    local memory=$(echo "$kpis" | jq -r '.memory_mb')
    local anomalies=$(echo "$kpis" | jq -r '.anomaly_count')
    
    log INFO "KPIs: coverage=$coverage%, cost=\$$cost/hr, series=$series, cpu=$cpu%, memory=${memory}MB, anomalies=$anomalies"
    
    # Decision logic
    local new_profile=$current_profile
    local reason=""
    
    # Priority 1: Coverage below target
    if (( $(awk "BEGIN {print ($coverage < $TARGET_COVERAGE)}") )); then
        case $current_profile in
            aggressive)
                new_profile="balanced"
                reason="Coverage $coverage% below target $TARGET_COVERAGE%"
                ;;
            balanced)
                new_profile="conservative"
                reason="Coverage still below target"
                ;;
        esac
    
    # Priority 2: Cost above target
    elif (( $(awk "BEGIN {print ($cost > $TARGET_COST_MAX)}") )); then
        case $current_profile in
            conservative)
                new_profile="balanced"
                reason="Cost \$$cost/hr exceeds target \$$TARGET_COST_MAX/hr"
                ;;
            balanced)
                new_profile="aggressive"
                reason="Cost still above target"
                ;;
        esac
    
    # Priority 3: Series count too high
    elif (( $(awk "BEGIN {print ($series > $TARGET_SERIES_MAX)}") )); then
        case $current_profile in
            conservative)
                new_profile="balanced"
                reason="Series count $series exceeds limit $TARGET_SERIES_MAX"
                ;;
            balanced)
                new_profile="aggressive"
                reason="Series count still too high"
                ;;
        esac
    
    # Priority 4: Resource usage high
    elif (( $(awk "BEGIN {print ($cpu > $TARGET_CPU_MAX || $memory > $TARGET_MEMORY_MAX)}") )); then
        if [[ $current_profile != "aggressive" ]]; then
            new_profile="aggressive"
            reason="High resource usage: CPU=$cpu%, Memory=${memory}MB"
        fi
    
    # Priority 5: Optimize if all targets met
    elif [[ $current_profile == "conservative" ]] && \
         (( $(awk "BEGIN {print ($coverage > 98 && $cost < $TARGET_COST_MAX * 0.5)}") )); then
        new_profile="balanced"
        reason="All KPIs healthy, optimizing for cost"
    fi
    
    # Check for anomaly surge
    if (( anomalies > 50 )) && [[ $new_profile == "aggressive" ]]; then
        new_profile="balanced"
        reason="High anomaly count: $anomalies processes"
    fi
    
    echo "$new_profile|$reason"
}

# Calculate performance score
calculate_score() {
    local kpis=$1
    
    # Weighted scoring (higher is better)
    # Coverage: 40%, Cost savings: 30%, Performance: 20%, Stability: 10%
    
    local coverage=$(echo "$kpis" | jq -r '.coverage')
    local cost=$(echo "$kpis" | jq -r '.cost_per_hour')
    local cpu=$(echo "$kpis" | jq -r '.cpu_utilization')
    local anomalies=$(echo "$kpis" | jq -r '.anomaly_count')
    
    # Normalize scores (0-100)
    local coverage_score=$(awk "BEGIN {print $coverage}")
    local cost_score=$(awk "BEGIN {print (1 - $cost / 1.0) * 100}")  # Assuming $1/hr is worst case
    local perf_score=$(awk "BEGIN {print (1 - $cpu / 100) * 100}")
    local stability_score=$(awk "BEGIN {print (1 - $anomalies / 100) * 100}")  # Assuming 100 anomalies is worst
    
    # Calculate weighted score
    local total_score=$(awk "BEGIN {
        print ($coverage_score * 0.4 + $cost_score * 0.3 + $perf_score * 0.2 + $stability_score * 0.1)
    }")
    
    echo "$total_score"
}

# Store KPI history
store_kpi_history() {
    local kpis=$1
    local profile=$(get_current_profile)
    local score=$(calculate_score "$kpis")
    
    # Add metadata
    local history_entry=$(echo "$kpis" | jq \
        --arg profile "$profile" \
        --arg score "$score" \
        '. + {profile: $profile, score: ($score | tonumber)}')
    
    # Append to history
    echo "$history_entry" >> "$STATE_DIR/kpi_history.jsonl"
    
    # Rotate if too large (keep last 10000 entries)
    if [[ $(wc -l < "$STATE_DIR/kpi_history.jsonl") -gt 10000 ]]; then
        tail -9000 "$STATE_DIR/kpi_history.jsonl" > "$STATE_DIR/kpi_history.jsonl.tmp"
        mv "$STATE_DIR/kpi_history.jsonl.tmp" "$STATE_DIR/kpi_history.jsonl"
    fi
}

# Generate KPI report
generate_report() {
    if [[ ! -f "$STATE_DIR/kpi_history.jsonl" ]]; then
        log WARN "No KPI history available"
        return
    fi
    
    # Last 24 hours of data
    local since=$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')
    
    # Generate summary
    local summary=$(jq -s --arg since "$since" '
        map(select(.timestamp > $since)) |
        group_by(.profile) |
        map({
            profile: .[0].profile,
            samples: length,
            avg_coverage: (map(.coverage) | add / length),
            avg_cost: (map(.cost_per_hour) | add / length),
            avg_series: (map(.total_series) | add / length),
            avg_score: (map(.score) | add / length),
            anomaly_rate: (map(.anomaly_count) | add / length)
        }) |
        sort_by(.avg_score) | reverse
    ' "$STATE_DIR/kpi_history.jsonl")
    
    echo "=== NRDOT KPI Report (Last 24 Hours) ==="
    echo
    echo "$summary" | jq -r '.[] | 
        "Profile: \(.profile)\n" +
        "  Samples: \(.samples)\n" +
        "  Avg Coverage: \(.avg_coverage | round)%\n" +
        "  Avg Cost: $\(.avg_cost)/hr\n" +
        "  Avg Series: \(.avg_series | round)\n" +
        "  Performance Score: \(.avg_score | round)/100\n" +
        "  Anomaly Rate: \(.anomaly_rate | round) per interval\n"'
    
    # Best profile recommendation
    local best=$(echo "$summary" | jq -r '.[0] | "Recommended Profile: \(.profile) (Score: \(.avg_score | round))"')
    echo "=== $best ==="
}

# Main loop
main() {
    log INFO "Starting KPI automation (PID: $$)"
    
    # Signal handling
    trap 'log INFO "Shutting down KPI automation"; exit 0' TERM INT
    
    while true; do
        # Fetch current KPIs
        if kpis=$(fetch_kpis); then
            # Store history
            store_kpi_history "$kpis"
            
            # Make decision
            decision=$(decide_profile "$kpis")
            new_profile="${decision%%|*}"
            reason="${decision#*|}"
            
            # Apply if changed
            if [[ -n "$reason" ]] && [[ "$new_profile" != "$(get_current_profile)" ]]; then
                update_profile "$new_profile" "$reason"
            fi
        else
            log ERROR "Failed to fetch KPIs"
        fi
        
        # Wait for next check
        sleep "$CHECK_INTERVAL"
    done
}

# Handle commands
case "${1:-run}" in
    run)
        main
        ;;
    report)
        generate_report
        ;;
    status)
        kpis=$(fetch_kpis)
        echo "Current KPIs:"
        echo "$kpis" | jq .
        echo
        echo "Current Profile: $(get_current_profile)"
        echo "Performance Score: $(calculate_score "$kpis")/100"
        ;;
    *)
        echo "Usage: $0 {run|report|status}"
        exit 1
        ;;
esac