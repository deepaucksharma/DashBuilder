import React from 'react';
import {
  Card,
  CardBody,
  Stack,
  StackItem,
  HeadingText,
  Icon,
  Spinner,
  LineChart
} from 'nr1';
import { motion } from 'framer-motion';
import { useRealTimeMetrics } from '../../../lib/hooks/useRealTimeMetrics';
import { formatCurrency, formatPercent, formatNumber } from '../../../lib/utils/formatting';

export default function LiveKPICards({ accountId }) {
  const { metrics, loading, error } = useRealTimeMetrics(accountId, { duration: 3600000 }); // 1 hour
  
  if (loading) {
    return <LoadingState />;
  }
  
  if (error) {
    return <ErrorState error={error} />;
  }
  
  const kpis = [
    {
      id: 'series',
      title: 'Total Series',
      value: formatNumber(metrics?.cost?.currentCost?.data?.[0]?.total || 0),
      subtitle: 'Active metric series',
      icon: Icon.TYPE.INTERFACE__OPERATIONS__DRAG,
      trend: calculateTrend(metrics?.cost?.costTrend?.data),
      sparkline: true
    },
    {
      id: 'reduction',
      title: 'Reduction Rate',
      value: formatPercent(metrics?.cost?.reductionPercent || 0),
      subtitle: 'Series filtered out',
      icon: Icon.TYPE.INTERFACE__CHEVRON__CHEVRON_BOTTOM__WEIGHT_BOLD,
      trend: 'positive',
      sparkline: false
    },
    {
      id: 'savings',
      title: 'Current Savings',
      value: formatCurrency(metrics?.cost?.totalSavings || 0),
      subtitle: 'Per hour',
      icon: Icon.TYPE.INTERFACE__SIGN__DOLLAR,
      trend: 'positive',
      sparkline: true
    },
    {
      id: 'coverage',
      title: 'Critical Coverage',
      value: formatPercent(metrics?.coverage?.criticalCoverage?.data?.[0]?.coverage || 0),
      subtitle: 'Essential processes',
      icon: Icon.TYPE.INTERFACE__OPERATIONS__GROUP,
      trend: 'stable',
      sparkline: false
    }
  ];
  
  return (
    <div className="live-kpi-cards">
      <HeadingText type={HeadingText.TYPE.HEADING_4}>
        Live Metrics
      </HeadingText>
      
      <div className="kpi-grid">
        {kpis.map((kpi, index) => (
          <motion.div
            key={kpi.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="live-kpi-card">
              <CardBody>
                <Stack directionType={Stack.DIRECTION_TYPE.VERTICAL} gapType={Stack.GAP_TYPE.SMALL}>
                  <StackItem>
                    <div className="kpi-header">
                      <Icon type={kpi.icon} />
                      <span className="kpi-title">{kpi.title}</span>
                    </div>
                  </StackItem>
                  
                  <StackItem>
                    <div className={`kpi-value trend-${kpi.trend}`}>
                      {kpi.value}
                      {kpi.trend && <TrendIndicator trend={kpi.trend} />}
                    </div>
                  </StackItem>
                  
                  <StackItem>
                    <div className="kpi-subtitle">{kpi.subtitle}</div>
                  </StackItem>
                  
                  {kpi.sparkline && (
                    <StackItem>
                      <Sparkline 
                        accountId={accountId}
                        metric={kpi.id}
                      />
                    </StackItem>
                  )}
                </Stack>
              </CardBody>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="live-kpi-loading">
      <Spinner />
      <p>Loading live metrics...</p>
    </div>
  );
}

function ErrorState({ error }) {
  return (
    <Card>
      <CardBody>
        <div className="error-state">
          <Icon type={Icon.TYPE.INTERFACE__STATE__CRITICAL} />
          <p>Unable to load live metrics</p>
          <small>{error.message}</small>
        </div>
      </CardBody>
    </Card>
  );
}

function TrendIndicator({ trend }) {
  const icons = {
    positive: Icon.TYPE.INTERFACE__CHEVRON__CHEVRON_TOP__WEIGHT_BOLD,
    negative: Icon.TYPE.INTERFACE__CHEVRON__CHEVRON_BOTTOM__WEIGHT_BOLD,
    stable: Icon.TYPE.INTERFACE__SIGN__MINUS__V_ALTERNATE
  };
  
  return (
    <Icon 
      type={icons[trend] || icons.stable}
      className={`trend-icon trend-${trend}`}
    />
  );
}

function Sparkline({ accountId, metric }) {
  const queries = {
    series: `
      SELECT sum(nrdot_process_series_total) 
      FROM Metric 
      WHERE nrdot.version = '2.0.0'
      TIMESERIES 5 minutes 
      SINCE 1 hour ago
    `,
    savings: `
      SELECT average(nrdot_estimated_cost_per_hour) 
      FROM Metric 
      WHERE nrdot.version = '2.0.0'
      TIMESERIES 5 minutes 
      SINCE 1 hour ago
    `
  };
  
  return (
    <div className="kpi-sparkline">
      <LineChart
        accountId={accountId}
        query={queries[metric] || queries.series}
        style={{ height: '40px' }}
        fullWidth
        fullHeight
        chartType="area"
        disableTimePicker
        disableLegend
      />
    </div>
  );
}

function calculateTrend(data) {
  if (!data || data.length < 2) return 'stable';
  
  const recent = data.slice(-5);
  const older = data.slice(-10, -5);
  
  const recentAvg = recent.reduce((sum, d) => sum + d.cost, 0) / recent.length;
  const olderAvg = older.reduce((sum, d) => sum + d.cost, 0) / older.length;
  
  const change = ((recentAvg - olderAvg) / olderAvg) * 100;
  
  if (Math.abs(change) < 2) return 'stable';
  return change > 0 ? 'negative' : 'positive';
}