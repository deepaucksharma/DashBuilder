# DashBuilder Troubleshooting Runbook

**Comprehensive troubleshooting guide for DashBuilder and NRDOT v2 platform issues**

## Table of Contents

1. [Quick Health Check](#quick-health-check)
2. [Common Issues](#common-issues)
3. [API & Authentication Issues](#api--authentication-issues)
4. [Metrics & Data Issues](#metrics--data-issues)
5. [Performance Issues](#performance-issues)
6. [Docker & Container Issues](#docker--container-issues)
7. [Dashboard Issues](#dashboard-issues)
8. [Experiment Issues](#experiment-issues)
9. [Emergency Procedures](#emergency-procedures)
10. [Diagnostic Commands](#diagnostic-commands)

## Quick Health Check

Run this comprehensive health check first:

```bash
# Run full diagnostics
npm run diagnostics:all

# Expected output:
# ✅ PostgreSQL: Connected
# ✅ Redis: Connected
# ✅ OTEL Collector: Healthy
# ✅ Control Loop: Active
# ✅ New Relic API: Connected
# ✅ Metrics Flow: Active
```

### Manual Health Check Script

```bash
#!/bin/bash
echo "=== DashBuilder Health Check ==="

# Check Docker services
echo "Checking services..."
docker-compose ps

# Check collector health
if curl -s http://localhost:13133/health > /dev/null 2>&1; then
    echo "✅ Collector health endpoint: OK"
else
    echo "❌ Collector health endpoint: FAILED"
fi

# Check metrics endpoint
if curl -s http://localhost:8889/metrics > /dev/null 2>&1; then
    echo "✅ Metrics endpoint: OK"
else
    echo "❌ Metrics endpoint: FAILED"
fi

# Check API connectivity
if npm run test:connection > /dev/null 2>&1; then
    echo "✅ New Relic API: Connected"
else
    echo "❌ New Relic API: Connection failed"
fi

# Check for recent errors
ERROR_COUNT=$(docker-compose logs --tail=100 2>&1 | grep -i error | wc -l)
echo "Recent errors in logs: $ERROR_COUNT"
```

## Common Issues

### Issue 1: Authentication Errors (403)

**Symptoms:**
- API calls return 403 Forbidden
- "Authentication failed" errors
- Metrics not appearing in New Relic

**Root Cause Analysis:**
```bash
# Check API key format
echo "License Key length: $(echo -n $NEW_RELIC_LICENSE_KEY | wc -c)"  # Should be 40
echo "User API Key format: $NEW_RELIC_USER_API_KEY"  # Should start with NRAK-
echo "Query Key format: $NEW_RELIC_QUERY_KEY"  # Should start with NRIQ-

# Test each endpoint
npm run test:connection -- --verbose
```

**Solutions:**

1. **Fix License Key Issues:**
   ```bash
   # Verify license key is correct (40 characters, no spaces)
   export NEW_RELIC_LICENSE_KEY="your-40-character-license-key"
   
   # Restart services
   docker-compose restart otel-collector
   ```

2. **Fix User API Key:**
   ```bash
   # Get key from New Relic UI:
   # Profile → API Keys → Create Key
   # Permissions needed: NerdGraph, Dashboard management
   
   export NEW_RELIC_USER_API_KEY="NRAK-XXXXXXXXXXXXXXXXXX"
   ```

3. **Region Mismatch:**
   ```bash
   # For EU datacenter
   export NEW_RELIC_REGION=EU
   export NEW_RELIC_OTLP_ENDPOINT=https://otlp.eu01.nr-data.net
   
   # Update docker-compose.yml
   docker-compose up -d
   ```

### Issue 2: No Metrics in New Relic

**Symptoms:**
- Collector running but no data in NRDB
- NRQL queries return empty results
- Dashboard widgets show "No data"

**Root Cause Analysis:**
```bash
# Step 1: Check if collector is receiving metrics
docker exec nrdot-collector curl -s http://localhost:8889/metrics | grep "receiver_accepted_metric_points"

# Step 2: Check if metrics are being exported
docker exec nrdot-collector curl -s http://localhost:8889/metrics | grep "exporter_sent_metric_points"

# Step 3: Check for export errors
docker logs nrdot-collector 2>&1 | grep -E "export.*failed|error.*sending"

# Step 4: Verify in New Relic
npm run find-metrics -- --pattern "system"
```

**Solutions:**

1. **Fix Collector Configuration:**
   ```yaml
   # configs/collector-nrdot.yaml
   exporters:
     otlp:
       endpoint: ${NEW_RELIC_OTLP_ENDPOINT}
       headers:
         api-key: ${NEW_RELIC_LICENSE_KEY}
       retry_on_failure:
         enabled: true
         initial_interval: 5s
         max_interval: 30s
   ```

2. **Check Process Filters:**
   ```bash
   # Too restrictive filtering
   export PROCESS_INCLUDE_PATTERN=".*"
   export MIN_CPU_THRESHOLD=0.001
   export MIN_MEMORY_THRESHOLD=1048576  # 1MB
   
   docker-compose up -d otel-collector
   ```

3. **Verify Network Connectivity:**
   ```bash
   # Test from inside container
   docker exec nrdot-collector sh -c "wget -O- https://otlp.nr-data.net 2>&1"
   
   # Check DNS
   docker exec nrdot-collector nslookup otlp.nr-data.net
   ```

### Issue 3: High Memory/CPU Usage

**Symptoms:**
- Container using excessive resources
- System slowdown
- OOM kills

**Root Cause Analysis:**
```bash
# Check resource usage
docker stats --no-stream

# Check process count
docker exec nrdot-collector curl -s http://localhost:8889/metrics | grep "process_count"

# Check metric cardinality
docker exec nrdot-collector curl -s http://localhost:8889/metrics | wc -l
```

**Solutions:**

1. **Switch to Aggressive Profile:**
   ```bash
   # Immediate relief
   docker exec control-loop redis-cli SET current_profile aggressive
   docker-compose restart otel-collector
   ```

2. **Adjust Resource Limits:**
   ```yaml
   # docker-compose.yml
   services:
     otel-collector:
       deploy:
         resources:
           limits:
             memory: 1G
             cpus: '1.0'
   ```

3. **Increase Filtering:**
   ```bash
   export PROCESS_IMPORTANCE_THRESHOLD=0.9
   export MAX_PROCESSES_PER_HOST=30
   export COLLECTION_INTERVAL=60s
   docker-compose up -d
   ```

## API & Authentication Issues

### NerdGraph API Failures

**Symptoms:**
- Dashboard creation fails
- "GraphQL error" messages
- 401/403 errors

**Diagnosis:**
```bash
# Test NerdGraph directly
curl -X POST https://api.newrelic.com/graphql \
  -H "Api-Key: $NEW_RELIC_USER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ actor { user { email } } }"}'
```

**Solutions:**

1. **Generate Correct API Key:**
   ```
   New Relic UI → Profile → API Keys → Create Key
   
   Required Permissions:
   - [x] NerdGraph
   - [x] Manage dashboards
   - [x] Query insights
   - [x] View entities
   ```

2. **Fix GraphQL Queries:**
   ```javascript
   // Correct account ID usage
   const query = `
     mutation CreateDashboard($accountId: Int!) {
       dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
         entityResult { guid }
       }
     }
   `;
   ```

### Insights Query API Issues

**Symptoms:**
- Metric queries fail
- "Invalid query" errors

**Solutions:**

```bash
# Test Insights API
curl -X GET "https://insights-api.newrelic.com/v1/accounts/$NEW_RELIC_ACCOUNT_ID/query?nrql=SELECT%20count(*)%20FROM%20Metric" \
  -H "X-Query-Key: $NEW_RELIC_QUERY_KEY"

# Fix common query issues
# Use correct event types:
# - Metric (for OTEL metrics)
# - ProcessSample (for APM metrics)
# - SystemSample (for infrastructure)
```

## Metrics & Data Issues

### Missing Process Metrics

**Symptoms:**
- Some processes not appearing
- Low coverage percentage

**Diagnosis:**
```bash
# List all system processes
ps aux | wc -l

# Check what collector sees
docker exec nrdot-collector curl -s http://localhost:8889/metrics | grep process | wc -l

# Check filters
docker exec nrdot-collector cat /etc/otel/config.yaml | grep -A10 process
```

**Solutions:**

1. **Fix Container Permissions:**
   ```yaml
   # docker-compose.yml
   services:
     otel-collector:
       privileged: true
       pid: host
       volumes:
         - /proc:/host/proc:ro
         - /sys:/host/sys:ro
   ```

2. **Adjust Process Filters:**
   ```yaml
   # Remove restrictive patterns
   processors:
     filter/processes:
       metrics:
         include:
           match_type: regexp
           metric_names:
             - .*
   ```

### Incorrect Cost Calculations

**Symptoms:**
- Cost estimates don't match reality
- Huge discrepancies in projections

**Diagnosis:**
```sql
-- Check datapoint counting
SELECT sum(nrdot_summary_total_datapoints) as 'Total Datapoints',
       sum(nrdot_summary_total_datapoints) / 1000000 * 0.25 as 'Estimated Cost'
FROM Metric 
WHERE service.name LIKE '%nrdot%'
SINCE 1 hour ago
```

**Solutions:**

```bash
# Update cost model
export COST_PER_MILLION_DATAPOINTS=0.25  # Adjust based on your pricing
export COST_CURRENCY=USD

# Recalculate
docker-compose restart control-loop
```

## Performance Issues

### Slow Dashboard Loading

**Symptoms:**
- Widgets timeout
- "Query exceeded resource limits"

**Solutions:**

1. **Optimize NRQL Queries:**
   ```sql
   -- Bad: No time limit
   SELECT count(*) FROM ProcessSample
   
   -- Good: With time window
   SELECT count(*) FROM ProcessSample SINCE 5 minutes ago
   
   -- Better: With sampling
   SELECT count(*) FROM ProcessSample SINCE 1 hour ago LIMIT 1000
   ```

2. **Use Summary Metrics:**
   ```sql
   -- Instead of raw process data
   SELECT latest(nrdot_process_coverage_percentage) FROM Metric
   ```

### High Latency

**Diagnosis:**
```bash
# Check pipeline latency
docker exec nrdot-collector curl -s http://localhost:8889/metrics | grep "pipeline_latency"

# Check batch size
docker exec nrdot-collector curl -s http://localhost:8889/metrics | grep "batch_send_size"
```

**Solutions:**

```yaml
# Optimize batching
processors:
  batch:
    send_batch_size: 5000  # Reduce from default 8192
    timeout: 5s            # Reduce from 200ms
```

## Docker & Container Issues

### Container Won't Start

**Symptoms:**
- Exit code 1 or 125
- "Permission denied" errors

**Diagnosis:**
```bash
# Check logs
docker-compose logs otel-collector

# Check permissions
ls -la configs/

# Validate compose file
docker-compose config
```

**Solutions:**

1. **Fix Permissions:**
   ```bash
   chmod 644 configs/*.yaml
   chmod 755 scripts/*.sh
   ```

2. **Fix Port Conflicts:**
   ```bash
   # Find what's using the port
   sudo lsof -i :4317
   
   # Change port in docker-compose.yml
   ports:
     - "14317:4317"  # Use different external port
   ```

### Container Keeps Restarting

**Diagnosis:**
```bash
# Check restart count
docker ps -a | grep nrdot

# Check exit codes
docker inspect nrdot-collector | grep -A5 "State"

# View full logs
docker logs --tail 100 nrdot-collector
```

**Solutions:**

1. **Fix Configuration Errors:**
   ```bash
   # Validate YAML
   docker run --rm -v $(pwd)/configs:/configs otel/opentelemetry-collector-contrib:latest \
     --config=/configs/collector-nrdot.yaml --dry-run
   ```

2. **Increase Health Check Tolerance:**
   ```yaml
   healthcheck:
     test: ["CMD", "wget", "--spider", "-q", "http://localhost:13133/health"]
     interval: 30s
     timeout: 10s
     retries: 5
     start_period: 60s
   ```

## Dashboard Issues

### Dashboard Creation Fails

**Symptoms:**
- "Invalid dashboard configuration"
- GraphQL errors

**Diagnosis:**
```bash
# Validate dashboard JSON
npm run cli dashboard validate dashboards/nrdot-main.json

# Test with minimal dashboard
npm run cli dashboard create --name "Test" --widgets "[]"
```

**Solutions:**

1. **Fix Widget Queries:**
   ```javascript
   // Validate each widget query
   widgets.forEach(widget => {
     npm.run(`cli nrql validate "${widget.query}"`);
   });
   ```

2. **Check Account Permissions:**
   ```bash
   # Verify account access
   npm run cli account info
   ```

### Widgets Show No Data

**Common Fixes:**

1. **Use Correct Event Type:**
   ```sql
   -- For OTEL metrics
   FROM Metric WHERE metricName = 'system.cpu.utilization'
   
   -- For APM metrics  
   FROM ProcessSample WHERE processDisplayName = 'nginx'
   ```

2. **Add Proper Filters:**
   ```sql
   WHERE service.name = 'nrdot-collector'
   AND host.name = '${var.hostname}'
   ```

## Experiment Issues

### Experiments Not Running

**Symptoms:**
- No test containers launching
- Results always empty

**Diagnosis:**
```bash
# Check experiment status
npm run experiment:status

# View container logs
docker ps -a | grep exp-

# Check experiment config
cat experiments/profiles/cost-optimization-basic.yaml
```

**Solutions:**

1. **Fix Docker Permissions:**
   ```bash
   # Add user to docker group
   sudo usermod -aG docker $USER
   newgrp docker
   ```

2. **Clean Up Stale Experiments:**
   ```bash
   # Stop all experiment containers
   docker stop $(docker ps -q --filter "name=exp-")
   docker rm $(docker ps -aq --filter "name=exp-")
   ```

## Emergency Procedures

### System Overload - Emergency Stop

```bash
#!/bin/bash
# EMERGENCY: Stop all optimization immediately

# 1. Stop control loop
docker-compose stop control-loop

# 2. Switch to baseline (no filtering)
docker exec otel-collector sh -c "echo 'baseline' > /tmp/profile"

# 3. Restart collector
docker-compose restart otel-collector

echo "Emergency stop completed. System in baseline mode."
```

### Data Loss Prevention

```bash
#!/bin/bash
# Backup before major changes

# 1. Backup database
docker exec postgres pg_dump -U dashbuilder > backup-$(date +%Y%m%d-%H%M%S).sql

# 2. Backup Redis
docker exec redis redis-cli SAVE
docker cp redis:/data/dump.rdb redis-backup-$(date +%Y%m%d-%H%M%S).rdb

# 3. Backup configurations
tar -czf configs-backup-$(date +%Y%m%d-%H%M%S).tar.gz configs/

echo "Backup completed"
```

### Complete System Reset

```bash
#!/bin/bash
# WARNING: This will reset everything!

read -p "Are you sure? This will delete all data! (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborted"
    exit 1
fi

# Stop everything
docker-compose down

# Remove volumes
docker volume rm dashbuilder_postgres-data dashbuilder_redis-data

# Clean up
docker system prune -af

# Fresh start
docker-compose up -d

echo "System reset complete"
```

## Diagnostic Commands

### Essential Diagnostics

```bash
# Full system diagnostic
npm run diagnostics:all > diagnostic-report.txt

# Quick checks
npm run test:connection      # API connectivity
npm run test:metrics         # Metric submission
npm run find-metrics         # Explore available metrics
npm run validate:keys        # Check API keys
```

### Metric Exploration

```bash
# Find specific metrics
npm run find-metrics -- --pattern "process"

# Check metric cardinality
docker exec nrdot-collector curl -s http://localhost:8889/metrics | \
  grep -v "^#" | cut -d'{' -f1 | sort | uniq -c | sort -rn | head -20
```

### Log Analysis

```bash
# View all errors
docker-compose logs | grep -i error | tail -50

# Follow specific service
docker-compose logs -f control-loop

# Export logs for analysis
docker-compose logs > logs-$(date +%Y%m%d-%H%M%S).txt
```

### Performance Profiling

```bash
# CPU profiling
docker stats --no-stream

# Memory analysis
docker exec nrdot-collector cat /proc/meminfo

# Network traffic
docker exec nrdot-collector netstat -an | grep ESTABLISHED | wc -l
```

## Common NRQL Queries for Debugging

### System Health

```sql
-- Overall system health
SELECT latest(nrdot_health_score) as 'Health Score',
       latest(nrdot_process_coverage_percentage) as 'Coverage %',
       latest(nrdot_estimated_cost_per_hour) as 'Cost/Hour'
FROM Metric 
WHERE service.name = 'nrdot-collector'
SINCE 5 minutes ago

-- Error rate
SELECT rate(count(*), 1 minute) as 'Errors/min'
FROM Log 
WHERE service.name IN ('nrdot-collector', 'control-loop')
AND severity = 'ERROR'
SINCE 1 hour ago TIMESERIES
```

### Cost Analysis

```sql
-- Cost breakdown
SELECT sum(nrdot_estimated_cost_per_hour) as 'Total Cost/Hour'
FROM Metric 
FACET host.name
SINCE 1 hour ago

-- Cost trend
SELECT average(nrdot_estimated_cost_per_hour) 
FROM Metric 
SINCE 24 hours ago 
TIMESERIES 1 hour
```

### Coverage Analysis

```sql
-- Process coverage by host
SELECT latest(nrdot_process_coverage_percentage) 
FROM Metric 
FACET host.name
WHERE nrdot_process_coverage_percentage IS NOT NULL

-- Missing critical processes
SELECT uniqueCount(processDisplayName) 
FROM ProcessSample 
WHERE processDisplayName IN ('nginx', 'redis', 'postgres')
FACET processDisplayName
SINCE 5 minutes ago
```

## Support Escalation

If issues persist after following this runbook:

1. **Collect Diagnostic Bundle:**
   ```bash
   npm run diagnostics:all > diagnostics.txt
   docker-compose logs > logs.txt
   tar -czf support-bundle.tar.gz diagnostics.txt logs.txt configs/
   ```

2. **Check Resources:**
   - GitHub Issues: https://github.com/your-org/dashbuilder/issues
   - Documentation: https://dashbuilder.io/docs
   - Community Forum: https://community.dashbuilder.io

3. **Contact Support:**
   - Email: support@dashbuilder.io
   - Include: Support bundle, steps tried, error messages

---

*Last Updated: January 2025 | Version: 2.0*