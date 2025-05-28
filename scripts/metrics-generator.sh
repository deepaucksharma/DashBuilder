#!/bin/bash
# Consolidated Metrics Generator Script for DashBuilder/NRDOT
# Usage: ./metrics-generator.sh [profile] [interval]
# Profiles: light, normal, heavy
# Interval: seconds between each batch (default: 10)

# Configuration
PROFILE=${1:-"normal"}
INTERVAL=${2:-10}
METRICS_COUNT=0
NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY:-${NEW_RELIC_INGEST_KEY:-${NEW_RELIC_API_KEY}}}
NEW_RELIC_REGION=${NEW_RELIC_REGION:-"US"}
NRDOT_VERSION=${NRDOT_VERSION:-"2.0.0"}

# Set OTLP endpoint based on region
if [[ "${NEW_RELIC_REGION}" == "EU" ]]; then
  INGEST_HOST="otlp.eu01.nr-data.net"
else
  INGEST_HOST="otlp.nr-data.net"
fi

# Configure profile metrics
case $PROFILE in
  "light")
    METRICS_PER_BATCH=20
    ATTRIBUTES_PER_METRIC=3
    DIMENSIONS_PER_METRIC=2
    ;;
  "heavy")
    METRICS_PER_BATCH=200
    ATTRIBUTES_PER_METRIC=15
    DIMENSIONS_PER_METRIC=10
    ;;
  *)
    # Default: normal
    METRICS_PER_BATCH=50
    ATTRIBUTES_PER_METRIC=8
    DIMENSIONS_PER_METRIC=5
    ;;
esac

# Logging helpers
log_info() {
  echo -e "\033[0;34m[INFO]\033[0m $1"
}

log_success() {
  echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

log_error() {
  echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# Validate required environment
if [[ -z "$NEW_RELIC_LICENSE_KEY" ]]; then
  log_error "NEW_RELIC_LICENSE_KEY or NEW_RELIC_INGEST_KEY or NEW_RELIC_API_KEY must be set"
  exit 1
fi

log_info "Starting NRDOT metrics generator with profile: $PROFILE"
log_info "Generating $METRICS_PER_BATCH metrics every $INTERVAL seconds"

# Function to generate random metrics
generate_metrics() {
  local timestamp=$(date +%s)
  local metrics_json="["
  
  for (( i=1; i<=$METRICS_PER_BATCH; i++ )); do
    # Random metric value
    local value=$(awk -v min=1 -v max=1000 'BEGIN{srand(); print int(min+rand()*(max-min+1))}')
    
    # Random metric name
    local metric_types=("counter" "gauge" "summary" "histogram")
    local type_idx=$(( RANDOM % 4 ))
    local metric_type=${metric_types[$type_idx]}
    local metric_name="nrdot.test.${metric_type}.$i"
    
    # Generate attributes
    local attrs="\"service.name\":\"nrdot-test\",\"version\":\"$NRDOT_VERSION\""
    
    for (( j=1; j<=$ATTRIBUTES_PER_METRIC; j++ )); do
      attrs="$attrs,\"attr$j\":\"value$j\""
    done
    
    # Generate dimensions
    local dims=""
    for (( k=1; k<=$DIMENSIONS_PER_METRIC; k++ )); do
      if [[ -n "$dims" ]]; then
        dims="$dims,"
      fi
      dims="$dims\"dim$k\":\"val$k\""
    done
    
    # Add metric to JSON array
    if [[ $i -gt 1 ]]; then
      metrics_json="$metrics_json,"
    fi
    
    metrics_json="$metrics_json{\"name\":\"$metric_name\",\"type\":\"$metric_type\",\"value\":$value,\"timestamp\":$timestamp,\"attributes\":{$attrs},\"dimensions\":{$dims}}"
  done
  
  metrics_json="$metrics_json]"
  
  # Send metrics to New Relic
  curl -s -X POST "https://${INGEST_HOST}:443/v1/metrics" \
    -H "Content-Type: application/json" \
    -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
    -d "$metrics_json" > /dev/null
  
  METRICS_COUNT=$((METRICS_COUNT + METRICS_PER_BATCH))
  log_success "Sent $METRICS_PER_BATCH metrics (Total: $METRICS_COUNT)"
}

# Main loop
while true; do
  generate_metrics
  sleep $INTERVAL
done
