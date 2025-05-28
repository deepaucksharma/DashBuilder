import React, { useState, useEffect, useRef } from 'react';
import { tokens, spacing, getOperationalColor, transition } from '../design-system/tokens';
import { cardStyles, DisclosureLevel, performanceIndicator, zombieIndicator } from '../design-system/patterns';

// Performance monitoring
const measureRenderTime = (componentName, callback) => {
  const startTime = performance.now();
  callback();
  const endTime = performance.now();
  
  if (endTime - startTime > tokens.performance.renderTarget) {
    console.warn(`[Performance] ${componentName} render took ${endTime - startTime}ms`);
  }
};

export const KPICard = ({
  title,
  value,
  unit = '',
  subtitle = '',
  status = 'neutral',
  trend = null,
  trendValue = null,
  trendPeriod = '1h',
  sparklineData = null,
  threshold = null,
  onClick = null,
  disclosureLevel = DisclosureLevel.PRIMARY,
  isZombie = false,
  confidence = 1,
  lastUpdated = new Date(),
  error = null,
  loading = false,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [renderTime, setRenderTime] = useState(0);
  const renderStartRef = useRef(performance.now());

  useEffect(() => {
    const renderEnd = performance.now();
    const duration = renderEnd - renderStartRef.current;
    setRenderTime(duration);
    
    if (duration > tokens.performance.renderTarget) {
      console.warn(`[KPICard] Initial render took ${duration.toFixed(2)}ms`);
    }
  }, []);

  // Calculate data freshness
  const dataAge = Date.now() - new Date(lastUpdated).getTime();
  const isStale = dataAge > 60000; // Data older than 1 minute
  const isFresh = dataAge < 5000; // Data newer than 5 seconds

  // Get appropriate color based on status
  const getStatusColor = () => {
    if (isZombie) return tokens.colors.operational.zombie;
    if (error) return tokens.colors.status.error;
    if (status === 'critical') return tokens.colors.status.critical;
    if (status === 'warning') return tokens.colors.status.warning;
    if (status === 'success') return tokens.colors.status.success;
    return tokens.colors.ui.textSecondary;
  };

  // Format value based on type
  const formatValue = (val) => {
    if (loading) return '—';
    if (error) return 'Error';
    if (val === null || val === undefined) return 'N/A';
    
    // Handle different value types
    if (typeof val === 'number') {
      if (Math.abs(val) >= 1000000) {
        return `${(val / 1000000).toFixed(1)}M`;
      } else if (Math.abs(val) >= 1000) {
        return `${(val / 1000).toFixed(1)}K`;
      }
      return val.toFixed(val % 1 === 0 ? 0 : 2);
    }
    
    return val.toString();
  };

  const styles = {
    container: {
      ...cardStyles[disclosureLevel],
      cursor: onClick ? 'pointer' : 'default',
      position: 'relative',
      minHeight: disclosureLevel === DisclosureLevel.PRIMARY ? spacing(10) : 'auto',
      opacity: loading ? 0.7 : 1,
      transform: isHovered && onClick ? 'translateY(-2px)' : 'translateY(0)',
      transition: transition(['transform', 'box-shadow', 'opacity']),
    },

    header: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: spacing(1),
    },

    title: {
      fontSize: tokens.typography.fontSize.sm,
      fontWeight: tokens.typography.fontWeight.medium,
      color: tokens.colors.ui.textSecondary,
      lineHeight: tokens.typography.lineHeight.tight,
      marginBottom: spacing(0.5),
    },

    statusDot: {
      width: spacing(1),
      height: spacing(1),
      borderRadius: tokens.borderRadius.full,
      backgroundColor: getStatusColor(),
      flexShrink: 0,
      ...(status === 'critical' && {
        animation: 'pulse 2s infinite',
      }),
    },

    valueContainer: {
      display: 'flex',
      alignItems: 'baseline',
      gap: spacing(0.5),
      marginBottom: spacing(1),
    },

    value: {
      fontSize: disclosureLevel === DisclosureLevel.PRIMARY 
        ? tokens.typography.fontSize.xl 
        : tokens.typography.fontSize.xxl,
      fontWeight: tokens.typography.fontWeight.bold,
      color: error ? tokens.colors.status.error : tokens.colors.ui.text,
      lineHeight: 1,
      fontFeatureSettings: '"tnum"', // Tabular numbers for better alignment
    },

    unit: {
      fontSize: tokens.typography.fontSize.base,
      fontWeight: tokens.typography.fontWeight.normal,
      color: tokens.colors.ui.textSecondary,
    },

    subtitle: {
      fontSize: tokens.typography.fontSize.xs,
      color: tokens.colors.ui.textTertiary,
      marginTop: spacing(0.5),
    },

    trend: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing(0.5),
      fontSize: tokens.typography.fontSize.sm,
      marginTop: spacing(1),
    },

    trendIcon: {
      width: 0,
      height: 0,
      borderStyle: 'solid',
      ...(trend === 'up' && {
        borderLeftWidth: spacing(0.5),
        borderRightWidth: spacing(0.5),
        borderBottomWidth: spacing(1),
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: tokens.colors.status.success,
      }),
      ...(trend === 'down' && {
        borderLeftWidth: spacing(0.5),
        borderRightWidth: spacing(0.5),
        borderTopWidth: spacing(1),
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: tokens.colors.status.error,
      }),
    },

    sparkline: {
      marginTop: spacing(2),
      height: spacing(6),
      opacity: 0.8,
    },

    freshIndicator: {
      position: 'absolute',
      top: spacing(1),
      right: spacing(1),
      width: spacing(0.5),
      height: spacing(0.5),
      borderRadius: tokens.borderRadius.full,
      backgroundColor: isFresh ? tokens.colors.status.success : 
                       isStale ? tokens.colors.status.warning : 
                       tokens.colors.ui.border,
    },

    confidenceBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: tokens.colors.ui.border,
      borderBottomLeftRadius: tokens.borderRadius.base,
      borderBottomRightRadius: tokens.borderRadius.base,
      overflow: 'hidden',
    },

    confidenceFill: {
      height: '100%',
      width: `${confidence * 100}%`,
      backgroundColor: confidence > 0.8 ? tokens.colors.status.success :
                       confidence > 0.5 ? tokens.colors.status.warning :
                       tokens.colors.status.error,
      transition: transition('width'),
    },

    zombieOverlay: isZombie ? zombieIndicator : {},

    performanceDebug: {
      position: 'absolute',
      bottom: spacing(0.5),
      right: spacing(0.5),
      fontSize: '10px',
      color: tokens.colors.ui.textTertiary,
      fontFamily: tokens.typography.fontFamily.mono,
      opacity: 0.5,
    },
  };

  // Render sparkline if available
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;

    const width = 100;
    const height = 32;
    const max = Math.max(...sparklineData.map(d => d.value));
    const min = Math.min(...sparklineData.map(d => d.value));
    const range = max - min || 1;

    const points = sparklineData.map((d, i) => {
      const x = (i / (sparklineData.length - 1)) * width;
      const y = height - ((d.value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg 
        width={width} 
        height={height} 
        style={styles.sparkline}
        aria-label={`Trend line showing ${trend || 'stable'} trend`}
      >
        <polyline
          points={points}
          fill="none"
          stroke={getStatusColor()}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div
      className={`kpi-card ${className} ${status}`}
      style={styles.container}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role={onClick ? 'button' : 'article'}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${title}: ${formatValue(value)}${unit}`}
    >
      {/* Data freshness indicator */}
      <div style={styles.freshIndicator} aria-hidden="true" />

      {/* Header */}
      <div style={styles.header}>
        <h4 style={styles.title}>{title}</h4>
        {disclosureLevel !== DisclosureLevel.PRIMARY && (
          <div style={styles.statusDot} aria-label={`Status: ${status}`} />
        )}
      </div>

      {/* Value */}
      <div style={styles.valueContainer}>
        <span style={styles.value}>{formatValue(value)}</span>
        {unit && <span style={styles.unit}>{unit}</span>}
      </div>

      {/* Subtitle */}
      {subtitle && <div style={styles.subtitle}>{subtitle}</div>}

      {/* Zombie indicator */}
      {isZombie && (
        <div style={styles.zombieOverlay}>
          <span className="zombie-icon">💀</span>
          <span>ZOMBIE PROCESS</span>
        </div>
      )}

      {/* Secondary level content */}
      {disclosureLevel !== DisclosureLevel.PRIMARY && (
        <>
          {/* Trend */}
          {trend && trendValue && (
            <div style={styles.trend}>
              <div style={styles.trendIcon} aria-hidden="true" />
              <span style={{ color: trend === 'up' ? tokens.colors.status.success : tokens.colors.status.error }}>
                {trendValue}
              </span>
              <span style={{ color: tokens.colors.ui.textTertiary }}>
                vs {trendPeriod}
              </span>
            </div>
          )}

          {/* Sparkline */}
          {sparklineData && renderSparkline()}

          {/* Threshold indicator */}
          {threshold && (
            <div style={performanceIndicator(value, threshold)}>
              <div className="perf-bar">
                <div className="perf-fill" />
              </div>
              <span className="perf-value">{value}/{threshold}</span>
            </div>
          )}
        </>
      )}

      {/* Detailed level content */}
      {disclosureLevel === DisclosureLevel.DETAILED && (
        <>
          {/* Error details */}
          {error && (
            <div style={styles.error}>
              <div className="error-message">{error}</div>
              <button className="error-action" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          )}

          {/* Last updated */}
          <div style={styles.subtitle}>
            Last updated: {new Date(lastUpdated).toLocaleTimeString()}
          </div>
        </>
      )}

      {/* Confidence indicator */}
      {confidence < 1 && (
        <div style={styles.confidenceBar} aria-label={`Confidence: ${(confidence * 100).toFixed(0)}%`}>
          <div style={styles.confidenceFill} />
        </div>
      )}

      {/* Performance debug (only in development) */}
      {process.env.NODE_ENV === 'development' && renderTime > tokens.performance.renderTarget && (
        <div style={styles.performanceDebug}>
          {renderTime.toFixed(0)}ms
        </div>
      )}
    </div>
  );
};