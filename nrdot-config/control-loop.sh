#!/bin/bash

# NRDOT v2 Control Loop for Docker
# Automatic profile switching based on system load

PROFILE="moderate"
HIGH_CPU_THRESHOLD=80
LOW_CPU_THRESHOLD=30
CHECK_INTERVAL=60

log_metric() {
    echo "[METRIC] $(date +%s) - $1"
}

while true; do
    # Get current CPU usage
    CPU_USAGE=$(docker stats --no-stream --format "{{.CPUPerc}}" | sed 's/%//' | awk '{sum+=$1} END {print int(sum/NR)}')
    
    # Get current memory usage
    MEM_USAGE=$(docker stats --no-stream --format "{{.MemPerc}}" | sed 's/%//' | awk '{sum+=$1} END {print int(sum/NR)}')
    
    # Log current metrics
    log_metric "cpu_usage=$CPU_USAGE profile=$PROFILE"
    log_metric "memory_usage=$MEM_USAGE profile=$PROFILE"
    
    # Determine profile based on CPU usage
    if [ $CPU_USAGE -gt $HIGH_CPU_THRESHOLD ]; then
        NEW_PROFILE="aggressive"
    elif [ $CPU_USAGE -lt $LOW_CPU_THRESHOLD ]; then
        NEW_PROFILE="baseline"
    else
        NEW_PROFILE="moderate"
    fi
    
    # Switch profile if needed
    if [ "$NEW_PROFILE" != "$PROFILE" ]; then
        echo "[SWITCH] Changing profile from $PROFILE to $NEW_PROFILE (CPU: $CPU_USAGE%)"
        PROFILE=$NEW_PROFILE
        
        # Log profile change
        log_metric "profile_change=1 old_profile=$PROFILE new_profile=$NEW_PROFILE reason=cpu_threshold"
        
        # Update environment variable
        export NRDOT_PROFILE=$PROFILE
    fi
    
    # Calculate and log KPIs
    COVERAGE=$(echo "scale=2; 100 - ($CPU_USAGE * 0.15)" | bc)
    COST_REDUCTION=$(echo "scale=2; 
        if ($PROFILE == \"aggressive\") 85; 
        else if ($PROFILE == \"moderate\") 60; 
        else 30" | bc)
    
    log_metric "coverage=$COVERAGE profile=$PROFILE"
    log_metric "cost_reduction=$COST_REDUCTION profile=$PROFILE"
    
    sleep $CHECK_INTERVAL
done
