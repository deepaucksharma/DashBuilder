# OpenTelemetry Setup Fixes

This document summarizes the critical issues found in the NRDOT v2 OpenTelemetry setup and the fixes applied.

## Critical Issues Identified

### 1. **Invalid Processor Configurations**
**Problem:** Several processors were using experimental or non-existent operations:
- `experimental_scale_value` with complex aggregations
- Invalid `transform` processor syntax 
- Non-standard processor names and operations

**Fix:** 
- Replaced with standard, supported processors
- Simplified metric transformations
- Used proper metricstransform syntax

### 2. **Incorrect Pipeline Ordering**
**Problem:** Processors were not in the correct order:
- Memory limiter not first
- Batch processor not last
- Dependencies between processors not respected

**Fix:**
- Ensured memory_limiter is first processor
- Moved batch to end of pipeline
- Ordered processors logically

### 3. **Docker Volume Mounting Issues**
**Problem:** 
- Config override was conflicting with built-in config
- Missing critical host filesystem mounts for process discovery
- Incorrect permissions

**Fix:**
- Removed config volume override (use built-in config)
- Added proper host filesystem mounts (`/proc`, `/sys`, `/`)
- Added environment variables for host paths

### 4. **Environment Variable Issues**
**Problem:**
- Missing HOST_* environment variables for containerized deployment
- Incorrect variable references
- Missing default values

**Fix:**
- Added HOST_PROC, HOST_SYS environment variables
- Updated hostmetrics receiver to use root_path
- Added proper defaults

### 5. **Complex Metric Transformations**
**Problem:**
- EWMA calculations using unsupported operations
- Complex aggregations causing failures
- Experimental features not available in stable release

**Fix:**
- Simplified to basic, working metric transformations
- Removed experimental EWMA calculations
- Focus on core metrics that work reliably

## Files Fixed

### 1. `config-minimal-working.yaml`
- **Purpose:** Simple, reliable configuration that actually works
- **Features:** Basic process monitoring, New Relic export, health checks
- **Testing:** Validated with OpenTelemetry collector

### 2. `config-fixed.yaml`
- **Purpose:** Enhanced configuration with more features
- **Features:** Process classification, KPI metrics, experiments
- **Status:** More complex but functional

### 3. `Dockerfile.otel`
- **Fixed:** Updated to use working configuration file
- **Fixed:** Proper user permissions and security

### 4. `docker-compose.yaml`
- **Fixed:** Removed conflicting volume mounts
- **Fixed:** Added proper host filesystem access
- **Fixed:** Added required environment variables

### 5. Validation Scripts
- **Added:** `validate-otel-config.sh` - Comprehensive configuration testing
- **Added:** `test-otel-quick.sh` - Quick functionality test

## Root Cause Analysis

The main issues stemmed from:

1. **Over-engineering:** Trying to implement complex features before basic functionality worked
2. **Experimental features:** Using unstable OpenTelemetry features
3. **Docker complexity:** Insufficient understanding of containerized process monitoring
4. **Configuration syntax:** Using incorrect or deprecated processor configurations

## Testing Approach

### Before Deployment:
```bash
# 1. Validate configuration syntax
./scripts/validate-otel-config.sh

# 2. Quick functionality test
./scripts/test-otel-quick.sh

# 3. Full Docker deployment test
./scripts/run-nrdot-docker.sh start
```

### Verification Steps:
1. Health endpoint responds: `http://localhost:13133/health`
2. Metrics endpoint responds: `http://localhost:8888/metrics`
3. Process metrics appear in output
4. No errors in collector logs
5. Data appears in New Relic (if license key provided)

## Deployment Options

### Option 1: Minimal Working (Recommended for Testing)
```bash
# Use config-minimal-working.yaml
# Basic process monitoring only
# Proven to work reliably
```

### Option 2: Enhanced Features
```bash
# Use config-fixed.yaml
# Includes KPIs, classification, experiments
# More complex but functional
```

## Current Status

✅ **FIXED Issues:**
- Configuration validates successfully
- Collector starts without errors
- Health and metrics endpoints respond
- Basic process monitoring works
- Docker deployment functional

⚠️ **Known Limitations:**
- EWMA calculations simplified
- Process classification basic
- Experiment features reduced
- Some advanced metrics removed

## Next Steps

1. **Test the minimal working configuration**
2. **Gradually add features back** (KPIs, classification, etc.)
3. **Validate each addition** before proceeding
4. **Build comprehensive test suite** for ongoing validation

## Command Reference

```bash
# Test configuration
docker run --rm \
  -v "$(pwd)/distributions/nrdot-plus/config/config-minimal-working.yaml:/tmp/config.yaml" \
  -e NEW_RELIC_LICENSE_KEY="your-key" \
  otel/opentelemetry-collector-contrib:0.91.0 \
  validate --config=/tmp/config.yaml

# Quick start
cd distributions/nrdot-plus
export NEW_RELIC_LICENSE_KEY="your-key"
docker compose up -d

# Check health
curl http://localhost:13133/health

# Check metrics
curl http://localhost:8888/metrics | grep process_
```

## Lessons Learned

1. **Start simple** - Get basic functionality working first
2. **Validate continuously** - Test each change
3. **Use stable features** - Avoid experimental OpenTelemetry features
4. **Understand containerization** - Process monitoring in containers has special requirements
5. **Documentation matters** - Clear configuration documentation prevents issues