#!/bin/bash
set -e

echo "Starting NRDOT OpenTelemetry Collector"
echo "======================================="

# Validate environment
# Support both API_KEY and LICENSE_KEY names
if [ -n "$NEW_RELIC_API_KEY" ]; then
    export NEW_RELIC_LICENSE_KEY="$NEW_RELIC_API_KEY"
fi

if [ -z "$NEW_RELIC_LICENSE_KEY" ]; then
    echo "ERROR: NEW_RELIC_LICENSE_KEY or NEW_RELIC_API_KEY not set"
    exit 1
fi

# Set OTLP endpoint based on region
if [ "$NEW_RELIC_REGION" = "EU" ]; then
    export NEW_RELIC_OTLP_ENDPOINT="${NEW_RELIC_OTLP_ENDPOINT:-otlp.eu01.nr-data.net:4317}"
else
    export NEW_RELIC_OTLP_ENDPOINT="${NEW_RELIC_OTLP_ENDPOINT:-otlp.nr-data.net:4317}"
fi

echo "Configuration:"
echo "- Endpoint: $NEW_RELIC_OTLP_ENDPOINT"
echo "- Config: ${CONFIG_FILE:-/etc/otel/config.yaml}"
echo "- Experiment: ${EXPERIMENT_NAME:-default}"
echo "- Profile: ${OPTIMIZATION_PROFILE:-standard}"
echo "- API Key: ${NEW_RELIC_LICENSE_KEY:0:10}..."

# Use provided config or default
DEFAULT_CONFIG="/etc/otel/config.yaml"
CONFIG_FILE="${CONFIG_FILE:-$DEFAULT_CONFIG}"

# If config is in read-only location, copy to writable location
if [ -f "$CONFIG_FILE" ]; then
    # Copy to temporary location
    TEMP_CONFIG="/tmp/collector-config.yaml"
    cp "$CONFIG_FILE" "$TEMP_CONFIG"
    CONFIG_FILE="$TEMP_CONFIG"
    echo "Using config copy at: $CONFIG_FILE"
fi

# Replace placeholders in config
sed -i "s|\${NEW_RELIC_LICENSE_KEY}|$NEW_RELIC_LICENSE_KEY|g" "$CONFIG_FILE"
sed -i "s|\${NEW_RELIC_OTLP_ENDPOINT}|$NEW_RELIC_OTLP_ENDPOINT|g" "$CONFIG_FILE"

# Debug mode
if [ "$DEBUG" = "true" ]; then
    echo "Config file contents:"
    cat "$CONFIG_FILE"
fi

# Health check endpoint
echo "Health check available at http://0.0.0.0:13133/health"

# Start collector
exec /usr/local/bin/otelcol-contrib \
    --config="$CONFIG_FILE" \
    ${OTEL_EXTRA_ARGS}