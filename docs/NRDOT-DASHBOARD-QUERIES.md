# NRDOT v2 Dashboard Queries

## Overview Dashboard

### 1. Cost Summary Widget
```sql
SELECT 
  latest(nrdot.estimated.cost.hourly) as 'Current Hourly Cost',
  latest(nrdot.estimated.cost.hourly) * 24 as 'Daily Cost',
  latest(nrdot.estimated.cost.hourly) * 24 * 30 as 'Monthly Cost'
FROM ProcessSample
WHERE nrdot.version IS NOT NULL
FACET host.name
SINCE 5 minutes ago
```

### 2. Process Classification Breakdown
```sql
SELECT uniqueCount(entity.name) as 'Process Count'
FROM ProcessSample
WHERE nrdot.version IS NOT NULL
FACET process.classification, process.tier
SINCE 1 hour ago
```

### 3. Coverage by Tier
```sql
SELECT 
  percentage(count(*), WHERE process.tier = 'tier1') as 'Tier 1 Coverage',
  percentage(count(*), WHERE process.tier = 'tier2') as 'Tier 2 Coverage',
  percentage(count(*), WHERE process.tier = 'tier3') as 'Tier 3 Coverage'
FROM ProcessSample
WHERE nrdot.version IS NOT NULL
SINCE 1 hour ago
```

### 4. Top Processes by Resource Usage
```sql
SELECT 
  average(process.cpu.utilization) as 'CPU %',
  average(process.memory.physical_usage) / 1024 / 1024 as 'Memory MB'
FROM ProcessSample
WHERE nrdot.version IS NOT NULL
FACET entity.name, process.classification
SINCE 1 hour ago
LIMIT 20
```

## Optimization Dashboard

### 5. Series Reduction Effectiveness
```sql
FROM Metric
SELECT 
  latest(nrdot_process_series_total) as 'Total Series',
  latest(nrdot_process_series_kept) as 'Kept Series',
  percentage(latest(nrdot_process_series_kept), latest(nrdot_process_series_total)) as 'Retention %'
WHERE service.name = 'nrdot-plus-host'
FACET host.name
SINCE 5 minutes ago
```

### 6. NRDOT System Health
```sql
FROM Metric
SELECT 
  latest(otelcol_processor_accepted_metric_points) as 'Accepted',
  latest(otelcol_processor_refused_metric_points) as 'Refused',
  latest(otelcol_exporter_sent_metric_points) as 'Exported'
WHERE service.name = 'nrdot-plus-host'
TIMESERIES 5 minutes
SINCE 1 hour ago
```

### 7. Profile Changes Timeline
```sql
FROM Log
SELECT count(*)
WHERE message LIKE 'Profile change:%'
FACET cases(
  WHERE message LIKE '%conservative%' as 'Conservative',
  WHERE message LIKE '%balanced%' as 'Balanced', 
  WHERE message LIKE '%aggressive%' as 'Aggressive'
)
TIMESERIES 1 hour
SINCE 1 day ago
```

### 8. Anomaly Detection
```sql
SELECT count(*) as 'Anomalies Detected'
FROM ProcessSample
WHERE nrdot.ewma_applied = 'true' 
  AND process.cpu.utilization > nrdot.ewma_value * 1.5
FACET entity.name, process.classification
TIMESERIES 5 minutes
SINCE 1 hour ago
```

## Entity-Centric Queries

### 9. Process Entity Details
```sql
SELECT 
  latest(process.cpu.utilization) as 'CPU %',
  latest(process.memory.physical_usage) / 1024 / 1024 as 'Memory MB',
  latest(process.importance) as 'Importance Score',
  latest(process.classification) as 'Classification',
  latest(nrdot.ewma_applied) as 'EWMA Active'
FROM ProcessSample
WHERE entity.name = 'postgres@server01'
TIMESERIES 5 minutes
SINCE 1 hour ago
```

### 10. Host Entity Summary  
```sql
SELECT 
  uniqueCount(entity.name) as 'Total Processes',
  percentage(count(*), WHERE process.importance >= 0.9) as 'Critical Coverage',
  latest(nrdot.estimated.cost.hourly) as 'Hourly Cost'
FROM ProcessSample
WHERE host.name = 'server01'
  AND nrdot.version IS NOT NULL
FACET process.classification
SINCE 1 hour ago
```

## Alert Conditions

### 11. Low Coverage Alert
```sql
SELECT percentage(count(*), WHERE process.importance >= 0.9) as 'coverage'
FROM ProcessSample
WHERE nrdot.version IS NOT NULL
```
Alert when: coverage < 95% for 5 minutes

### 12. High Cost Alert
```sql
SELECT latest(nrdot.estimated.cost.hourly) as 'hourly_cost'
FROM ProcessSample
WHERE nrdot.version IS NOT NULL
```
Alert when: hourly_cost > 0.15 for 5 minutes

### 13. Profile Thrashing Alert
```sql
FROM Log
SELECT count(*) as 'profile_changes'
WHERE message LIKE 'Profile change:%'
```
Alert when: profile_changes > 5 in 10 minutes

## Troubleshooting Queries

### 14. Missing Critical Processes
```sql
SELECT uniqueCount(entity.name) as 'Count'
FROM ProcessSample
WHERE process.classification = 'critical_system'
  AND nrdot.version IS NULL
FACET process.executable.name
SINCE 10 minutes ago
```

### 15. Export Failures
```sql
FROM Metric
SELECT 
  rate(sum(otelcol_exporter_send_failed_metric_points), 1 minute) as 'Failed/min',
  rate(sum(otelcol_exporter_sent_metric_points), 1 minute) as 'Sent/min'
WHERE service.name = 'nrdot-plus-host'
TIMESERIES 1 minute
SINCE 30 minutes ago
```

## Usage Notes

1. **Entity Names**: All processes have `entity.name` in format `processname@hostname`
2. **Process Tiers**: tier1 (critical), tier2 (important), tier3 (standard)
3. **Cost Attributes**: `nrdot.cost.currency` and `nrdot.cost.model` provide context
4. **EWMA Attributes**: `nrdot.ewma_applied` and `nrdot.ewma_value` for anomaly detection
5. **Technology Tags**: Database processes include `technology.name` attribute

## Best Practices

- Use `entity.name` for unique process identification
- Group by `process.classification` for categorical analysis  
- Filter by `nrdot.version IS NOT NULL` to ensure NRDOT-managed data
- Use `latest()` for cost metrics to avoid double-counting
- Include `host.name` facet for multi-host environments