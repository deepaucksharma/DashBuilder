# NRDOT v2 Troubleshooting Runbook

This runbook provides step-by-step guidance for diagnosing and resolving common issues with NRDOT v2.

## Quick Diagnostics

### 1. Health Check Script
```bash
#!/bin/bash
# Quick health check for NRDOT
echo "=== NRDOT Health Check ==="

# Check if collector is running
if pgrep -f "otelcol" > /dev/null; then
    echo "✓ Collector is running"
else
    echo "✗ Collector is NOT running"
fi

# Check metrics endpoint
if curl -s http://localhost:8889/metrics > /dev/null; then
    echo "✓ Metrics endpoint responding"
else
    echo "✗ Metrics endpoint NOT responding"
fi

# Check for recent errors
ERROR_COUNT=$(journalctl -u nrdot-collector -n 100 | grep -i error | wc -l)
echo "Recent errors in logs: $ERROR_COUNT"

# Check New Relic connectivity
if curl -s https://otlp.nr-data.net > /dev/null; then
    echo "✓ Can reach New Relic endpoint"
else
    echo "✗ Cannot reach New Relic endpoint"
fi
```

## Common Issues and Solutions

### Issue 1: No Metrics in New Relic

**Symptoms:**
- Collector is running but no data appears in New Relic
- NRQL queries return no results

**Diagnosis:**
```bash
# Check exporter metrics
curl -s http://localhost:8888/metrics | grep otelcol_exporter_sent_metric_points

# Check for export errors
journalctl -u nrdot-collector | grep -i "export.*failed"

# Verify license key
echo $NEW_RELIC_LICENSE_KEY | wc -c  # Should be 40 characters
```

**Solutions:**
1. Verify license key is correct:
   ```bash
   systemctl stop nrdot-collector
   export NEW_RELIC_LICENSE_KEY="your-correct-key"
   systemctl start nrdot-collector
   ```

2. Check endpoint configuration:
   ```yaml
   # In collector config
   exporters:
     otlp/newrelic:
       endpoint: https://otlp.nr-data.net
   ```

3. Verify network connectivity:
   ```bash
   # Test OTLP endpoint
   curl -v https://otlp.nr-data.net/v1/metrics
   
   # Check DNS resolution
   nslookup otlp.nr-data.net
   ```

### Issue 2: High Memory Usage

**Symptoms:**
- Collector consuming excessive memory
- OOM kills or restarts

**Diagnosis:**
```bash
# Check memory usage
ps aux | grep otelcol | awk '{print $4 " " $11}'

# Check batch size
curl -s http://localhost:8888/metrics | grep batch_send_size

# Check cardinality
curl -s http://localhost:8889/metrics | wc -l
```

**Solutions:**
1. Adjust memory limiter:
   ```yaml
   processors:
     memory_limiter:
       check_interval: 1s
       limit_mib: 512  # Reduce if needed
       spike_limit_mib: 128
   ```

2. Reduce batch size:
   ```yaml
   processors:
     batch:
       send_batch_size: 1000  # Default is 8192
       timeout: 10s
   ```

3. Enable sampling for high-cardinality metrics:
   ```bash
   # Check which processes have high cardinality
   scripts/cardinality-monitor.sh
   ```

### Issue 3: Missing Process Metrics

**Symptoms:**
- Some processes not appearing in metrics
- Coverage percentage lower than expected

**Diagnosis:**
```bash
# List all processes
ps aux | wc -l

# Check what collector sees
curl -s http://localhost:8889/metrics | grep process_cpu_time | cut -d'{' -f2 | cut -d'}' -f1 | sort -u | wc -l

# Check process receiver config
grep -A10 "hostmetrics/process" /etc/nrdot/collector-config.yaml
```

**Solutions:**
1. Verify process receiver configuration:
   ```yaml
   receivers:
     hostmetrics/process:
       collection_interval: 20s
       scrapers:
         process:
           mute_process_name_error: true
           mute_process_exe_error: true
           mute_process_io_error: true
   ```

2. Check permissions (especially in containers):
   ```bash
   # For Docker
   docker run --pid=host ...
   
   # For Kubernetes
   hostPID: true
   ```

3. Verify no process filters are too restrictive:
   ```yaml
   # Check optimization.yaml
   process_filters:
     exclude_patterns: []  # Should be minimal
   ```

### Issue 4: Incorrect Cost Calculations

**Symptoms:**
- Cost estimates way off (too high or too low)
- Cost not matching actual New Relic bill

**Diagnosis:**
```sql
-- Check total datapoints
SELECT sum(nrdot_summary_total_datapoints) 
FROM Metric 
WHERE service.name = 'nrdot-plus-host' 
SINCE 1 hour ago

-- Verify cost calculation
SELECT latest(nrdot_cost_estimate_total) as 'Estimated Cost',
       sum(nrdot_summary_total_datapoints) / 1000000 * 0.25 as 'Calculated Cost'
FROM Metric 
WHERE service.name = 'nrdot-plus-host'
```

**Solutions:**
1. Verify cost formula in config:
   ```yaml
   metricstransform/cost:
     transforms:
       - include: nrdot_summary_total_datapoints
         action: insert
         new_name: nrdot_cost_estimate_total
         operations:
           - action: multiply
             value: 0.00000025  # $0.25 per million
   ```

2. Check datapoint counting:
   ```bash
   # Ensure all metrics are counted
   curl -s http://localhost:8889/metrics | grep -c "^[^#]"
   ```

### Issue 5: EWMA Not Working

**Symptoms:**
- Anomaly scores always 0 or very high
- EWMA values not updating over time

**Diagnosis:**
```sql
-- Check EWMA values
SELECT latest(nrdot_process_cpu_ewma) as 'EWMA', 
       latest(process.cpu.utilization) as 'Current'
FROM Metric 
WHERE process.name = 'your-process'
FACET process.name

-- Check anomaly scores
SELECT latest(nrdot_process_anomaly_score) 
FROM Metric 
WHERE process.name = 'your-process'
```

**Solutions:**
1. Verify EWMA processor configuration:
   ```yaml
   metricstransform/ewma:
     transforms:
       - include: process.cpu.utilization
         action: insert
         new_name: nrdot_process_cpu_ewma
         match_type: regexp
         operations:
           - action: experimental_scale_value
             aggregation_type: exponential_histogram
             scale: 0.1  # Alpha value
   ```

2. Check TTL implementation:
   ```bash
   # EWMA should reset after inactivity
   grep -A20 "ttl_minutes" /etc/nrdot/collector-config.yaml
   ```

### Issue 6: Control Loop Not Switching Profiles

**Symptoms:**
- Always in same profile despite KPI changes
- Profile switches not logged

**Diagnosis:**
```bash
# Check control loop logs
journalctl -u nrdot-control-loop -n 50

# Verify KPI values
./scripts/control-loop-enhanced.sh check

# Check profile file
cat /var/lib/nrdot/current_profile.json
```

**Solutions:**
1. Verify thresholds in optimization.yaml:
   ```yaml
   profiles:
     aggressive:
       thresholds:
         cost_per_hour: 10.0  # Adjust as needed
         coverage_percentage: 90.0
   ```

2. Ensure control loop has correct permissions:
   ```bash
   sudo chown nrdot:nrdot /var/lib/nrdot/
   sudo chmod 755 /var/lib/nrdot/
   ```

3. Check New Relic API key:
   ```bash
   # Test API access
   curl -H "Api-Key: $NEW_RELIC_API_KEY" \
     https://api.newrelic.com/v2/applications.json
   ```

### Issue 7: Experiments Not Running

**Symptoms:**
- All processes in control group
- No treatment metrics

**Diagnosis:**
```sql
-- Check experiment distribution
SELECT latest(nrdot_experiment_control_processes) as 'Control',
       latest(nrdot_experiment_treatment_1_processes) as 'Treatment 1',
       latest(nrdot_experiment_treatment_2_processes) as 'Treatment 2',
       latest(nrdot_experiment_treatment_3_processes) as 'Treatment 3'
FROM Metric
```

**Solutions:**
1. Verify experiment processor:
   ```yaml
   metricstransform/experiment:
     transforms:
       - include: process.cpu.utilization
         action: update
         operations:
           - action: add_label
             new_label: experiment_group
             new_value: # Hash-based assignment
   ```

2. Check if experiments are enabled:
   ```yaml
   # In optimization.yaml
   experiments:
     enabled: true
     rings:
       - name: control
         percentage: 25
   ```

### Issue 8: Dashboard Not Loading

**Symptoms:**
- Dashboard widgets show errors
- NRQL queries timeout

**Diagnosis:**
```bash
# Validate dashboard JSON
jq . /path/to/dashboard.json

# Test NRQL queries directly
curl -X POST https://api.newrelic.com/graphql \
  -H "Api-Key: $NEW_RELIC_API_KEY" \
  -d '{"query": "{ actor { account(id: YOUR_ACCOUNT_ID) { nrql(query: \"SELECT count(*) FROM Metric\") { results } } } }"}'
```

**Solutions:**
1. Fix metric name issues:
   ```sql
   -- Use underscores for Metric queries
   SELECT latest(nrdot_summary_total_series) FROM Metric
   
   -- Use dots for ProcessSample queries  
   SELECT latest(process.cpu.utilization) FROM ProcessSample
   ```

2. Add proper time windows:
   ```sql
   -- Always include SINCE clause
   SELECT latest(value) FROM Metric SINCE 5 minutes ago
   ```

## Performance Tuning

### Reduce Metric Cardinality
```bash
# Find high-cardinality metrics
./scripts/cardinality-monitor.sh

# Add to optimization.yaml
high_cardinality_limits:
  process.cpu.time: 1000  # Limit unique series
```

### Optimize Collection Intervals
```yaml
# Adjust per metric importance
receivers:
  hostmetrics/process:
    collection_interval: 60s  # Increase for less critical
```

### Enable Compression
```yaml
exporters:
  otlp/newrelic:
    compression: gzip  # Reduce bandwidth
```

## Emergency Procedures

### Complete Reset
```bash
#!/bin/bash
# Emergency reset procedure
systemctl stop nrdot-collector
systemctl stop nrdot-control-loop

# Backup current config
cp -r /etc/nrdot /etc/nrdot.backup.$(date +%s)

# Clear state
rm -rf /var/lib/nrdot/*

# Restart with defaults
systemctl start nrdot-collector
systemctl start nrdot-control-loop
```

### Rollback Procedure
```bash
#!/bin/bash
# Rollback to previous version
cd /opt/nrdot
git checkout tags/v1.0.0  # Previous stable
make install
systemctl restart nrdot-collector
```

## Monitoring Commands

### Real-time Metrics
```bash
# Watch metric flow
watch -n 5 'curl -s http://localhost:8888/metrics | grep -E "received|sent|dropped"'

# Monitor errors
tail -f /var/log/nrdot/collector.log | grep -i error
```

### Validation Checks
```bash
# Run full validation
./scripts/validate-nrdot-complete.sh

# Quick health check
curl http://localhost:13133/
```

## Support Escalation

If issues persist after following this runbook:

1. Collect diagnostic bundle:
   ```bash
   ./scripts/collect-diagnostics.sh
   ```

2. Check known issues:
   - GitHub: https://github.com/your-org/nrdot/issues
   - Internal wiki: /nrdot-known-issues

3. Contact support with:
   - Diagnostic bundle
   - Steps tried from this runbook
   - Error messages and logs

## Appendix: Useful NRQL Queries

### System Health
```sql
-- Overall health score
SELECT average(nrdot_health_score) 
FROM Metric 
WHERE service.name = 'nrdot-plus-host' 
SINCE 1 hour ago TIMESERIES

-- Error rate
SELECT rate(count(*), 1 minute) 
FROM Log 
WHERE service.name = 'nrdot-collector' 
AND level = 'ERROR' 
SINCE 1 hour ago
```

### Cost Analysis
```sql
-- Cost breakdown by tier
SELECT sum(nrdot_cost_estimate_total) 
FROM Metric 
FACET process.tier 
SINCE 1 day ago
```

### Coverage Analysis
```sql
-- Coverage by process type
SELECT latest(nrdot_coverage_percentage) 
FROM Metric 
FACET process.executable.name 
WHERE process.executable.name IS NOT NULL
```