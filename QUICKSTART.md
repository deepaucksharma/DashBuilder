# DashBuilder Quick Start Guide

Get DashBuilder and NRDOT v2 running in under 5 minutes!

## 📋 Prerequisites

- **Docker & Docker Compose** (v20.10+)
- **Node.js** (v16+ for local development)
- **New Relic Account** with:
  - 🔑 License Key (for data ingestion)
  - 👤 User API Key (for NerdGraph access)
  - 🔍 Query Key (for Insights API)
  - 🆔 Account ID

## 🚀 5-Minute Setup

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/your-org/dashbuilder.git
cd dashbuilder

# Setup environment variables
cp .env.example .env
```

**Edit `.env` with your credentials:**
```bash
# Required New Relic Keys
NEW_RELIC_LICENSE_KEY=your_40_char_license_key
NEW_RELIC_USER_API_KEY=your_user_api_key
NEW_RELIC_ACCOUNT_ID=your_account_id
NEW_RELIC_QUERY_KEY=your_query_key

# Optional Configuration
NEW_RELIC_REGION=US                  # or EU
OPTIMIZATION_PROFILE=balanced        # or conservative/aggressive
CONTROL_LOOP_INTERVAL=300000         # 5 minutes
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Run interactive setup wizard
npm run setup
```

The setup wizard will:
- ✅ Verify your API keys
- ✅ Test New Relic connectivity
- ✅ Create necessary directories
- ✅ Initialize configuration

### 3. Start Services

```bash
# Start all services (recommended)
docker-compose up -d

# Or start with a specific profile
OPTIMIZATION_PROFILE=conservative docker-compose up -d

# View logs
docker-compose logs -f
```

**Services started:**
- 🗄️ PostgreSQL (port 5432)
- 🔴 Redis (port 6379)
- 📡 OTEL Collector (ports 4317, 8889)
- 🤖 Control Loop
- 🌐 DashBuilder API (port 3000)

### 4. Verify Installation

```bash
# Test New Relic connectivity
npm run test:connection

# Run full diagnostics
npm run diagnostics:all

# Check service health
docker-compose ps

# Verify collector is receiving metrics
curl http://localhost:8889/metrics | grep otelcol_receiver_accepted_metric_points
```

**Expected output:**
```
✅ Insights Query API: Success
✅ NerdGraph API: Success (if User API Key is set)
✅ All services: Up and healthy
✅ Metrics flowing: Yes
```

### 5. Deploy Your First Dashboard

```bash
# Create NRDOT monitoring dashboard
npm run cli dashboard create dashboards/nrdot-main.json

# Or use the interactive CLI
npm run cli
```

**Dashboard includes:**
- 📊 Process metrics and coverage
- 💵 Cost tracking and projections  
- 📈 Performance indicators
- 🚨 Anomaly detection alerts

## 🎯 Optimization Profiles

| Profile | Coverage | Cost Reduction | Interval | Best For |
|---------|----------|----------------|----------|----------|
| **baseline** | 100% | 0% | 10s | Debugging, full visibility |
| **conservative** | 95% | 30% | 30s | Production systems |
| **balanced** | 90% | 60% | 30s | **Recommended default** |
| **aggressive** | 80% | 85% | 60s | Cost-sensitive environments |

Switch profiles dynamically:
```bash
# Via environment variable
export OPTIMIZATION_PROFILE=aggressive
docker-compose restart control-loop

# Or let the control loop decide automatically
npm run control-loop
```

## 🧪 Run Your First Experiment

### Quick 5-Minute Test

```bash
# Run a quick comparison of profiles
npm run experiment:quick

# View results
npm run experiment:results
```

### Full Experiment Suite

```bash
# List available experiments
npm run experiment:list

# Run specific experiment
npm run experiment:run cost-optimization-basic

# Compare multiple runs
npm run experiment:compare exp-001 exp-002
```

### Monitor in Real-Time

```bash
# Watch control loop decisions
docker-compose logs -f control-loop

# Monitor optimization metrics
npm run monitor

# View live metrics in New Relic
open https://one.newrelic.com
```

## ⚙️ Advanced Configuration

### Process Filtering

```bash
# Customize what processes to monitor
PROCESS_INCLUDE_PATTERN=.*           # Include all by default
PROCESS_EXCLUDE_PATTERN=(kernel|systemd-|ssh-agent)

# Resource thresholds
MIN_CPU_THRESHOLD=0.1                # Minimum 0.1% CPU
MIN_MEMORY_THRESHOLD=10485760        # Minimum 10MB memory

# Importance scoring
PROCESS_IMPORTANCE_THRESHOLD=0.8     # 0-1 scale
MAX_PROCESSES_PER_HOST=50            # Limit per host
```

### Control Loop Tuning

```bash
# Optimization behavior
TARGET_COST_REDUCTION=0.70          # Aim for 70% reduction
CRITICAL_PROCESS_THRESHOLD=0.95     # Keep 95% coverage
ANOMALY_SENSITIVITY=2.5             # Standard deviations

# Timing
CONTROL_LOOP_INTERVAL=300000        # Check every 5 minutes
PROFILE_SWITCH_COOLDOWN=900000      # Wait 15 min between switches
```

## 📈 Monitoring & Dashboards

### New Relic Dashboards

1. **Login to New Relic**
   ```bash
   open https://one.newrelic.com
   ```

2. **Find Your Dashboards**
   - Navigate to: Dashboards → "NRDOT v2 Monitoring"
   - Key metrics displayed:
     - 📦 Process count and coverage percentage
     - 💰 Estimated hourly/monthly costs
     - 🔝 Top 10 processes by resource usage
     - 📉 Optimization effectiveness trends
     - 🚨 Anomaly detection alerts

### Local Monitoring

```bash
# Prometheus metrics endpoint
open http://localhost:8889/metrics

# Health check endpoint  
open http://localhost:13133/health

# Optional: Start Grafana
docker-compose --profile monitoring up -d
open http://localhost:3000  # admin/admin
```

### CLI Monitoring

```bash
# Real-time metrics
npm run monitor

# Find specific metrics
npm run find-metrics -- --pattern "process"

# Validate dashboards
npm run validate-dashboards
```

## 🔥 Troubleshooting

### Common Issues

#### 🚫 No metrics in New Relic
```bash
# 1. Check connectivity
npm run test:connection

# 2. Verify collector is sending data
curl http://localhost:8889/metrics | grep "sent_metric_points"

# 3. Check for errors
docker-compose logs collector | grep -i error

# 4. Run full diagnostics
npm run diagnostics:all
```

#### 🔴 Authentication errors (403)
```bash
# Verify license key format (40 characters)
echo $NEW_RELIC_LICENSE_KEY | wc -c

# Test with curl
curl -X POST https://otlp.nr-data.net/v1/metrics \
  -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
  -H "Content-Type: application/x-protobuf"
```

#### 💻 High memory/CPU usage
```bash
# Switch to conservative profile immediately
docker-compose exec control-loop \
  redis-cli SET current_profile conservative

docker-compose restart collector
```

#### 🔍 Missing critical processes
```bash
# Temporarily disable filtering
export PROCESS_INCLUDE_PATTERN=".*"
export MIN_CPU_THRESHOLD=0.001
docker-compose up -d collector
```

### Get Help

```bash
# Generate debug report
npm run diagnostics:debug > debug-report.txt

# Check documentation
npm run docs

# Community support
open https://github.com/your-org/dashbuilder/discussions
```

## 🏢 Production Deployment

### Docker Deployment
```bash
# Build optimized image
docker build -t dashbuilder:latest .

# Run with production settings
docker run -d \
  --name dashbuilder \
  --env-file .env.production \
  -p 3000:3000 \
  dashbuilder:latest
```

### Kubernetes Deployment
```bash
# Apply configurations
kubectl apply -f k8s/

# Verify deployment
kubectl get pods -n dashbuilder
kubectl logs -n dashbuilder -l app=control-loop
```

### Cloud Platforms
- **AWS ECS**: See [docs/deployment-guide.md#ecs](docs/deployment-guide.md#ecs)
- **Google Cloud Run**: See [docs/deployment-guide.md#gcr](docs/deployment-guide.md#gcr)
- **Azure Container**: See [docs/deployment-guide.md#azure](docs/deployment-guide.md#azure)

## 🎓 Next Steps

### Essential Reading
1. 📖 [Project Status & Roadmap](PROJECT-STATUS.md) - Current state and plans
2. 🏗️ [Architecture Deep Dive](docs/architecture.md) - System design details
3. 🧪 [Experiment Guide](experiments/README.md) - Run comparisons
4. 🏭 [Production Setup](docs/production-setup.md) - Scale to production

### Quick Actions
```bash
# Explore the CLI
npm run cli help

# Run your first experiment
npm run experiment:quick

# Create custom dashboard
npm run cli dashboard create --interactive

# View all available commands
npm run
```

### Join the Community
- ⭐ [Star us on GitHub](https://github.com/your-org/dashbuilder)
- 💬 [Join Discussions](https://github.com/your-org/dashbuilder/discussions)
- 🐛 [Report Issues](https://github.com/your-org/dashbuilder/issues)
- 📧 [Contact Support](mailto:support@dashbuilder.io)

---

**Need help?** Run `npm run help` or check our [troubleshooting guide](docs/TROUBLESHOOTING_RUNBOOK.md).