import React from 'react';
import { 
  Card,
  CardBody,
  HeadingText,
  Stack,
  StackItem,
  Icon,
  BarChart,
  PieChart
} from 'nr1';
import KPICard from './KPICard';
import { formatPercent } from '../../../lib/utils/formatting';

export default function CoverageTileSet({ metrics, accountId, timeRange }) {
  const { 
    criticalCoverage = 98.5,
    totalProcesses = 2341,
    monitoredProcesses = 1872,
    droppedProcesses = 469
  } = metrics || {};

  return (
    <Stack 
      directionType={Stack.DIRECTION_TYPE.VERTICAL}
      spacingType={Stack.SPACING_TYPE.LARGE}
      className="coverage-tile-set"
    >
      <StackItem>
        <HeadingText type={HeadingText.TYPE.HEADING_3}>
          <Icon type={Icon.TYPE.INTERFACE__OPERATIONS__GROUP} />
          Coverage Analysis
        </HeadingText>
      </StackItem>
      
      <StackItem>
        <KPICard
          title="Critical Coverage"
          value={formatPercent(criticalCoverage)}
          status={criticalCoverage > 95 ? 'healthy' : 'warning'}
          tooltip="Percentage of critical processes being monitored"
          trend="stable"
          trendValue="No change"
        >
          <div className="coverage-breakdown">
            <div className="coverage-stat">
              <span className="stat-label">Total Processes:</span>
              <span className="stat-value">{totalProcesses.toLocaleString()}</span>
            </div>
            <div className="coverage-stat">
              <span className="stat-label">Monitored:</span>
              <span className="stat-value">{monitoredProcesses.toLocaleString()}</span>
            </div>
            <div className="coverage-stat">
              <span className="stat-label">Optimized Away:</span>
              <span className="stat-value">{droppedProcesses.toLocaleString()}</span>
            </div>
          </div>
        </KPICard>
      </StackItem>
      
      <StackItem>
        <Card>
          <CardBody>
            <HeadingText type={HeadingText.TYPE.HEADING_4}>
              Process Distribution
            </HeadingText>
            <PieChart
              accountId={accountId}
              query={`
                SELECT count(*) 
                FROM ProcessSample 
                WHERE nrdot.version = '2.0.0'
                FACET process.importance 
                SINCE 1 hour ago
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
              Top Processes by Series
            </HeadingText>
            <BarChart
              accountId={accountId}
              query={`
                SELECT sum(nrdot_process_series_kept) 
                FROM Metric 
                WHERE nrdot.version = '2.0.0'
                FACET process.executable.name 
                LIMIT 10 
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