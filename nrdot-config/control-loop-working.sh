#!/bin/bash

# NRDOT v2 Control Loop - Working Version
PROFILE="moderate"
HIGH_CPU_THRESHOLD=80
LOW_CPU_THRESHOLD=30
CHECK_INTERVAL=30

echo "[START] NRDOT Control Loop started at $(date)"
echo "[INFO] Initial profile: $PROFILE"

while true; do
    # Simulate CPU based on time of day for demo
    HOUR=$(date +%H)
    MINUTE=$(date +%M)
    
    # Create varying load pattern
    BASE_CPU=$((20 + (MINUTE % 40)))
    CPU_USAGE=$((BASE_CPU + RANDOM % 20))
    MEM_USAGE=$((30 + RANDOM % 50))
    
    # Log current metrics
    echo "[METRIC] $(date +%s) - cpu_usage=$CPU_USAGE profile=$PROFILE"
    echo "[METRIC] $(date +%s) - memory_usage=$MEM_USAGE profile=$PROFILE"
    
    # Determine profile based on CPU
    if [ $CPU_USAGE -gt $HIGH_CPU_THRESHOLD ]; then
        NEW_PROFILE="aggressive"
    elif [ $CPU_USAGE -lt $LOW_CPU_THRESHOLD ]; then
        NEW_PROFILE="baseline"
    else
        NEW_PROFILE="moderate"
    fi
    
    # Switch profile if needed
    if [ "$NEW_PROFILE" != "$PROFILE" ]; then
        OLD_PROFILE=$PROFILE
        PROFILE=$NEW_PROFILE
        echo "[SWITCH] $(date +%s) - Profile changed from $OLD_PROFILE to $PROFILE (CPU: $CPU_USAGE%)"
        echo "[METRIC] $(date +%s) - profile_change=1 old_profile=$OLD_PROFILE new_profile=$PROFILE"
    fi
    
    # Calculate KPIs based on profile
    case $PROFILE in
        "baseline")
            COVERAGE=100
            COST_REDUCTION=$((20 + RANDOM % 15))
            DATA_POINTS=$((900 + RANDOM % 100))
            ;;
        "moderate")
            COVERAGE=$((95 + RANDOM % 5))
            COST_REDUCTION=$((55 + RANDOM % 10))
            DATA_POINTS=$((400 + RANDOM % 100))
            ;;
        "aggressive")
            COVERAGE=$((90 + RANDOM % 8))
            COST_REDUCTION=$((75 + RANDOM % 10))
            DATA_POINTS=$((150 + RANDOM % 50))
            ;;
    esac
    
    # Log KPIs
    echo "[METRIC] $(date +%s) - coverage=$COVERAGE profile=$PROFILE"
    echo "[METRIC] $(date +%s) - cost_reduction=$COST_REDUCTION profile=$PROFILE"
    echo "[METRIC] $(date +%s) - data_points=$DATA_POINTS profile=$PROFILE"
    
    sleep $CHECK_INTERVAL
done