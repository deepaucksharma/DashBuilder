import React from 'react';
import { 
  Card,
  CardBody,
  HeadingText,
  Stack,
  StackItem,
  Icon,
  TableChart,
  LineChart,
  Badge
} from 'nr1';
import KPICard from './KPICard';

export default function AnomalyTileSet({ metrics, accountId, timeRange }) {
  const { 
    totalAnomalies = 42,
    criticalAnomalies = 8,
    resolvedToday = 15,
    anomalyRate = 0.02
  } = metrics || {};

  return (
    <Stack 
      directionType={Stack.DIRECTION_TYPE.VERTICAL}
      spacingType={Stack.SPACING_TYPE.LARGE}
      className="anomaly-tile-set"
    >
      <StackItem>
        <HeadingText type={HeadingText.TYPE.HEADING_3}>
          <Icon type={Icon.TYPE.INTERFACE__SIGN__EXCLAMATION__V_ALTERNATE} />
          Anomaly Detection
        </HeadingText>
      </StackItem>
      
      <StackItem>
        <KPICard
          title="Active Anomalies"
          value={totalAnomalies}
          status={criticalAnomalies > 10 ? 'critical' : 'warning'}
          tooltip="Total number of detected process anomalies"
          trend={totalAnomalies > 50 ? 'up' : 'stable'}
          trendValue={`${criticalAnomalies} critical`}
        >
          <div className="anomaly-stats">
            <div className="anomaly-stat">
              <Badge type={Badge.TYPE.CRITICAL}>
                {criticalAnomalies} Critical
              </Badge>
            </div>
            <div className="anomaly-stat">
              <Badge type={Badge.TYPE.SUCCESS}>
                {resolvedToday} Resolved Today
              </Badge>
            </div>
            <div className="anomaly-stat">
              <Badge type={Badge.TYPE.INFO}>
                {(anomalyRate * 100).toFixed(2)}% Rate
              </Badge>
            </div>
          </div>
        </KPICard>
      </StackItem>
      
      <StackItem>
        <Card>
          <CardBody>
            <HeadingText type={HeadingText.TYPE.HEADING_4}>
              Anomaly Trend (24h)
            </HeadingText>
            <LineChart
              accountId={accountId}
              query={`
                SELECT 
                  sum(nrdot_process_anomaly_detected) as 'Anomalies',
                  sum(nrdot_process_anomaly_critical) as 'Critical'
                FROM Metric 
                WHERE nrdot.version = '2.0.0'
                TIMESERIES 1 hour
                SINCE 24 hours ago
              `}
              fullWidth
              fullHeight
              style={{ height: '200px' }}
            />
          </CardBody>
        </Card>
      </StackItem>
      
      <StackItem>
        <Card>
          <CardBody>
            <HeadingText type={HeadingText.TYPE.HEADING_4}>
              Recent Anomalies
            </HeadingText>
            <TableChart
              accountId={accountId}
              query={`
                SELECT 
                  latest(hostname) as 'Host',
                  latest(process.executable.name) as 'Process',
                  latest(anomaly.type) as 'Type',
                  latest(anomaly.severity) as 'Severity'
                FROM ProcessSample 
                WHERE process.is_anomaly = 'true'
                  AND nrdot.version = '2.0.0'
                LIMIT 5
                SINCE 1 hour ago
              `}
              fullWidth
              fullHeight
              style={{ height: '200px' }}
            />
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
}