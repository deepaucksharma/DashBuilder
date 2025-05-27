# NRDOT v2 Troubleshooting Guide

This guide helps diagnose and resolve common issues with the NRDOT v2 framework.

## Table of Contents
- [Common Issues](#common-issues)
- [Diagnostic Commands](#diagnostic-commands)
- [Configuration Problems](#configuration-problems)
- [Performance Issues](#performance-issues)
- [Control Loop Issues](#control-loop-issues)
- [Metrics Collection Problems](#metrics-collection-problems)
- [Emergency Procedures](#emergency-procedures)
- [Support Resources](#support-resources)

---

## Common Issues

### 1. High Cost Despite Optimization

**Symptoms:**
- Cost metrics show minimal reduction
- Series count remains high
- Profile changes don't reduce costs

**Diagnosis:**
```bash
# Check current profile and metrics
curl -s http://localhost:8888/metrics | grep -E "nrdot_process_series|nrdot_estimated_cost"

# Verify profile is active
yq eval '.state.active_profile' /etc/nrdot-collector-host/optimization.yaml

# Check if filters are working
journalctl -u nrdot-collector-host | grep -i "filter"
```

**Solutions:**
1. **Verify process classification:**
   ```bash
   # List top processes by series count
   ps aux | awk '{print $11}' | sort | uniq -c | sort -rn | head -20
   
   # Check if they're classified correctly
   grep -E "pattern" /etc/nrdot-collector-host/optimization.yaml
   ```

2. **Adjust thresholds:**
   ```yaml
   # Edit optimization.yaml
   profiles:
     aggressive:
       thresholds:
         cpu_threshold_percent: 25.0  # Increase from 20.0
         memory_threshold_mb: 250     # Increase from 200
   ```

3. **Enable debug logging:**
   ```bash
   export OTEL_LOG_LEVEL=debug
   systemctl restart nrdot-collector-host
   ```

### 2. Missing Critical Processes

**Symptoms:**
- Important processes not appearing in New Relic
- Coverage metrics below threshold
- Alerts for missing data

**Diagnosis:**
```bash
# Check coverage metric
curl -s http://localhost:8888/metrics | grep nrdot_process_coverage_critical

# List excluded processes
yq eval '.process_classification.noise.patterns' /etc/nrdot-collector-host/optimization.yaml

# Verify process is running
ps aux | grep <process_name>
```

**Solutions:**
1. **Add to critical classification:**
   ```yaml
   process_classification:
     critical_system:
       patterns:
         common:
           - "^your-critical-process$"
   ```

2. **Override importance score:**
   ```yaml
   custom_classification:
     business_critical:
       score: 0.95
       patterns:
         common:
           - "^payment-service"
   ```

3. **Switch to conservative profile:**
   ```bash
   yq eval -i '.state.active_profile = "conservative"' /etc/nrdot-collector-host/optimization.yaml
   systemctl restart nrdot-collector-host
   ```

### 3. Control Loop Thrashing

**Symptoms:**
- Frequent profile changes
- Unstable metrics
- Log messages about thrashing protection

**Diagnosis:**
```bash
# Check recent profile changes
jq '.' /var/lib/nrdot/state/profile_changes.jsonl | tail -20

# Monitor control loop logs
journalctl -u nrdot-control-loop -f

# Check thrashing protection
grep "Thrashing detected" /var/log/nrdot/control-loop.log
```

**Solutions:**
1. **Increase change cooldown:**
   ```bash
   # Edit control loop script
   sed -i 's/sleep 300/sleep 600/' /usr/local/bin/nrdot-control-loop.sh
   ```

2. **Adjust decision thresholds:**
   ```bash
   # Increase hysteresis
   export NRDOT_TARGET_SERIES=5000
   export NRDOT_MAX_SERIES=12000  # Increase from 10000
   systemctl restart nrdot-control-loop
   ```

3. **Disable automatic changes temporarily:**
   ```bash
   systemctl stop nrdot-control-loop
   # Manually set profile
   yq eval -i '.state.active_profile = "balanced"' /etc/nrdot-collector-host/optimization.yaml
   ```

---

## Diagnostic Commands

### Health Checks

```bash
# Collector health
curl -s http://localhost:13133/health | jq .

# Metrics endpoint
curl -s http://localhost:8888/metrics | grep -E "^nrdot_"

# Process count
ps aux | wc -l

# Estimated series
echo "Processes: $(ps aux | wc -l), Estimated series: $(($(ps aux | wc -l) * 3))"
```

### Configuration Validation

```bash
# Validate YAML syntax
yq eval '.' /etc/nrdot-collector-host/optimization.yaml > /dev/null && echo "✓ Valid" || echo "✗ Invalid"

# Dry run collector
/usr/bin/nrdot-collector-host --config=/etc/nrdot-collector-host/config.yaml --dry-run

# Check permissions
ls -la /etc/nrdot-collector-host/
ls -la /var/lib/nrdot/
```

### Performance Metrics

```bash
# Collector resource usage
ps aux | grep nrdot-collector-host

# Control loop status
systemctl status nrdot-control-loop

# Recent errors
journalctl -u nrdot-collector-host -p err --since "1 hour ago"
```

---

## Configuration Problems

### Invalid YAML Syntax

**Error:** `yaml: line X: found character that cannot start any token`

**Fix:**
```bash
# Validate with yq
yq eval '.' /etc/nrdot-collector-host/optimization.yaml

# Common issues:
# - Tabs instead of spaces
# - Missing quotes around regex patterns
# - Incorrect indentation

# Auto-format
yq eval '.' /etc/nrdot-collector-host/optimization.yaml > /tmp/fixed.yaml
mv /tmp/fixed.yaml /etc/nrdot-collector-host/optimization.yaml
```

### Environment Variables Not Set

**Error:** `environment variable NEW_RELIC_LICENSE_KEY not set`

**Fix:**
```bash
# Check current environment
systemctl show nrdot-collector-host --property=Environment

# Set in service file
systemctl edit nrdot-collector-host
# Add:
[Service]
Environment="NEW_RELIC_LICENSE_KEY=your-key-here"

# Or use environment file
echo "NEW_RELIC_LICENSE_KEY=your-key-here" >> /etc/default/nrdot-collector-host
```

### File Permissions

**Error:** `permission denied`

**Fix:**
```bash
# Fix ownership
chown -R nrdot-collector-host:nrdot-collector-host /etc/nrdot-collector-host
chown -R nrdot-collector-host:nrdot-collector-host /var/lib/nrdot
chown -R nrdot-collector-host:nrdot-collector-host /var/log/nrdot

# Fix permissions
chmod 644 /etc/nrdot-collector-host/*.yaml
chmod 755 /usr/local/bin/nrdot-control-loop.sh
```

---

## Performance Issues

### High CPU Usage

**Diagnosis:**
```bash
# Check collector CPU
top -p $(pgrep -f nrdot-collector-host)

# Profile collector
curl http://localhost:8889/debug/pprof/profile?seconds=30 > cpu.pprof
```

**Solutions:**
1. Increase collection interval:
   ```yaml
   receivers:
     hostmetrics:
       collection_interval: 120s  # Increase from 60s
   ```

2. Reduce scrapers:
   ```yaml
   scrapers:
     process:
       exclude:
         names: 
           - ".*"  # More aggressive exclusion
   ```

3. Increase batch size:
   ```yaml
   processors:
     batch:
       send_batch_size: 2000  # Increase from 1000
       timeout: 20s
   ```

### High Memory Usage

**Diagnosis:**
```bash
# Check memory usage
ps aux | grep nrdot-collector-host | awk '{print $6}'

# Check for memory leaks
curl http://localhost:8889/debug/pprof/heap > heap.pprof
```

**Solutions:**
1. Reduce memory limit:
   ```yaml
   processors:
     memory_limiter:
       limit_mib: 128  # Reduce from 256
   ```

2. Enable garbage collection tuning:
   ```bash
   # Add to service
   Environment="GOGC=50"  # More aggressive GC
   ```

---

## Control Loop Issues

### Loop Not Starting

**Diagnosis:**
```bash
# Check service status
systemctl status nrdot-control-loop

# Check for lock file
ls -la /var/run/nrdot-control-loop.lock

# View recent logs
journalctl -u nrdot-control-loop --since "10 minutes ago"
```

**Solutions:**
1. Remove stale lock:
   ```bash
   rm -f /var/run/nrdot-control-loop.lock
   systemctl restart nrdot-control-loop
   ```

2. Check dependencies:
   ```bash
   # Ensure collector is running
   systemctl start nrdot-collector-host
   systemctl start nrdot-control-loop
   ```

### Incorrect Decisions

**Diagnosis:**
```bash
# Enable debug mode
sed -i 's/log INFO/log DEBUG/' /usr/local/bin/nrdot-control-loop.sh
systemctl restart nrdot-control-loop

# Watch decision making
tail -f /var/log/nrdot/control-loop.log | grep -E "Metrics:|Decision:"
```

**Solutions:**
1. Adjust thresholds:
   ```bash
   # Edit environment
   systemctl edit nrdot-control-loop
   # Adjust:
   Environment="NRDOT_MIN_COVERAGE=0.90"  # Reduce from 0.95
   ```

2. Override profile manually:
   ```bash
   # Stop auto-control
   systemctl stop nrdot-control-loop
   
   # Set profile
   yq eval -i '.state.active_profile = "balanced"' /etc/nrdot-collector-host/optimization.yaml
   ```

---

## Metrics Collection Problems

### No Metrics in New Relic

**Diagnosis:**
```bash
# Check export errors
journalctl -u nrdot-collector-host | grep -i "export.*failed"

# Verify endpoint connectivity
curl -v https://otlp.nr-data.net

# Check API key
echo $NEW_RELIC_LICENSE_KEY | wc -c  # Should be 40 chars
```

**Solutions:**
1. Verify credentials:
   ```bash
   # Test API key
   curl -X POST https://otlp.nr-data.net/v1/metrics \
     -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

2. Check proxy settings:
   ```bash
   # Add proxy if needed
   export https_proxy=http://proxy.company.com:8080
   systemctl restart nrdot-collector-host
   ```

### Incomplete Process Data

**Diagnosis:**
```bash
# Check process scraper
curl -s http://localhost:8888/metrics | grep process_scrape

# Verify permissions
sudo -u nrdot-collector-host ps aux > /dev/null && echo "✓ Can read processes"
```

**Solutions:**
1. Grant capabilities:
   ```bash
   # Add CAP_DAC_READ_SEARCH for full process visibility
   setcap cap_dac_read_search+ep /usr/bin/nrdot-collector-host
   ```

2. Run as root (not recommended):
   ```bash
   # Edit service
   systemctl edit nrdot-collector-host
   # Change:
   [Service]
   User=root
   ```

---

## Emergency Procedures

### 1. Disable All Optimization

```bash
#!/bin/bash
# Emergency disable script

# Stop control loop
systemctl stop nrdot-control-loop

# Set conservative profile
yq eval -i '.state.active_profile = "conservative"' \
  /etc/nrdot-collector-host/optimization.yaml

# Disable all filtering
yq eval -i '.profiles.conservative.thresholds.min_importance_score = 0.0' \
  /etc/nrdot-collector-host/optimization.yaml

# Restart collector
systemctl restart nrdot-collector-host

echo "✓ Optimization disabled - all processes now collected"
```

### 2. Rollback Configuration

```bash
#!/bin/bash
# Rollback to previous configuration

# Backup current
cp /etc/nrdot-collector-host/optimization.yaml \
   /etc/nrdot-collector-host/optimization.yaml.$(date +%s)

# Restore default
curl -s https://raw.githubusercontent.com/newrelic/nrdot-configs/main/optimization.yaml \
  -o /etc/nrdot-collector-host/optimization.yaml

# Restart services
systemctl restart nrdot-collector-host
systemctl restart nrdot-control-loop
```

### 3. Complete Reset

```bash
#!/bin/bash
# Full reset procedure

# Stop all services
systemctl stop nrdot-control-loop
systemctl stop nrdot-collector-host

# Clear state
rm -rf /var/lib/nrdot/state/*
rm -f /var/run/nrdot-control-loop.lock

# Reset to defaults
/opt/nrdot/scripts/quickstart.sh --reset

# Start fresh
systemctl start nrdot-collector-host
systemctl start nrdot-control-loop
```

---

## Support Resources

### Documentation
- [Official Documentation](https://docs.newrelic.com/nrdot)
- [GitHub Repository](https://github.com/newrelic/nrdot-collector-releases)
- [Configuration Examples](https://github.com/newrelic/nrdot-configs)

### Getting Help
1. **Check logs first:**
   ```bash
   # Collector logs
   journalctl -u nrdot-collector-host -n 100
   
   # Control loop logs
   tail -100 /var/log/nrdot/control-loop.log
   ```

2. **Gather diagnostics:**
   ```bash
   # Create support bundle
   /opt/nrdot/scripts/support-bundle.sh
   ```

3. **Contact support:**
   - Email: nrdot-support@newrelic.com
   - Slack: #nrdot-users
   - GitHub Issues: [Report Issue](https://github.com/newrelic/nrdot-collector-releases/issues)

### Debug Mode

Enable comprehensive debugging:
```bash
# Set all debug flags
export OTEL_LOG_LEVEL=debug
export NRDOT_DEBUG=true
export GODEBUG=gctrace=1

# Restart with debug
systemctl restart nrdot-collector-host

# Watch debug output
journalctl -u nrdot-collector-host -f | grep -i debug
```

---

**Remember:** When in doubt, switch to conservative profile and contact support!