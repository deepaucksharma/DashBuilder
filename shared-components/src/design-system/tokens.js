/**
 * Design System Tokens
 * Based on mathematical ratios and operational clarity principles
 */

// Base unit for spacing (8px grid system)
const BASE_UNIT = 8;

// Typography scale using perfect fourth ratio (1.333)
const TYPE_RATIO = 1.333;
const BASE_FONT_SIZE = 14;

// Modular scale for consistent sizing
const modularScale = (n) => Math.round(BASE_FONT_SIZE * Math.pow(TYPE_RATIO, n));

export const tokens = {
  // Spacing - all based on 8px grid
  spacing: {
    unit: BASE_UNIT,
    xs: BASE_UNIT * 0.5,    // 4px
    sm: BASE_UNIT * 1,      // 8px
    md: BASE_UNIT * 2,      // 16px
    lg: BASE_UNIT * 3,      // 24px
    xl: BASE_UNIT * 4,      // 32px
    xxl: BASE_UNIT * 6,     // 48px
    xxxl: BASE_UNIT * 8,    // 64px
  },

  // Typography - mathematical scale
  typography: {
    fontFamily: {
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
    },
    fontSize: {
      xs: modularScale(-2),    // 10px
      sm: modularScale(-1),    // 11px
      base: BASE_FONT_SIZE,    // 14px
      md: modularScale(1),     // 19px
      lg: modularScale(2),     // 25px
      xl: modularScale(3),     // 33px
      xxl: modularScale(4),    // 44px
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  // Colors - semantic and operational
  colors: {
    // Status colors - high contrast for 3am clarity
    status: {
      critical: '#D62728',      // Pure red - immediate action required
      error: '#E45B5B',         // Softer red - errors
      warning: '#FF7F0E',       // Orange - attention needed
      success: '#2CA02C',       // Green - all good
      info: '#1F77B4',          // Blue - informational
      neutral: '#7F7F7F',       // Gray - inactive/disabled
    },
    
    // Operational states
    operational: {
      healthy: '#2CA02C',
      degraded: '#FF7F0E',
      unhealthy: '#D62728',
      zombie: '#8B0000',        // Dark red for zombie processes
      unknown: '#7F7F7F',
    },

    // UI colors
    ui: {
      background: '#FFFFFF',
      backgroundAlt: '#F7F8F8',
      surface: '#FFFFFF',
      surfaceHover: '#F4F5F5',
      border: '#E3E4E4',
      borderHover: '#D5D7D7',
      text: '#2A2B2B',
      textSecondary: '#5A5C5C',
      textTertiary: '#8E9090',
      textInverse: '#FFFFFF',
      focus: '#0078D4',
      focusRing: 'rgba(0, 120, 212, 0.3)',
    },

    // Data visualization - perceptually uniform
    dataviz: {
      primary: ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD'],
      extended: ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD', 
                 '#8C564B', '#E377C2', '#7F7F7F', '#BCBD22', '#17BECF'],
      sequential: {
        blue: ['#EFF3FF', '#BDD7E7', '#6BAED6', '#3182BD', '#08519C'],
        green: ['#EDF8E9', '#BAE4B3', '#74C476', '#31A354', '#006D2C'],
        red: ['#FEE5D9', '#FCAE91', '#FB6A4A', '#DE2D26', '#A50F15'],
      },
    },
  },

  // Timing - for animations and transitions
  timing: {
    instant: 0,
    fast: 100,          // Interactions
    normal: 200,        // Transitions
    slow: 300,          // Complex animations
    crawl: 500,         // Page transitions
  },

  // Border radius - consistent curves
  borderRadius: {
    none: 0,
    sm: 2,
    base: 4,
    md: 6,
    lg: 8,
    xl: 12,
    full: 9999,
  },

  // Shadows - elevation system
  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },

  // Z-index scale - logical layering
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    modal: 1200,
    popover: 1300,
    tooltip: 1400,
    notification: 1500,
  },

  // Breakpoints - responsive design
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    xxl: 1536,
  },

  // Performance thresholds
  performance: {
    renderTarget: 16,      // 60fps
    interactionTarget: 100, // 100ms response
    loadTarget: 1000,      // 1s initial load
  },
};

// Utility functions for consistent application
export const spacing = (multiplier = 1) => tokens.spacing.unit * multiplier;

export const fontSize = (scale = 0) => modularScale(scale);

export const transition = (properties = 'all', duration = tokens.timing.normal) => 
  `${properties} ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;

export const focusRing = () => ({
  outline: 'none',
  boxShadow: `0 0 0 3px ${tokens.colors.ui.focusRing}`,
});

export const truncate = () => ({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const visuallyHidden = () => ({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
});

// Semantic color helpers
export const getStatusColor = (status) => {
  const statusMap = {
    critical: tokens.colors.status.critical,
    error: tokens.colors.status.error,
    warning: tokens.colors.status.warning,
    success: tokens.colors.status.success,
    info: tokens.colors.status.info,
    neutral: tokens.colors.status.neutral,
  };
  return statusMap[status] || tokens.colors.status.neutral;
};

export const getOperationalColor = (health) => {
  if (health >= 90) return tokens.colors.operational.healthy;
  if (health >= 70) return tokens.colors.operational.degraded;
  if (health >= 50) return tokens.colors.operational.unhealthy;
  if (health === 0) return tokens.colors.operational.zombie;
  return tokens.colors.operational.unknown;
};