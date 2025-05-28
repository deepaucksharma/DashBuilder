#!/bin/bash
set -e

echo "Starting NRDOT v2 Container..."
echo "License Key: ${NEW_RELIC_LICENSE_KEY:0:10}..."
echo "API Key: ${NEW_RELIC_API_KEY:0:10}..."
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"

# Create static directory
mkdir -p /app/static
echo "<h1>NRDOT v2 Dashboard</h1><p>Check /api/status for API status</p>" > /app/static/index.html

# Start metrics generator in background
if [ -f /usr/local/bin/generate-real-metrics.sh ]; then
    echo "Starting metrics generator..."
    /usr/local/bin/generate-real-metrics.sh &
fi

# Start simple API server in background
if [ -f /app/simple-api-server.js ]; then
    echo "Starting API server..."
    cd /app && node simple-api-server.js &
fi

# Run initial diagnostics
if [ -f /usr/local/bin/fix-zero-ingestion.sh ]; then
    echo "Running initial diagnostics..."
    /usr/local/bin/fix-zero-ingestion.sh || true
fi

# Start nginx
echo "Starting nginx..."
nginx -g "daemon off;"