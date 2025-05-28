#!/bin/bash

echo "=== Running NRDOT Experiment with Full Tracking ==="
echo ""

# Set experiment metadata
export EXPERIMENT_ID="exp-$(date +%Y%m%d-%H%M%S)"
export EXPERIMENT_NAME="nrdot-profile-comparison"
export EXPERIMENT_RUN_ID="run-$(date +%s)"
export EXPERIMENT_VERSION="1.0.0"
export TEAM_NAME="platform"
export OWNER="nrdot"
export PROJECT_NAME="telemetry-optimization"

echo "Experiment Setup:"
echo "================="
echo "ID: $EXPERIMENT_ID"
echo "Name: $EXPERIMENT_NAME"
echo "Run: $EXPERIMENT_RUN_ID"
echo ""

# Function to run collector with specific profile
run_profile_test() {
    local PROFILE=$1
    local DURATION=$2
    
    echo "Testing Profile: $PROFILE"
    echo "------------------------"
    
    # Set profile-specific environment
    export NRDOT_PROFILE=$PROFILE
    export EXPERIMENT_PHASE=$PROFILE
    
    # Clean up any existing containers
    docker rm -f nrdot-collector-$PROFILE 2>/dev/null || true
    docker rm -f nrdot-metrics-gen-$PROFILE 2>/dev/null || true
    
    # Start collector with experiment tracking
    echo "Starting collector..."
    docker run -d \
        --name nrdot-collector-$PROFILE \
        --network dashbuilder_dashbuilder-net \
        -e NEW_RELIC_LICENSE_KEY="${NEW_RELIC_LICENSE_KEY}" \
        -e EXPERIMENT_ID="${EXPERIMENT_ID}" \
        -e EXPERIMENT_NAME="${EXPERIMENT_NAME}" \
        -e EXPERIMENT_RUN_ID="${EXPERIMENT_RUN_ID}" \
        -e NRDOT_PROFILE="${PROFILE}" \
        -e EXPERIMENT_PHASE="${PROFILE}" \
        -e TARGET_CPU_THRESHOLD=70 \
        -e TARGET_MEMORY_THRESHOLD=80 \
        -e MIN_CPU_THRESHOLD=0.1 \
        -e MIN_MEMORY_THRESHOLD=10485760 \
        -e TARGET_COST_REDUCTION=0.70 \
        -e CRITICAL_PROCESS_THRESHOLD=0.95 \
        -e TEAM_NAME="${TEAM_NAME}" \
        -e OWNER="${OWNER}" \
        -e PROJECT_NAME="${PROJECT_NAME}" \
        -e LOG_LEVEL=info \
        -v $(pwd)/configs/collector-experiment-tracking.yaml:/etc/otel-collector.yaml:ro \
        -p $((4317 + $(echo $PROFILE | wc -c))):4317 \
        -p $((4318 + $(echo $PROFILE | wc -c))):4318 \
        -p $((8888 + $(echo $PROFILE | wc -c))):8888 \
        -p $((13133 + $(echo $PROFILE | wc -c))):13133 \
        otel/opentelemetry-collector-contrib:latest \
        --config=/etc/otel-collector.yaml
    
    # Wait for collector to be ready
    echo "Waiting for collector to be ready..."
    sleep 10
    
    # Start metrics generator
    echo "Starting metrics generator..."
    docker run -d \
        --name nrdot-metrics-gen-$PROFILE \
        --network dashbuilder_dashbuilder-net \
        -e OTEL_ENDPOINT=http://nrdot-collector-$PROFILE:4318 \
        -e METRIC_INTERVAL=10000 \
        -e PROCESS_COUNT=50 \
        -e NRDOT_PROFILE="${PROFILE}" \
        -v $(pwd)/scripts:/app/scripts \
        -w /app/scripts \
        node:18-alpine \
        sh -c "npm install axios && node metrics-generator-fixed.js"
    
    # Run for specified duration
    echo "Running for $DURATION seconds..."
    sleep $DURATION
    
    # Collect final metrics
    echo "Collecting results..."
    docker logs nrdot-metrics-gen-$PROFILE 2>&1 | tail -n 20
    
    # Cleanup
    echo "Cleaning up..."
    docker stop nrdot-collector-$PROFILE nrdot-metrics-gen-$PROFILE
    docker rm nrdot-collector-$PROFILE nrdot-metrics-gen-$PROFILE
    
    echo ""
}

# Run tests for each profile
echo "Starting Experiment Runs"
echo "======================="
echo ""

# Quick test - 30 seconds per profile
if [ "$1" == "quick" ]; then
    DURATION=30
else
    DURATION=300  # 5 minutes per profile
fi

# Test each profile
for profile in conservative balanced aggressive; do
    run_profile_test $profile $DURATION
    echo "Waiting 30 seconds before next profile..."
    sleep 30
done

echo "Experiment Complete!"
echo "==================="
echo ""
echo "View results in New Relic with these queries:"
echo ""
echo "1. Compare profiles:"
echo "   SELECT average(nrdot.cost.per_hour) as 'Cost/Hour',"
echo "          average(nrdot.process.coverage) as 'Coverage %',"
echo "          average(nrdot.optimization.score) as 'Score'"
echo "   FROM Metric"
echo "   WHERE experiment.id = '$EXPERIMENT_ID'"
echo "   SINCE 30 minutes ago"
echo "   FACET config.profile"
echo ""
echo "2. View experiment timeline:"
echo "   SELECT average(nrdot.cost.reduction) as 'Cost Reduction %'"
echo "   FROM Metric"
echo "   WHERE experiment.id = '$EXPERIMENT_ID'"
echo "   SINCE 30 minutes ago"
echo "   TIMESERIES 1 minute"
echo "   FACET experiment.phase"
echo ""
echo "3. Process coverage by profile:"
echo "   SELECT uniqueCount(process.executable.name) as 'Unique Processes'"
echo "   FROM Metric"
echo "   WHERE experiment.id = '$EXPERIMENT_ID'"
echo "   AND process.executable.name IS NOT NULL"
echo "   SINCE 30 minutes ago"
echo "   FACET config.profile"