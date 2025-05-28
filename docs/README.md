# DashBuilder Documentation

## Quick Links

- [Getting Started](../README.md) - Installation and setup
- [Quick Start Guide](../QUICKSTART.md) - 5-minute setup
- [Project Status](../PROJECT-STATUS.md) - Current state and roadmap

## Core Documentation

### Architecture & Configuration
- [Overview](01-overview.md) - System architecture and NRDOT v2 concepts
- [Configuration](02-configuration.md) - Configuration options and profiles
- [API Reference](api-reference.md) - CLI and API documentation

### Operations
- [Control Loop](03-control-loop.md) - Automatic optimization engine
- [Monitoring](05-monitoring.md) - Dashboards, metrics, and alerts
- [Deployment](06-deployment.md) - Production deployment guide
- [Validation](07-validation.md) - Testing and validation procedures

### Guides
- [Production Setup](production-setup.md) - Production best practices
- [Migration Guide](migration-from-v1.md) - Upgrading from NRDOT v1
- [Troubleshooting](TROUBLESHOOTING_RUNBOOK.md) - Common issues and solutions
- [Docker Monitoring](DOCKER-MONITORING-GUIDE.md) - Container monitoring setup
- [Experiment Tracking](EXPERIMENT_TRACKING_GUIDE.md) - Running optimization experiments

### Advanced Topics
- [Cross-Platform Support](04-cross-platform.md) - Multi-OS deployment
- [Advanced Scenarios](ADVANCED_SCENARIOS.md) - Complex configurations
- [Production Update Plan](nrdot-v2-production-update-plan.md) - Rolling updates

## Quick Reference

### Key Features
- **Smart Process Filtering**: OS-aware classification of processes
- **Dynamic Optimization**: Automatic profile switching based on cost/coverage
- **EWMA Anomaly Detection**: Identifies unusual process behavior
- **Entity Enrichment**: Meaningful names for processes (`processname@hostname`)

### Optimization Profiles
- **baseline**: Full telemetry (100% coverage, highest cost)
- **conservative**: Minimal filtering (95% coverage, 30% cost reduction)
- **balanced**: Recommended (90% coverage, 60% cost reduction)
- **aggressive**: Maximum savings (80% coverage, 85% cost reduction)

### Essential Commands
```bash
# Check system status
npm run diagnostics:all

# Test connections
npm run test:connection

# Find metrics
node scripts/find-metrics.js system

# Run experiments
npm run experiment:quick
```

### Key Metrics
| Metric | Description | Type |
|--------|-------------|------|
| `nrdot.processes.kept` | Processes after filtering | Gauge |
| `nrdot.cost.estimate` | Estimated hourly cost | Gauge |
| `nrdot.coverage.percentage` | Process coverage % | Gauge |
| `nrdot.profile` | Current optimization profile | Attribute |

## Archive
Historical documentation and analyses are available in the [archive](archive/) directory.