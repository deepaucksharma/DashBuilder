import React from 'react';
import { 
  Card,
  CardBody,
  HeadingText,
  LineChart,
  BillboardChart,
  AreaChart,
  Stack,
  StackItem,
  Badge,
  Icon,
  Tooltip
} from 'nr1';
import { motion } from 'framer-motion';
import { formatCurrency, formatPercent } from '../../../lib/utils/formatting';
import KPICard from './KPICard';

export default function CostTileSet({ metrics, accountId, timeRange }) {
  const { 
    currentCost, 
    projectedCost, 
    budget, 
    savingsRate,
    historicalData 
  } = metrics || {};

  const budgetStatus = getBudgetStatus(currentCost, budget);
  
  return (
    <Stack 
      directionType={Stack.DIRECTION_TYPE.VERTICAL}
      spacingType={Stack.SPACING_TYPE.LARGE}
      className="cost-tile-set"
    >
      <StackItem>
        <HeadingText type={HeadingText.TYPE.HEADING_3}>
          <Icon type={Icon.TYPE.INTERFACE__SIGN__DOLLAR} />
          Cost Optimization
        </HeadingText>
      </StackItem>
      
      <StackItem>
        <KPICard
          title="Current Cost"
          value={formatCurrency(currentCost)}
          unit="/hour"
          status={budgetStatus}
          tooltip="Real-time cost based on current series count and pricing"
          trend={savingsRate > 0 ? 'down' : 'stable'}
          trendValue={`${formatPercent(savingsRate)} savings`}
        >
          <CostGauge 
            current={currentCost} 
            budget={budget} 
            projected={projectedCost}
          />
        </KPICard>
      </StackItem>
      
      <StackItem>
        <Card>
          <CardBody>
            <HeadingText type={HeadingText.TYPE.HEADING_4}>
              Cost Trend (24h)
            </HeadingText>
            <AreaChart
              accountId={accountId}
              query={`
                SELECT 
                  average(nrdot_estimated_cost_per_hour) as 'Cost/Hour',
                  max(nrdot_estimated_cost_per_hour) as 'Peak Cost'
                FROM Metric 
                WHERE nrdot.version = '2.0.0'
                TIMESERIES 30 minutes
                SINCE 24 hours ago
              `}
              fullWidth
              fullHeight
              colors={['#11A600', '#FFA500']}
              style={{ height: '200px' }}
            />
          </CardBody>
        </Card>
      </StackItem>
      
      <StackItem>
        <Card className="budget-forecast-card">
          <CardBody>
            <Stack directionType={Stack.DIRECTION_TYPE.HORIZONTAL}>
              <StackItem grow>
                <div className="metric-label">Monthly Projection</div>
                <div className="metric-value">
                  {formatCurrency(projectedCost * 24 * 30)}
                </div>
              </StackItem>
              <StackItem>
                <BudgetHealthIndicator 
                  projected={projectedCost * 24 * 30}
                  budget={budget * 24 * 30}
                />
              </StackItem>
            </Stack>
          </CardBody>
        </Card>
      </StackItem>
    </Stack>
  );
}

function CostGauge({ current, budget, projected }) {
  const percentage = (current / budget) * 100;
  const projectedPercentage = (projected / budget) * 100;
  
  return (
    <div className="cost-gauge">
      <svg viewBox="0 0 200 120" className="gauge-svg">
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#e0e0e0"
          strokeWidth="20"
        />
        
        {/* Current cost arc */}
        <motion.path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={getGaugeColor(percentage)}
          strokeWidth="20"
          strokeDasharray={`${percentage * 1.57} 157`}
          initial={{ strokeDasharray: "0 157" }}
          animate={{ strokeDasharray: `${percentage * 1.57} 157` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        
        {/* Projected cost marker */}
        <motion.line
          x1="100"
          y1="100"
          x2="100"
          y2="20"
          stroke="#666"
          strokeWidth="2"
          strokeDasharray="5,5"
          initial={{ opacity: 0 }}
          animate={{ 
            opacity: 1,
            transform: `rotate(${projectedPercentage * 1.8 - 90}deg)`
          }}
          style={{ transformOrigin: '100px 100px' }}
        />
        
        {/* Center text */}
        <text x="100" y="90" textAnchor="middle" className="gauge-text">
          <tspan className="gauge-value">{percentage.toFixed(0)}%</tspan>
          <tspan x="100" dy="20" className="gauge-label">of budget</tspan>
        </text>
      </svg>
      
      <div className="gauge-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: getGaugeColor(percentage) }} />
          <span>Current: {formatCurrency(current)}/hr</span>
        </div>
        <div className="legend-item">
          <span className="legend-color legend-dashed" />
          <span>Projected: {formatCurrency(projected)}/hr</span>
        </div>
      </div>
    </div>
  );
}

function BudgetHealthIndicator({ projected, budget }) {
  const ratio = projected / budget;
  let status, icon, message;
  
  if (ratio < 0.8) {
    status = 'healthy';
    icon = Icon.TYPE.PROFILES__EVENTS__LIKE;
    message = 'Well under budget';
  } else if (ratio < 0.95) {
    status = 'warning';
    icon = Icon.TYPE.INTERFACE__SIGN__EXCLAMATION;
    message = 'Approaching budget';
  } else {
    status = 'critical';
    icon = Icon.TYPE.INTERFACE__SIGN__EXCLAMATION__V_ALTERNATE;
    message = 'Over budget risk';
  }
  
  return (
    <Tooltip text={message}>
      <Badge type={getBadgeType(status)}>
        <Icon type={icon} />
        {(ratio * 100).toFixed(0)}% of budget
      </Badge>
    </Tooltip>
  );
}

function getBudgetStatus(current, budget) {
  const ratio = current / budget;
  if (ratio < 0.8) return 'healthy';
  if (ratio < 0.95) return 'warning';
  return 'critical';
}

function getGaugeColor(percentage) {
  if (percentage < 80) return '#11A600';
  if (percentage < 95) return '#FFA500';
  return '#FF0000';
}

function getBadgeType(status) {
  switch (status) {
    case 'healthy': return Badge.TYPE.SUCCESS;
    case 'warning': return Badge.TYPE.WARNING;
    case 'critical': return Badge.TYPE.CRITICAL;
    default: return Badge.TYPE.NEUTRAL;
  }
}