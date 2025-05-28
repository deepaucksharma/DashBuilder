# DashBuilder Docker Monitoring Guide

## 🚀 Quick Start

1. **Setup environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your New Relic credentials
   ```

2. **Start with comprehensive monitoring:**
   ```bash
   ./start-comprehensive-monitoring.sh
   ```

## 📊 Monitoring Stack

### Components

1. **OpenTelemetry Collector** (Port 4317, 4318, 8888)
   - Collects all metrics, traces, and logs
   - Configured with comprehensive profile for maximum observability
   - Exports to New Relic and local Prometheus

2. **Prometheus** (Port 9091)
   - Time-series metrics storage
   - Scrapes all services every 15s
   - 30-day retention

3. **Grafana** (Port 3001)
   - Visualization dashboards
   - Pre-configured datasources
   - New Relic integration

4. **Jaeger** (Port 16686)
   - Distributed tracing
   - Trace visualization
   - Service dependency analysis

5. **Node Exporter** (Port 9100)
   - Host system metrics
   - CPU, memory, disk, network

6. **cAdvisor** (Port 8080)
   - Container metrics
   - Resource usage per container
   - Performance insights

## 📈 Metrics Collection

### System Metrics
- CPU utilization (per core)
- Memory usage and cache
- Disk I/O and utilization
- Network traffic and errors
- Load averages
- Process counts

### Container Metrics
- CPU usage per container
- Memory limits and usage
- Network I/O
- Block I/O
- Container health status

### Process Metrics
- Per-process CPU and memory
- Open file descriptors
- Thread counts
- I/O operations
- Context switches

### NRDOT KPIs
- Process coverage percentage
- Cost reduction metrics
- Data points per minute
- Optimization efficiency
- Anomaly scores

## 🔍 Viewing Metrics

### Grafana Dashboards
1. Access: http://localhost:3001
2. Login: admin / changeme
3. Available dashboards:
   - NRDOT Overview
   - Process Monitoring
   - Container Performance
   - System Resources

### Prometheus Queries
Access: http://localhost:9091

Example queries:
```promql
# CPU usage by container
rate(container_cpu_usage_seconds_total[5m]) * 100

# Memory usage
container_memory_usage_bytes / container_spec_memory_limit_bytes * 100

# NRDOT process coverage
nrdot_processes_coverage

# Data ingestion rate
rate(otelcol_receiver_accepted_metric_points[5m])
```

### Jaeger Traces
1. Access: http://localhost:16686
2. Select service: nrdot-control-loop
3. View traces for:
   - Control loop iterations
   - Metric collection
   - Experiments
   - Adjustments

## 🎯 Monitoring Profiles

### Comprehensive (Default)
- All metrics enabled
- 5s collection interval
- No filtering
- Maximum visibility

### Balanced
- Key metrics only
- 30s collection interval
- 50% sampling
- Good cost/coverage balance

### Conservative
- Essential metrics
- 60s collection interval
- 80% sampling
- Lower cost

### Aggressive
- Minimal metrics
- 120s collection interval
- 20% sampling
- Maximum cost reduction

## 📝 Logs

### View all logs:
```bash
docker-compose -f docker-compose.yml -f docker-compose.observability.yml logs -f
```

### View specific service:
```bash
docker-compose -f docker-compose.yml -f docker-compose.observability.yml logs -f nrdot-collector
```

### Log locations:
- DashBuilder: `./logs/dashbuilder/`
- OTEL Collector: `./logs/otel/`
- Control Loop: `./logs/control-loop/`

## 🧪 Running Experiments

### Enable experiments:
```bash
export ENABLE_EXPERIMENTS=true
docker-compose -f docker-compose.yml -f docker-compose.observability.yml up -d control-loop
```

### View experiment results:
```bash
curl http://localhost:9090/experiments
```

### Available experiments:
- `aggressive_sampling`: Reduces sampling rate
- `selective_monitoring`: Filters low-value processes
- `dynamic_intervals`: Adjusts collection intervals

## 🔧 Troubleshooting

### Check service health:
```bash
./run-with-monitoring.sh health
```

### Common issues:

1. **Port conflicts:**
   ```bash
   # Check what's using a port
   lsof -i :3000
   ```

2. **High memory usage:**
   - Switch to balanced profile
   - Reduce retention periods
   - Limit metric cardinality

3. **Missing metrics:**
   - Check OTEL collector logs
   - Verify New Relic credentials
   - Check network connectivity

### Debug mode:
```bash
export OTEL_LOG_LEVEL=debug
export ENABLE_DEBUG=true
docker-compose -f docker-compose.yml -f docker-compose.observability.yml up
```

## 📊 Custom Metrics

### Add custom metrics:
1. Edit `configs/collector-comprehensive.yaml`
2. Add metric definitions
3. Restart collector:
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.observability.yml restart nrdot-collector
   ```

### Export metrics to file:
```bash
# Metrics are automatically exported to /tmp/otel-metrics.json
docker exec nrdot-collector cat /tmp/otel-metrics.json | jq
```

## 🛑 Stopping Services

### Stop all:
```bash
docker-compose -f docker-compose.yml -f docker-compose.observability.yml down
```

### Stop and remove volumes:
```bash
docker-compose -f docker-compose.yml -f docker-compose.observability.yml down -v
```

### Clean up everything:
```bash
docker-compose -f docker-compose.yml -f docker-compose.observability.yml down -v
rm -rf logs/* data/* secrets/*
```