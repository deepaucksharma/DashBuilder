#!/bin/bash

# Get New Relic License Key using API Key
# This is crucial for data ingestion - API keys are for GraphQL, License keys are for sending data

source "$(dirname "$0")/../.env"

echo "=== Fetching New Relic License Key ==="
echo "This is the key needed for actual data ingestion (different from API key)"
echo

# Query for license key
RESPONSE=$(curl -s -X POST https://api.newrelic.com/graphql \
  -H "Content-Type: application/json" \
  -H "API-Key: $NEW_RELIC_API_KEY" \
  -d '{
    "query": "{ actor { account(id: '"$NEW_RELIC_ACCOUNT_ID"') { licenseKey } } }"
  }')

# Extract license key
LICENSE_KEY=$(echo "$RESPONSE" | jq -r '.data.actor.account.licenseKey // empty')

if [ -n "$LICENSE_KEY" ]; then
    echo "✓ Found License Key: ${LICENSE_KEY:0:10}..."
    echo
    echo "Adding to .env file..."
    
    # Update .env file
    if grep -q "NEW_RELIC_LICENSE_KEY=" "../.env"; then
        sed -i.bak "s/NEW_RELIC_LICENSE_KEY=.*/NEW_RELIC_LICENSE_KEY=$LICENSE_KEY/" "../.env"
    else
        echo "NEW_RELIC_LICENSE_KEY=$LICENSE_KEY" >> "../.env"
    fi
    
    echo "✓ License key added to .env"
    echo
    echo "IMPORTANT: This license key is what actually allows data ingestion!"
    echo "The API key (NRAK-...) is only for API queries, not for sending metrics."
else
    echo "✗ Failed to fetch license key"
    echo "Response: $RESPONSE"
    echo
    echo "Please check:"
    echo "1. Your API key has the correct permissions"
    echo "2. The account ID is correct"
    echo "3. You have access to view license keys"
fi