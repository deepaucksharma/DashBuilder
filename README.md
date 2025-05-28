# DashBuilder with NRDOT v2 Process Optimization

A comprehensive platform for New Relic dashboard management with integrated NRDOT v2 process optimization, delivering 70-85% telemetry cost reduction while maintaining 95%+ critical process coverage.

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/deepaucksharma/DashBuilder.git
cd DashBuilder
./setup.sh

# Quick start with consolidated architecture
./quick-start.sh

# Or deploy directly with Docker Compose profiles
docker compose --profile full up -d
```

## 🔄 Consolidated Architecture

This project has been consolidated to improve maintainability and reduce duplication. Key improvements:

- **Single Docker Compose** with profiles for different deployment scenarios
- **Multi-stage Dockerfile** with targets for different components
- **Unified scripts** with consistent interfaces and shared utilities
- **Modular configuration** with base config and profile overlays

For details on the consolidated structure, see:
- [CONSOLIDATED_STRUCTURE.md](CONSOLIDATED_STRUCTURE.md) - Overview of consolidated structure
- [CONSOLIDATION.md](CONSOLIDATION.md) - Documentation of consolidation process
- [FILE_CONSOLIDATION_MAP.md](FILE_CONSOLIDATION_MAP.md) - Mapping between original and consolidated files

## 🚀 Key Features

- **Dashboard Management**: Validate, optimize, and manage New Relic dashboards
- **NRDOT v2 Integration**: Process metrics optimization with intelligent filtering
- **Cost Reduction**: 70-85% reduction in telemetry costs
- **Process Coverage**: Maintains 95%+ coverage of critical processes
- **CLI Tools**: Comprehensive command-line interface (nr-guardian)
- **Docker & Native**: Deploy with Docker Compose or systemd services
- **Auto-Validation**: Comprehensive validation with automatic fixes

## 📁 Streamlined Structure

```
DashBuilder/
├── setup.sh                     # 🎯 Main setup script (start here)
├── docker-compose.yml           # 🐳 Unified Docker deployment
├── scripts/                     # 🛠️ Organized operational scripts
│   ├── deployment/              #   📦 Deploy NRDOT (Docker/Native/K8s)
│   ├── validation/              #   ✅ Validate & test everything
│   ├── monitoring/              #   📊 Health checks & diagnostics
│   ├── utils/                   #   🔧 Utilities & helpers
│   ├── src/                     #   💻 CLI tool (nr-guardian)
│   └── INDEX.md                 #   📋 Complete scripts reference
├── distributions/nrdot-plus/    # 📦 NRDOT deployment package
├── automation/                  # 🤖 Browser automation workflows
├── orchestrator/                # 🎛️ Workflow orchestration
├── nrdot-nr1-app/              # 📱 New Relic One application
├── docs/                       # 📚 Comprehensive documentation
└── archive/                    # 🗄️ Historical files
```

## 🔧 Essential Commands

### Quick Operations
```bash
# Deploy NRDOT with different options
./scripts/deployment/deploy-nrdot.sh --mode=docker --profile=balanced
./scripts/deployment/deploy-nrdot.sh --mode=native --day=2 --profile=aggressive

# Validate deployment
./scripts/validation/validate-nrdot.sh              # Full validation
./scripts/validation/validate-nrdot.sh quick       # Essential checks
./scripts/validation/validate-nrdot.sh metrics     # Just metrics
```

### CLI Tool (nr-guardian)
```bash
# Dashboard operations
npm run cli -- dashboard list                       # List all dashboards
npm run cli -- dashboard export <guid>              # Export dashboard
npm run cli -- dashboard validate-widgets <guid>    # Validate queries

# NRQL operations
npm run cli -- nrql validate "SELECT count(*) FROM ProcessSample"
npm run cli -- nrql optimize "SELECT * FROM Metric"

# Schema operations  
npm run cli -- schema discover-event-types
npm run cli -- schema describe-event-type ProcessSample

# Data analysis
npm run cli -- ingest get-data-volume --days 7
npm run cli -- ingest get-cardinality ProcessSample processName
```

### Docker Profiles
```bash
# Different deployment options
docker-compose --profile dashbuilder up       # Just DashBuilder
docker-compose --profile nrdot up             # NRDOT system  
docker-compose --profile full up              # Everything + monitoring
docker-compose --profile experiments up       # A/B testing
```

## 📋 Installation Requirements

- **Node.js 18+** and npm
- **Docker & Docker Compose** (for Docker deployment)
- **New Relic account** with API access
- **Linux/MacOS/WSL** environment
- **Git**

## 🛠️ Configuration

### Environment Setup
Create `.env` file (or copy from `.env.example`):

```env
# Required
NEW_RELIC_API_KEY=your-user-api-key
NEW_RELIC_ACCOUNT_ID=your-account-id

# Optional
NEW_RELIC_LICENSE_KEY=your-license-key
NEW_RELIC_REGION=US
NRDOT_PROFILE=balanced
NRDOT_TARGET_COVERAGE=95
NRDOT_COST_REDUCTION_TARGET=70
```

### NRDOT Optimization Profiles
- **Conservative**: 30-40% cost reduction, 99% coverage
- **Balanced**: 60-70% cost reduction, 95% coverage _(recommended)_
- **Aggressive**: 75-85% cost reduction, 90% coverage

## 📊 NRDOT v2 Architecture

### Deployment Modes
- **Docker**: Container-based deployment with Docker Compose
- **Native**: Systemd services on Linux servers
- **Kubernetes**: Scalable cluster deployment
- **Hybrid**: Mix of Docker and native components

### Key Components
- **OpenTelemetry Collector**: Central metrics processing
- **Control Loop**: Automatic profile switching
- **Process Classification**: Smart categorization system
- **Cost Calculator**: Real-time cost estimation
- **Validation Engine**: Comprehensive health monitoring

### Data Flow
```
Processes → OTEL Collector → NRDOT Processor → New Relic
                ↓
          Control Loop ← Cost/Coverage Analysis
```

## 🚨 Troubleshooting

### Quick Diagnostics
```bash
# Run comprehensive validation
./scripts/validation/validate-nrdot.sh --verbose

# Check specific components
./scripts/validation/validate-nrdot.sh services
./scripts/validation/validate-nrdot.sh metrics
./scripts/validation/validate-nrdot.sh queries

# Health check
./scripts/monitoring/health-check-comprehensive.sh
```

### Common Issues

1. **Deployment Failed**
   ```bash
   # Check prerequisites and retry
   ./scripts/deployment/deploy-nrdot.sh --mode=docker --dry-run
   ```

2. **No Metrics in New Relic**
   ```bash
   # Validate metrics pipeline
   ./scripts/validation/validate-nrdot.sh metrics --verbose
   ```

3. **API Connection Issues**
   ```bash
   # Test API connectivity
   npm run cli -- schema discover-event-types --limit 1
   ```

4. **Docker Issues**
   ```bash
   # Check containers
   docker-compose ps
   docker-compose logs nrdot-complete
   ```

## 📚 Documentation

### Getting Started
- [Scripts Index](scripts/INDEX.md) - Complete scripts reference
- [Docker Guide](docker/README.md) - Docker deployment guide
- [Configuration Guide](docs/02-configuration.md) - Detailed setup

### Advanced Topics
- [Control Loop](docs/03-control-loop.md) - Automatic optimization
- [Cross-Platform](docs/04-cross-platform.md) - Multi-platform deployment
- [Monitoring](docs/05-monitoring.md) - Observability setup
- [API Reference](docs/api-reference.md) - Complete API documentation

### Operations
- [Deployment Guide](docs/06-deployment.md) - Production deployment
- [Troubleshooting](docs/troubleshooting.md) - Common issues
- [Validation Guide](docs/07-validation.md) - Testing procedures

## 🛠️ Development

### Adding New Features
1. Check [Scripts Index](scripts/INDEX.md) for existing functionality
2. Use organized script structure in `scripts/` subdirectories
3. Add validation tests to `scripts/validation/`
4. Update documentation

### Testing
```bash
# Run all validations
./scripts/validation/validate-nrdot.sh all

# Test specific components
cd scripts && npm test
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Follow existing code organization in `scripts/` directories
4. Add tests and documentation
5. Submit pull request

## 📄 License

This project is licensed under the Apache 2.0 License.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/deepaucksharma/DashBuilder/issues)
- **Documentation**: See `docs/` directory
- **Examples**: Check `scripts/examples/` and `automation/src/examples/`
- **Scripts**: See `scripts/INDEX.md` for complete reference

---

**Quick Links:**
- 🎯 [Start Here: setup.sh](./setup.sh)
- 📦 [Deploy: scripts/deployment/](./scripts/deployment/)
- ✅ [Validate: scripts/validation/](./scripts/validation/)
- 📋 [Scripts Reference: scripts/INDEX.md](./scripts/INDEX.md)
- 🐳 [Docker Guide: docker/README.md](./docker/README.md)

Built with ❤️ for New Relic users who want to optimize costs without compromising observability.