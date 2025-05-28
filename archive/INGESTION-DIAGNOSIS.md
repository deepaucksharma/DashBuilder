# NRDOT v2 Ingestion Diagnosis

## Current Status

### ✅ What's Working:
1. **Docker containers are running**
   - Main NRDOT container is healthy
   - Web dashboard accessible at http://localhost:8090
   - Health endpoint responding correctly

2. **Environment variables are set**
   - API Key: ***REMOVED***
   - License Key: ***REMOVED***
   - Account ID: 4430445
   - Region: US

### ❌ What's Not Working:
1. **Authentication failures**
   - API Key returns 401 (authentication required) on GraphQL endpoint
   - License Key returns 403 (forbidden) on Metrics API endpoint
   
2. **Zero data ingestion**
   - No metrics are being sent to New Relic
   - Test metrics are rejected with authentication errors

## Root Cause Analysis

The primary issue is **invalid or expired credentials**:

1. **API Key Issue**: The API key `***REMOVED***` is being rejected by the GraphQL API
2. **License Key Issue**: The license key `***REMOVED***` is being rejected by the Metrics API

## Immediate Actions Required

### 1. Verify Credentials in New Relic UI
1. Log into New Relic: https://one.newrelic.com
2. Navigate to API Keys section
3. Verify the API key is active and has the correct permissions
4. Get a fresh License Key from Account Settings

### 2. Test with Fresh Credentials
```bash
# Test API Key
curl -X POST https://api.newrelic.com/graphql \
  -H "Content-Type: application/json" \
  -H "API-Key: YOUR_NEW_API_KEY" \
  -d '{"query": "{ actor { user { name email } } }"}'

# Test License Key  
curl -X POST https://metric-api.newrelic.com/metric/v1 \
  -H "Api-Key: YOUR_NEW_LICENSE_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"metrics":[{"name":"test.metric","type":"gauge","value":1,"timestamp":'$(date +%s)'000}]}]'
```

### 3. Update .env File
Once you have valid credentials:
```bash
# Update .env with new credentials
NEW_RELIC_API_KEY=<new-api-key>
NEW_RELIC_LICENSE_KEY=<new-license-key>
```

### 4. Restart Docker Containers
```bash
docker-compose -f docker-compose-complete.yml down
docker-compose -f docker-compose-complete.yml up -d
```

## Alternative: Use Browser Automation

If manual credential retrieval is difficult, we can use the browser automation script:
```bash
cd automation
npm install
node src/examples/full-setup.js
```

This will:
1. Log into New Relic automatically
2. Generate fresh API keys
3. Update the .env file
4. Restart the services

## Monitoring Success

Once credentials are updated, verify ingestion:
```bash
# Check container logs
docker logs nrdot-complete -f

# Run diagnostics
source .env && bash scripts/fix-zero-ingestion.sh

# Query for metrics
curl -X POST https://api.newrelic.com/graphql \
  -H "API-Key: $NEW_RELIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ actor { account(id: '$NEW_RELIC_ACCOUNT_ID') { nrql(query: \"SELECT count(*) FROM Metric SINCE 5 minutes ago\") { results } } } }"
  }'
```

## Summary

The zero ingestion issue is caused by invalid/expired credentials. Once you obtain fresh API and License keys from New Relic, the containerized NRDOT setup is ready to start ingesting data immediately.