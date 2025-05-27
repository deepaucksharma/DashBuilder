# NRDOT v2 Production Update Plan

## Executive Summary

This document outlines the comprehensive updates required to transform NRDOT v2 from its current problematic state into a production-ready optimization system. Based on extensive operational analysis, we've identified critical changes needed in documentation, implementation, and deployment strategies.

## Update Categories

### 1. Critical Performance Fixes (Week 1)
- Replace OTTL expressions with efficient alternatives
- Implement proper memory management
- Add state persistence
- Fix unbounded process discovery

### 2. Architecture Redesign (Week 2-3)
- Multi-stage pipeline implementation
- Horizontal scaling support
- Circuit breaker patterns
- Progressive degradation

### 3. Production Features (Week 4-5)
- Comprehensive monitoring
- Canary deployment support
- Automated rollback
- Proper experiment framework

### 4. Documentation Overhaul (Week 6)
- Production configuration examples
- Runbook creation
- Troubleshooting guides
- Migration playbooks

## Detailed Implementation Updates

### 1. Configuration Updates

#### A. Replace Current `otel-collector-config.yaml`

**Current Problematic Configuration:**
```yaml
receivers:
  hostmetrics:
    collection_interval: 60s
    scrapers:
      process:
        # No limits - will discover 10,000+ processes
```

**New Production Configuration:**
```yaml
# /configs/collector-config-production.yaml
receivers:
  hostmetrics:
    collection_interval: 60s
    scrapers:
      process:
        # Limit process discovery
        max_processes: 1000
        # Smart sampling based on resource usage
        sampling:
          enabled: true
          threshold_cpu_percent: 0.1
          threshold_memory_mb: 10
        # Resource consumption limits
        resource_limits:
          max_cpu_percent: 5
          max_memory_mb: 500
        # Multi-criteria exclusion
        exclude:
          names: ["kworker/*", "ksoftirqd/*", "*-test", "*-debug"]
          cpu_below: 0.01
          memory_below_mb: 1
          age_below_seconds: 60
```

#### B. Efficient Filter Implementation

**Replace OTTL with Routing Processor:**
```yaml
# /configs/pipeline-routing.yaml
processors:
  # Pre-compute classifications once
  attributes/classify:
    actions:
      - key: process.importance_score
        value: |
          case process.executable.name:
            when contains "database": 0.9
            when contains "api": 0.8
            when contains "web": 0.7
            when contains "worker": 0.6
            else: 0.3
        action: upsert
  
  # Route based on pre-computed values
  routing/importance:
    from_attribute: process.importance_score
    table:
      - value: [0.9, 1.0]
        pipelines: [critical]
      - value: [0.6, 0.9)
        pipelines: [important]  
      - value: [0.3, 0.6)
        pipelines: [standard]
    default_pipelines: [sampling]
```

#### C. Production Memory Management

```yaml
# /configs/memory-management.yaml
processors:
  memory_limiter:
    # Adaptive configuration
    check_interval: 100ms
    limit_percentage: 75
    spike_limit_percentage: 25
    
    # Progressive degradation strategy
    drop_levels:
      - threshold_percent: 60
        action: 
          drop_metrics_matching: 'importance_score < 0.3'
      - threshold_percent: 70
        action:
          drop_metrics_matching: 'importance_score < 0.6'
      - threshold_percent: 80
        action:
          sample_metrics_matching: 'importance_score >= 0.6'
          sample_rate: 0.5
      - threshold_percent: 90
        action:
          keep_only: 'importance_score >= 0.9'
```

### 2. State Management Implementation

#### A. Create State Persistence Module

```go
// /pkg/state/manager.go
package state

import (
    "encoding/json"
    "sync"
    "time"
    "github.com/dgraph-io/badger/v3"
)

type StateManager struct {
    db              *badger.DB
    mu              sync.RWMutex
    checkpointInterval time.Duration
}

type ProcessState struct {
    Name            string
    ImportanceScore float64
    EWMAValues      map[string]float64
    LastUpdated     time.Time
    RingAssignment  int
}

func NewStateManager(dbPath string) (*StateManager, error) {
    opts := badger.DefaultOptions(dbPath)
    opts.SyncWrites = false // Async for performance
    opts.CompactL0OnClose = true
    
    db, err := badger.Open(opts)
    if err != nil {
        return nil, err
    }
    
    sm := &StateManager{
        db: db,
        checkpointInterval: 60 * time.Second,
    }
    
    go sm.periodicCheckpoint()
    return sm, nil
}

func (sm *StateManager) SaveProcessState(processName string, state ProcessState) error {
    sm.mu.Lock()
    defer sm.mu.Unlock()
    
    return sm.db.Update(func(txn *badger.Txn) error {
        data, err := json.Marshal(state)
        if err != nil {
            return err
        }
        
        e := badger.NewEntry([]byte(processName), data).
            WithTTL(7 * 24 * time.Hour) // 7 day TTL
        return txn.SetEntry(e)
    })
}
```

#### B. Integrate State with Pipeline

```yaml
# /configs/stateful-pipeline.yaml
extensions:
  state_manager:
    storage_path: "/var/lib/nrdot/state"
    checkpoint_interval: 60s
    recovery_mode: "progressive"

processors:
  state_aware_scoring:
    extension: state_manager
    operations:
      - load_state: process.executable.name
      - apply_ewma:
          alpha: 0.1
          metrics: ["cpu.usage", "memory.usage"]
      - save_state: process.executable.name
```

### 3. Multi-Stage Pipeline Architecture

#### A. Implement Pipeline Stages

```yaml
# /configs/multi-stage-pipeline.yaml
service:
  extensions: [state_manager, health_check, pprof]
  
  pipelines:
    # Stage 1: Collection and Initial Classification
    metrics/ingestion:
      receivers: [hostmetrics]
      processors:
        - memory_limiter/strict
        - attributes/classify
        - filter/obvious_noise
      exporters: [forward/classification]
    
    # Stage 2: Stateful Processing and Routing
    metrics/processing:
      receivers: [forward/classification]
      processors:
        - state_aware_scoring
        - routing/importance
      exporters: 
        - forward/critical
        - forward/standard
        - forward/sampled
    
    # Stage 3A: Critical Path (Low Latency)
    metrics/critical:
      receivers: [forward/critical]
      processors:
        - batch/small_fast
        - compression/light
      exporters: [otlphttp/primary_ha]
    
    # Stage 3B: Standard Path (Cost Optimized)
    metrics/standard:
      receivers: [forward/standard]
      processors:
        - batch/large_efficient
        - compression/heavy
        - deduplication
      exporters: [otlphttp/secondary]
    
    # Stage 3C: Sampled Path (Deep Analytics)
    metrics/sampled:
      receivers: [forward/sampled]
      processors:
        - sampling/adaptive
        - enrichment/detailed
        - batch/analytics
      exporters: [otlphttp/analytics]
```

### 4. Monitoring and Observability

#### A. Create Monitoring Configuration

```yaml
# /configs/monitoring.yaml
extensions:
  health_check:
    endpoint: 0.0.0.0:13133
    
  pprof:
    endpoint: 0.0.0.0:1777
    
  zpages:
    endpoint: 0.0.0.0:55679

receivers:
  # Self-monitoring
  prometheus:
    config:
      scrape_configs:
        - job_name: 'otel-collector'
          scrape_interval: 10s
          static_configs:
            - targets: ['0.0.0.0:8888']

exporters:
  # Export collector metrics
  prometheus/monitoring:
    endpoint: "0.0.0.0:9090"
    const_labels:
      collector_instance: "${HOSTNAME}"
    
processors:
  # Add optimization metrics
  metrics/optimization:
    metrics:
      - name: nrdot_optimization_ratio
        value: |
          1 - (sum(rate(sent_metric_points)) / 
               sum(rate(received_metric_points)))
      
      - name: nrdot_cost_per_million
        value: |
          (sum(rate(sent_metric_points)) / 1000000) * 0.25
```

#### B. Implement Custom Metrics

```go
// /pkg/metrics/optimization.go
package metrics

import (
    "go.opentelemetry.io/otel/metric"
)

type OptimizationMetrics struct {
    DroppedByImportance  metric.Int64Counter
    ProcessingLatency    metric.Float64Histogram
    StateOperations      metric.Int64Counter
    MemoryPressureEvents metric.Int64Counter
}

func NewOptimizationMetrics(meter metric.Meter) *OptimizationMetrics {
    dropped, _ := meter.Int64Counter(
        "nrdot.dropped_by_importance",
        metric.WithDescription("Metrics dropped by importance score"),
        metric.WithUnit("1"),
    )
    
    latency, _ := meter.Float64Histogram(
        "nrdot.processing_latency",
        metric.WithDescription("Pipeline processing latency"),
        metric.WithUnit("s"),
    )
    
    return &OptimizationMetrics{
        DroppedByImportance: dropped,
        ProcessingLatency: latency,
    }
}
```

### 5. Experiment Framework

#### A. Scientific Experiment Controller

```go
// /pkg/experiments/controller.go
package experiments

import (
    "context"
    "math"
    "time"
)

type Experiment struct {
    ID              string
    Hypothesis      string
    ControlGroup    []string
    TreatmentGroup  []string
    Metrics         []string
    Duration        time.Duration
    SuccessCriteria SuccessCriteria
}

type SuccessCriteria struct {
    MinCostReduction    float64
    MaxAccuracyLoss     float64
    MinStatisticalPower float64
}

type ExperimentController struct {
    experiments map[string]*Experiment
    baseline    map[string]float64
}

func (ec *ExperimentController) RunExperiment(ctx context.Context, exp *Experiment) (*Results, error) {
    // Collect baseline metrics
    baseline := ec.collectBaseline(exp.ControlGroup, exp.Duration/10)
    
    // Apply treatment
    ec.applyTreatment(exp.TreatmentGroup, exp.ID)
    
    // Monitor both groups
    results := ec.monitorGroups(ctx, exp)
    
    // Statistical analysis
    pValue := ec.calculatePValue(results)
    effect := ec.calculateEffectSize(results)
    
    // Auto-rollback if criteria not met
    if !ec.meetsSuccessCriteria(results, exp.SuccessCriteria) {
        ec.rollback(exp.TreatmentGroup)
        results.RolledBack = true
    }
    
    return results, nil
}
```

### 6. Production Deployment Updates

#### A. Kubernetes Manifests

```yaml
# /deployments/kubernetes/collector-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nrdot-collector
  labels:
    app: nrdot-collector
spec:
  replicas: 3  # Horizontal scaling
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # Zero downtime
  template:
    spec:
      containers:
      - name: collector
        image: nrdot/collector:v2.0-production
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "4Gi"
            cpu: "2"
        env:
        - name: GOGC
          value: "200"
        - name: GOMEMLIMIT
          value: "3750MiB"
        volumeMounts:
        - name: state
          mountPath: /var/lib/nrdot/state
        - name: config
          mountPath: /etc/otelcol
        livenessProbe:
          httpGet:
            path: /health
            port: 13133
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 13133
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: state
        persistentVolumeClaim:
          claimName: nrdot-state
      - name: config
        configMap:
          name: nrdot-config
```

#### B. Canary Deployment

```yaml
# /deployments/kubernetes/canary-deployment.yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: nrdot-collector
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nrdot-collector
  progressDeadlineSeconds: 600
  service:
    port: 4317
    targetPort: 4317
  analysis:
    interval: 1m
    threshold: 5
    maxWeight: 50
    stepWeight: 10
    metrics:
    - name: optimization-ratio
      thresholdRange:
        min: 70  # Minimum 70% reduction
      interval: 1m
    - name: error-rate
      thresholdRange:
        max: 1
      interval: 30s
    - name: latency
      thresholdRange:
        max: 500
      interval: 30s
```

### 7. Documentation Structure Update

```
docs/
├── getting-started/
│   ├── quick-start.md          # 5-minute setup
│   ├── production-setup.md     # Full production guide
│   └── migration-guide.md      # From v1 to v2
├── configuration/
│   ├── receivers.md            # Bounded collection
│   ├── processors.md           # Efficient processing
│   ├── exporters.md           # HA exporting
│   └── pipelines.md           # Multi-stage design
├── operations/
│   ├── monitoring.md          # Key metrics
│   ├── troubleshooting.md    # Common issues
│   ├── tuning.md             # Performance optimization
│   └── runbooks/             # Incident response
│       ├── high-memory.md
│       ├── pipeline-backup.md
│       └── state-corruption.md
├── experiments/
│   ├── framework.md          # How experiments work
│   ├── examples.md           # Sample experiments
│   └── analysis.md           # Statistical methods
└── reference/
    ├── architecture.md       # System design
    ├── api.md               # Control plane API
    └── metrics.md           # Metric reference
```

### 8. Migration Strategy

#### Phase 1: Parallel Testing (Week 1-2)
```bash
# Deploy new configuration alongside existing
kubectl apply -f deployments/kubernetes/nrdot-v2-shadow.yaml

# Forward 10% of traffic for validation
kubectl apply -f deployments/kubernetes/traffic-split-10.yaml

# Monitor key metrics
kubectl port-forward svc/nrdot-monitoring 3000:3000
```

#### Phase 2: Gradual Rollout (Week 3-4)
```bash
# Increase traffic gradually
for percent in 25 50 75 100; do
  kubectl apply -f deployments/kubernetes/traffic-split-${percent}.yaml
  sleep 86400  # Wait 24 hours
  ./scripts/validate-metrics.sh || ./scripts/rollback.sh
done
```

#### Phase 3: Full Production (Week 5-6)
```bash
# Enable all optimizations
kubectl apply -f deployments/kubernetes/nrdot-v2-full.yaml

# Remove old deployment
kubectl delete deployment nrdot-v1-collector

# Enable auto-experiments
kubectl apply -f deployments/kubernetes/experiment-controller.yaml
```

## Implementation Timeline

### Week 1: Core Fixes
- [ ] Implement bounded process discovery
- [ ] Replace OTTL with efficient routing
- [ ] Add basic state persistence
- [ ] Fix memory management

### Week 2: Architecture
- [ ] Implement multi-stage pipeline
- [ ] Add horizontal scaling support
- [ ] Create circuit breakers
- [ ] Add progressive degradation

### Week 3: Production Features
- [ ] Deploy monitoring stack
- [ ] Implement experiment framework
- [ ] Add canary deployment
- [ ] Create health checks

### Week 4: Testing
- [ ] Load testing at scale
- [ ] Chaos engineering
- [ ] Performance validation
- [ ] Security audit

### Week 5: Documentation
- [ ] Update all configuration docs
- [ ] Create runbooks
- [ ] Write migration guide
- [ ] Record training videos

### Week 6: Rollout
- [ ] Deploy to staging
- [ ] Gradual production rollout
- [ ] Monitor and tune
- [ ] Gather feedback

## Success Metrics

1. **Performance**
   - Pipeline latency < 100ms p99
   - Memory usage < 2GB per collector
   - CPU usage < 50% under normal load

2. **Reliability**
   - Zero data loss under normal operations
   - < 0.01% data loss under pressure
   - Automatic recovery from failures

3. **Cost Efficiency**
   - 70-85% reduction achieved
   - < $0.10 per million metrics
   - Minimal operational overhead

4. **Operational Excellence**
   - < 30 minutes daily operations
   - Automated experiment validation
   - Self-healing capabilities

## Conclusion

This update plan transforms NRDOT v2 from a problematic proof-of-concept into a production-ready optimization system. The key changes focus on:

1. **Performance**: Efficient processing with bounded resource usage
2. **Reliability**: State persistence and progressive degradation
3. **Scalability**: Horizontal scaling and multi-stage pipelines
4. **Operability**: Comprehensive monitoring and automation

Following this plan will deliver the promised 70-85% cost reduction while maintaining a system that operations teams can actually run in production.