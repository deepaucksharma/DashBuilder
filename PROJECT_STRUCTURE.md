# DashBuilder Project Structure

## Overview
DashBuilder with NRDOT v2 - Streamlined repository structure for New Relic dashboard management and telemetry optimization.

## Directory Structure

```
DashBuilder/
├── configs/                 # Configuration files
│   ├── collector-profiles/  # OTEL collector profiles (baseline, conservative, balanced, aggressive)
│   ├── grafana-provisioning/# Grafana datasource configs
│   └── prometheus.yml       # Prometheus configuration
│
├── dashboards/             # Dashboard JSON templates
│   ├── main-dashboard.json # Main NRDOT dashboard
│   ├── kpi-dashboard.json  # KPI monitoring dashboard
│   └── day1-monitoring.json# Day 1 operations dashboard
│
├── docs/                   # Documentation
│   ├── *.md               # Various documentation files
│   └── index.md           # Documentation index
│
├── examples/              # Example configurations
│   └── nrdot-process-dashboard.json
│
├── lib/                   # Shared libraries
│   └── common/
│       ├── logging.js     # Logging utilities
│       └── nr-api.js      # New Relic API client
│
├── nrdot-nr1-app/        # New Relic One application
│   ├── nerdlets/         # NR1 UI components
│   ├── lib/              # App-specific libraries
│   └── package.json      # NR1 app dependencies
│
├── orchestrator/         # Main orchestration logic
│   ├── monitor.js        # Service monitor
│   ├── setup.js          # Setup orchestrator
│   └── workflows/        # Workflow implementations
│
├── scripts/              # Utility scripts
│   ├── control-loop.js   # Main control loop
│   ├── control-loop.sh   # Shell control loop
│   ├── deployment/       # Deployment scripts
│   ├── validation/       # Validation scripts
│   └── src/              # CLI source code
│
├── tests/                # Test suites
│   ├── functional/
│   ├── integration/
│   └── unit/
│
├── Dockerfile            # Multi-stage Docker configuration
├── docker-compose.yml    # Docker Compose setup
├── docker-entrypoint.sh  # Unified entrypoint script
├── package.json          # Main project dependencies
├── README.md             # Project documentation
├── CLAUDE.md             # AI assistant instructions
└── setup.sh              # Setup script
```

## Key Features
- **70-85% telemetry cost reduction** with 95%+ critical process coverage
- Multi-stage Docker builds for optimized deployments
- Unified control loop supporting multiple backends
- Comprehensive dashboard management
- Real-time optimization with configurable profiles

## Quick Start
```bash
# Setup
./setup.sh

# Run with Docker
docker-compose up

# Run specific profile
OPTIMIZATION_MODE=aggressive docker-compose up
```