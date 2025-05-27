# NRDOT v2 Troubleshooting Guide

## Quick Diagnosis

Use this flowchart to quickly identify issues:

```
Is data being collected? ──No──▶ Check Receivers
         │
        Yes
         ▼
Is data being exported? ──No──▶ Check Pipeline/Memory
         │
        Yes
         ▼
Is optimization working? ──No──▶ Check Filters/State
         │
        Yes
         ▼
Are costs reduced? ──────No──▶ Check Configuration
```

## Common Issues and Solutions

### 1. No Metrics Being Collected

**Symptoms:**
- `otelcol_receiver_accepted_metric_points` is 0
- No process metrics in New Relic

**Diagnosis:**
```bash
# Check collector pods
kubectl get pods -n nrdot-system -l app=nrdot-collector

# View receiver errors
kubectl logs -n nrdot-system -l app=nrdot-collector | grep -i "error.*receiver"

# Check process discovery
kubectl exec -n nrdot-system -l app=nrdot-collector -- \
  ps aux | wc -l
```

**Solutions:**

1. **Permission Issues**
```yaml
# Fix: Ensure privileged access for process discovery
securityContext:
  privileged: true
  capabilities:
    add:
      - SYS_PTRACE
```

2. **File Descriptor Limits**
```bash
# Check current limits
kubectl exec -n nrdot-system -l app=nrdot-collector -- \
  cat /proc/self/limits | grep "open files"

# Fix: Increase limits
kubectl set env daemonset/nrdot-collector \
  OTEL_RESOURCE_ATTRIBUTES="ulimit.nofile=65536"
```

3. **Process Discovery Timeout**
```yaml
# Fix: Increase timeout and add sampling
receivers:
  hostmetrics:
    collection_interval: 60s
    timeout: 30s  # Increase from default 10s
    scrapers:
      process:
        initial_delay: 10s  # Wait for system to stabilize
```

### 2. High Memory Usage / OOM Kills

**Symptoms:**
- Pods restarting with `OOMKilled`
- Memory usage > 80% consistently
- GC pauses in logs

**Diagnosis:**
```bash
# Check memory usage
kubectl top pods -n nrdot-system -l app=nrdot-collector

# View memory limiter logs
kubectl logs -n nrdot-system -l app=nrdot-collector | \
  grep -E "(memory_limiter|GC)"

# Check heap profile
kubectl port-forward -n nrdot-system svc/nrdot-collector 1777:1777
go tool pprof -http=:8080 http://localhost:1777/debug/pprof/heap
```

**Solutions:**

1. **Tune Memory Limiter**
```yaml
processors:
  memory_limiter:
    check_interval: 100ms  # More frequent checks
    limit_percentage: 80   # Increase headroom
    spike_limit_percentage: 30  # More spike tolerance
```

2. **Reduce Process Count**
```yaml
receivers:
  hostmetrics:
    scrapers:
      process:
        max_processes: 500  # Reduce from 1000
        exclude:
          names: [".*-worker-.*", ".*-temp-.*"]
```

3. **Enable Progressive Degradation**
```yaml
processors:
  memory_limiter:
    degradation_levels:
      - threshold_percentage: 60
        actions:
          - drop_metrics_where: 'importance_score < 0.3'
```

### 3. Pipeline Latency / Backup

**Symptoms:**
- Increasing `otelcol_exporter_queue_size`
- Pipeline latency > 1s
- Metrics delayed by minutes

**Diagnosis:**
```bash
# Check pipeline metrics
curl -s http://localhost:13133/metrics | \
  grep -E "pipeline_latency|queue_size"

# Identify bottleneck stage
kubectl logs -n nrdot-system -l app=nrdot-collector | \
  grep -E "processor.*took.*ms"
```

**Solutions:**

1. **Optimize OTTL Expressions**
```yaml
# Replace complex OTTL with routing
# Bad:
processors:
  filter:
    metrics:
      include:
        match_type: expr
        expressions:
          - 'resource.attributes["name"] =~ ".*api.*" && value > 100'

# Good:
processors:
  routing:
    from_attribute: process_class
    table:
      - value: "api"
        pipelines: [high_priority]
```

2. **Increase Parallelism**
```yaml
exporters:
  otlphttp:
    sending_queue:
      num_consumers: 20  # Increase from 10
      queue_size: 20000  # Increase buffer
```

3. **Use Multi-Stage Pipeline**
```yaml
service:
  pipelines:
    metrics/fast:
      receivers: [hostmetrics]
      processors: [memory_limiter, batch/small]
      exporters: [otlphttp/critical]
    
    metrics/bulk:
      receivers: [hostmetrics]
      processors: [memory_limiter, filter, batch/large]
      exporters: [otlphttp/standard]
```

### 4. State Loss / Ring Assignment Issues

**Symptoms:**
- Processes changing rings after restart
- EWMA baselines reset
- Importance scores inconsistent

**Diagnosis:**
```bash
# Check state persistence
kubectl exec -n nrdot-system deployment/state-manager -- \
  ls -la /var/lib/nrdot/state/

# Verify checkpoints
kubectl logs -n nrdot-system deployment/state-manager | \
  grep -i checkpoint

# Test state recovery
kubectl exec -n nrdot-system deployment/state-manager -- \
  /app/state-tool validate
```

**Solutions:**

1. **Fix State Storage**
```yaml
# Ensure PVC is mounted correctly
volumes:
  - name: state
    persistentVolumeClaim:
      claimName: nrdot-state-pvc
volumeMounts:
  - name: state
    mountPath: /var/lib/nrdot/state
    subPath: collector-state
```

2. **Enable State Sync**
```yaml
processors:
  state_sync:
    storage: file_storage
    sync_interval: 30s
    recovery_mode: "progressive"
```

3. **Implement State Backup**
```bash
# Create backup CronJob
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: state-backup
  namespace: nrdot-system
spec:
  schedule: "0 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: busybox
            command:
            - /bin/sh
            - -c
            - tar czf /backup/state-\$(date +%Y%m%d-%H%M%S).tgz /var/lib/nrdot/state/
EOF
```

### 5. Export Failures

**Symptoms:**
- `otelcol_exporter_send_failed_metric_points` increasing
- 429 errors in logs
- Connection timeouts

**Diagnosis:**
```bash
# Check export errors
kubectl logs -n nrdot-system -l app=nrdot-collector | \
  grep -E "(failed to export|429|timeout)"

# Test connectivity
kubectl exec -n nrdot-system -l app=nrdot-collector -- \
  curl -v https://otlp.nr-data.net:4317
```

**Solutions:**

1. **Handle Rate Limits**
```yaml
exporters:
  otlphttp:
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 300s
      randomization_factor: 0.5
    
    # Add circuit breaker
    circuit_breaker:
      enabled: true
      failure_threshold: 5
      recovery_timeout: 60s
```

2. **Implement Fallback**
```yaml
exporters:
  fallback:
    protocol: grpc
    endpoint: ${FALLBACK_ENDPOINT}
    
service:
  pipelines:
    metrics:
      exporters: [otlphttp/primary, fallback]
```

### 6. Incorrect Optimization Ratio

**Symptoms:**
- Cost reduction < 70%
- Too many/few metrics dropped
- Critical metrics missing

**Diagnosis:**
```bash
# Check classification distribution
curl -s http://localhost:13133/metrics | \
  grep nrdot_processes_by_importance

# Verify filter effectiveness
kubectl logs -n nrdot-system -l app=nrdot-collector | \
  grep -E "dropped.*importance"
```

**Solutions:**

1. **Tune Importance Scoring**
```yaml
processors:
  attributes/classify:
    actions:
      - key: importance_score
        value: |
          # Review and adjust these values
          Switch(
            Case(Contains(process.name, "database"), 0.95),
            Case(Contains(process.name, "api"), 0.85),
            Case(Contains(process.name, "web"), 0.75),
            Default(0.3)
          )
```

2. **Adjust Ring Thresholds**
```yaml
processors:
  routing/importance:
    table:
      - value: [0.8, 1.0]   # Increase critical threshold
        pipelines: [critical]
      - value: [0.5, 0.8]   # Adjust ranges
        pipelines: [important]
```

## Performance Optimization

### CPU Optimization

**High CPU Usage Checklist:**

1. **Profile the Collector**
```bash
# Get CPU profile
kubectl port-forward -n nrdot-system svc/nrdot-collector 1777:1777
curl http://localhost:1777/debug/pprof/profile?seconds=30 > cpu.prof
go tool pprof -http=:8080 cpu.prof
```

2. **Common CPU Hogs**
- Regex in OTTL expressions
- Excessive transformations
- Unoptimized batching

3. **Fixes**
```yaml
# Use exact matching instead of regex
match_type: strict  # Instead of regexp

# Reduce transformation frequency
transform_at: aggregation  # Not per-datapoint

# Optimize batch sizes
batch:
  send_batch_size: 8192  # Find sweet spot
```

### Memory Optimization

**Memory Reduction Strategies:**

1. **Limit Cardinality**
```yaml
processors:
  metricstransform:
    transforms:
      - include: process.*
        action: aggregate
        group_by: [service.name, host.name]
```

2. **Enable Compression**
```yaml
exporters:
  otlphttp:
    compression: zstd  # More efficient than gzip
```

3. **Tune GC**
```bash
# Set environment variables
GOGC=150  # Less aggressive GC
GOMEMLIMIT=3750MiB  # Set hard limit
```

## Emergency Procedures

### Complete Metric Loss

```bash
# 1. Verify basic connectivity
kubectl exec -n nrdot-system -l app=nrdot-collector -- \
  wget -qO- http://localhost:13133/health

# 2. Restart with minimal config
kubectl create configmap emergency-config \
  --from-file=configs/minimal-config.yaml
kubectl set env daemonset/nrdot-collector \
  CONFIG_FILE=/etc/emergency/config.yaml

# 3. Gradually re-enable features
kubectl rollout status daemonset/nrdot-collector
```

### Rollback Procedure

```bash
# 1. Capture current state
kubectl get configmap -n nrdot-system collector-config -o yaml > current-config.yaml

# 2. Apply previous version
kubectl apply -f backups/collector-config-stable.yaml

# 3. Restart collectors
kubectl rollout restart daemonset/nrdot-collector

# 4. Verify metrics flow
watch 'curl -s http://localhost:13133/metrics | grep -E "(accepted|sent)"'
```

## Monitoring Queries

### Key Metrics to Watch

```promql
# Optimization effectiveness
(1 - (sum(rate(otelcol_exporter_sent_metric_points[5m])) / 
      sum(rate(otelcol_receiver_accepted_metric_points[5m])))) * 100

# Memory pressure
otelcol_process_memory_rss / otelcol_processor_memory_limiter_limit

# Pipeline latency (p99)
histogram_quantile(0.99, rate(otelcol_processor_process_duration_bucket[5m]))

# Error rate
rate(otelcol_exporter_send_failed_metric_points[5m]) / 
rate(otelcol_exporter_sent_metric_points[5m])
```

### Useful Debug Commands

```bash
# Get all collector metrics
curl -s http://localhost:13133/metrics > collector-metrics.txt

# Check specific processor
grep "processor.*scoring" collector-metrics.txt

# Watch real-time metrics
watch -n 1 'curl -s http://localhost:13133/metrics | \
  grep -E "(dropped|sent|received)" | tail -20'
```

## Getting Help

1. **Collect Diagnostics**
```bash
./scripts/collect-diagnostics.sh > diagnostics.tar.gz
```

2. **Include in Bug Report**
- Collector version
- Configuration (sanitized)
- Error logs
- Metrics snapshot

3. **Contact**
- Slack: #nrdot-support
- GitHub: https://github.com/nrdot/nrdot/issues