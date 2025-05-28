#!/bin/bash

# NRDOT v2 Experiment Runner
# Tests all profiles and collects metrics

echo "Starting NRDOT v2 Experiments..."
echo "================================"

# Function to simulate load
simulate_load() {
    local intensity=$1
    echo "[$(date)] Simulating $intensity load..."
    
    case $intensity in
        "low")
            # Low CPU load
            for i in {1..5}; do
                dd if=/dev/zero of=/dev/null bs=1M count=100 &
            done
            ;;
        "medium")
            # Medium CPU load
            for i in {1..10}; do
                dd if=/dev/zero of=/dev/null bs=1M count=500 &
            done
            ;;
        "high")
            # High CPU load
            for i in {1..20}; do
                dd if=/dev/zero of=/dev/null bs=1M count=1000 &
            done
            ;;
    esac
    
    # Run for 2 minutes
    sleep 120
    
    # Kill load generators
    pkill -f "dd if=/dev/zero"
    sleep 10
}

# Experiment 1: Baseline profile with varying load
echo ""
echo "Experiment 1: Baseline Profile"
echo "------------------------------"
export NRDOT_PROFILE=baseline
simulate_load low
simulate_load medium
simulate_load high

# Experiment 2: Moderate profile with varying load
echo ""
echo "Experiment 2: Moderate Profile"
echo "------------------------------"
export NRDOT_PROFILE=moderate
simulate_load low
simulate_load medium
simulate_load high

# Experiment 3: Aggressive profile with varying load
echo ""
echo "Experiment 3: Aggressive Profile"
echo "--------------------------------"
export NRDOT_PROFILE=aggressive
simulate_load low
simulate_load medium
simulate_load high

# Experiment 4: Auto-switching with control loop
echo ""
echo "Experiment 4: Auto Profile Switching"
echo "------------------------------------"
./control-loop.sh &
CONTROL_LOOP_PID=$!

simulate_load low
simulate_load high
simulate_load medium
simulate_load high
simulate_load low

kill $CONTROL_LOOP_PID

echo ""
echo "Experiments completed!"
echo "Check the NRDOT v2 KPI Monitoring dashboard for results."
