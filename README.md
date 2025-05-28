# DashBuilder

Comprehensive platform for New Relic dashboard management integrated with NRDOT v2 (New Relic Dot) process optimization. Delivers 70-85% telemetry cost reduction while maintaining 95%+ critical process coverage.

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/dashbuilder.git
cd dashbuilder

# Setup environment
cp .env.example .env
# Edit .env with your New Relic credentials

# Run setup wizard
npm run setup

# Start services
npm run start

# Run diagnostics
npm run diagnostics:all
```

For detailed setup, see [QUICKSTART.md](QUICKSTART.md)

## 📋 Features

### NRDOT v2 Process Optimization
- **Smart Filtering**: OS-aware process classification
- **Dynamic Profiles**: Automatic optimization based on cost/coverage
- **Real-time Monitoring**: Track savings and coverage metrics
- **Anomaly Detection**: EWMA-based unusual behavior identification

### Dashboard Management
- **Automated Creation**: Generate dashboards from templates
- **Schema Validation**: Ensure dashboard compatibility
- **Version Control**: Track dashboard changes
- **Bulk Operations**: Manage multiple dashboards

### Experiment Framework
- **A/B Testing**: Compare optimization profiles
- **Metric Collection**: Automated performance tracking
- **Results Analysis**: Visualize optimization impact
- **Reproducible**: Consistent experiment execution

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  OpenTelemetry  │────▶│   New Relic      │────▶│   Dashboards    │
│   Collector     │     │   OTLP/API       │     │   & Alerts      │
│                 │     │                  │     │                 │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │                                                  ▲
         │                                                  │
         ▼                                                  │
┌─────────────────┐     ┌──────────────────┐              │
│                 │     │                  │              │
│  Control Loop   │────▶│  Orchestrator    │──────────────┘
│  (Optimization) │     │  (Automation)    │
│                 │     │                  │
└─────────────────┘     └──────────────────┘
```

## 📊 Optimization Profiles

| Profile | Coverage | Cost Reduction | Use Case |
|---------|----------|----------------|----------|
| **baseline** | 100% | 0% | Full visibility, debugging |
| **conservative** | 95% | 30% | Production with high visibility |
| **balanced** | 90% | 60% | Recommended for most cases |
| **aggressive** | 80% | 85% | Maximum cost savings |

## 🛠️ Essential Commands

```bash
# Testing & Diagnostics
npm run test:connection    # Test New Relic endpoints
npm run test:metrics       # Test metric submission
npm run diagnostics:all    # Full system diagnostics

# Experiments
npm run experiment:quick   # 5-minute comparison test
npm run experiment:run -- --profile=balanced  # Run specific profile
npm run experiment:results # View results

# Operations
npm run control-loop      # Start optimization engine
npm run monitor          # Start dashboard orchestrator
npm run cli             # Interactive CLI

# Development
npm run nr1             # Start New Relic One app
npm run test           # Run test suite
```

## 📁 Project Structure

See [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) for detailed layout.

Key directories:
- `configs/` - Collector and profile configurations
- `scripts/` - Consolidated tools and utilities
- `experiments/` - Experiment framework
- `dashboards/` - Dashboard templates
- `docs/` - Comprehensive documentation

## 🔧 Configuration

### Environment Variables

```bash
# Required
NEW_RELIC_ACCOUNT_ID=your_account_id
NEW_RELIC_LICENSE_KEY=your_license_key
NEW_RELIC_USER_API_KEY=your_user_api_key
NEW_RELIC_QUERY_KEY=your_query_key

# Optional
NEW_RELIC_REGION=US        # US or EU
OPTIMIZATION_PROFILE=balanced
CONTROL_LOOP_INTERVAL=300000  # 5 minutes
LOG_LEVEL=info
```

### Docker Compose

The platform runs as a set of Docker services:
- **postgres**: Data persistence
- **redis**: Caching and state
- **otel-collector**: Telemetry collection
- **control-loop**: Optimization engine
- **dashbuilder**: API and UI

## 📚 Documentation

- [Documentation Index](docs/README.md)
- [Architecture Overview](docs/01-overview.md)
- [Configuration Guide](docs/02-configuration.md)
- [Production Setup](docs/production-setup.md)
- [Troubleshooting](docs/TROUBLESHOOTING_RUNBOOK.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## 📄 License

[MIT License](LICENSE)

## 🆘 Support

- [Documentation](docs/)
- [Issues](https://github.com/your-org/dashbuilder/issues)
- [Discussions](https://github.com/your-org/dashbuilder/discussions)

---

Built with ❤️ for the New Relic community