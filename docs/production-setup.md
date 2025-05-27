# NRDOT v2 Production Setup Guide

## Overview

This guide walks through setting up NRDOT v2 in a production environment with proper monitoring, state management, and operational controls. Unlike the original single-file approach, this production setup uses:

- Multi-stage pipeline architecture
- Persistent state management
- Progressive degradation under pressure
- Comprehensive monitoring and alerting
- Scientific experiment framework

## Prerequisites

- Kubernetes cluster (1.19+)
- Prometheus & Grafana for monitoring
- 3+ nodes with 4 CPU cores and 8GB RAM each
- New Relic account with Metrics API access
- BadgerDB persistent volumes (10GB per collector)

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Host Metrics   │────▶│  Multi-Stage    │────▶│   New Relic     │
│   Receivers     │     │   Pipeline      │     │   Exporters     │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                         │
         │                       │                         │
    ┌────▼─────┐          ┌─────▼──────┐          ┌──────▼───────┐
    │  State   │          │ Monitoring │          │  Experiment  │
    │ Manager  │          │   Stack    │          │  Controller  │
    └──────────┘          └────────────┘          └──────────────┘
```

## Step 1: Deploy State Storage

First, set up persistent storage for state management:

```bash
# Create namespace
kubectl create namespace nrdot-system

# Deploy persistent volumes
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: nrdot-state-pvc
  namespace: nrdot-system
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: fast-ssd
EOF

# Deploy state manager
kubectl apply -f deployments/state-manager.yaml
```

## Step 2: Configure Secrets

```bash
# Create secrets for New Relic access
kubectl create secret generic nrdot-credentials \
  --namespace=nrdot-system \
  --from-literal=NEW_RELIC_LICENSE_KEY=<your-key> \
  --from-literal=NEW_RELIC_OTLP_ENDPOINT=https://otlp.nr-data.net:4317
```

## Step 3: Deploy Monitoring Stack

```bash
# Deploy Prometheus
kubectl apply -f monitoring/prometheus-deployment.yaml

# Deploy Grafana with dashboards
kubectl apply -f monitoring/grafana-deployment.yaml

# Import NRDOT dashboard
kubectl create configmap nrdot-dashboard \
  --namespace=nrdot-system \
  --from-file=monitoring/dashboards/nrdot-overview.json
```

## Step 4: Deploy Collectors

### 4.1 Review and Customize Configuration

Edit `configs/collector-config-production.yaml`:

```yaml
# Key settings to review:
processors:
  memory_limiter:
    limit_percentage: 75  # Adjust based on node memory
    
  attributes/classify:
    actions:
      # Customize importance scoring for your apps
      - key: importance_score
        value: |
          Switch(
            Case(MatchesPattern(process.executable.name, ".*your-critical-app.*"), 0.95),
            # Add your patterns here
          )
```

### 4.2 Deploy Collectors

```bash
# Create ConfigMap from production config
kubectl create configmap collector-config \
  --namespace=nrdot-system \
  --from-file=configs/collector-config-production.yaml

# Deploy collector DaemonSet
kubectl apply -f deployments/collector-daemonset.yaml

# Verify deployment
kubectl get pods -n nrdot-system
```

## Step 5: Configure Process Exclusions

Create exclusion patterns for your environment:

```yaml
# configs/exclusions.yaml
process_exclusions:
  # System processes
  - pattern: "^/usr/lib/systemd/.*"
    reason: "systemd internals"
  
  # Kubernetes components
  - pattern: "^/pause$"
    reason: "k8s pause containers"
  
  # Development/test
  - pattern: ".*-test$"
    reason: "test processes"
  
  # Your custom exclusions
  - pattern: "^/opt/monitoring/.*"
    reason: "monitoring agents"
```

Apply exclusions:

```bash
kubectl create configmap process-exclusions \
  --namespace=nrdot-system \
  --from-file=configs/exclusions.yaml
```

## Step 6: Validate Setup

### 6.1 Check Collector Health

```bash
# Check pod status
kubectl get pods -n nrdot-system -l app=nrdot-collector

# View collector logs
kubectl logs -n nrdot-system -l app=nrdot-collector --tail=100

# Check health endpoint
kubectl port-forward -n nrdot-system svc/nrdot-collector 13133:13133
curl http://localhost:13133/health
```

### 6.2 Verify Metrics Flow

```bash
# Check metrics reception
curl -s http://localhost:13133/metrics | grep receiver_accepted

# Check export success
curl -s http://localhost:13133/metrics | grep exporter_sent

# Calculate optimization ratio
curl -s http://localhost:13133/metrics | \
  grep -E "(receiver_accepted|exporter_sent)" | \
  awk 'BEGIN{r=0;e=0} /receiver/{r+=$2} /exporter/{e+=$2} END{print "Optimization: " (1-e/r)*100 "%"}'
```

### 6.3 Monitor State Persistence

```bash
# Check state manager logs
kubectl logs -n nrdot-system deployment/state-manager

# Verify checkpoints
kubectl exec -n nrdot-system deployment/state-manager -- ls -la /var/lib/nrdot/state/

# Test state recovery
kubectl delete pod -n nrdot-system -l app=nrdot-collector
# Wait for restart and check if state is preserved
```

## Step 7: Enable Progressive Features

### 7.1 Start with Conservative Settings

```yaml
# Initial conservative configuration
processors:
  filter/conservative:
    metrics:
      include:
        match_type: strict
        metric_names:
          - process.cpu.time
          - process.memory.physical
```

### 7.2 Gradually Enable Optimizations

Week 1: Basic filtering
```bash
kubectl patch configmap collector-config -n nrdot-system \
  --type merge -p '{"data":{"enable_basic_filtering":"true"}}'
```

Week 2: Enable EWMA and anomaly detection
```bash
kubectl patch configmap collector-config -n nrdot-system \
  --type merge -p '{"data":{"enable_ewma":"true"}}'
```

Week 3: Full optimization
```bash
kubectl patch configmap collector-config -n nrdot-system \
  --type merge -p '{"data":{"enable_full_optimization":"true"}}'
```

## Step 8: Configure Alerts

Apply production alerts:

```bash
kubectl apply -f monitoring/alerts/nrdot-alerts.yaml

# Test alert routing
kubectl exec -n nrdot-system deployment/prometheus -- \
  promtool test rules /etc/prometheus/rules/nrdot-alerts.yaml
```

## Step 9: Set Up Experiments

### 9.1 Deploy Experiment Controller

```bash
kubectl apply -f deployments/experiment-controller.yaml
```

### 9.2 Create First Experiment

```yaml
# experiments/reduce-standard-collection.yaml
apiVersion: nrdot.io/v1
kind: Experiment
metadata:
  name: reduce-standard-collection
spec:
  hypothesis: "Reducing collection frequency for standard processes by 50% will not impact alerting"
  duration: 7d
  targetGroup:
    selector:
      importance_score: [0.3, 0.6]
    percentage: 50
  changes:
    - path: collection_interval
      from: 60s
      to: 120s
  successCriteria:
    - metric: alert_accuracy
      threshold: "> 0.95"
    - metric: cost_reduction
      threshold: "> 0.15"
  rollbackOn:
    - metric: critical_alerts_missed
      threshold: "> 0"
```

Apply experiment:

```bash
kubectl apply -f experiments/reduce-standard-collection.yaml
```

## Step 10: Production Checklist

Before going live, ensure:

- [ ] **Monitoring**
  - [ ] Prometheus scraping all collectors
  - [ ] Grafana dashboards loading
  - [ ] Alerts configured and tested
  
- [ ] **State Management**
  - [ ] State persisted across restarts
  - [ ] Checkpoints running every 60s
  - [ ] Recovery tested
  
- [ ] **Performance**
  - [ ] Memory usage < 2GB per collector
  - [ ] CPU usage < 50% under normal load
  - [ ] Pipeline latency < 100ms p99
  
- [ ] **Reliability**
  - [ ] Collectors survive node failures
  - [ ] No data loss during rolling updates
  - [ ] Graceful degradation tested
  
- [ ] **Security**
  - [ ] Secrets properly managed
  - [ ] Network policies in place
  - [ ] RBAC configured

## Troubleshooting

### High Memory Usage

```bash
# Check memory limiter status
kubectl logs -n nrdot-system -l app=nrdot-collector | grep memory_limiter

# Adjust limits
kubectl set env deployment/nrdot-collector \
  GOMEMLIMIT=3GiB \
  GOGC=100
```

### State Corruption

```bash
# Stop collectors
kubectl scale deployment nrdot-collector --replicas=0

# Backup corrupted state
kubectl exec -n nrdot-system deployment/state-manager -- \
  tar czf /tmp/state-backup.tgz /var/lib/nrdot/state/

# Clear state
kubectl exec -n nrdot-system deployment/state-manager -- \
  rm -rf /var/lib/nrdot/state/*

# Restart
kubectl scale deployment nrdot-collector --replicas=3
```

### Performance Issues

```bash
# Enable profiling
kubectl port-forward -n nrdot-system svc/nrdot-collector 1777:1777

# Collect CPU profile
go tool pprof http://localhost:1777/debug/pprof/profile?seconds=30

# Analyze hot paths
(pprof) top10
(pprof) list <function_name>
```

## Maintenance

### Daily Tasks

1. Review optimization ratio in Grafana
2. Check for anomalies in process discovery
3. Verify no critical alerts

### Weekly Tasks

1. Review and tune importance scores
2. Analyze dropped metrics patterns
3. Plan and execute experiments

### Monthly Tasks

1. Review cost savings vs SLA compliance
2. Update exclusion patterns
3. Capacity planning based on growth

## Next Steps

1. **Customize Importance Scoring**: Modify the classification logic for your specific applications
2. **Tune Memory Limits**: Adjust based on your actual workload
3. **Create Runbooks**: Document procedures for common scenarios
4. **Train Team**: Ensure operations team understands the new system

## Support

- Slack: #nrdot-support
- Documentation: https://docs.nrdot.io
- Issues: https://github.com/nrdot/nrdot/issues