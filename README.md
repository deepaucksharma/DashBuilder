# DashBuilder - Complete New Relic Dashboard Solution

A comprehensive, production-ready solution for creating, managing, and optimizing New Relic dashboards with automated workflows, browser automation, and monitoring capabilities.

## 🚀 Quick Start

```bash
# Clone and install
git clone <repository>
cd DashBuilder
npm run install:all

# Run interactive setup
npm run setup init

# Create your first dashboard
npm run workflow:create-dashboard
```

## 📋 Features

### Core Components

1. **CLI Tool** (`scripts/`) - Command-line interface for New Relic operations
2. **Browser Automation** (`automation/`) - Automated key management and verification
3. **NR1 Application** (`nrdot-nr1-app/`) - Native New Relic One app with live monitoring
4. **Orchestrator** (`orchestrator/`) - Workflow automation and monitoring

### Key Capabilities

- 📊 **Dashboard Management** - Create, update, delete, and migrate dashboards
- 🔑 **Automated Setup** - Browser automation for API key creation
- 🔄 **Migration Tools** - Move dashboards between accounts
- 📈 **Real-time Monitoring** - Health checks and performance tracking
- 🚨 **Alert Integration** - Proactive issue detection
- 🔧 **Error Recovery** - Automatic retry and recovery mechanisms

## 🏗️ Architecture

```
DashBuilder/
├── orchestrator/          # Main control plane
│   ├── setup.js          # Interactive setup wizard
│   ├── monitor.js        # Health monitoring
│   ├── workflows/        # Automated workflows
│   └── lib/             # Core libraries
├── scripts/              # CLI tool
│   ├── src/             # Source code
│   └── examples/        # Sample dashboards
├── automation/          # Browser automation
│   ├── src/            # Puppeteer scripts
│   └── examples/       # Usage examples
├── nrdot-nr1-app/      # New Relic One app
│   ├── nerdlets/       # UI components
│   └── visualizations/ # Custom visualizations
└── docs/               # Documentation
```

## 🔧 Installation & Setup

### Prerequisites

- Node.js 16+ and npm
- New Relic account with API access
- Chrome/Chromium (for browser automation)

### Automated Setup

```bash
# Run the interactive setup wizard
npm run setup init

# This will:
# 1. Install all dependencies
# 2. Configure API credentials
# 3. Set up browser automation
# 4. Create sample dashboards
# 5. Validate the installation
```

### Manual Setup

```bash
# Install dependencies
npm run install:all

# Configure environment
cp scripts/.env.example scripts/.env
cp automation/.env.example automation/.env

# Edit .env files with your credentials
```

## 📚 Usage Guide

### Dashboard Operations

```bash
# List dashboards
npm run cli -- dashboard list

# Create dashboard
npm run cli -- dashboard create --file examples/sample-dashboard.json

# Update dashboard
npm run cli -- dashboard update --id <dashboard-id> --file updated.json

# Delete dashboard
npm run cli -- dashboard delete --id <dashboard-id>
```

### Workflow Automation

```bash
# Create dashboard with wizard
npm run workflow:create-dashboard

# Migrate dashboards between accounts
npm run workflow:migrate-dashboard

# Optimize dashboard performance
npm run workflow:optimize-dashboard
```

### Browser Automation

```bash
# Create API keys automatically
cd automation && npm run create-keys

# Verify dashboard in browser
cd automation && npm run verify-dashboard

# Full automated setup
cd automation && npm run full-setup
```

### Monitoring

```bash
# Start continuous monitoring
npm run monitor

# Run validation checks
npm run validate

# Generate health report
npm run monitor -- --report
```

## 🛠️ Advanced Features

### Custom Workflows

Create custom workflows in `orchestrator/workflows/`:

```javascript
import { BaseWorkflow } from '../lib/base-workflow.js';

export class CustomWorkflow extends BaseWorkflow {
  async run(options) {
    // Your workflow logic
  }
}
```

### Error Recovery

The solution includes automatic error recovery:

- API rate limit handling with backoff
- Network error retries
- Authentication failure recovery
- File system error handling

### Integration Points

- **Slack Alerts** - Configure in monitoring settings
- **Email Reports** - Daily summaries
- **CI/CD** - GitHub Actions ready
- **Custom Plugins** - Extensible architecture

## 📊 Dashboard Templates

Pre-built templates in `docs/templates/`:

- Application Performance Monitoring
- Infrastructure Health
- Browser Performance
- Custom Business Metrics

## 🔍 Troubleshooting

### Common Issues

1. **Authentication Errors**
   ```bash
   npm run setup init  # Re-run setup
   ```

2. **API Rate Limits**
   - Built-in retry logic handles this automatically
   - Monitor usage with `npm run monitor`

3. **Browser Automation Issues**
   ```bash
   cd automation
   HEADLESS=false npm run create-keys  # Debug visually
   ```

### Debug Mode

```bash
DEBUG=true npm run <command>
VERBOSE=true npm run monitor
```

## 📈 Performance Optimization

- Batch API operations for efficiency
- Concurrent dashboard creation
- Intelligent caching
- Query optimization suggestions

## 🔐 Security

- Credentials stored locally only
- Environment-based configuration
- No hardcoded secrets
- Secure browser automation

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Submit pull request

## 📄 License

MIT License - see LICENSE file

## 🆘 Support

- Documentation: `docs/`
- Issues: GitHub Issues
- Examples: `scripts/examples/`, `automation/examples/`

---

Built with ❤️ for the New Relic community