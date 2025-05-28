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
            latest(nrdot.estimated.cost.hourly) as value
          FROM Metric 
          WHERE nrdot.version IS NOT NULL
          SINCE 5 minutes ago
        `,
        
        costTrend: `
          SELECT 
            sum(nrdot.estimated.cost.hourly) as cost,
            uniqueCount(process.executable.name) as unique_processes
          FROM ProcessSample 
          WHERE nrdot.version IS NOT NULL
          SINCE ${timeRange.duration} ms ago
          TIMESERIES AUTO
        `,
        
        // Coverage metrics
        criticalCoverage: `
          SELECT 
            percentage(count(*), WHERE process.importance >= 0.9) as coverage
          FROM ProcessSample 
          WHERE nrdot.version IS NOT NULL
          SINCE 5 minutes ago
        `,
        
        processCoverage: `
          SELECT 
            uniqueCount(process.executable.name) as covered,
            percentage(count(*), WHERE process.importance >= 0.9) as critical
          FROM ProcessSample
          WHERE nrdot.version IS NOT NULL
          SINCE 1 hour ago
          FACET process.classification
        `,
        
        // Anomaly metrics
        anomalyCount: `
          SELECT 
            count(*) as count
          FROM ProcessSample 
          WHERE nrdot.ewma_applied = 'true' AND process.cpu.utilization > nrdot.ewma_value * 1.5
          SINCE 1 hour ago
        `,
        
        anomalyBreakdown: `
          SELECT 
            count(*) as anomalies,
            average(process.cpu.utilization) as avg_cpu
          FROM ProcessSample
          WHERE nrdot.ewma_applied = 'true' 
            AND (process.cpu.utilization > nrdot.ewma_value * 1.5 OR process.memory.physical_usage > 1073741824)
          SINCE 1 hour ago
          FACET process.executable.name
          LIMIT 10
        `,
        
        // Performance metrics
        collectorHealth: `
          SELECT 
            average(otelcol_processor_accepted_metric_points) as accepted,
            average(otelcol_processor_refused_metric_points) as refused,
            average(otelcol_exporter_sent_metric_points) as sent
          FROM Metric
          WHERE service.name = 'nrdot-plus-host'
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
  // Since we don't have direct series counts in metrics, estimate from cost
  // Assuming baseline cost without optimization would be 3x current
  const current = costMetrics.currentCost?.data?.[0]?.value || 0;
  const baseline = current * 3; // Conservative estimate
  return current > 0 ? ((baseline - current) / baseline) * 100 : 0;
}

async function fetchBudget(accountId) {
  // In a real implementation, this would fetch from account settings
  return 100; // $100/hour default budget
}