# NRDOT Experiment Tracking Configuration Guide

This guide documents all important configuration fields, tags, and attributes used for comparing different NRDOT configurations and experiment runs.

## Core Identification Fields

These fields uniquely identify and track each experiment:

### 1. **Experiment Identifiers**
```bash
EXPERIMENT_ID         # Unique ID for the experiment (e.g., exp-20250528-071234)
EXPERIMENT_NAME       # Human-readable name (e.g., cost-optimization-test)
EXPERIMENT_RUN_ID     # Unique ID for each run (e.g., run-1748396789)
EXPERIMENT_VERSION    # Version of the experiment config (e.g., 1.0.0)
```

### 2. **Profile Configuration**
```bash
NRDOT_PROFILE         # Current optimization profile: conservative, balanced, aggressive, emergency
OPTIMIZATION_MODE     # Same as NRDOT_PROFILE (legacy support)
OPTIMIZATION_VERSION  # Version of optimization algorithm (e.g., 2.0)
```

### 3. **Environment Context**
```bash
NODE_ENV              # Environment: development, staging, production
DEPLOYMENT_ENV        # Deployment environment: local, docker, k8s, cloud
CLUSTER_NAME          # Kubernetes cluster name (if applicable)
REGION                # Geographic region: us-east-1, eu-west-1, etc.
```

## Metric Attributes and Tags

All metrics sent to New Relic should include these attributes for proper filtering and comparison:

### 1. **Service Identification**
```yaml
service.name: "nrdot"                    # Always "nrdot" for our metrics
service.version: "2.0"                   # NRDOT version
service.instance.id: "${HOSTNAME}"       # Unique instance identifier
service.namespace: "${K8S_NAMESPACE}"    # Kubernetes namespace
```

### 2. **Experiment Metadata**
```yaml
experiment.id: "${EXPERIMENT_ID}"
experiment.name: "${EXPERIMENT_NAME}"
experiment.run.id: "${EXPERIMENT_RUN_ID}"
experiment.profile: "${NRDOT_PROFILE}"
experiment.phase: "baseline|optimization|validation"
experiment.duration: "${EXPERIMENT_DURATION}"
```

### 3. **Configuration Details**
```yaml
config.profile: "${NRDOT_PROFILE}"
config.cpu.threshold: "${TARGET_CPU_THRESHOLD}"
config.memory.threshold: "${TARGET_MEMORY_THRESHOLD}"
config.cost.target: "${TARGET_COST_REDUCTION}"
config.coverage.target: "${CRITICAL_PROCESS_THRESHOLD}"
config.process.min_cpu: "${MIN_CPU_THRESHOLD}"
config.process.min_memory: "${MIN_MEMORY_THRESHOLD}"
```

### 4. **Resource Tags**
```yaml
host.name: "${HOSTNAME}"
host.id: "${HOST_ID}"
container.name: "${CONTAINER_NAME}"
container.id: "${CONTAINER_ID}"
container.image: "${CONTAINER_IMAGE}"
k8s.pod.name: "${POD_NAME}"
k8s.deployment.name: "${DEPLOYMENT_NAME}"
```

### 5. **Business Context**
```yaml
team: "platform"                         # Team owning the experiment
owner: "nrdot"                          # Product owner
cost.center: "engineering"              # Cost center for billing
project: "telemetry-optimization"       # Project name
```

## Key Performance Indicators (KPIs)

These metrics are critical for comparing experiments:

### 1. **Cost Metrics**
- `nrdot.cost.per_hour` - Estimated cost per hour
- `nrdot.cost.reduction` - Percentage cost reduction achieved
- `nrdot.datapoints.per_minute` - Data points ingested per minute
- `nrdot.datapoints.dropped` - Data points filtered/dropped

### 2. **Coverage Metrics**
- `nrdot.process.coverage` - Percentage of processes monitored
- `nrdot.process.count.total` - Total processes discovered
- `nrdot.process.count.monitored` - Processes being monitored
- `nrdot.process.count.critical` - Critical processes monitored

### 3. **Performance Metrics**
- `nrdot.optimization.score` - Overall optimization score (0-100)
- `nrdot.cpu.overhead` - CPU overhead of monitoring
- `nrdot.memory.overhead` - Memory overhead of monitoring
- `nrdot.latency.p95` - 95th percentile processing latency

### 4. **Quality Metrics**
- `nrdot.accuracy.score` - Data accuracy score
- `nrdot.anomaly.detection.rate` - Anomaly detection effectiveness
- `nrdot.false.positive.rate` - False positive rate
- `nrdot.coverage.critical` - Critical process coverage percentage

## NRQL Queries for Experiment Comparison

### 1. Compare Profiles Side-by-Side
```sql
SELECT 
  average(nrdot.cost.per_hour) as 'Cost/Hour',
  average(nrdot.process.coverage) as 'Coverage %',
  average(nrdot.optimization.score) as 'Score'
FROM Metric 
WHERE experiment.name = 'cost-optimization-test'
SINCE 1 hour ago 
FACET config.profile
```

### 2. Track Experiment Progress Over Time
```sql
SELECT 
  average(nrdot.cost.reduction) as 'Cost Reduction %',
  average(nrdot.process.count.monitored) as 'Monitored Processes'
FROM Metric 
WHERE experiment.id = 'exp-20250528-071234'
SINCE 1 hour ago 
TIMESERIES 5 minutes
FACET experiment.phase
```

### 3. Compare Multiple Experiment Runs
```sql
SELECT 
  latest(nrdot.optimization.score) as 'Final Score',
  max(nrdot.cost.reduction) as 'Max Cost Reduction',
  min(nrdot.cost.per_hour) as 'Min Cost/Hour'
FROM Metric 
WHERE experiment.name = 'cost-optimization-test'
SINCE 1 day ago 
FACET experiment.run.id
```

### 4. Analyze Process Coverage by Profile
```sql
SELECT 
  uniqueCount(process.executable.name) as 'Unique Processes',
  average(process.cpu.utilization) as 'Avg CPU %'
FROM Metric 
WHERE service.name = 'nrdot'
  AND process.executable.name IS NOT NULL
SINCE 1 hour ago 
FACET config.profile, process.executable.name
LIMIT 100
```

## Environment Variable Template

Add these to your `.env` file for complete experiment tracking:

```bash
# Experiment Identification
EXPERIMENT_ID=exp-20250528-071234
EXPERIMENT_NAME=nrdot-cost-optimization-q1
EXPERIMENT_RUN_ID=run-1748396789
EXPERIMENT_VERSION=1.0.0
EXPERIMENT_PHASE=optimization
EXPERIMENT_DURATION=3600

# Profile Configuration  
NRDOT_PROFILE=balanced
OPTIMIZATION_VERSION=2.0

# Resource Limits
TARGET_CPU_THRESHOLD=70
TARGET_MEMORY_THRESHOLD=80
MIN_CPU_THRESHOLD=0.1
MIN_MEMORY_THRESHOLD=10485760

# Cost Targets
COST_PER_MILLION_DATAPOINTS=0.25
TARGET_COST_REDUCTION=0.70
CRITICAL_PROCESS_THRESHOLD=0.95

# Business Context
TEAM_NAME=platform
COST_CENTER=engineering
PROJECT_NAME=telemetry-optimization

# Deployment Context
DEPLOYMENT_ENV=docker
CLUSTER_NAME=nrdot-test
REGION=us-east-1
```

## Best Practices

1. **Always include experiment identifiers** in all metrics to enable proper filtering
2. **Use consistent naming** across all experiments for easy comparison
3. **Version your configurations** to track changes over time
4. **Include both technical and business context** for comprehensive analysis
5. **Set meaningful defaults** that auto-generate unique IDs if not specified
6. **Document your experiments** with clear names and descriptions
7. **Use phases** (baseline, optimization, validation) to track experiment stages

## Automated Tagging

The OTEL collector configuration should automatically add these tags to all metrics:

```yaml
processors:
  attributes:
    actions:
      - key: experiment.id
        value: ${EXPERIMENT_ID}
        action: upsert
      - key: experiment.name
        value: ${EXPERIMENT_NAME}
        action: upsert
      - key: experiment.run.id
        value: ${EXPERIMENT_RUN_ID}
        action: upsert
      - key: config.profile
        value: ${NRDOT_PROFILE}
        action: upsert
      - key: experiment.phase
        value: ${EXPERIMENT_PHASE:-optimization}
        action: upsert
```

This ensures all metrics are properly tagged for experiment comparison and analysis.