# DashBuilder + NRDOT v2: Integrated Telemetry Solution

## 🚀 One-Command Setup

```bash
./master-setup.sh
```

That's it! This single command will:
1. Check prerequisites (Docker, Node.js, etc.)
2. Configure your New Relic credentials
3. Build and start all services
4. Create monitoring dashboards
5. Validate the entire setup

## 🎯 What You Get

### NRDOT v2 Features
- **70-85% telemetry cost reduction** through intelligent process filtering
- **Real-time optimization** with automatic profile switching
- **Zero data loss** for critical processes
- **A/B testing framework** for safe rollouts

### DashBuilder Features
- **Automated dashboard creation** for New Relic
- **Visual dashboard management** interface
- **API-driven operations** for automation
- **Integrated monitoring** with Prometheus/Grafana

### Integration Benefits
- **Seamless data flow** from NRDOT to New Relic
- **Unified configuration** management
- **Single-pane monitoring** for both systems
- **Automatic dashboard creation** for NRDOT metrics

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Infrastructure                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐      ┌─────────────┐     ┌─────────────┐ │
│  │   Servers   │─────▶│    NRDOT    │────▶│ New Relic  │ │
│  │  Processes  │      │  Collector  │     │    OTLP    │ │
│  └─────────────┘      └─────────────┘     └─────────────┘ │
│                              │                      │       │
│                              ▼                      ▼       │
│                      ┌─────────────┐       ┌─────────────┐ │
│                      │Control Loop │       │ Dashboards │ │
│                      │(Optimizer)  │       │   (Auto)   │ │
│                      └─────────────┘       └─────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📊 How It Works

### 1. Process Collection
- NRDOT collector gathers all process metrics
- Applies intelligent filtering based on importance
- Reduces data volume while maintaining visibility

### 2. Optimization
- Control loop monitors cost and coverage
- Automatically adjusts filtering profiles
- Maintains SLA targets (>95% critical coverage)

### 3. Dashboard Creation
- DashBuilder detects NRDOT metrics
- Automatically creates monitoring dashboards
- Updates visualizations in real-time

### 4. Monitoring
- Prometheus collects internal metrics
- Grafana provides local visualization
- New Relic shows production metrics

## 🛠️ Service Management

All services are managed through Docker Compose:

| Service | Port | Purpose |
|---------|------|---------|  
| dashbuilder | 3000 | Dashboard UI |
| otel-collector | 4317/8888 | NRDOT metrics collection |
| control-loop | - | Optimization engine |
| redis | 6379 | Cache & state storage |
| postgres | 5432 | Configuration database |

## 🔧 Quick Start Commands

```bash
# View system status
./status.sh

# Restart all services
./restart.sh

# Open all dashboards
./open-dashboards.sh

# Run validation checks
./validate-integration.sh

# View logs
docker-compose logs -f
```

## ⚙️ Configuration

### Environment Variables (.env)
```bash
# New Relic Credentials (Required)
NEW_RELIC_LICENSE_KEY=your_license_key_here
NEW_RELIC_ACCOUNT_ID=your_account_id_here
NEW_RELIC_API_KEY=your_api_key_here
NEW_RELIC_REGION=US  # or EU

# NRDOT Configuration
NRDOT_PROFILE=balanced  # conservative, balanced, aggressive
NRDOT_CONTROL_LOOP_INTERVAL=60
NRDOT_EXPERIMENT_ENABLED=false

# Optional Configuration
NODE_ENV=production
LOG_LEVEL=info
```

### NRDOT Profiles

| Profile | Cost Reduction | Coverage | Use Case |
|---------|----------------|----------|----------|
| **Conservative** | ~50% | >99% | Maximum visibility |
| **Balanced** | ~70% | >95% | Recommended default |
| **Aggressive** | ~85% | >90% | Maximum savings |

## 🧪 Running Experiments

### Quick 5-minute Test
```bash
npm run experiment:quick
```

### Full Profile Comparison
```bash
npm run experiment:all
```

### View Results
```bash
npm run experiment:results
```

## 📈 Monitoring Your Setup

### 1. Local Dashboards
- **Dashboard UI**: http://localhost:3000
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001

### 2. NRDOT Metrics
```bash
# Check optimization metrics
curl http://localhost:8888/metrics | grep nrdot_

# Key metrics to monitor:
# - nrdot_process_series_total: Total process count
# - nrdot_process_series_kept: Processes after filtering
# - nrdot_process_coverage_critical: Critical coverage %
# - nrdot_cost_estimated_hr: Estimated hourly cost
```

### 3. New Relic Dashboards
The system automatically creates:
- NRDOT Performance Dashboard
- Process Optimization Dashboard
- Cost Analysis Dashboard

## 🛠️ Common Operations

### Check Status
```bash
./status.sh
```

### Restart Services
```bash
./restart.sh
```

### Change Optimization Profile
```bash
# Edit .env file
NRDOT_PROFILE=aggressive

# Restart services
docker-compose restart
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f otel-collector
```

### Run Validation
```bash
./validate-integration.sh
```

## 🚨 Troubleshooting

### No Data in New Relic?
1. Check collector is running: `docker-compose ps otel-collector`
2. Verify credentials: `grep LICENSE .env`
3. Check logs: `docker-compose logs otel-collector`

### High Memory Usage?
1. Switch to aggressive profile
2. Increase memory limits in docker-compose.yml
3. Check for process explosion

### Dashboard Not Loading?
1. Ensure all services are running: `./status.sh`
2. Check API connectivity: `curl http://localhost:8080/health`
3. Verify database: `docker-compose logs postgres`

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions.

## 📚 Advanced Topics

### Custom Process Classification
Edit `configs/optimization.yaml`:
```yaml
process_classification:
  custom_critical:
    score: 0.95
    patterns:
      common:
        - "^my-critical-app$"
```

### A/B Testing
Enable experiments in `.env`:
```bash
NRDOT_EXPERIMENT_ENABLED=true
```

### Multi-Environment Setup
Use different profiles:
- Development: `NRDOT_PROFILE=conservative`
- Staging: `NRDOT_PROFILE=balanced`
- Production: `NRDOT_PROFILE=aggressive`

## 🤝 Support

- Documentation: See `docs/` directory
- Issues: Create GitHub issue
- Logs: Always include `docker-compose logs`

## 📄 License

Apache 2.0 - See LICENSE file

---

**Ready to save 70-85% on your New Relic costs?** Run `./master-setup.sh` now!