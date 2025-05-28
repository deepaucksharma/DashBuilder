# NRDOT Experiments Framework

## Overview

The NRDOT Experiments Framework provides a systematic way to compare different telemetry optimization configurations. Run controlled experiments to find the optimal balance between cost reduction and process coverage for your specific environment.

## Quick Start

### 1. List Available Experiments
```bash
npm run experiment:list
```

### 2. Run a Quick Test
```bash
# 5-minute quick test
npm run experiment:quick

# Full experiment with default profile
npm run experiment:run cost-optimization-basic
```

### 3. View Results
```bash
# View latest results
npm run experiment:results

# View specific experiment
npm run experiment:results exp-cost-opt-basic

# Compare multiple experiments
npm run experiment:compare exp-001 exp-002 exp-003
```

## Experiment Workflow

### Phase 1: Setup
- Launch control container (baseline NRDOT)
- Launch test containers (NRDOT with different configs)
- Verify all containers are healthy

### Phase 2: Warmup (5 minutes)
- Start synthetic workload generator
- Allow systems to stabilize
- Begin initial metrics collection

### Phase 3: Test Execution (10-30 minutes)
- Collect metrics every 30 seconds
- Monitor telemetry volume, costs, and coverage
- Track resource utilization

### Phase 4: Cooldown (5 minutes)
- Stop workload generation
- Allow final metrics to propagate
- Ensure data completeness

### Phase 5: Analysis
- Compare test groups to control
- Calculate percentage improvements
- Generate insights and recommendations

### Phase 6: Cleanup
- Stop and remove containers
- Save all results and reports

## Pre-defined Experiment Profiles

### cost-optimization-basic
- **Duration**: 10 minutes
- **Configs**: Conservative, Aggressive
- **Goal**: Find basic cost/coverage balance
- **Best for**: Initial testing

### performance-impact
- **Duration**: 30 minutes
- **Configs**: All optimization levels
- **Goal**: Measure resource usage impact
- **Best for**: Performance validation

### coverage-analysis
- **Duration**: 20 minutes
- **Configs**: Various importance thresholds
- **Goal**: Ensure critical process coverage
- **Best for**: Coverage validation

### scale-test
- **Duration**: 60 minutes
- **Configs**: High-volume scenarios
- **Goal**: Test at scale
- **Best for**: Production preparation

## Configuration Profiles

### Conservative
- Process importance threshold: 0.7
- Max processes per host: 75
- Sampling reduction: 20%
- **Expected**: 20-30% cost reduction

### Balanced
- Process importance threshold: 0.8
- Max processes per host: 50
- Sampling reduction: 35%
- **Expected**: 40-50% cost reduction

### Aggressive
- Process importance threshold: 0.9
- Max processes per host: 30
- Sampling reduction: 50%
- **Expected**: 60-70% cost reduction

## Creating Custom Experiments

### 1. Interactive Creation
```bash
npm run experiment:create my-custom-test -- \
  --duration 15 \
  --configs "conservative,aggressive"
```

### 2. Manual YAML Creation
Create a file in `experiments/profiles/my-experiment.yaml`:

```yaml
experiment:
  id: "my-experiment"
  name: "My Custom Experiment"
  
  duration:
    warmup_minutes: 5
    test_minutes: 20
    cooldown_minutes: 5
  
  containers:
    control:
      name: "baseline"
      config_profile: "baseline"
    
    test_groups:
      - name: "optimized"
        config_profile: "custom"
        environment:
          PROCESS_IMPORTANCE_THRESHOLD: "0.85"
  
  metrics:
    primary_metrics:
      - name: "telemetry_volume"
        query: "SELECT sum(bytes) FROM Metric..."
  
  success_criteria:
    goals:
      - metric: "telemetry_volume"
        baseline_percentage: 50
```

## Metrics Collected

### Primary Metrics
- **telemetry_volume**: Total bytes sent to New Relic
- **process_count**: Number of unique processes monitored
- **estimated_cost**: Projected monthly telemetry cost
- **cpu_utilization**: Container CPU usage
- **memory_usage**: Container memory consumption

### Secondary Metrics
- **dropped_metrics**: Data lost due to filtering
- **error_rate**: Processing errors
- **pipeline_latency**: Data processing delay
- **critical_coverage**: Coverage of important processes

## Understanding Results

### Success Indicators
✅ **Good Result**:
- Cost reduction > 30%
- Process coverage > 95%
- No increase in errors
- Stable resource usage

⚠️ **Needs Tuning**:
- Cost reduction < 20%
- Process coverage < 90%
- Increased error rate
- High resource usage

### Report Sections

1. **Summary**: High-level comparison
2. **Detailed Metrics**: All collected data
3. **Insights**: Automated analysis
4. **Recommendations**: Suggested actions

## Best Practices

### 1. Environment Preparation
- Ensure consistent system load
- Close unnecessary applications
- Use dedicated test environment if possible

### 2. Experiment Design
- Run multiple iterations
- Test during typical workload periods
- Include edge cases in workload

### 3. Result Interpretation
- Look for consistent patterns
- Consider your specific requirements
- Validate in staging before production

## Troubleshooting

### Container Launch Failures
```bash
# Check Docker status
docker ps -a

# View container logs
docker logs <container-name>

# Verify network
docker network ls
```

### Metrics Collection Issues
```bash
# Check New Relic connectivity
npm run test:connection

# Verify API keys
echo $NEW_RELIC_API_KEY
```

### Cleanup Issues
```bash
# Force stop experiment
npm run experiment:stop -- --force

# Manual cleanup
docker stop $(docker ps -q --filter "name=exp-")
docker rm $(docker ps -aq --filter "name=exp-")
```

## Advanced Usage

### Running Parallel Experiments
```bash
# Terminal 1
npm run experiment:run profile1

# Terminal 2
npm run experiment:run profile2
```

### Continuous Experiments
```bash
# Run experiments on schedule
*/30 * * * * cd /path/to/dashbuilder && npm run experiment:quick
```

### Integration with CI/CD
```yaml
# GitHub Actions example
- name: Run NRDOT Experiment
  run: |
    npm run experiment:run cost-optimization-basic
    npm run experiment:results --format json > results.json
```

## Architecture

```
┌─────────────────┐
│   Orchestrator  │
│  (Node.js App)  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼───┐
│Control│ │Test 1│
│Docker │ │Docker│
└───────┘ └──────┘
    │         │
    └────┬────┘
         │
    ┌────▼────┐
    │ Metrics │
    │Collector│
    └─────────┘
         │
    ┌────▼────┐
    │Analysis │
    │ Engine  │
    └─────────┘
```

## Next Steps

1. **Run Your First Experiment**
   ```bash
   npm run experiment:quick
   ```

2. **Review Results**
   ```bash
   npm run experiment:results
   ```

3. **Deploy Best Configuration**
   - Update your NRDOT configuration
   - Monitor in production
   - Iterate as needed