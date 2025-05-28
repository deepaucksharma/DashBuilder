#!/bin/bash

echo "=== Checking New Relic Connection ==="
echo ""

# Check environment
source .env

echo "1. Environment Variables:"
echo "   License Key: ${NEW_RELIC_LICENSE_KEY:0:10}..."
echo "   API Key: ${NEW_RELIC_API_KEY:0:10}..."
echo "   Account ID: $NEW_RELIC_ACCOUNT_ID"
echo ""

echo "2. Testing OTLP endpoint connectivity:"
# Test basic connectivity
curl -s -o /dev/null -w "   HTTPS endpoint: %{http_code}\n" https://otlp.nr-data.net:4317 || echo "   Connection failed"
echo ""

echo "3. Current Issues:"
echo "   ❌ Account ID is not set (showing 'your_account_id_here')"
echo "   ⚠️  The collector is getting 'unexpected EOF' errors when sending to New Relic"
echo ""

echo "4. To fix the data ingestion:"
echo "   a) Update .env file with your actual NEW_RELIC_ACCOUNT_ID"
echo "   b) Ensure the license key is correct (should be 40 characters)"
echo "   c) For OTLP data, the endpoint should be: otlp.nr-data.net:4317"
echo "   d) The header should use 'api-key' with the license key value"
echo ""

echo "5. Test with curl (requires account ID):"
echo "   Once you have the account ID, you can test with:"
echo "   curl -X POST https://otlp.nr-data.net:4317/v1/metrics \\"
echo "     -H 'api-key: YOUR_LICENSE_KEY' \\"
echo "     -H 'Content-Type: application/x-protobuf' \\"
echo "     --data-binary @test-metrics.pb"
echo ""

echo "6. Alternative: Use New Relic API directly:"
echo "   You can also send metrics via the Metric API:"
echo "   curl -X POST https://metric-api.newrelic.com/metric/v1 \\"
echo "     -H 'Api-Key: YOUR_LICENSE_KEY' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '[{\"metrics\":[{\"name\":\"test.metric\",\"type\":\"gauge\",\"value\":100,\"timestamp\":$(date +%s)000,\"attributes\":{\"host\":\"test\"}}]}]'"