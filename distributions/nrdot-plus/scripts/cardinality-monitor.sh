#!/bin/bash
# NRDOT Cardinality Monitoring Script
# Tracks and reports on metric cardinality to prevent cost explosions

set -euo pipefail

# Configuration
readonly SCRIPT_NAME="cardinality-monitor"
readonly NR_ACCOUNT_ID="${NR_ACCOUNT_ID}"
readonly NR_API_KEY="${NR_API_KEY}"
readonly STATE_FILE="/var/lib/nrdot-plus/cardinality-state.json"
readonly LOG_FILE="/var/log/nrdot-plus/cardinality-monitor.log"

# Thresholds
readonly CARDINALITY_LIMIT_PER_HOST=5000
readonly CARDINALITY_LIMIT_GLOBAL=100000
readonly CARDINALITY_GROWTH_RATE_LIMIT=0.10  # 10% growth per hour

# Logging
log() {
    local level="$1"
    shift
    echo "$(date -Iseconds) [$level] $SCRIPT_NAME: $*" | tee -a "$LOG_FILE"
}

# Initialize state
init_state() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo '{"measurements": [], "alerts_sent": {}}' > "$STATE_FILE"
    fi
}

# Query New Relic
query_nrql() {
    local query="$1"
    
    curl -s -X POST "https://api.newrelic.com/graphql" \
        -H "Api-Key: ${NR_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{
            \"query\": \"{ actor { account(id: ${NR_ACCOUNT_ID}) { nrql(query: \\\"${query}\\\") { results } } } }\"
        }" | jq -r '.data.actor.account.nrql.results'
}

# Get current cardinality metrics
get_cardinality_metrics() {
    local timestamp=$(date -Iseconds)
    
    # Global cardinality
    local global_cardinality=$(query_nrql "SELECT uniqueCount(dimensions()) FROM Metric WHERE service.name = 'nrdot-plus-host' SINCE 5 minutes ago" | jq -r '.[0].uniqueCount')
    
    # Per-host cardinality
    local host_cardinality=$(query_nrql "SELECT uniqueCount(dimensions()) FROM Metric WHERE service.name = 'nrdot-plus-host' FACET host.name SINCE 5 minutes ago LIMIT 100")
    
    # Top cardinality contributors
    local top_metrics=$(query_nrql "SELECT uniqueCount(dimensions()) FROM Metric WHERE service.name = 'nrdot-plus-host' FACET metricName SINCE 5 minutes ago LIMIT 20")
    
    # Top label contributors
    local top_labels=$(query_nrql "SELECT cardinality() FROM Metric WHERE service.name = 'nrdot-plus-host' FACET process.executable.name SINCE 5 minutes ago LIMIT 20")
    
    # Create measurement record
    local measurement=$(jq -n \
        --arg ts "$timestamp" \
        --argjson gc "$global_cardinality" \
        --argjson hc "$host_cardinality" \
        --argjson tm "$top_metrics" \
        --argjson tl "$top_labels" \
        '{
            timestamp: $ts,
            global_cardinality: $gc,
            host_cardinality: $hc,
            top_metrics: $tm,
            top_labels: $tl
        }')
    
    echo "$measurement"
}

# Calculate growth rate
calculate_growth_rate() {
    local current="$1"
    local previous="$2"
    
    if [[ -z "$previous" || "$previous" == "0" ]]; then
        echo "0"
    else
        echo "scale=4; ($current - $previous) / $previous" | bc
    fi
}

# Check for cardinality issues
check_cardinality_limits() {
    local measurement="$1"
    local alerts=()
    
    # Check global limit
    local global_card=$(echo "$measurement" | jq -r '.global_cardinality')
    if [[ $global_card -gt $CARDINALITY_LIMIT_GLOBAL ]]; then
        alerts+=("CRITICAL: Global cardinality ($global_card) exceeds limit ($CARDINALITY_LIMIT_GLOBAL)")
    fi
    
    # Check per-host limits
    local host_violations=$(echo "$measurement" | jq -r ".host_cardinality[] | select(.uniqueCount > $CARDINALITY_LIMIT_PER_HOST) | \"Host \(.facet[0]) has cardinality \(.uniqueCount)\"")
    if [[ -n "$host_violations" ]]; then
        while IFS= read -r violation; do
            alerts+=("WARNING: $violation (limit: $CARDINALITY_LIMIT_PER_HOST)")
        done <<< "$host_violations"
    fi
    
    # Check growth rate
    local previous_card=$(jq -r '.measurements[-2].global_cardinality // 0' "$STATE_FILE")
    if [[ $previous_card -gt 0 ]]; then
        local growth_rate=$(calculate_growth_rate "$global_card" "$previous_card")
        if (( $(echo "$growth_rate > $CARDINALITY_GROWTH_RATE_LIMIT" | bc -l) )); then
            alerts+=("WARNING: Cardinality growth rate ($(echo "scale=2; $growth_rate * 100" | bc)%) exceeds limit ($(echo "scale=0; $CARDINALITY_GROWTH_RATE_LIMIT * 100" | bc)%)")
        fi
    fi
    
    printf '%s\n' "${alerts[@]}"
}

# Generate cardinality report
generate_report() {
    local measurement="$1"
    
    cat <<EOF
=== NRDOT Cardinality Report ===
Timestamp: $(echo "$measurement" | jq -r '.timestamp')

Global Metrics:
  Total Cardinality: $(echo "$measurement" | jq -r '.global_cardinality')
  
Top Hosts by Cardinality:
$(echo "$measurement" | jq -r '.host_cardinality[:5][] | "  \(.facet[0]): \(.uniqueCount)"')

Top Metrics by Cardinality:
$(echo "$measurement" | jq -r '.top_metrics[:5][] | "  \(.facet[0]): \(.uniqueCount)"')

Top Process Labels:
$(echo "$measurement" | jq -r '.top_labels[:5][] | "  \(.facet[0]): \(.cardinality)"')

Recommendations:
EOF

    # Add recommendations based on data
    local global_card=$(echo "$measurement" | jq -r '.global_cardinality')
    if [[ $global_card -gt $(( CARDINALITY_LIMIT_GLOBAL * 80 / 100 )) ]]; then
        echo "  - Consider switching to 'conservative' profile to reduce cardinality"
    fi
    
    local top_metric=$(echo "$measurement" | jq -r '.top_metrics[0].facet[0]')
    local top_metric_card=$(echo "$measurement" | jq -r '.top_metrics[0].uniqueCount')
    if [[ $top_metric_card -gt 10000 ]]; then
        echo "  - Review metric '$top_metric' - contributing $top_metric_card unique series"
    fi
}

# Send alert to New Relic
send_alert() {
    local severity="$1"
    local message="$2"
    
    curl -s -X POST "https://api.newrelic.com/v2/alerts_events.json" \
        -H "Api-Key: ${NR_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{
            \"eventType\": \"NRDOTCardinality\",
            \"severity\": \"$severity\",
            \"message\": \"$message\",
            \"timestamp\": $(date +%s)
        }"
}

# Update state file
update_state() {
    local measurement="$1"
    local temp_file=$(mktemp)
    
    # Add measurement and keep last 24 hours
    jq --argjson m "$measurement" '
        .measurements = (.measurements + [$m]) | 
        .measurements |= map(select(.timestamp > (now - 86400 | strftime("%Y-%m-%dT%H:%M:%S"))))
    ' "$STATE_FILE" > "$temp_file"
    
    mv "$temp_file" "$STATE_FILE"
}

# Main monitoring function
monitor_cardinality() {
    log "INFO" "Starting cardinality check"
    
    # Get current metrics
    local measurement=$(get_cardinality_metrics)
    
    # Check limits
    local alerts=$(check_cardinality_limits "$measurement")
    
    # Process alerts
    if [[ -n "$alerts" ]]; then
        log "WARN" "Cardinality issues detected:"
        while IFS= read -r alert; do
            log "WARN" "  $alert"
            
            # Send high-severity alerts
            if [[ "$alert" == *"CRITICAL"* ]]; then
                send_alert "CRITICAL" "$alert"
            fi
        done <<< "$alerts"
    else
        log "INFO" "Cardinality within limits"
    fi
    
    # Generate and log report
    local report=$(generate_report "$measurement")
    echo "$report" >> "$LOG_FILE"
    
    # Update state
    update_state "$measurement"
    
    log "INFO" "Cardinality check complete"
}

# Export cardinality data to New Relic
export_metrics() {
    local measurement="$1"
    local global_card=$(echo "$measurement" | jq -r '.global_cardinality')
    
    # Create custom event
    cat <<EOF | curl -s -X POST "https://insights-collector.newrelic.com/v1/accounts/${NR_ACCOUNT_ID}/events" \
        -H "Api-Key: ${NR_API_KEY}" \
        -H "Content-Type: application/json" -d @-
[{
    "eventType": "NRDOTCardinality",
    "timestamp": $(date +%s),
    "globalCardinality": $global_card,
    "hostCount": $(echo "$measurement" | jq '.host_cardinality | length'),
    "topMetric": "$(echo "$measurement" | jq -r '.top_metrics[0].facet[0]')",
    "topMetricCardinality": $(echo "$measurement" | jq -r '.top_metrics[0].uniqueCount')
}]
EOF
}

# Main execution
main() {
    init_state
    
    while true; do
        monitor_cardinality
        
        # Export metrics for dashboarding
        local latest_measurement=$(jq -r '.measurements[-1]' "$STATE_FILE")
        if [[ "$latest_measurement" != "null" ]]; then
            export_metrics "$latest_measurement"
        fi
        
        # Sleep for monitoring interval
        sleep "${MONITOR_INTERVAL:-300}"  # 5 minutes default
    done
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi