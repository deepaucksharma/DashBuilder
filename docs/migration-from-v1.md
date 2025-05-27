# Migration Guide: NRDOT v1 to v2 Production

## Overview

This guide helps you migrate from the original NRDOT v1 implementation (single-file config, bash scripts) to the production-ready v2 architecture. The migration is designed to be gradual with zero downtime.

## Key Differences

| Aspect | v1 (Original) | v2 (Production) |
|--------|---------------|-----------------|
| Configuration | Single YAML file | Modular configs with hot reload |
| State Management | In-memory only | Persistent with BadgerDB |
| Scaling | Single instance | Horizontal scaling with sharding |
| Memory Management | Basic limiter | Progressive degradation |
| Monitoring | Limited | Comprehensive Prometheus/Grafana |
| Experiments | Bash scripts | Statistical framework |
| Recovery | Manual | Automated with circuit breakers |

## Pre-Migration Checklist

- [ ] Current NRDOT v1 running and stable
- [ ] Baseline metrics collected (costs, volume, performance)
- [ ] Kubernetes cluster meets v2 requirements
- [ ] Team trained on v2 concepts
- [ ] Rollback plan documented

## Migration Phases

### Phase 1: Parallel Deployment (Week 1)

Deploy v2 alongside v1 without processing any data:

```bash
# 1. Create separate namespace
kubectl create namespace nrdot-v2

# 2. Deploy v2 in observer mode
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: collector-config
  namespace: nrdot-v2
data:
  config.yaml: |
    receivers:
      hostmetrics:
        collection_interval: 60s
    processors:
      # Start with no filtering
      memory_limiter:
        limit_percentage: 80
    exporters:
      # Send to test account first
      otlphttp/test:
        endpoint: ${TEST_ENDPOINT}
    service:
      pipelines:
        metrics:
          receivers: [hostmetrics]
          processors: [memory_limiter]
          exporters: [otlphttp/test]
EOF

# 3. Deploy collectors
kubectl apply -f deployments/v2/collector-daemonset.yaml
```

### Phase 2: Shadow Mode (Week 2)

Run v2 in parallel, comparing outputs:

```bash
# 1. Configure v2 to match v1 collection
kubectl apply -f configs/shadow-mode.yaml

# 2. Deploy comparison tool
kubectl apply -f tools/metric-comparator.yaml

# 3. Monitor differences
kubectl logs -f deployment/metric-comparator
```

Expected differences:
- ±5% in metric count (due to timing)
- Different attribute names (v2 uses OTEL semantic conventions)
- Additional metadata in v2

### Phase 3: Gradual Traffic Shift (Week 3-4)

Start sending real traffic through v2:

```bash
# 1. 10% traffic to v2
kubectl apply -f traffic-split/10-percent.yaml

# Monitor for 24 hours
./scripts/validate-v2-metrics.sh

# 2. 50% traffic to v2
kubectl apply -f traffic-split/50-percent.yaml

# Monitor for 48 hours
./scripts/compare-costs.sh

# 3. 100% traffic to v2
kubectl apply -f traffic-split/100-percent.yaml
```

### Phase 4: Decommission v1 (Week 5)

```bash
# 1. Ensure v2 is stable for 1 week

# 2. Backup v1 configuration
kubectl get configmap -n nrdot-v1 -o yaml > v1-backup.yaml

# 3. Scale down v1
kubectl scale deployment nrdot-v1 --replicas=0

# 4. Wait 24 hours, verify no issues

# 5. Delete v1 resources
kubectl delete namespace nrdot-v1
```

## Configuration Migration

### Converting v1 Config to v2

**v1 Configuration Example:**
```yaml
# v1: Monolithic configuration
receivers:
  hostmetrics:
    collection_interval: 60s
    scrapers:
      process:
        include:
          names: [".*"]
processors:
  filter/optimization:
    metrics:
      datapoint:
        - 'resource.attributes["process.importance"] >= 0.9'
        - 'resource.attributes["process.importance"] < 0.9 AND resource.attributes["process.importance"] >= ${env:MIN_IMPORTANCE}'
exporters:
  newrelic:
    api_key: ${env:NR_API_KEY}
```

**v2 Configuration (Modular):**

1. **Receiver Config** (`configs/receivers.yaml`):
```yaml
receivers:
  hostmetrics:
    collection_interval: 60s
    scrapers:
      process:
        max_processes: 1000
        sampling:
          enabled: true
          threshold_cpu_percent: 0.1
        exclude:
          names: ${file:./exclusions.yaml}
```

2. **Processor Config** (`configs/processors.yaml`):
```yaml
processors:
  # Efficient classification
  attributes/classify:
    actions:
      - key: importance_score
        value: ${file:./importance-rules.yaml}
  
  # Smart routing instead of filtering
  routing/importance:
    from_attribute: importance_score
    table: ${file:./routing-table.yaml}
```

3. **Pipeline Config** (`configs/pipelines.yaml`):
```yaml
service:
  pipelines:
    metrics/ingestion:
      receivers: [hostmetrics]
      processors: [memory_limiter, attributes/classify]
      exporters: [routing/importance]
    
    metrics/critical:
      receivers: [routing/importance]
      processors: [batch/small]
      exporters: [otlphttp/primary]
```

### State Migration

v1 has no state persistence. v2 requires initial state bootstrapping:

```bash
# 1. Export current process list from v1
kubectl exec -n nrdot-v1 deployment/collector -- \
  curl -s http://localhost:8888/metrics | \
  grep "process_name" > v1-processes.txt

# 2. Generate initial state for v2
./tools/generate-initial-state.py \
  --input v1-processes.txt \
  --output initial-state.json

# 3. Import into v2 state manager
kubectl exec -n nrdot-v2 deployment/state-manager -- \
  state-tool import --file initial-state.json
```

## Monitoring Migration

### Setting Up v2 Monitoring

```bash
# 1. Deploy Prometheus for v2
kubectl apply -f monitoring/v2/prometheus-deployment.yaml

# 2. Import dashboards
kubectl create configmap grafana-dashboards \
  --from-file=monitoring/dashboards/

# 3. Configure alerts
kubectl apply -f monitoring/alerts/v2-alerts.yaml
```

### Key Metrics to Compare

Create a migration dashboard comparing v1 and v2:

```promql
# Metric volume comparison
sum(rate(v1_metrics_sent[5m])) vs sum(rate(v2_otelcol_exporter_sent_metric_points[5m]))

# Cost comparison
v1_monthly_cost vs (v2_metrics_sent_per_month / 1000000 * 0.25)

# Coverage comparison
count(distinct v1_process_names) vs count(distinct v2_process_names)
```

## Common Migration Issues

### 1. Higher Memory Usage in v2

**Symptom:** v2 collectors use more memory than v1

**Solution:**
```yaml
# Tune memory settings
processors:
  memory_limiter:
    check_interval: 100ms
    limit_percentage: 80
    degradation_levels:
      - threshold_percentage: 60
        actions:
          - drop_metrics_where: 'importance_score < 0.3'
```

### 2. Different Metric Names

**Symptom:** Dashboards broken due to metric name changes

**Solution:** Use recording rules for compatibility:
```yaml
groups:
  - name: v1_compatibility
    rules:
      - record: old_metric_name
        expr: new_metric_name{job="nrdot-v2"}
```

### 3. Missing Processes

**Symptom:** Some processes visible in v1 but not v2

**Solution:** Check exclusion rules:
```bash
# Compare process lists
diff <(kubectl exec -n nrdot-v1 deployment/collector -- ps aux | awk '{print $11}' | sort) \
     <(kubectl exec -n nrdot-v2 deployment/collector -- ps aux | awk '{print $11}' | sort)

# Adjust exclusions
kubectl edit configmap process-exclusions -n nrdot-v2
```

## Rollback Procedure

If issues arise during migration:

```bash
# 1. Immediate rollback to v1
kubectl apply -f traffic-split/0-percent-v2.yaml

# 2. Scale up v1 if needed
kubectl scale deployment nrdot-v1 --replicas=3

# 3. Investigate v2 issues
kubectl logs -n nrdot-v2 -l app=collector --tail=1000 > v2-errors.log

# 4. Fix issues and retry migration
```

## Post-Migration Optimization

After successful migration:

### 1. Enable Advanced Features

```bash
# Enable EWMA anomaly detection
kubectl patch configmap collector-config -n nrdot-v2 \
  --type merge -p '{"data":{"enable_anomaly_detection":"true"}}'

# Enable experiments
kubectl apply -f deployments/experiment-controller.yaml
```

### 2. Optimize for Your Workload

```yaml
# Tune importance scoring for your apps
processors:
  attributes/classify:
    actions:
      - key: importance_score
        value: |
          Switch(
            # Add your critical apps
            Case(Contains(process.name, "payment"), 0.95),
            Case(Contains(process.name, "auth"), 0.95),
            # ... more rules
          )
```

### 3. Set Up Automated Experiments

```bash
# Deploy first experiment
kubectl apply -f experiments/optimize-standard-collection.yaml

# Monitor results
kubectl get experiments -n nrdot-v2
```

## Success Criteria

Migration is complete when:

- [ ] All traffic flowing through v2
- [ ] Cost reduction ≥ 70%
- [ ] No critical metrics missing
- [ ] State persistence verified
- [ ] Monitoring fully operational
- [ ] Team comfortable with v2 operations
- [ ] v1 resources deleted

## Lessons Learned

Based on migrations across multiple environments:

1. **Take Time with Parallel Running**: 2 weeks minimum
2. **Monitor Everything**: Both v1 and v2 extensively
3. **Train the Team**: v2 requires different operational patterns
4. **Start Conservative**: Enable optimizations gradually
5. **Keep v1 Config**: You might need to reference it

## Support

- Migration Hotline: #nrdot-migration
- Office Hours: Tuesdays 2-3 PM EST
- Documentation: https://docs.nrdot.io/migration