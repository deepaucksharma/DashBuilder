#!/bin/bash
set -euo pipefail

# Default to collector if no argument provided
SERVICE="${1:-collector}"

# Validate environment
if [ -z "${NEW_RELIC_LICENSE_KEY:-}" ]; then
    echo "ERROR: NEW_RELIC_LICENSE_KEY is required"
    exit 1
fi

if [ "$SERVICE" != "collector" ] && [ -z "${NEW_RELIC_API_KEY:-}" ]; then
    echo "ERROR: NEW_RELIC_API_KEY is required for non-collector services"
    exit 1
fi

# Set defaults
export NODE_ENV="${NODE_ENV:-production}"
export OPTIMIZATION_MODE="${OPTIMIZATION_MODE:-balanced}"
export CONTROL_LOOP_INTERVAL="${CONTROL_LOOP_INTERVAL:-300}"
export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-https://otlp.nr-data.net:4317}"
export OTEL_EXPORTER_OTLP_HEADERS="api-key=${NEW_RELIC_LICENSE_KEY}"

# Handle different service types
case "$SERVICE" in
    "collector")
        echo "Starting NRDOT Collector in ${OPTIMIZATION_MODE} mode..."
        CONFIG_FILE="/etc/otel/profiles/${OPTIMIZATION_MODE}.yaml"
        echo "Using config: ${CONFIG_FILE}"
        exec /usr/local/bin/otelcol-contrib --config="${CONFIG_FILE}"
        ;;
    "control-loop")
        echo "Starting Control Loop..."
        cd /app
        exec node scripts/control-loop-simple.js
        ;;
    "monitor")
        echo "Starting DashBuilder Monitor..."
        cd /app/orchestrator
        exec node monitor.js
        ;;
    *)
        # For any other command, just execute it
        exec "$@"
        ;;
esac
