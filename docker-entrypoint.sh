#!/bin/bash
set -euo pipefail

# Signal handlers for graceful shutdown
trap 'echo "Received SIGTERM, shutting down gracefully..."; shutdown' SIGTERM
trap 'echo "Received SIGINT, shutting down gracefully..."; shutdown' SIGINT

shutdown() {
    if [ -n "${CHILD_PID:-}" ]; then
        kill -TERM "$CHILD_PID" 2>/dev/null || true
        wait "$CHILD_PID" 2>/dev/null || true
    fi
    exit 0
}

# Validate environment
if [ -z "${NEW_RELIC_LICENSE_KEY:-}" ]; then
    echo "ERROR: NEW_RELIC_LICENSE_KEY is required"
    exit 1
fi

if [ -z "${NEW_RELIC_API_KEY:-}" ]; then
    echo "ERROR: NEW_RELIC_API_KEY is required"
    exit 1
fi

# Set defaults
export NODE_ENV="${NODE_ENV:-production}"
export OPTIMIZATION_MODE="${OPTIMIZATION_MODE:-balanced}"
export CONTROL_LOOP_INTERVAL="${CONTROL_LOOP_INTERVAL:-300}"
export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-https://otlp.nr-data.net}"
export OTEL_EXPORTER_OTLP_HEADERS="${OTEL_EXPORTER_OTLP_HEADERS:-api-key=${NEW_RELIC_LICENSE_KEY}}"

# Handle different service types
case "${1:-collector}" in
    "collector")
        echo "Starting NRDOT Collector in ${OPTIMIZATION_MODE} mode..."
        exec /usr/local/bin/otelcol-contrib \
            --config="/etc/otel/profiles/${OPTIMIZATION_MODE}.yaml" &
        CHILD_PID=$!
        wait $CHILD_PID
        ;;
    "control-loop")
        echo "Starting Control Loop..."
        cd /app
        exec node scripts/control-loop.js docker "${OPTIMIZATION_MODE}" "${CONTROL_LOOP_INTERVAL}" &
        CHILD_PID=$!
        wait $CHILD_PID
        ;;
    "monitor")
        echo "Starting DashBuilder Monitor..."
        cd /app
        exec node orchestrator/monitor.js &
        CHILD_PID=$!
        wait $CHILD_PID
        ;;
    *)
        exec "$@"
        ;;
esac
