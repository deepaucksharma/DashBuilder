# NRDOT v2 Documentation

## Quick Start

NRDOT v2 (New Relic Dot) is a process optimization system that reduces telemetry costs by 70-85% while maintaining 95%+ critical process coverage.

### Installation

```bash
# Quick install
curl -Ls https://raw.githubusercontent.com/your-org/dashbuilder/main/distributions/nrdot-plus/install.sh | sudo bash

# Manual install
cd distributions/nrdot-plus
sudo ./install.sh
```

### Key Features

- **Smart Process Filtering**: OS-aware classification of processes
- **Dynamic Optimization**: Automatic profile switching based on cost/coverage
- **EWMA Anomaly Detection**: Identifies unusual process behavior
- **Entity Enrichment**: Meaningful names for processes (`processname@hostname`)

## Documentation Structure

### Core Documentation

- [Overview](01-overview.md) - System architecture and concepts
- [Configuration](02-configuration.md) - Configuration guide
- [Control Loop](03-control-loop.md) - Automatic optimization logic
- [Monitoring](05-monitoring.md) - Dashboards and alerts
- [Deployment](06-deployment.md) - Production deployment guide

### Operational Guides

- [Production Setup](production-setup.md) - Complete production configuration
- [Troubleshooting Guide](troubleshooting-guide.md) - Common issues and solutions
- [Validation](07-validation.md) - Testing and validation procedures

### Advanced Topics

- [OpenTelemetry Pipeline Deep Dive](operational-analysis/opentelemetry-pipeline-deepdive.md)
- [NRDOT v2 Operational Reality](operational-analysis/nrdot-v2-operational-reality.md)
- [Dashboard Queries](NRDOT-DASHBOARD-QUERIES.md) - NRQL query examples

### Implementation

- [Implementation Roadmap](IMPLEMENTATION_ROADMAP.md) - Development phases
- [API Reference](api-reference.md) - CLI and API documentation
- [Migration from v1](migration-from-v1.md) - Upgrade guide

## Quick Reference

### Key Metrics

| Metric | Description | Format |
|--------|-------------|---------|
| `nrdot_process_series_kept` | Series after filtering | Prometheus |
| `nrdot_estimated_cost_per_hour` | Hourly cost estimate | Prometheus |
| `nrdot.version` | NRDOT version | NRQL attribute |
| `entity.name` | Process entity name | NRQL attribute |

### Profiles

- **conservative**: Maximum visibility, minimal filtering
- **balanced**: Recommended for most use cases
- **aggressive**: Maximum cost reduction

### Control Commands

```bash
# Check status
nrdot-plus-ctl status

# Change profile
nrdot-plus-ctl profile set balanced

# View metrics
nrdot-plus-ctl metrics

# Force control loop evaluation
nrdot-plus-ctl control force-check
```