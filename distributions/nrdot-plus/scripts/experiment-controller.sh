#!/bin/bash
# NRDOT Experiment Controller
# Manages A/B testing rings and tracks KPIs

set -euo pipefail

# Configuration
readonly SCRIPT_NAME=$(basename "$0")
readonly CONFIG_DIR="/etc/nrdot-plus"
readonly STATE_DIR="/var/lib/nrdot-plus/state"
readonly LOG_FILE="/var/log/nrdot-plus/experiment.log"
readonly METRICS_URL="http://localhost:8888/metrics"

# Experiment rings
readonly CONTROL_RING=0
readonly TREATMENT_RINGS=(1 2 3)

# Create directories
mkdir -p "$STATE_DIR" "$(dirname "$LOG_FILE")"

# Logging
log() {
    local level=$1
    shift
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [$level] $*" | tee -a "$LOG_FILE"
}

# Get current ring assignment
get_current_ring() {
    local host=$(hostname)
    
    # Check if already assigned
    if [[ -f "$STATE_DIR/ring_assignment.json" ]]; then
        local ring=$(jq -r --arg host "$host" '.[$host] // empty' "$STATE_DIR/ring_assignment.json")
        if [[ -n "$ring" ]]; then
            echo "$ring"
            return
        fi
    fi
    
    # Assign new ring (hash-based for consistency)
    local hash=$(echo -n "$host" | md5sum | cut -c1-8)
    local ring_index=$((0x$hash % 4))  # 0-3 (control + 3 treatment)
    
    echo "$ring_index"
}

# Assign host to ring
assign_ring() {
    local host=$(hostname)
    local ring=$(get_current_ring)
    
    log INFO "Host $host assigned to ring $ring"
    
    # Update assignment file
    local assignments="{}"
    if [[ -f "$STATE_DIR/ring_assignment.json" ]]; then
        assignments=$(cat "$STATE_DIR/ring_assignment.json")
    fi
    
    echo "$assignments" | jq --arg host "$host" --arg ring "$ring" '.[$host] = $ring' > "$STATE_DIR/ring_assignment.json"
    
    # Export for collector
    echo "NRDOT_RING=$ring" >> /etc/default/nrdot-plus
    
    echo "$ring"
}

# Get profile for ring
get_ring_profile() {
    local ring=$1
    
    case $ring in
        0)  # Control
            echo "balanced"
            ;;
        1)  # Treatment 1: Conservative
            echo "conservative"
            ;;
        2)  # Treatment 2: Balanced
            echo "balanced"
            ;;
        3)  # Treatment 3: Aggressive
            echo "aggressive"
            ;;
        *)
            echo "balanced"
            ;;
    esac
}

# Apply experiment configuration
apply_experiment() {
    local ring=$1
    local profile=$(get_ring_profile "$ring")
    
    log INFO "Applying experiment: ring=$ring, profile=$profile"
    
    # Load profile settings
    case $profile in
        conservative)
            cat > /etc/default/nrdot-experiment << EOF
NRDOT_ACTIVE_PROFILE="conservative"
NRDOT_MIN_IMPORTANCE="0.2"
NRDOT_CPU_THRESHOLD="5.0"
NRDOT_MEMORY_THRESHOLD_MB="50"
NRDOT_TARGET_SERIES="10000"
EOF
            ;;
        balanced)
            cat > /etc/default/nrdot-experiment << EOF
NRDOT_ACTIVE_PROFILE="balanced"
NRDOT_MIN_IMPORTANCE="0.5"
NRDOT_CPU_THRESHOLD="10.0"
NRDOT_MEMORY_THRESHOLD_MB="100"
NRDOT_TARGET_SERIES="5000"
EOF
            ;;
        aggressive)
            cat > /etc/default/nrdot-experiment << EOF
NRDOT_ACTIVE_PROFILE="aggressive"
NRDOT_MIN_IMPORTANCE="0.7"
NRDOT_CPU_THRESHOLD="20.0"
NRDOT_MEMORY_THRESHOLD_MB="200"
NRDOT_TARGET_SERIES="2000"
EOF
            ;;
    esac
    
    # Merge with main config
    cat /etc/default/nrdot-experiment >> /etc/default/nrdot-plus
    
    # Reload collector
    systemctl reload nrdot-plus || log ERROR "Failed to reload collector"
}

# Collect KPI metrics
collect_kpis() {
    local ring=$1
    local timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    
    # Fetch metrics from Prometheus endpoint
    local metrics=$(curl -s "$METRICS_URL" 2>/dev/null || echo "")
    
    # Extract KPIs
    local total_series=$(echo "$metrics" | grep -E '^nrdot_summary_total_series' | awk '{print $2}' | head -1)
    local coverage=$(echo "$metrics" | grep -E '^nrdot_summary_coverage' | awk '{print $2}' | head -1)
    local cpu_usage=$(echo "$metrics" | grep -E '^process_cpu_seconds_total' | awk '{sum+=$2} END {print sum}')
    local memory_usage=$(echo "$metrics" | grep -E '^process_resident_memory_bytes' | awk '{sum+=$2} END {print sum/1048576}')
    
    # Calculate cost (rough estimate)
    local cost_per_hour=$(awk "BEGIN {print ${total_series:-0} * 60 * 0.25 / 1000000}")
    
    # Create KPI record
    local kpi_record=$(cat <<EOF
{
  "timestamp": "$timestamp",
  "ring": $ring,
  "profile": "$(get_ring_profile $ring)",
  "kpis": {
    "total_series": ${total_series:-0},
    "coverage_percent": ${coverage:-0},
    "cpu_usage_total": ${cpu_usage:-0},
    "memory_usage_mb": ${memory_usage:-0},
    "cost_per_hour_usd": ${cost_per_hour:-0}
  }
}
EOF
)
    
    # Append to KPI log
    echo "$kpi_record" >> "$STATE_DIR/kpi_metrics.jsonl"
    
    log INFO "KPIs collected for ring $ring: series=$total_series, coverage=$coverage%, cost=\$$cost_per_hour/hr"
}

# Calculate experiment results
calculate_results() {
    if [[ ! -f "$STATE_DIR/kpi_metrics.jsonl" ]]; then
        log WARN "No KPI data available"
        return
    fi
    
    # Aggregate by ring
    local results=$(jq -s '
        group_by(.ring) |
        map({
            ring: .[0].ring,
            profile: .[0].profile,
            sample_count: length,
            avg_series: (map(.kpis.total_series) | add / length),
            avg_coverage: (map(.kpis.coverage_percent) | add / length),
            avg_cost: (map(.kpis.cost_per_hour_usd) | add / length),
            series_reduction: (1 - (map(.kpis.total_series) | add / length) / 10000) * 100
        })
    ' "$STATE_DIR/kpi_metrics.jsonl")
    
    echo "$results" | jq -r '.[] | "Ring \(.ring) (\(.profile)): \(.avg_series | round) series, \(.avg_coverage | round)% coverage, $\(.avg_cost) cost/hr, \(.series_reduction | round)% reduction"'
    
    # Save results
    echo "$results" > "$STATE_DIR/experiment_results.json"
    
    # Determine winner
    local winner=$(echo "$results" | jq -r '
        map(select(.avg_coverage >= 95)) |
        sort_by(.avg_cost) |
        .[0] |
        "Winner: Ring \(.ring) (\(.profile)) - $\(.avg_cost)/hr with \(.avg_coverage | round)% coverage"
    ')
    
    log INFO "$winner"
}

# Main command handling
case "${1:-}" in
    init)
        log INFO "Initializing experiment"
        ring=$(assign_ring)
        apply_experiment "$ring"
        log INFO "Experiment initialized for ring $ring"
        ;;
        
    collect)
        ring=$(get_current_ring)
        collect_kpis "$ring"
        ;;
        
    results)
        calculate_results
        ;;
        
    status)
        ring=$(get_current_ring)
        profile=$(get_ring_profile "$ring")
        echo "Current experiment status:"
        echo "  Ring: $ring"
        echo "  Profile: $profile"
        echo "  KPI samples: $(wc -l < "$STATE_DIR/kpi_metrics.jsonl" 2>/dev/null || echo 0)"
        ;;
        
    reset)
        log INFO "Resetting experiment data"
        rm -f "$STATE_DIR/ring_assignment.json" "$STATE_DIR/kpi_metrics.jsonl" "$STATE_DIR/experiment_results.json"
        log INFO "Experiment data reset"
        ;;
        
    *)
        echo "Usage: $0 {init|collect|results|status|reset}"
        exit 1
        ;;
esac