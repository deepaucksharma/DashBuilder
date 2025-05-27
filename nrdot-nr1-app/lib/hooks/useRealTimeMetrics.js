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
        // Cost metrics
        currentCost: `
          SELECT 
            latest(nrdot_estimated_cost_per_hour) as value
          FROM Metric 
          WHERE nrdot.version = '2.0.0'
          SINCE 5 minutes ago
        `,
        
        costTrend: `
          SELECT 
            average(nrdot_estimated_cost_per_hour) as cost,
            sum(nrdot_process_series_total) as total,
            sum(nrdot_process_series_kept) as kept
          FROM Metric 
          WHERE nrdot.version = '2.0.0'
          SINCE ${timeRange.duration} ms ago
          TIMESERIES AUTO
        `,
        
        // Coverage metrics
        criticalCoverage: `
          SELECT 
            average(nrdot_process_coverage_critical) * 100 as coverage
          FROM Metric 
          WHERE nrdot.version = '2.0.0'
          SINCE 5 minutes ago
        `,
        
        processCoverage: `
          SELECT 
            uniqueCount(process.executable.name) as covered,
            percentage(count(*), WHERE process.importance >= 0.9) as critical
          FROM ProcessSample
          WHERE nrdot.version = '2.0.0'
          SINCE 1 hour ago
          FACET process.importance
        `,
        
        // Anomaly metrics
        anomalyCount: `
          SELECT 
            sum(nrdot_process_anomaly_detected) as count
          FROM Metric 
          WHERE nrdot.version = '2.0.0'
          SINCE 1 hour ago
        `,
        
        anomalyBreakdown: `
          SELECT 
            count(*) as anomalies
          FROM ProcessSample
          WHERE process.is_anomaly = 'true'
            AND nrdot.version = '2.0.0'
          SINCE 1 hour ago
          FACET process.executable.name
          LIMIT 10
        `,
        
        // Performance metrics
        collectorHealth: `
          SELECT 
            average(otelcol_process_cpu_seconds) as cpu,
            average(otelcol_process_memory_rss) / 1024 / 1024 as memory_mb,
            sum(otelcol_exporter_sent_metric_points) as throughput
          FROM Metric
          WHERE otelcol.service.name = 'nrdot-collector-host'
          SINCE 5 minutes ago
        `
      };
      
      const results = await Promise.all(
        Object.entries(queries).map(async ([key, query]) => {
          const { data } = await NrqlQuery.query({
            accountId,
            query,
            formatType: NrqlQuery.FORMAT_TYPE.RAW
          });
          return { key, data };
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
      processedMetrics.cost.totalSavings = calculateSavings(processedMetrics.cost);
      processedMetrics.cost.reductionPercent = calculateReduction(processedMetrics.cost);
      processedMetrics.cost.budget = await fetchBudget(accountId);
      
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
  if (key.includes('coverage') || key.includes('Coverage')) return 'coverage';
  if (key.includes('anomaly') || key.includes('Anomaly')) return 'anomalies';
  return 'performance';
}

function calculateSavings(costMetrics) {
  const baseline = costMetrics.costTrend?.data?.[0]?.cost || 0;
  const current = costMetrics.currentCost?.data?.[0]?.value || 0;
  return Math.max(0, baseline - current);
}

function calculateReduction(costMetrics) {
  const total = costMetrics.costTrend?.data?.[0]?.total || 1;
  const kept = costMetrics.costTrend?.data?.[0]?.kept || 0;
  return ((total - kept) / total) * 100;
}

async function fetchBudget(accountId) {
  // In a real implementation, this would fetch from account settings
  return 100; // $100/hour default budget
}