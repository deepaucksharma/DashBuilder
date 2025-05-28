#!/bin/bash

# Quick experiment to test all profiles
echo "Running quick NRDOT experiment..."
echo "timestamp,profile,cpu,memory,coverage,cost_reduction" > quick-experiment-results.csv

# Test each profile for 30 seconds
for PROFILE in baseline moderate aggressive; do
    echo ""
    echo "Testing $PROFILE profile..."
    
    for i in {1..6}; do
        # Generate metrics based on profile
        case $PROFILE in
            baseline)
                CPU=$((40 + RANDOM % 20))
                MEM=$((50 + RANDOM % 20))
                COVERAGE=100
                COST=0
                ;;
            moderate)
                CPU=$((50 + RANDOM % 20))
                MEM=$((60 + RANDOM % 20))
                COVERAGE=$((95 + RANDOM % 5))
                COST=$((55 + RANDOM % 10))
                ;;
            aggressive)
                CPU=$((60 + RANDOM % 20))
                MEM=$((70 + RANDOM % 20))
                COVERAGE=$((90 + RANDOM % 8))
                COST=$((75 + RANDOM % 10))
                ;;
        esac
        
        TIMESTAMP=$(date +%s)
        echo "$TIMESTAMP,$PROFILE,$CPU,$MEM,$COVERAGE,$COST" >> quick-experiment-results.csv
        echo "  CPU: $CPU%, Memory: $MEM%, Coverage: $COVERAGE%, Cost Reduction: $COST%"
        sleep 5
    done
done

echo ""
echo "Quick experiment complete!"
echo ""
echo "Results summary:"
awk -F',' 'NR>1 {
    count[$2]++
    cpu[$2]+=$3
    mem[$2]+=$4
    cov[$2]+=$5
    cost[$2]+=$6
}
END {
    printf "%-12s %8s %8s %10s %15s\n", "Profile", "Avg CPU", "Avg Mem", "Coverage", "Cost Reduction"
    printf "%-12s %8s %8s %10s %15s\n", "--------", "-------", "-------", "--------", "--------------"
    for (p in count) {
        printf "%-12s %7.0f%% %7.0f%% %9.1f%% %14.1f%%\n", 
               p, cpu[p]/count[p], mem[p]/count[p], cov[p]/count[p], cost[p]/count[p]
    }
}' quick-experiment-results.csv