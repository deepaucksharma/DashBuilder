/**
 * Design Patterns - Reusable visual patterns following our principles
 */

import { tokens, spacing, transition, focusRing } from './tokens';

// Progressive disclosure levels
export const DisclosureLevel = {
  PRIMARY: 'primary',    // 2 seconds to understand
  SECONDARY: 'secondary', // 30 seconds to analyze
  DETAILED: 'detailed',   // 2 minutes to investigate
};

// Card patterns with progressive disclosure
export const cardStyles = {
  [DisclosureLevel.PRIMARY]: {
    padding: spacing(2),
    borderRadius: tokens.borderRadius.base,
    backgroundColor: tokens.colors.ui.surface,
    border: `1px solid ${tokens.colors.ui.border}`,
    boxShadow: tokens.shadows.sm,
    transition: transition(['box-shadow', 'border-color']),
    
    '&:hover': {
      boxShadow: tokens.shadows.base,
      borderColor: tokens.colors.ui.borderHover,
    },
    
    // Only show essential info
    '.card-title': {
      fontSize: tokens.typography.fontSize.base,
      fontWeight: tokens.typography.fontWeight.semibold,
      marginBottom: spacing(1),
    },
    
    '.card-value': {
      fontSize: tokens.typography.fontSize.lg,
      fontWeight: tokens.typography.fontWeight.bold,
      color: tokens.colors.ui.text,
    },
  },
  
  [DisclosureLevel.SECONDARY]: {
    // Extends primary
    '.card-trend': {
      display: 'flex',
      alignItems: 'center',
      marginTop: spacing(1),
      fontSize: tokens.typography.fontSize.sm,
      color: tokens.colors.ui.textSecondary,
    },
    
    '.card-chart': {
      marginTop: spacing(2),
      height: spacing(8),
    },
  },
  
  [DisclosureLevel.DETAILED]: {
    // Extends secondary
    padding: spacing(3),
    
    '.card-details': {
      marginTop: spacing(2),
      paddingTop: spacing(2),
      borderTop: `1px solid ${tokens.colors.ui.border}`,
    },
    
    '.card-actions': {
      display: 'flex',
      gap: spacing(1),
      marginTop: spacing(2),
    },
  },
};

// Status indicators following operational truth
export const statusIndicator = (status) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: spacing(0.5),
  
  '.status-dot': {
    width: spacing(1),
    height: spacing(1),
    borderRadius: tokens.borderRadius.full,
    backgroundColor: tokens.colors.status[status],
    
    // Pulse animation for critical states
    ...(status === 'critical' && {
      animation: 'pulse 2s infinite',
    }),
  },
  
  '.status-text': {
    fontSize: tokens.typography.fontSize.sm,
    fontWeight: tokens.typography.fontWeight.medium,
    color: tokens.colors.status[status],
  },
  
  '@keyframes pulse': {
    '0%, 100%': {
      opacity: 1,
    },
    '50%': {
      opacity: 0.5,
    },
  },
});

// Data visualization patterns
export const chartDefaults = {
  // Grid and axes
  grid: {
    stroke: tokens.colors.ui.border,
    strokeDasharray: '3 3',
  },
  
  axis: {
    stroke: tokens.colors.ui.border,
    fontSize: tokens.typography.fontSize.xs,
    fontFamily: tokens.typography.fontFamily.sans,
    fill: tokens.colors.ui.textTertiary,
  },
  
  // Tooltips
  tooltip: {
    backgroundColor: tokens.colors.ui.text,
    color: tokens.colors.ui.textInverse,
    padding: spacing(1),
    borderRadius: tokens.borderRadius.sm,
    fontSize: tokens.typography.fontSize.sm,
    boxShadow: tokens.shadows.lg,
  },
  
  // Animation
  animation: {
    duration: tokens.timing.normal,
    easing: 'ease-out',
  },
};

// Interactive elements
export const buttonStyles = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(0.5),
    padding: `${spacing(1)}px ${spacing(2)}px`,
    borderRadius: tokens.borderRadius.base,
    fontSize: tokens.typography.fontSize.base,
    fontWeight: tokens.typography.fontWeight.medium,
    fontFamily: tokens.typography.fontFamily.sans,
    lineHeight: tokens.typography.lineHeight.tight,
    cursor: 'pointer',
    transition: transition(['background-color', 'border-color', 'color', 'box-shadow']),
    border: '1px solid transparent',
    
    '&:focus': focusRing(),
    
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
  
  variants: {
    primary: {
      backgroundColor: tokens.colors.ui.focus,
      color: tokens.colors.ui.textInverse,
      
      '&:hover:not(:disabled)': {
        backgroundColor: '#106EBE',
      },
    },
    
    secondary: {
      backgroundColor: tokens.colors.ui.surface,
      color: tokens.colors.ui.text,
      border: `1px solid ${tokens.colors.ui.border}`,
      
      '&:hover:not(:disabled)': {
        backgroundColor: tokens.colors.ui.surfaceHover,
        borderColor: tokens.colors.ui.borderHover,
      },
    },
    
    danger: {
      backgroundColor: tokens.colors.status.error,
      color: tokens.colors.ui.textInverse,
      
      '&:hover:not(:disabled)': {
        backgroundColor: '#CC4B4B',
      },
    },
  },
  
  sizes: {
    sm: {
      padding: `${spacing(0.5)}px ${spacing(1.5)}px`,
      fontSize: tokens.typography.fontSize.sm,
    },
    md: {
      // base size
    },
    lg: {
      padding: `${spacing(1.5)}px ${spacing(3)}px`,
      fontSize: tokens.typography.fontSize.md,
    },
  },
};

// Loading states
export const loadingPatterns = {
  skeleton: {
    backgroundColor: tokens.colors.ui.backgroundAlt,
    borderRadius: tokens.borderRadius.base,
    position: 'relative',
    overflow: 'hidden',
    
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: '-100%',
      width: '100%',
      height: '100%',
      background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)`,
      animation: 'shimmer 2s infinite',
    },
    
    '@keyframes shimmer': {
      to: {
        left: '100%',
      },
    },
  },
  
  spinner: {
    display: 'inline-block',
    width: spacing(2),
    height: spacing(2),
    border: `2px solid ${tokens.colors.ui.border}`,
    borderTopColor: tokens.colors.ui.focus,
    borderRadius: tokens.borderRadius.full,
    animation: 'spin 1s linear infinite',
    
    '@keyframes spin': {
      to: {
        transform: 'rotate(360deg)',
      },
    },
  },
};

// Error states
export const errorPatterns = {
  inline: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing(1),
    padding: spacing(2),
    backgroundColor: '#FEF2F2',
    border: `1px solid #FEE2E2`,
    borderRadius: tokens.borderRadius.base,
    
    '.error-icon': {
      flexShrink: 0,
      color: tokens.colors.status.error,
    },
    
    '.error-message': {
      fontSize: tokens.typography.fontSize.sm,
      color: tokens.colors.status.error,
    },
    
    '.error-action': {
      marginTop: spacing(1),
      fontSize: tokens.typography.fontSize.sm,
      color: tokens.colors.ui.focus,
      textDecoration: 'underline',
      cursor: 'pointer',
    },
  },
  
  fullPage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    padding: spacing(4),
    textAlign: 'center',
    
    '.error-icon': {
      fontSize: spacing(6),
      color: tokens.colors.status.error,
      marginBottom: spacing(2),
    },
    
    '.error-title': {
      fontSize: tokens.typography.fontSize.lg,
      fontWeight: tokens.typography.fontWeight.semibold,
      marginBottom: spacing(1),
    },
    
    '.error-description': {
      fontSize: tokens.typography.fontSize.base,
      color: tokens.colors.ui.textSecondary,
      marginBottom: spacing(3),
      maxWidth: '400px',
    },
  },
};

// Performance indicators
export const performanceIndicator = (value, threshold) => {
  const status = value < threshold * 0.5 ? 'success' :
                 value < threshold * 0.8 ? 'warning' : 'critical';
  
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing(0.5),
    
    '.perf-bar': {
      width: spacing(8),
      height: spacing(0.5),
      backgroundColor: tokens.colors.ui.border,
      borderRadius: tokens.borderRadius.full,
      overflow: 'hidden',
      
      '.perf-fill': {
        height: '100%',
        width: `${Math.min((value / threshold) * 100, 100)}%`,
        backgroundColor: tokens.colors.status[status],
        transition: transition('width'),
      },
    },
    
    '.perf-value': {
      fontSize: tokens.typography.fontSize.xs,
      fontFamily: tokens.typography.fontFamily.mono,
      color: tokens.colors.ui.textSecondary,
    },
  };
};

// Zombie process indicator (following operational truth principle)
export const zombieIndicator = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: spacing(0.5),
  padding: `${spacing(0.5)}px ${spacing(1)}px`,
  backgroundColor: tokens.colors.operational.zombie,
  color: tokens.colors.ui.textInverse,
  borderRadius: tokens.borderRadius.sm,
  fontSize: tokens.typography.fontSize.xs,
  fontWeight: tokens.typography.fontWeight.bold,
  
  '.zombie-icon': {
    fontSize: tokens.typography.fontSize.sm,
  },
  
  // Make it very obvious - operational truth
  animation: 'zombie-pulse 3s infinite',
  
  '@keyframes zombie-pulse': {
    '0%, 100%': {
      backgroundColor: tokens.colors.operational.zombie,
    },
    '50%': {
      backgroundColor: '#660000',
    },
  },
};