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
        // Cost metrics - CORRECTED for Metric queries
        currentCost: `
          SELECT 
            latest(nrdot_estimated_cost_hourly) as value
          FROM Metric 
          WHERE service.name = 'nrdot-plus-host'
          SINCE 5 minutes ago
        `,
        
        costTrend: `
          SELECT 
            sum(nrdot_cost_hourly) as cost,
            count(DISTINCT dimensions()) as unique_series
          FROM Metric 
          WHERE service.name = 'nrdot-plus-host'
          SINCE ${timeRange.duration} ms ago
          TIMESERIES AUTO
        `,
        
        // Coverage metrics - CORRECTED
        criticalCoverage: `
          SELECT 
            filter(count(*), WHERE process.importance >= 0.9) / count(*) * 100 as coverage
          FROM Metric 
          WHERE service.name = 'nrdot-plus-host' 
            AND metricName = 'process.cpu.time'
          SINCE 5 minutes ago
        `,
        
        processCoverage: `
          SELECT 
            count(DISTINCT process.executable.name) as covered,
            filter(count(*), WHERE process.importance >= 0.9) / count(*) * 100 as critical
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
            AND metricName = 'process.cpu.time'
          SINCE 1 hour ago
          FACET process.classification
        `,
        
        // Series metrics - CORRECTED
        seriesMetrics: `
          SELECT 
            latest(nrdot_summary_total_series) as total_series,
            latest(nrdot_summary_coverage) as coverage_score,
            count(DISTINCT dimensions()) as actual_series
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
          SINCE 5 minutes ago
        `,
        
        // Anomaly metrics - CORRECTED
        anomalyCount: `
          SELECT 
            count(*) as count
          FROM Metric 
          WHERE service.name = 'nrdot-plus-host'
            AND nrdot.anomaly.detected = 'true'
            AND metricName = 'process.cpu.utilization'
          SINCE 1 hour ago
        `,
        
        anomalyBreakdown: `
          SELECT 
            latest(value) as current,
            latest(nrdot.ewma.value) as expected,
            abs(latest(value) - latest(nrdot.ewma.value)) as deviation
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
            AND nrdot.ewma.enabled = 'true'
            AND metricName = 'process.cpu.utilization'
          SINCE 1 hour ago
          FACET process.executable.name
          LIMIT 10
        `,
        
        // Collector health metrics - CORRECTED
        collectorHealth: `
          SELECT 
            rate(sum(otelcol_processor_accepted_metric_points), 1 minute) as accepted_rate,
            rate(sum(otelcol_processor_refused_metric_points), 1 minute) as refused_rate,
            rate(sum(otelcol_exporter_sent_metric_points), 1 minute) as export_rate,
            rate(sum(otelcol_exporter_send_failed_metric_points), 1 minute) as failure_rate
          FROM Metric
          WHERE otelcol.service.name = 'nrdot-plus'
          SINCE 5 minutes ago
        `,
        
        // Profile state - CORRECTED
        profileState: `
          SELECT 
            latest(nrdot.profile.active) as active_profile,
            count(DISTINCT host.name) as host_count,
            count(DISTINCT nrdot.experiment.ring) as ring_count
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
          SINCE 5 minutes ago
          FACET nrdot.profile.active
        `,
        
        // KPI metrics - NEW
        kpiMetrics: `
          SELECT 
            latest(nrdot_kpi_process_count) as process_count,
            average(nrdot_kpi_cpu_by_class) as avg_cpu,
            sum(nrdot_kpi_memory_by_tier) / 1048576 as total_memory_mb
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
          SINCE 5 minutes ago
          FACET process.classification
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
            // Return empty data instead of failing completely
            return { key, data: { results: [{}] } };
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
      processedMetrics.coverage.effectiveRate = calculateEffectiveCoverage(processedMetrics);
      
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
  if (key.includes('profile') || key.includes('State') || key.includes('kpi')) return 'coverage';
  return 'performance';
}

function calculateSavings(metrics) {
  // Get baseline (all processes) vs actual (filtered)
  const totalSeries = metrics.coverage?.seriesMetrics?.data?.results?.[0]?.total_series || 0;
  const actualSeries = metrics.coverage?.seriesMetrics?.data?.results?.[0]?.actual_series || totalSeries;
  
  // Cost per series per hour
  const costPerSeries = 60 * 0.25 / 1000000; // 60 datapoints/hour * $0.25/million
  
  const baselineCost = totalSeries * costPerSeries;
  const actualCost = actualSeries * costPerSeries;
  
  return Math.max(0, baselineCost - actualCost);
}

function calculateReduction(metrics) {
  const totalSeries = metrics.coverage?.seriesMetrics?.data?.results?.[0]?.total_series || 1;
  const actualSeries = metrics.coverage?.seriesMetrics?.data?.results?.[0]?.actual_series || totalSeries;
  
  return Math.max(0, ((totalSeries - actualSeries) / totalSeries) * 100);
}

function calculateMonthlyProjection(metrics) {
  const currentCost = metrics.cost?.currentCost?.data?.results?.[0]?.value || 0;
  return currentCost * 24 * 30; // 30-day month
}

function calculateEffectiveCoverage(metrics) {
  const coverage = metrics.coverage?.criticalCoverage?.data?.results?.[0]?.coverage || 0;
  const seriesReduction = calculateReduction(metrics);
  
  // Effective coverage considers both coverage % and reduction %
  return coverage * (1 - seriesReduction / 100);
}