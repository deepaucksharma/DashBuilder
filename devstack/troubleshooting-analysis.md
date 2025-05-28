# NRDOT Troubleshooting Analysis - Complete Retrospective

## What We Tried (Chronologically)

### Phase 1: Initial NRDOT Deployment
- **Tried**: Deploy 5 NRDOT collectors using `newrelic/nrdot-collector-host:latest`
- **Result**: Got 403 Permission Denied errors
- **Discovery**: License key had "FFFF" in it (placeholder)

### Phase 2: License Key Issues
- **Tried**: Multiple license keys
  - First: `46cb357917adfc2dffad66c887659fe4FFFFNRAL` (placeholder)
  - Second: `a73002b4f9516df7b8696aea5c13681d6308NRAL` (from root .env)
  - Third: `7da497365fc75f0eedabb8ce37e69d42FFFFNRAL` (updated in devstack .env)
- **Result**: 403 errors continued with NRDOT
- **Discovery**: Different API key types exist (NRAK vs NRAL)

### Phase 3: NRDOT Configuration Issues
- **Tried**: Various NRDOT configurations
- **Result**: Containers had issues with:
  - Host ID detection: `failed to get host ID`
  - Root path warning for metrics collection
- **Discovery**: NRDOT needs explicit host.id and root_path configuration

### Phase 4: Standard OpenTelemetry Collectors
- **Tried**: Switch to `otel/opentelemetry-collector-contrib:latest`
- **Result**: Collectors ran without errors
- **Discovery**: Standard OTEL collectors seemed to work better

### Phase 5: Authentication Testing
- **Tried**: Direct API testing with curl
- **Result**: HTTP 200 responses - authentication works!
- **Discovery**: License key is valid for the endpoint

## What Worked ✅

1. **Authentication**:
   ```bash
   curl -X POST https://otlp.nr-data.net/v1/metrics \
     -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
     -H "Content-Type: application/json" \
     -d '{...}'
   # Returns HTTP 200
   ```

2. **Standard OTEL Collectors**:
   - No 403 errors
   - Successfully collected metrics
   - Ran stable without crashes

3. **Manual Test Metrics**:
   - Successfully sent (HTTP 200)
   - Used correct endpoint and headers

## What Didn't Work ❌

1. **NRDOT Collectors**:
   - Persistent 403 errors on metrics endpoint
   - Even with valid license key
   - Possible configuration mismatch

2. **Data Visibility**:
   - Despite HTTP 200 responses
   - No data visible in New Relic UI
   - All queries return no results

## Complexities Discovered 🔍

### 1. API Key Types
- **License Keys** (NRAL): For data ingestion
- **User API Keys** (NRAK): For querying/configuration
- **Query Keys** (NRIQ): For querying data

### 2. NRDOT Specific Requirements
- Needs explicit `host.id` setting
- Requires `/hostfs` mount for proper metrics
- Has specific config format expectations

### 3. OTLP Endpoint Configuration
- Endpoint: `https://otlp.nr-data.net`
- Ports: 443, 4317 (gRPC), 4318 (HTTP)
- Protocol preference: `http/protobuf`
- Required headers: `api-key: <license-key>`

### 4. New Relic Requirements
- Attribute limits: 4095 chars for values, 255 for names
- Metric temporality: Delta preferred
- Compression: gzip or zstd
- Batch size considerations

## What We Know for Certain ✓

1. **License Key**: Valid and returns HTTP 200
2. **Region**: US endpoint is correct (EU returns 403)
3. **Account ID**: 3630072
4. **Collectors**: Running and collecting metrics
5. **Network**: Can reach New Relic endpoints

## What We Don't Know ?

1. **Why no data visible**:
   - Account permissions issue?
   - License key scope limitations?
   - Data processing delays?
   - Wrong account view?

2. **NRDOT vs Standard OTEL**:
   - Why NRDOT gets 403 but standard OTEL doesn't
   - Configuration differences

3. **Data Pipeline**:
   - Where data goes after HTTP 200
   - Processing time on New Relic side

## Key Insights 💡

1. **HTTP 200 ≠ Data Visible**: Successfully sending data doesn't guarantee visibility
2. **NRDOT is Opinionated**: Has specific config requirements that differ from standard OTEL
3. **Authentication Works**: The license key itself is valid
4. **Collector Choice Matters**: Standard OTEL worked better than NRDOT in this case

## Most Likely Root Causes

1. **Account Configuration**:
   - License key might not have full permissions
   - Account might need OTLP enabled
   - Data might be going to different account

2. **Timing/Processing**:
   - Longer delay than expected
   - Batch processing on NR side

3. **Query Context**:
   - Looking at wrong account
   - Time range issues
   - Region mismatch

## What Actually Helped

1. **Direct API Testing**: Confirmed authentication works
2. **Standard OTEL Collectors**: More stable than NRDOT
3. **Debug Logging**: Showed metrics being collected
4. **Test Metrics**: Proved endpoint accepts data

## Recommended Next Steps

1. **Contact New Relic Support** with:
   - Account ID: 3630072
   - License Key (first 10 chars): 7da497365f...
   - Evidence of HTTP 200 responses
   
2. **Verify Account Settings**:
   - Check if OTLP is enabled
   - Verify license key permissions
   - Confirm data retention settings

3. **Try Alternative Approaches**:
   - New Relic Agent instead of OTLP
   - Different account/license key
   - Wait longer (hours) for data