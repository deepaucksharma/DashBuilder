import React from 'react';
import { Card, CardBody, Icon, Tooltip } from 'nr1';
import { motion } from 'framer-motion';
import classNames from 'classnames';

export default function KPICard({ 
  title, 
  value, 
  unit, 
  status, 
  tooltip, 
  trend, 
  trendValue, 
  children 
}) {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return Icon.TYPE.INTERFACE__CARET__CARET_TOP__WEIGHT_BOLD;
      case 'down':
        return Icon.TYPE.INTERFACE__CARET__CARET_BOTTOM__WEIGHT_BOLD;
      default:
        return Icon.TYPE.INTERFACE__SIGN__MINUS__V_ALTERNATE;
    }
  };

  return (
    <Card className={classNames('kpi-card', `status-${status}`)}>
      <CardBody>
        <div className="kpi-header">
          <h4>
            {title}
            {tooltip && (
              <Tooltip text={tooltip}>
                <Icon
                  type={Icon.TYPE.INTERFACE__INFO__INFO}
                  style={{ marginLeft: '8px', cursor: 'help' }}
                />
              </Tooltip>
            )}
          </h4>
          {trend && (
            <div className={classNames('kpi-trend', `trend-${trend}`)}>
              <Icon type={getTrendIcon()} />
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        
        <motion.div 
          className="kpi-value"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          {value}
          {unit && <span className="kpi-unit">{unit}</span>}
        </motion.div>
        
        {children && (
          <div className="kpi-content">
            {children}
          </div>
        )}
      </CardBody>
    </Card>
  );
}