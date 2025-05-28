# NRDOT Metric Queries for New Relic

## Verify All Metrics Being Collected

### 1. List All System Metrics
```sql
SELECT uniques(metricName) FROM Metric 
WHERE host.id = 'dashbuilder-host' 
AND metricName LIKE 'system%' 
SINCE 30 minutes ago
```

### 2. CPU Metrics
```sql
-- CPU usage by state
SELECT rate(sum(system.cpu.time), 1 second) 
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
FACET state 
SINCE 30 minutes ago 
TIMESERIES

-- CPU load averages
SELECT latest(system.cpu.load_average.1m) as '1 min',
       latest(system.cpu.load_average.5m) as '5 min',
       latest(system.cpu.load_average.15m) as '15 min'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
SINCE 5 minutes ago
```

### 3. Memory Metrics
```sql
-- Memory usage by state
SELECT latest(system.memory.usage) / 1e9 as 'GB' 
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
FACET state 
SINCE 5 minutes ago

-- Memory utilization percentage
SELECT (latest(system.memory.usage) / (latest(system.memory.usage) + latest(system.memory.free))) * 100 as 'Memory %' 
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
AND state = 'used'
SINCE 5 minutes ago
```

### 4. Disk I/O Metrics
```sql
-- Disk I/O rate
SELECT rate(sum(system.disk.io), 1 second) 
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
FACET device, direction 
SINCE 30 minutes ago 
TIMESERIES

-- Disk operations
SELECT rate(sum(system.disk.operations), 1 second) as 'ops/sec'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
FACET device 
SINCE 30 minutes ago 
TIMESERIES
```

### 5. Network Metrics
```sql
-- Network I/O
SELECT rate(sum(system.network.io), 1 second) / 1e6 as 'MB/s'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
FACET device, direction 
SINCE 30 minutes ago 
TIMESERIES

-- Network errors and drops
SELECT sum(system.network.errors), sum(system.network.dropped)
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
FACET device 
SINCE 1 hour ago
```

### 6. Filesystem Metrics
```sql
-- Filesystem usage
SELECT latest(system.filesystem.usage) / 1e9 as 'Used GB',
       latest(system.filesystem.free) / 1e9 as 'Free GB',
       (latest(system.filesystem.usage) / (latest(system.filesystem.usage) + latest(system.filesystem.free))) * 100 as 'Usage %'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
FACET device, mountpoint 
SINCE 5 minutes ago
```

## NRDOT Collection Statistics

### Metric Collection Rate
```sql
SELECT rate(count(*), 1 minute) as 'Metrics/min',
       uniqueCount(metricName) as 'Unique Metrics',
       count(*) as 'Total Data Points'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
SINCE 1 hour ago 
TIMESERIES
```

### Collection Health Check
```sql
SELECT count(*) as 'Data Points',
       latest(timestamp) as 'Last Seen',
       uniqueCount(metricName) as 'Metric Types'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
AND service.name = 'nrdot-collector'
SINCE 10 minutes ago
```

## Cost Analysis Queries

### Data Ingestion Volume
```sql
-- Estimate data points per month
SELECT rate(count(*), 1 month) as 'Monthly Data Points',
       rate(count(*), 1 day) as 'Daily Data Points',
       rate(count(*), 1 hour) as 'Hourly Data Points'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
SINCE 1 hour ago
```

### Metric Cardinality
```sql
-- Unique metric series
SELECT uniqueCount(metricName, device, state, mountpoint) as 'Unique Series'
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
SINCE 1 hour ago
```

## Troubleshooting Queries

### Check Recent Data
```sql
SELECT count(*) 
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
SINCE 1 minute ago
```

### Verify Resource Attributes
```sql
SELECT latest(host.id), 
       latest(host.name),
       latest(service.name),
       latest(service.version),
       latest(deployment.environment)
FROM Metric 
WHERE host.id = 'dashbuilder-host' 
SINCE 5 minutes ago
```