# NRDOT v2 - New Relic Host Process Optimization

## Overview

NRDOT (New Relic Dynamic Optimization for Telemetry) v2 is a complete rewrite of the host process optimization solution, featuring a modern React-based UI with real-time control capabilities.

## Features

- **Executive Dashboard**: Real-time cost, coverage, and anomaly visualization
- **Control Console**: Change optimization profiles with immediate effect
- **Smart Targeting**: Apply profiles to specific hosts using NRQL, tags, or manual selection
- **Experiment Management**: A/B test optimization strategies safely
- **Cost Tracking**: See savings in real-time with projected monthly impact
- **Anomaly Detection**: Never miss critical issues with ML-powered detection

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Build the app: `npm run build`
4. Deploy: `./deploy-nrdot-nr1.sh`

## Development

```bash
# Start local development server
npm start

# Run tests
npm test

# Check bundle size
npm run bundle-size

# Validate NR1 app
npm run validate
```

## Architecture

The app consists of:

- **Overview Nerdlet**: Executive dashboard with KPI tiles
- **Console Nerdlet**: Control center for profile management
- **Control Loop API**: GraphQL integration with NerdStorage
- **Real-time Hooks**: Custom React hooks for live metrics
- **Smart Components**: Reusable UI components with animations

## Optimization Profiles

| Profile | Reduction | Coverage | Use Case |
|---------|-----------|----------|----------|
| Conservative | ~50% | 99% | Production systems |
| Balanced | ~70% | 95% | Default recommendation |
| Aggressive | ~85% | 90% | Cost-conscious teams |
| Emergency | ~95% | 80% | Budget constraints |

## Performance

- Bundle size: <150KB
- First paint: <250ms
- Real-time updates: 10s intervals
- WCAG 2.1 AA compliant

## Support

- GitHub Issues: [Report bugs](https://github.com/your-org/nrdot-nr1-app/issues)
- Documentation: [Full docs](./catalog/documentation.md)
- Email: support@your-org.com