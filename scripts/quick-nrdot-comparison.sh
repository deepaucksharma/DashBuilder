#!/bin/bash

echo "=========================================="
echo "NRDOT Quick Configuration Comparison"
echo "=========================================="
echo ""

# Function to test a configuration
test_config() {
    local config_name=$1
    local config_file=$2
    
    echo "Testing: $config_name"
    echo "Config: $config_file"
    echo ""
    
    # Update docker-compose to use this config
    sed -i.bak "s|collector-[a-z-]*\.yaml|$config_file|g" docker-compose.yml
    
    # Restart collector
    docker-compose restart otel-collector > /dev/null 2>&1
    
    # Wait for stabilization
    echo "Waiting 60 seconds for metrics collection..."
    sleep 60
    
    # Collect metrics
    echo "Collecting metrics sample..."
    
    # Count metrics
    total_metrics=$(curl -s http://localhost:8889/metrics | grep -c "^system_")
    cpu_metrics=$(curl -s http://localhost:8889/metrics | grep -c "^system_cpu_")
    memory_metrics=$(curl -s http://localhost:8889/metrics | grep -c "^system_memory_")
    disk_metrics=$(curl -s http://localhost:8889/metrics | grep -c "^system_disk_")
    network_metrics=$(curl -s http://localhost:8889/metrics | grep -c "^system_network_")
    fs_metrics=$(curl -s http://localhost:8889/metrics | grep -c "^system_filesystem_")
    
    # Get unique metric names
    unique_metrics=$(curl -s http://localhost:8889/metrics | grep "^system_" | cut -d'{' -f1 | sort | uniq | wc -l)
    
    echo "Results for $config_name:"
    echo "  Total metric data points: $total_metrics"
    echo "  Unique metric types: $unique_metrics"
    echo "  CPU metrics: $cpu_metrics"
    echo "  Memory metrics: $memory_metrics"
    echo "  Disk metrics: $disk_metrics"
    echo "  Network metrics: $network_metrics"
    echo "  Filesystem metrics: $fs_metrics"
    echo ""
    
    # Save results
    echo "$config_name,$total_metrics,$unique_metrics,$cpu_metrics,$memory_metrics,$disk_metrics,$network_metrics,$fs_metrics" >> experiment-results.csv
}

# Create results directory
mkdir -p experiment-results

# Initialize CSV
echo "Profile,Total,Unique,CPU,Memory,Disk,Network,Filesystem" > experiment-results/quick-comparison-$(date +%Y%m%d-%H%M%S).csv
cp experiment-results/quick-comparison-$(date +%Y%m%d-%H%M%S).csv experiment-results.csv

echo "Starting comparison..."
echo ""

# Test each configuration
test_config "Baseline (30s)" "collector-baseline.yaml"
test_config "Conservative (60s)" "collector-profiles/conservative.yaml"
test_config "Aggressive (120s)" "collector-profiles/aggressive.yaml"

# Restore original config
cp docker-compose.yml.bak docker-compose.yml
docker-compose restart otel-collector > /dev/null 2>&1

echo "=========================================="
echo "COMPARISON SUMMARY"
echo "=========================================="
echo ""

# Show results
cat experiment-results.csv | column -t -s,

echo ""
echo "Results saved to: experiment-results/quick-comparison-$(date +%Y%m%d-%H%M%S).csv"

# Calculate reductions
baseline_total=$(grep "Baseline" experiment-results.csv | cut -d',' -f2)
conservative_total=$(grep "Conservative" experiment-results.csv | cut -d',' -f2)
aggressive_total=$(grep "Aggressive" experiment-results.csv | cut -d',' -f2)

if [ -n "$baseline_total" ] && [ "$baseline_total" -gt 0 ]; then
    conservative_reduction=$(echo "scale=1; (($baseline_total - $conservative_total) / $baseline_total) * 100" | bc)
    aggressive_reduction=$(echo "scale=1; (($baseline_total - $aggressive_total) / $baseline_total) * 100" | bc)
    
    echo ""
    echo "Data Reduction vs Baseline:"
    echo "  Conservative: ${conservative_reduction}%"
    echo "  Aggressive: ${aggressive_reduction}%"
fi

echo ""
echo "Done!"