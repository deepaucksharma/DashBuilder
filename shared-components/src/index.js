/**
 * DashBuilder Shared Components
 * Central export point for all shared components and utilities
 */

// Utils
export { NRQLValidator, nrqlValidator } from './utils/nrql-validator';

// Components
export { VisualQueryBuilder } from './components/visual-query-builder';
export { VisualQueryBuilderV2 } from './components/visual-query-builder-v2';
export { KPICard } from './components/kpi-card';

// Design System
export * from './design-system/tokens';
export * from './design-system/patterns';

// Styles (imported for side effects)
import './styles/visual-query-builder.css';

// Core components (to be added)
// export { AdaptiveWidget } from './visualization/adaptive-widget';
// export { ProgressiveLoader } from './performance/progressive-loader';
// export { SecurityLayer } from './security/security-layer';

// Version info
export const version = '0.3.0';