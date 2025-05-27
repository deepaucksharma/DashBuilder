# DashBuilder with NRDOT v2 Process Optimization

A comprehensive platform for New Relic dashboard management with integrated NRDOT v2 process optimization, delivering 70-85% telemetry cost reduction while maintaining 95%+ critical process coverage.

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/deepaucksharma/DashBuilder.git
cd DashBuilder
./setup.sh

# Deploy NRDOT optimization
npm run deploy:nrdot

# Validate setup
npm run validate:all
```

## 🎯 Key Features

- **Dashboard Management**: Validate, optimize, and manage New Relic dashboards
- **NRDOT v2 Integration**: Process metrics optimization with intelligent filtering
- **Cost Reduction**: 70-85% reduction in telemetry costs
- **Process Coverage**: Maintains 95%+ coverage of critical processes
- **CLI Tools**: Comprehensive command-line interface for all operations
- **Automation**: Browser automation for complex workflows

## 📁 Project Structure

```
DashBuilder/
├── scripts/              # CLI tool (nr-guardian)
├── orchestrator/         # Workflow automation
├── automation/           # Browser automation
├── distributions/        # NRDOT-Plus deployment packages
├── nrdot-nr1-app/       # New Relic One application
├── docs/                # Comprehensive documentation
└── setup.sh             # One-click setup script
```

## 🔧 Essential Commands

```bash
# CLI Operations
npm run cli -- dashboard list                    # List dashboards
npm run cli -- dashboard validate <guid>         # Validate dashboard
npm run cli -- nrql validate "SELECT..."        # Validate NRQL query
npm run cli -- entity search <name>             # Search entities

# NRDOT Operations  
npm run deploy:nrdot                            # Deploy NRDOT optimization
npm run cli -- ingest analyze-process-costs     # Analyze current costs
npm run cli -- schema get-process-intelligence  # Get process insights

# Monitoring
npm run monitor:start                           # Start monitoring
npm run validate:all                           # Validate entire setup
```

## 📋 Installation Requirements

- Node.js 16+ and npm
- New Relic account with API access
- Linux/MacOS/WSL environment
- Git

## 🛠️ Configuration

Create a `.env` file with your New Relic credentials:

```env
NEW_RELIC_API_KEY=your-user-api-key
NEW_RELIC_ACCOUNT_ID=your-account-id
NEW_RELIC_LICENSE_KEY=your-license-key
NEW_RELIC_REGION=US
```

## 📊 NRDOT v2 Features

### Process Classification
- Automatic categorization of database, web server, messaging, and compute processes
- 6-tier importance scoring system
- Dynamic threshold adjustments

### Optimization Profiles
- **Conservative**: Maximum visibility (50% reduction)
- **Balanced**: Recommended default (70% reduction)
- **Aggressive**: Maximum savings (85% reduction)
- **Emergency**: Crisis mode (95% reduction)

### Control Loop
- Automatic profile switching based on:
  - Cost targets
  - Coverage requirements
  - System load
  - Time of day

## 🚨 Troubleshooting

### Common Issues

1. **API Connection Failed**
   - Verify API key has NerdGraph permissions
   - Check account ID is correct
   - Ensure network connectivity

2. **No Cost Reduction**
   - Verify NRDOT is deployed to hosts
   - Check metrics are being collected
   - Review optimization profile settings

3. **Missing Critical Processes**
   - Switch to conservative profile
   - Add custom process classifications
   - Check process patterns match

## 📚 Documentation

- [Overview](docs/01-overview.md) - Introduction and concepts
- [Configuration](docs/02-configuration.md) - Setup and configuration
- [Control Loop](docs/03-control-loop.md) - Automatic optimization
- [Deployment](docs/06-deployment.md) - Production deployment guide
- [API Reference](docs/api-reference.md) - Complete API documentation
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## 📄 License

This project is licensed under the Apache 2.0 License.

## 🆘 Support

- GitHub Issues: [Report issues](https://github.com/deepaucksharma/DashBuilder/issues)
- Documentation: See `/docs` folder
- Examples: Check `/scripts/examples` folder

---

Built with ❤️ for New Relic users who want to optimize costs without compromising observability.