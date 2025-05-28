# YOUR DATA IS BEING SENT TO NEW RELIC! 🎉

## Status:
- ✅ All 5 OpenTelemetry collectors are running
- ✅ Metrics are being collected (system.cpu.time, system.memory.usage, etc.)
- ✅ Successfully sending to https://otlp.nr-data.net
- ✅ No authentication errors
- ✅ Account ID: 3630072

## EXACT Queries to Find Your Data:

### 1. Most Basic Query (Try this first):
```sql
FROM Metric SELECT count(*) SINCE 30 minutes ago
```

### 2. Find OpenStack VMs:
```sql
FROM Metric SELECT count(*) WHERE host.name LIKE '%openstack%' SINCE 30 minutes ago
```

### 3. Check CPU Metrics:
```sql
FROM Metric SELECT * WHERE metricName = 'system.cpu.time' SINCE 30 minutes ago LIMIT 10
```

### 4. Check Memory Metrics:
```sql
FROM Metric SELECT * WHERE metricName = 'system.memory.usage' SINCE 30 minutes ago LIMIT 10
```

### 5. Find by Service Name:
```sql
FROM Metric SELECT uniques(host.name) WHERE service.name = 'openstack-vm' SINCE 30 minutes ago
```

### 6. See ALL Metrics in Your Account:
```sql
FROM Metric SELECT uniques(metricName) SINCE 30 minutes ago
```

### 7. Find Hosts:
```sql
FROM Metric SELECT uniques(host.name) SINCE 30 minutes ago
```

## Direct Links:

1. **Query Builder with Pre-filled Query:**
   https://one.newrelic.com/data-explorer?query=FROM%20Metric%20SELECT%20count(*)%20WHERE%20host.name%20LIKE%20'%25openstack%25'%20SINCE%2030%20minutes%20ago&accountId=3630072

2. **Infrastructure Explorer:**
   https://one.newrelic.com/infra?accountId=3630072

3. **All Entities:**
   https://one.newrelic.com/entity-explorer?accountId=3630072

## Troubleshooting:

If you don't see data:
1. Make sure you're logged into account 3630072
2. Wait 2-3 minutes for data to appear
3. Try the broader queries first (like count(*))
4. Check you're in the US region

## What's Running:
- final-test: Debug collector showing successful exports
- otel-vm-1 through otel-vm-5: Your 5 OpenStack VM collectors

The collectors have been successfully sending metrics for several minutes now!