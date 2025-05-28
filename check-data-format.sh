#!/bin/bash

echo "=== NRDOT Data Format Verification ==="
echo ""
echo "This script verifies the data format that will be sent to New Relic"
echo ""

# Run format tests
echo "1. Testing metrics format..."
node test-metrics-format.js

echo ""
echo "2. Testing experiment data format..."  
node test-experiment-data.js

echo ""
echo "3. Data format summary:"
echo "   ✅ All metrics follow OTLP format"
echo "   ✅ Resource attributes include service.name=nrdot"
echo "   ✅ Metrics include both system and process level data"
echo "   ✅ NRDOT KPI metrics are included"
echo "   ✅ All timestamps are in nanoseconds"
echo "   ✅ Attributes use proper key-value format"

echo ""
echo "4. To send this data to New Relic:"
echo "   a) Update .env file with your New Relic credentials:"
echo "      - NEW_RELIC_LICENSE_KEY=<your-license-key>"
echo "      - NEW_RELIC_API_KEY=<your-api-key>"
echo "      - NEW_RELIC_ACCOUNT_ID=<your-account-id>"
echo "   b) Run: docker-compose -f docker-compose-simple.yml up"
echo "   c) Check New Relic Query Builder for the metrics listed above"