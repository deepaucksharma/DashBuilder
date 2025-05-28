# NRDOT Deployment Summary: Complete Analysis

## Overview
This document summarizes the complete journey of deploying NRDOT collectors, including all challenges, solutions, and best practices discovered.

## Key Discoveries

### 1. Authentication Complexity
- **Issue**: Initial 403 errors despite valid license key
- **Root Cause**: Using wrong key type (NRAK vs NRAL)
- **Solution**: License Keys (ending in NRAL) are required for data ingestion
- **Learning**: Different API key types serve different purposes

### 2. NRDOT vs Standard OpenTelemetry
- **NRDOT Challenges**:
  - More opinionated configuration
  - Built-in defaults that may conflict
  - Specific environment variable expectations
- **OpenTelemetry Advantages**:
  - More flexible configuration
  - Better documentation
  - Predictable behavior
- **Solution**: Created configurable system supporting both

### 3. Data Visibility Delay
- **Issue**: Data sent successfully (HTTP 200) but not visible
- **Root Cause**: Initial indexing/processing delay in New Relic
- **Solution**: Wait 2-3 minutes for first-time data
- **Learning**: HTTP 200 ≠ immediate visibility

### 4. Configuration Requirements
- **Host ID**: Must be explicitly set to avoid detection failures
- **Root Path**: Required for proper host metrics in containers
- **Process Visibility**: Needs --pid=host and proper mounts
- **Resource Attributes**: Critical for data organization

## What Worked

### 1. Standard OpenTelemetry Collectors
```yaml
receivers:
  hostmetrics:
    collection_interval: 30s
    scrapers: [cpu, memory, disk, filesystem, load, network, processes, process]

exporters:
  otlphttp:
    endpoint: https://otlp.nr-data.net:4318
    headers:
      api-key: ${NEW_RELIC_LICENSE_KEY}
```

### 2. Proper Environment Configuration
```bash
# Essential environment variables
NEW_RELIC_LICENSE_KEY=xxx...NRAL  # Must end with NRAL
NEW_RELIC_ACCOUNT_ID=3630072
OTEL_RESOURCE_ATTRIBUTES="host.id=vm-1,service.name=openstack-vm"
```

### 3. Volume Mounts for Full Visibility
```bash
-v /proc:/host/proc:ro
-v /sys:/host/sys:ro
-v /:/hostfs:ro
--pid host
```

## What Didn't Work

### 1. Default NRDOT Configuration
- Missing explicit host.id caused entity creation issues
- Default exporters had authentication problems
- Built-in config assumptions didn't match our setup

### 2. Incomplete Documentation Following
- NRDOT documentation gaps for containerized deployments
- Assumed defaults that weren't suitable
- Missing troubleshooting for common issues

### 3. Initial Security Approach
- Hardcoded credentials in examples (now fixed)
- Insufficient secret management
- Missing security best practices

## Solutions Developed

### 1. Configurable Deployment System
- **Purpose**: Support any NRDOT or OTEL distribution
- **Features**:
  - Profile-based configuration
  - Environment variable templating
  - Security best practices
  - Multi-collector support

### 2. Advanced Configuration Management
- **collector-config-advanced.env**: Comprehensive settings
- **Profile system**: Pre-configured for common scenarios
- **Override mechanism**: Flexible customization

### 3. Security Framework
- **Secret Management**: Environment-based with validation
- **Container Security**: Non-root, capability restrictions
- **Network Security**: Proper TLS, limited exposure

## NRDOT Plus Considerations

### Potential Overrides
1. **Configuration**:
   - Additional config files
   - Dynamic configuration
   - Plugin support

2. **Receivers**:
   - Enhanced cloud-native receivers
   - Service discovery
   - Custom protocols

3. **Processors**:
   - ML-based sampling
   - Advanced filtering
   - Cloud enrichment

4. **Exporters**:
   - Multi-destination
   - Failover support
   - Enhanced buffering

### Implementation Strategy
```bash
# Use profile system
./switch-collector.sh  # Select NRDOT Plus

# Or direct configuration
COLLECTOR_IMAGE=newrelic/nrdot-plus:latest
COLLECTOR_TYPE=nrdot-plus
./deploy-advanced-collectors.sh
```

## Best Practices Summary

### 1. Deployment
- Always validate API keys before deployment
- Use profile system for consistency
- Monitor initial deployment closely
- Allow time for data to appear

### 2. Configuration
- Explicit is better than implicit
- Set all critical attributes
- Use environment variables for secrets
- Version control configs (not secrets)

### 3. Security
- Never hardcode credentials
- Use least privilege principle
- Regular key rotation
- Monitor for exposed secrets

### 4. Troubleshooting
- Check HTTP response codes
- Verify with curl tests
- Review container logs
- Use debug exporters

## Final Architecture

```
┌─────────────────────────────────────────────────┐
│             Configuration Layer                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────┐ │
│  │  .env File  │  │   Profiles   │  │ Custom │ │
│  │  (Secrets)  │  │ (Templates)  │  │ Config │ │
│  └─────────────┘  └──────────────┘  └────────┘ │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│           Deployment Scripts                     │
│  ┌──────────────────┐  ┌───────────────────┐   │
│  │ deploy-nrdot-    │  │ deploy-advanced-  │   │
│  │ final.sh         │  │ collectors.sh     │   │
│  └──────────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              Collectors (1-N)                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  │
│  │ NRDOT     │  │ NRDOT     │  │   OTEL    │  │
│  │ Host      │  │ Plus      │  │ Contrib   │  │
│  └───────────┘  └───────────┘  └───────────┘  │
└─────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              New Relic Platform                  │
│         https://otlp.nr-data.net                 │
└─────────────────────────────────────────────────┘
```

## Conclusion

The journey from initial NRDOT deployment to a fully configurable, secure, and flexible collector system revealed:

1. **Complexity is in the Details**: Small configuration differences have big impacts
2. **Flexibility is Key**: Supporting multiple distributions is essential
3. **Security Cannot be Afterthought**: Must be built-in from start
4. **Documentation Gaps Exist**: Real-world usage differs from docs
5. **Community Solutions Work**: Standard OTEL often more reliable

The final solution provides a robust framework for deploying any NRDOT variant or OpenTelemetry distribution with confidence.