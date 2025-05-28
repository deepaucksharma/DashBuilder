# DashBuilder Project Structure

## Directory Layout

```
DashBuilder/
├── configs/                    # Configuration files
│   ├── collector-nrdot.yaml    # Main NRDOT collector config
│   ├── collector-profiles/     # Optimization profiles
│   │   ├── baseline.yaml       # Full telemetry
│   │   ├── conservative.yaml   # Minimal optimization
│   │   ├── balanced.yaml       # Recommended
│   │   └── aggressive.yaml     # Maximum savings
│   └── grafana-provisioning/   # Grafana configs
│
├── dashboards/                 # New Relic dashboards
│   ├── nrdot-main.json         # Main NRDOT dashboard
│   ├── nrdot-comprehensive.json # Detailed metrics
│   ├── experiment-dashboard.json # Experiment tracking
│   └── archive/                # Old versions
│
├── deployment/                 # Deployment resources
│   ├── k8s/                    # Kubernetes manifests
│   └── docker-entrypoint.sh    # Docker entrypoint
│
├── distributions/              # Distribution packages
│   └── nrdot-plus/             # NRDOT+ distribution
│
├── docs/                       # Documentation
│   ├── README.md               # Documentation index
│   ├── 01-overview.md          # Architecture overview
│   ├── 02-configuration.md     # Configuration guide
│   └── archive/                # Historical docs
│
├── experiments/                # Experiment framework
│   ├── profiles/               # Experiment profiles
│   └── orchestrator/           # Experiment runner
│
├── lib/                        # Shared libraries
│   ├── shared/                 # Common utilities
│   └── telemetry.js            # Telemetry helpers
│
├── nrdot-nr1-app/              # New Relic One app
│   ├── nerdlets/               # NR1 components
│   └── lib/                    # App libraries
│
├── orchestrator/               # Dashboard orchestrator
│   ├── monitor.js              # Main monitor
│   ├── workflows/              # Automation workflows
│   └── lib/                    # Orchestrator libs
│
├── scripts/                    # Utility scripts
│   ├── core/                   # Core scripts
│   │   ├── setup.js            # Setup wizard
│   │   ├── validation.js       # Validation
│   │   └── experiment-orchestrator.js
│   ├── shell/                  # Shell scripts
│   │   ├── deploy.sh           # Deployment
│   │   ├── run-experiment.sh   # Run experiments
│   │   └── test-metrics.sh     # Test metrics
│   ├── src/                    # CLI source
│   │   ├── cli.js              # Main CLI
│   │   ├── commands/           # CLI commands
│   │   └── services/           # Business logic
│   ├── control-loop.js         # NRDOT control loop
│   ├── find-metrics.js         # Metric finder
│   ├── nrdot-diagnostics.js    # Diagnostics tool
│   └── test-newrelic-connection.js # Connection test
│
├── tests/                      # Test suites
│   ├── jest/                   # Jest tests
│   ├── functional/             # Functional tests
│   └── integration/            # Integration tests
│
├── .env.example                # Environment template
├── docker-compose.yml          # Docker services
├── Dockerfile                  # Container image
├── package.json                # Main package
├── README.md                   # Getting started
├── QUICKSTART.md               # Quick setup
└── PROJECT-STATUS.md           # Current status
```

## Key Components

### 1. Configuration (`configs/`)
- OpenTelemetry collector configurations
- Optimization profiles for different use cases
- Infrastructure provisioning

### 2. Scripts (`scripts/`)
- **Consolidated tools**: Unified utilities replacing multiple scripts
- **Shell scripts**: Deployment and testing scripts
- **CLI**: Command-line interface for all operations

### 3. Orchestrator (`orchestrator/`)
- Dashboard management and automation
- Workflow execution
- Monitoring and alerting

### 4. Experiments (`experiments/`)
- Profile comparison framework
- Automated testing scenarios
- Results analysis

### 5. Deployment (`deployment/`)
- Kubernetes manifests
- Docker configurations
- Production deployment guides

## Package Organization

- **Main package** (`package.json`): Core dependencies and scripts
- **Scripts package** (`scripts/package.json`): CLI and utilities
- **Orchestrator package** (`orchestrator/package.json`): Dashboard automation
- **NR1 App** (`nrdot-nr1-app/package.json`): New Relic One app

## Naming Conventions

- **Configs**: `{component}-{variant}.yaml`
- **Scripts**: `{action}-{target}.js`
- **Dashboards**: `{component}-{purpose}.json`
- **Tests**: `{component}.test.js`
