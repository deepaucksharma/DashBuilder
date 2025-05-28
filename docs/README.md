# DashBuilder Documentation

Welcome to the DashBuilder documentation. This guide covers everything you need to know about deploying, configuring, and using DashBuilder with NRDOT v2 optimization.

## 📚 Documentation Structure

### Core Documentation

- **[Architecture](./architecture.md)** - System design and component overview
- **[API Reference](./api-reference.md)** - Complete API documentation
- **[Troubleshooting Runbook](./TROUBLESHOOTING_RUNBOOK.md)** - Common issues and solutions

### Guides

- **[Experiment Tracking Guide](./EXPERIMENT_TRACKING_GUIDE.md)** - How to run and analyze experiments
- **[Docker Monitoring Guide](./DOCKER-MONITORING-GUIDE.md)** - Container metrics collection
- **[Production Setup](./production-setup.md)** - Production deployment guide
- **[Migration from v1](./migration-from-v1.md)** - Upgrading from NRDOT v1

### Advanced Topics

- **[Advanced Scenarios](./ADVANCED_SCENARIOS.md)** - Complex use cases and configurations
- **[NRDOT v2 Production Update Plan](./nrdot-v2-production-update-plan.md)** - Rollout strategy

## 🚀 Quick Navigation

### Getting Started
1. Read the [Architecture](./architecture.md) overview
2. Follow the [Quick Start Guide](../QUICKSTART.md)
3. Run your first [experiment](./EXPERIMENT_TRACKING_GUIDE.md)

### For DevOps Engineers
- [Production Setup](./production-setup.md)
- [Docker Monitoring](./DOCKER-MONITORING-GUIDE.md)
- [Troubleshooting](./TROUBLESHOOTING_RUNBOOK.md)

### For Developers
- [API Reference](./api-reference.md)
- [Architecture](./architecture.md)
- [Dashboard Generator](../dashboard-generator/README.md)

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

## 📂 Additional Resources

### Implementation Details
- **Dashboard Generator**: `/dashboard-generator/README.md`
- **CLI Documentation**: `/scripts/README.md`
- **Experiment Framework**: `/experiments/README.md`
- **NR1 App**: `/nrdot-nr1-app/README.md`

### DevStack Resources
- **NRDOT Deployment**: `/devstack/NRDOT-README.md`
- **Setup Guide**: `/devstack/SETUP_GUIDE.md`
- **Commands Cheatsheet**: `/devstack/COMMANDS_CHEATSHEET.md`

## 🔍 Finding Information

### By Topic

**NRDOT Optimization**
- Process filtering and optimization profiles
- Control loop configuration
- Cost reduction strategies

**Dashboard Management**
- Creating dashboards programmatically
- Template management
- Schema validation

**Experiments**
- Running comparison tests
- Analyzing results
- Optimizing profiles

**Deployment**
- Docker Compose setup
- Kubernetes deployment
- Environment configuration

### By Role

**System Administrator**
- Focus on production setup and monitoring guides
- Review troubleshooting runbook
- Check deployment configurations

**Developer**
- Start with architecture documentation
- Review API reference
- Explore CLI tools

**Data Analyst**
- Learn about experiment framework
- Understand metrics and dashboards
- Review optimization profiles

## 📝 Documentation Standards

All documentation follows these principles:
1. **Current State**: Documents reflect actual implementation
2. **Single Source**: Each concept documented once
3. **Clear Structure**: Logical organization and navigation
4. **Practical Examples**: Real-world usage examples
5. **Version Controlled**: Changes tracked in git

## 🆘 Need Help?

1. Check the [Troubleshooting Runbook](./TROUBLESHOOTING_RUNBOOK.md)
2. Review [Advanced Scenarios](./ADVANCED_SCENARIOS.md)
3. Search the codebase for examples
4. Open an issue on GitHub

## 📦 Archive

Historical documentation and deprecated approaches are preserved in:
- `/docs/archive/` - Old documentation versions
- `/docs/archive/architecture-explorations/` - Previous architectural designs

---

Last updated: November 2024