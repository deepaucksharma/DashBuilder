# NRDOT v2 Quick Start Guide

This guide will help you get NRDOT v2 up and running in minutes with the fixed architecture.

## Prerequisites

- Docker and Docker Compose installed
- New Relic account with:
  - License Key
  - API Key (with NRQL query permissions)
  - Account ID

## Quick Setup

### 1. Clone and Setup Environment

```bash
# Clone the repository
git clone <repository-url>
cd DashBuilder

# Copy environment template
cp .env.example .env

# Edit .env with your New Relic credentials
nano .env  # or use your preferred editor
```

### 2. Clean Up Old Files (Optional)

If upgrading from previous version:

```bash
# Review what will be removed
./cleanup-redundant-files.sh

# Actually remove redundant files
./cleanup-redundant-files.sh execute
```

### 3. Start NRDOT

```bash
# Start with default (balanced) profile
docker-compose -f docker-compose-test.yml up -d

# Or specify a profile
OPTIMIZATION_MODE=conservative docker-compose -f docker-compose-test.yml up -d
```

### 4. Verify Setup

```bash
# Check if services are running
docker-compose -f docker-compose-test.yml ps

# Check collector health
curl http://localhost:13133/health

# View collector metrics
curl http://localhost:8888/metrics

# Check logs
docker-compose -f docker-compose-test.yml logs -f collector
```

### 5. Deploy Dashboard

```bash
# Deploy the aligned dashboard
node scripts/src/cli.js dashboard create nrdot-dashboard-aligned.json
```

## Available Profiles

- **conservative**: Maximum filtering, 60s collection interval, lowest cost
- **balanced**: Good coverage with reasonable cost, 30s interval
- **aggressive**: Maximum data collection, 10s interval, highest coverage

## Testing

### Generate Test Metrics

```bash
# Start metrics generator
node scripts/metrics-generator-fixed.js

# Or use Docker profile
docker-compose -f docker-compose-test.yml --profile test up metrics-generator
```

### Run Experiments

```bash
# Run experiments across all profiles
EXPERIMENT_DURATION=600 node scripts/experiment-runner-fixed.js
```

### Monitor Control Loop

```bash
# View control loop decisions
docker-compose -f docker-compose-test.yml logs -f control-loop
```

## Configuration

### Key Environment Variables

```bash
# Required
NEW_RELIC_LICENSE_KEY=your_license_key
NEW_RELIC_API_KEY=your_api_key
NEW_RELIC_ACCOUNT_ID=your_account_id

# Optional (with defaults)
OPTIMIZATION_MODE=balanced            # Profile: conservative, balanced, aggressive
CONTROL_LOOP_INTERVAL=300            # Seconds between control loop checks
TARGET_COST_REDUCTION=0.70           # Target 70% cost reduction
CRITICAL_PROCESS_THRESHOLD=0.95      # Maintain 95% coverage
```

### Process Filtering

```bash
# Include/exclude patterns (regex)
PROCESS_INCLUDE_PATTERN=.*
PROCESS_EXCLUDE_PATTERN=(kernel|systemd-|ssh-agent|kworker)

# Minimum thresholds
MIN_CPU_THRESHOLD=0.1              # CPU percentage
MIN_MEMORY_THRESHOLD=10485760      # Memory in bytes (10MB)
```

## Monitoring

### View in New Relic

1. Go to your New Relic account
2. Navigate to Dashboards
3. Find "NRDOT v2 - Process Monitoring (Aligned)"
4. Monitor:
   - Process count and coverage
   - Estimated cost per hour
   - Top processes by CPU/Memory
   - OTEL collector health

### Local Monitoring

```bash
# Prometheus metrics
http://localhost:8888/metrics

# With monitoring profile
docker-compose -f docker-compose-test.yml --profile monitoring up -d

# Access Grafana
http://localhost:3000 (admin/changeme)
```

## Troubleshooting

### No metrics appearing

```bash
# Check collector logs
docker-compose -f docker-compose-test.yml logs collector

# Verify environment variables
docker-compose -f docker-compose-test.yml config

# Test collector config
docker run --rm -v $(pwd)/configs/profiles/balanced.yaml:/config.yaml \
  otel/opentelemetry-collector-contrib:0.91.0 \
  --config=/config.yaml --dry-run
```

### High memory usage

```bash
# Switch to conservative profile
docker-compose -f docker-compose-test.yml exec control-loop \
  sh -c 'echo "conservative" > /var/lib/nrdot/profile'
docker-compose -f docker-compose-test.yml restart collector
```

### Missing processes

```bash
# Check current filters
docker-compose -f docker-compose-test.yml exec collector \
  cat /etc/otel/config.yaml | grep -A5 process

# Adjust filters in .env
PROCESS_INCLUDE_PATTERN=.*
MIN_CPU_THRESHOLD=0.01
```

## Production Deployment

For production, use the simplified Docker setup:

```bash
# Build production image
docker build -f Dockerfile.simple -t nrdot:latest .

# Deploy with your orchestrator (K8s, ECS, etc.)
# See docs/06-deployment.md for detailed instructions
```

## Next Steps

- Review [Architecture Documentation](docs/01-overview.md)
- Configure [Advanced Settings](docs/02-configuration.md)
- Set up [Automated Control Loop](docs/03-control-loop.md)
- Deploy to [Production](docs/06-deployment.md)