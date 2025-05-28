# DashBuilder Troubleshooting Guide

This guide covers common issues and their solutions when working with DashBuilder and NRDOT v2.

## Table of Contents

- [Connection Issues](#connection-issues)
- [Docker Problems](#docker-problems)
- [NRDOT Configuration](#nrdot-configuration)
- [Performance Issues](#performance-issues)
- [Data Collection Problems](#data-collection-problems)
- [Dashboard Issues](#dashboard-issues)
- [API Errors](#api-errors)

---

## Connection Issues

### Problem: Cannot connect to New Relic API

**Symptoms:**
- `401 Unauthorized` errors
- `403 Forbidden` errors
- Connection timeouts

**Solutions:**

1. **Verify API credentials:**
   ```bash
   # Test your API key
   curl -H "Api-Key: YOUR_API_KEY" https://api.newrelic.com/v2/users.json
   ```

2. **Check region settings:**
   - US datacenter: `https://api.newrelic.com`
   - EU datacenter: `https://api.eu.newrelic.com`

3. **Validate environment variables:**
   ```bash
   # Check if variables are set
   echo $NEW_RELIC_API_KEY
   echo $NEW_RELIC_ACCOUNT_ID
   echo $NEW_RELIC_LICENSE_KEY
   ```

4. **Test OTLP endpoint:**
   ```bash
   # For US
   telnet otlp.nr-data.net 4317
   
   # For EU
   telnet otlp.eu01.nr-data.net 4317
   ```

### Problem: OTEL Collector not sending data

**Symptoms:**
- No metrics in New Relic
- Collector logs show export errors

**Solutions:**

1. **Check collector status:**
   ```bash
   docker-compose ps
   docker-compose logs otel-collector
   ```

2. **Verify configuration:**
   ```bash
   # Validate YAML syntax
   docker run --rm -v $(pwd)/configs:/configs otel/opentelemetry-collector-contrib:latest \
     --config /configs/collector-comprehensive.yaml --dry-run
   ```

3. **Check metrics endpoint:**
   ```bash
   curl http://localhost:8888/metrics | grep -i error
   ```

---

## Docker Problems

### Problem: Containers won't start

**Symptoms:**
- `docker-compose up` fails
- Port binding errors
- Permission denied errors

**Solutions:**

1. **Check port availability:**
   ```bash
   # Check if ports are in use
   sudo lsof -i :3000
   sudo lsof -i :8080
   sudo lsof -i :9090
   ```

2. **Clean up Docker resources:**
   ```bash
   # Stop all containers
   docker-compose down
   
   # Remove volumes (warning: deletes data)
   docker-compose down -v
   
   # Prune system
   docker system prune -a
   ```

3. **Fix permission issues:**
   ```bash
   # Fix volume permissions
   sudo chown -R $USER:$USER ./
   ```

### Problem: Out of memory errors

**Symptoms:**
- Containers crash with OOM
- System becomes unresponsive

**Solutions:**

1. **Increase Docker memory:**
   - Docker Desktop: Preferences → Resources → Memory
   - Linux: Check `/etc/docker/daemon.json`

2. **Add memory limits to containers:**
   ```yaml
   # In docker-compose.yml
   services:
     nrdot:
       mem_limit: 2g
       memswap_limit: 2g
   ```

---

## NRDOT Configuration

### Problem: Profile changes not taking effect

**Symptoms:**
- Metrics volume unchanged
- Old profile still active

**Solutions:**

1. **Force reload collector:**
   ```bash
   # Restart the collector
   docker-compose restart otel-collector
   
   # Or send SIGHUP
   docker-compose kill -s HUP otel-collector
   ```

2. **Verify profile in metrics:**
   ```bash
   curl -s http://localhost:8888/metrics | grep nrdot_optimization_profile
   ```

3. **Check control loop logs:**
   ```bash
   docker-compose logs control-loop | tail -50
   ```

### Problem: High cardinality causing issues

**Symptoms:**
- Memory usage increasing
- Slow metric queries
- Cost higher than expected

**Solutions:**

1. **Switch to more aggressive profile:**
   ```bash
   # Update environment variable
   export NRDOT_PROFILE=aggressive
   docker-compose up -d
   ```

2. **Check current cardinality:**
   ```sql
   -- In New Relic Query Builder
   SELECT uniqueCount(dimensions()) 
   FROM Metric 
   WHERE metricName LIKE 'process.%' 
   SINCE 1 hour ago
   ```

3. **Identify high-cardinality sources:**
   ```sql
   SELECT count(*) 
   FROM Metric 
   WHERE metricName LIKE 'process.%' 
   FACET process.executable.name 
   SINCE 1 hour ago 
   LIMIT 20
   ```

---

## Performance Issues

### Problem: Slow dashboard loading

**Symptoms:**
- Dashboards take long to load
- Timeouts on complex queries

**Solutions:**

1. **Optimize NRQL queries:**
   ```sql
   -- Instead of:
   SELECT * FROM ProcessSample WHERE host = 'server1'
   
   -- Use:
   SELECT cpuPercent, memoryResidentSizeBytes 
   FROM ProcessSample 
   WHERE host = 'server1' 
   LIMIT 100
   ```

2. **Use query caching:**
   ```javascript
   // In dashboard configuration
   {
     "configuration": {
       "queries": [{
         "accountId": 123456,
         "query": "...",
         "cacheSeconds": 300  // 5-minute cache
       }]
     }
   }
   ```

### Problem: High CPU usage on collector

**Symptoms:**
- Collector using >50% CPU
- Metrics processing delays

**Solutions:**

1. **Reduce collection frequency:**
   ```yaml
   # In collector config
   receivers:
     hostmetrics:
       collection_interval: 120s  # Increase from 60s
   ```

2. **Enable batching:**
   ```yaml
   processors:
     batch:
       timeout: 10s
       send_batch_size: 1000
   ```

---

## Data Collection Problems

### Problem: Missing process metrics

**Symptoms:**
- Some processes not appearing
- Incomplete data

**Solutions:**

1. **Check process filters:**
   ```yaml
   # In optimization.yaml
   process_classification:
     noise:
       patterns:
         # Make sure important processes aren't filtered
   ```

2. **Verify permissions:**
   ```bash
   # Collector needs permission to read all processes
   sudo usermod -a -G docker otel
   ```

### Problem: Metrics delayed or batched incorrectly

**Symptoms:**
- Data appears in bursts
- Timestamps are old

**Solutions:**

1. **Adjust batch processor:**
   ```yaml
   processors:
     batch:
       timeout: 5s  # Reduce from 10s
       send_batch_size: 500  # Reduce from 1000
   ```

2. **Check time synchronization:**
   ```bash
   # Ensure system time is correct
   timedatectl status
   ```

---

## Dashboard Issues

### Problem: Widgets showing "No data"

**Symptoms:**
- Empty charts
- "No data available" messages

**Solutions:**

1. **Verify data is flowing:**
   ```sql
   -- Check if any metrics exist
   SELECT count(*) 
   FROM Metric 
   WHERE metricName LIKE 'nrdot%' 
   SINCE 5 minutes ago
   ```

2. **Check widget configuration:**
   - Ensure correct account ID
   - Verify time range is appropriate
   - Check for typos in metric names

3. **Test queries in Query Builder:**
   - Copy NRQL from widget
   - Run in New Relic Query Builder
   - Adjust as needed

---

## API Errors

### Problem: GraphQL mutations failing

**Symptoms:**
- Dashboard creation fails
- Can't update configurations

**Solutions:**

1. **Check API permissions:**
   - Ensure API key has required permissions
   - User keys need dashboard management permissions

2. **Validate mutation syntax:**
   ```bash
   # Test with curl
   curl -X POST https://api.newrelic.com/graphql \
     -H "Api-Key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"query": "{ actor { user { email } } }"}'
   ```

3. **Check rate limits:**
   - New Relic has API rate limits
   - Implement exponential backoff

---

## Debug Commands Reference

```bash
# Check all services status
docker-compose ps

# View recent logs
docker-compose logs --tail=100

# Check collector metrics
curl -s http://localhost:8888/metrics | less

# Test New Relic connection
npm run test:connection

# Validate all configurations
npm run validate:all

# Force recreate all containers
docker-compose up -d --force-recreate

# Check disk usage
df -h
docker system df

# Monitor real-time logs
docker-compose logs -f otel-collector

# Export debug info
docker-compose exec nrdot env > debug-env.txt
docker-compose config > debug-compose.txt
```

---

## Getting Help

If you're still experiencing issues:

1. Check the [documentation](docs/README.md)
2. Review [GitHub issues](https://github.com/your-repo/issues)
3. Enable debug logging:
   ```bash
   export DEBUG=true
   export LOG_LEVEL=debug
   docker-compose up
   ```

4. Collect diagnostic information:
   ```bash
   ./scripts/collect-diagnostics.sh
   ```

Remember to sanitize any sensitive information (API keys, passwords) before sharing logs or configuration files!