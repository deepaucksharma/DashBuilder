import { useState, useEffect, useCallback } from 'react';
import { NrqlQuery } from 'nr1';

export function useRealTimeMetrics(accountId, timeRange, refreshInterval = 10000) {
  const [metrics, setMetrics] = useState({
    cost: {},
    coverage: {},
    anomalies: {},
    performance: {}
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const fetchMetrics = useCallback(async () => {
    if (!accountId) return;
    
    try {
      const queries = {
        // Cost metrics - using actual metric names from the collector
        currentCost: `
          SELECT 
            latest(nrdot.estimated.cost.hourly) as value
          FROM Metric 
          WHERE service.name = 'nrdot-plus-host'
          SINCE 5 minutes ago
        `,
        
        costTrend: `
          SELECT 
            sum(nrdot.estimated.cost.hourly) as cost,
            count(DISTINCT dimensions()) as total,
            count(DISTINCT dimensions()) as kept
          FROM Metric 
          WHERE service.name = 'nrdot-plus-host'
            AND metricName IN ('process.cpu.utilization', 'process.memory.physical_usage')
          SINCE ${timeRange.duration} ms ago
          TIMESERIES AUTO
        `,
        
        // Coverage metrics - using generated metrics
        criticalCoverage: `
          SELECT 
            latest(nrdot.process.coverage.critical) * 100 as coverage
          FROM Metric 
          WHERE service.name = 'nrdot-plus-host'
          SINCE 5 minutes ago
        `,
        
        processCoverage: `
          SELECT 
            count(DISTINCT process.executable.name) as covered,
            percentage(count(*), WHERE process.importance >= 0.9) as critical,
            percentage(count(*), WHERE process.importance >= 0.8) as important
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
            AND metricName = 'process.cpu.time'
          SINCE 1 hour ago
          FACET CASES(
            WHERE process.importance = 1.0 as 'Critical',
            WHERE process.importance >= 0.9 as 'Database',
            WHERE process.importance >= 0.8 as 'Web Server',
            WHERE process.importance >= 0.6 as 'Application',
            WHERE process.importance < 0.6 as 'Other'
          )
        `,
        
        // Series count metrics
        seriesMetrics: `
          SELECT 
            count(DISTINCT dimensions()) as total_series,
            filter(count(DISTINCT dimensions()), WHERE process.importance >= 0.5) as kept_series,
            latest(nrdot.series.count) as series_count
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
          SINCE 5 minutes ago
        `,
        
        // Anomaly metrics (if EWMA is enabled)
        anomalyCount: `
          SELECT 
            count(*) as count
          FROM Metric 
          WHERE service.name = 'nrdot-plus-host'
            AND nrdot.ewma_applied = 'true'
            AND abs(value - nrdot.ewma_value) > (nrdot.ewma_value * 0.5)
          SINCE 1 hour ago
        `,
        
        anomalyBreakdown: `
          SELECT 
            latest(value) as current,
            latest(nrdot.ewma_value) as expected,
            abs(latest(value) - latest(nrdot.ewma_value)) / latest(nrdot.ewma_value) * 100 as deviation_pct
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
            AND nrdot.ewma_applied = 'true'
            AND metricName = 'process.cpu.utilization'
          SINCE 1 hour ago
          FACET process.executable.name
          LIMIT 10
        `,
        
        // Collector performance metrics
        collectorHealth: `
          SELECT 
            average(otelcol_process_cpu_seconds) * 100 as cpu_percent,
            average(otelcol_process_memory_rss) / 1024 / 1024 as memory_mb,
            sum(otelcol_exporter_sent_metric_points) as throughput,
            sum(otelcol_exporter_send_failed_metric_points) as failures
          FROM Metric
          WHERE service.name = 'nrdot-collector'
          SINCE 5 minutes ago
        `,
        
        // Profile and optimization state
        profileState: `
          SELECT 
            latest(nrdot.profile) as active_profile,
            latest(nrdot.ring) as experiment_ring,
            count(DISTINCT host.name) as host_count
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
          SINCE 5 minutes ago
          FACET nrdot.profile
        `
      };
      
      const results = await Promise.all(
        Object.entries(queries).map(async ([key, query]) => {
          try {
            const { data } = await NrqlQuery.query({
              accountId,
              query,
              formatType: NrqlQuery.FORMAT_TYPE.RAW
            });
            return { key, data };
          } catch (err) {
            console.warn(`Query failed for ${key}:`, err);
            return { key, data: null };
          }
        })
      );
      
      // Process results
      const processedMetrics = results.reduce((acc, { key, data }) => {
        const category = getMetricCategory(key);
        acc[category][key] = data;
        return acc;
      }, {
        cost: {},
        coverage: {},
        anomalies: {},
        performance: {}
      });
      
      // Calculate derived metrics
      processedMetrics.cost.totalSavings = calculateSavings(processedMetrics);
      processedMetrics.cost.reductionPercent = calculateReduction(processedMetrics);
      processedMetrics.cost.projectedMonthly = calculateMonthlyProjection(processedMetrics);
      
      setMetrics(processedMetrics);
      setLoading(false);
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  }, [accountId, timeRange]);
  
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchMetrics, refreshInterval]);
  
  return { metrics, loading, error, refresh: fetchMetrics };
}

// Helper functions
function getMetricCategory(key) {
  if (key.includes('cost') || key.includes('Cost')) return 'cost';
  if (key.includes('coverage') || key.includes('Coverage') || key.includes('series')) return 'coverage';
  if (key.includes('anomaly') || key.includes('Anomaly')) return 'anomalies';
  if (key.includes('profile') || key.includes('State')) return 'coverage';
  return 'performance';
}

function calculateSavings(metrics) {
  // Calculate based on series reduction
  const totalSeries = metrics.coverage?.seriesMetrics?.data?.[0]?.total_series || 0;
  const keptSeries = metrics.coverage?.seriesMetrics?.data?.[0]?.kept_series || totalSeries;
  const costPerSeries = 0.25 / 1000000 * 60; // $0.25 per million datapoints, 60 datapoints/hour
  
  const totalCost = totalSeries * costPerSeries;
  const actualCost = keptSeries * costPerSeries;
  
  return Math.max(0, totalCost - actualCost);
}

function calculateReduction(metrics) {
  const totalSeries = metrics.coverage?.seriesMetrics?.data?.[0]?.total_series || 1;
  const keptSeries = metrics.coverage?.seriesMetrics?.data?.[0]?.kept_series || totalSeries;
  
  return Math.max(0, ((totalSeries - keptSeries) / totalSeries) * 100);
}

function calculateMonthlyProjection(metrics) {
  const hourlySavings = calculateSavings(metrics);
  return hourlySavings * 24 * 30; // 30-day month
}