# DashBuilder Frequently Asked Questions (FAQ)

## Table of Contents

1. [General Questions](#general-questions)
2. [Setup & Installation](#setup--installation)
3. [Cost & Pricing](#cost--pricing)
4. [Technical Questions](#technical-questions)
5. [NRDOT Optimization](#nrdot-optimization)
6. [Dashboard Management](#dashboard-management)
7. [Troubleshooting](#troubleshooting)
8. [Integration & Compatibility](#integration--compatibility)
9. [Security & Compliance](#security--compliance)
10. [Performance & Scaling](#performance--scaling)

## General Questions

### What is DashBuilder?

DashBuilder is a comprehensive platform that combines automated New Relic dashboard management with NRDOT v2 telemetry optimization. It helps organizations reduce their New Relic costs by 70-85% while maintaining 95%+ critical process coverage.

### How does DashBuilder save money?

DashBuilder uses intelligent process filtering through NRDOT v2 to:
- Filter out low-value metrics (idle processes, system noise)
- Dynamically adjust collection intervals based on importance
- Optimize metric cardinality
- Automatically switch between optimization profiles based on cost/coverage targets

### What is NRDOT?

NRDOT (New Relic Dot) is our telemetry optimization engine that intelligently filters process metrics before they're sent to New Relic. Version 2 includes:
- Machine learning-ready importance scoring
- Dynamic profile switching
- Real-time cost tracking
- Anomaly detection with EWMA

### Is DashBuilder officially supported by New Relic?

DashBuilder is an independent solution that uses New Relic's official APIs (NerdGraph, OTLP, Insights). While not officially supported by New Relic, it's built using their recommended integration patterns.

### What's the typical ROI?

Most organizations see:
- **Month 1**: 50-60% cost reduction
- **Month 2**: 70-75% cost reduction  
- **Month 3+**: 80-85% cost reduction
- **Payback period**: Usually 2-4 weeks

Example: A company spending $10K/month on New Relic telemetry typically saves $7-8.5K/month.

## Setup & Installation

### What are the system requirements?

**Minimum Requirements:**
- Docker 20.10+ and Docker Compose 2.0+
- 4GB RAM
- 20GB disk space
- Linux, macOS, or Windows (WSL2)

**Recommended for Production:**
- 8GB RAM
- 50GB SSD storage
- Dedicated server or VM
- Kubernetes cluster (for scale)

### How long does setup take?

- **Quick Start**: 5 minutes (using docker-compose)
- **Production Setup**: 30-60 minutes
- **Enterprise Deployment**: 2-4 hours (including testing)

### Do I need to modify my applications?

No! DashBuilder works at the infrastructure level using OpenTelemetry Collector. Your applications continue sending metrics as usual - we optimize what gets sent to New Relic.

### Can I try it before buying?

Yes! DashBuilder is open source. You can:
1. Clone the repository
2. Run experiments to see potential savings
3. Deploy in a test environment
4. Validate savings before production deployment

### What New Relic permissions do I need?

You'll need:
- **License Key**: For data ingestion
- **User API Key**: For NerdGraph access (dashboard management)
- **Query Key**: For Insights API (metric queries)
- **Account Admin**: Recommended for full functionality

## Cost & Pricing

### How is New Relic telemetry priced?

New Relic charges approximately $0.25 per million data points ingested. Process metrics can generate millions of data points per host per month.

### How much can I really save?

Real-world examples:
- **Small startup (10 hosts)**: $2K → $400/month (80% savings)
- **Mid-size company (100 hosts)**: $25K → $5K/month (80% savings)
- **Enterprise (1000+ hosts)**: $200K → $40K/month (80% savings)

### Does optimization affect my bill immediately?

Yes! New Relic bills based on ingested data, so reductions appear in your next billing cycle. You can track savings in real-time using our cost estimation metrics.

### What if I need to debug an issue?

DashBuilder can instantly switch to "baseline" profile for 100% visibility during debugging. You can also exclude critical processes from optimization permanently.

### Is there a DashBuilder license cost?

DashBuilder is open source (MIT license). There are no license fees. Costs include only:
- Infrastructure to run DashBuilder
- Reduced New Relic telemetry costs

## Technical Questions

### How does the optimization work?

1. **Process Scoring**: Each process gets an importance score based on CPU, memory, and criticality
2. **Dynamic Filtering**: Low-importance processes are filtered or sampled less frequently
3. **Profile Switching**: Automatic adjustment based on cost/coverage targets
4. **Anomaly Detection**: EWMA algorithms detect unusual behavior and adjust filtering

### What metrics are optimized?

Primarily process metrics (`ProcessSample`), which typically account for 60-80% of telemetry costs. System metrics (`SystemSample`) are preserved for infrastructure monitoring.

### Can I customize optimization rules?

Yes! You can:
- Define critical process patterns
- Set custom importance scores
- Create custom profiles
- Exclude specific processes
- Adjust thresholds

Example:
```yaml
process_classification:
  critical_apps:
    patterns:
      - nginx
      - postgres
      - redis
    importance: 1.0  # Never filter
```

### How does anomaly detection work?

We use Exponentially Weighted Moving Average (EWMA) to track normal behavior for each process. Anomalies trigger automatic profile switches to capture more data during incidents.

### What's the data pipeline architecture?

```
Your Hosts → OpenTelemetry Collector → NRDOT Filters → New Relic OTLP
                     ↑
                Control Loop (monitors cost/coverage)
```

## NRDOT Optimization

### What are optimization profiles?

| Profile | Coverage | Cost Reduction | Use Case |
|---------|----------|----------------|----------|
| **baseline** | 100% | 0% | Debugging, full visibility |
| **conservative** | 95% | 30% | Production with high visibility |
| **balanced** | 90% | 60% | Recommended default |
| **aggressive** | 80% | 85% | Maximum cost savings |

### How does automatic profile switching work?

The control loop monitors:
- Current cost per hour
- Process coverage percentage
- Anomaly scores
- Time of day/week

It automatically switches profiles to maintain your targets.

### Can I override automatic switching?

Yes! You can:
```bash
# Manual override
npm run cli profile switch aggressive --duration 3600

# Disable automation
npm run cli optimization disable
```

### What processes are always monitored?

By default, these are never filtered:
- Database processes (postgres, mysql, mongodb)
- Web servers (nginx, apache, httpd)
- Critical system services (sshd, systemd)
- Your custom critical process list

### How do I know what's being filtered?

Check the coverage metrics:
```sql
SELECT latest(nrdot_process_coverage_percentage) as 'Coverage',
       latest(nrdot_process_series_kept) as 'Kept',
       latest(nrdot_process_series_total) as 'Total'
FROM Metric
```

## Dashboard Management

### Can I use my existing dashboards?

Yes! DashBuilder doesn't change your metric names or structure. Existing dashboards continue working. We also provide optimized dashboard templates.

### How do I create NRDOT monitoring dashboards?

```bash
# Use our templates
npm run cli dashboard create dashboards/nrdot-main.json

# Or create custom dashboards
npm run cli dashboard create --interactive
```

### Can I automate dashboard deployment?

Yes! Use our CLI in CI/CD:
```bash
# Deploy all dashboards
npm run cli dashboard deploy --all

# Deploy specific dashboard
npm run cli dashboard create my-dashboard.json --account $ACCOUNT_ID
```

### Do dashboards update automatically?

Dashboards show real-time data from New Relic. The optimization metrics (cost, coverage) update every 5 minutes by default.

### Can I version control dashboards?

Yes! Export dashboards as JSON:
```bash
npm run cli dashboard export GUID > dashboards/my-dashboard.json
git add dashboards/my-dashboard.json
git commit -m "Add monitoring dashboard"
```

## Troubleshooting

### Why am I getting 403 errors?

Usually means incorrect API keys. Check:
1. License key is exactly 40 characters
2. User API key starts with `NRAK-`
3. Keys have correct permissions
4. Region setting matches your account (US/EU)

### Why are no metrics appearing?

Common causes:
1. Network connectivity issues
2. Incorrect OTLP endpoint
3. Too restrictive filtering
4. Container permission issues

Run diagnostics:
```bash
npm run diagnostics:all
```

### How do I debug optimization issues?

1. Check current profile: `npm run cli profile current`
2. View control loop logs: `docker-compose logs control-loop`
3. Verify metrics flow: `npm run test:metrics`
4. Switch to baseline if needed

### What if costs aren't decreasing?

Check:
1. Profile is not baseline
2. Filters are applied correctly
3. Majority of costs are from process metrics
4. Control loop is running

### Can I roll back changes?

Yes! 
```bash
# Switch to baseline immediately
npm run cli profile switch baseline

# Or restore previous configuration
docker-compose down
git checkout HEAD~1 configs/
docker-compose up -d
```

## Integration & Compatibility

### Does it work with Kubernetes?

Yes! We provide:
- DaemonSet configurations
- Helm charts
- Service monitors
- Auto-discovery

### Can I use it with other monitoring tools?

Yes! DashBuilder only optimizes data sent to New Relic. You can simultaneously send data to:
- Prometheus
- Datadog  
- Grafana
- Any OTLP-compatible backend

### Does it work with New Relic agents?

DashBuilder optimizes infrastructure metrics. APM agents continue working normally. You can use both together.

### What about custom metrics?

Custom metrics are preserved by default. You can add them to optimization rules if desired.

### Can I use it in air-gapped environments?

Yes, but you'll need to:
1. Mirror required Docker images
2. Configure proxy for New Relic endpoints
3. Use offline license activation

## Security & Compliance

### Is my data secure?

Yes! DashBuilder:
- Runs in your infrastructure
- Doesn't store metric data
- Only forwards filtered metrics to New Relic
- Uses TLS for all communications

### What data is sent to New Relic?

Only the filtered metrics you configure. No additional metadata or tracking data is added.

### Are API keys encrypted?

API keys should be:
- Stored in environment variables
- Never committed to version control
- Rotated regularly
- Managed by your secret management system

### Does it meet compliance requirements?

DashBuilder inherits your infrastructure's compliance posture. It doesn't introduce additional compliance concerns since it only filters data you're already sending.

### Can I audit what's being filtered?

Yes! All filtering decisions are logged and can be audited:
```bash
docker-compose logs otel-collector | grep "filtered"
```

## Performance & Scaling

### How much overhead does it add?

Typically < 5% CPU and < 200MB RAM per host. The savings in reduced data transmission often offset this.

### Can it handle high-volume environments?

Yes! DashBuilder scales horizontally:
- Multiple collector instances
- Redis clustering for state
- PostgreSQL replication
- Kubernetes auto-scaling

### What's the maximum supported scale?

Tested configurations:
- 10,000+ processes per host
- 1,000+ hosts per cluster
- 1M+ metrics per second
- 100GB+ daily data reduction

### How do I optimize performance?

1. Use appropriate batch sizes
2. Enable compression
3. Tune collection intervals
4. Use profile-specific configurations
5. Scale horizontally when needed

### Does it support multi-region?

Yes! Deploy DashBuilder in each region with region-specific configurations. Use global dashboards to view all regions.

---

## Still Have Questions?

- 📚 Check our [Documentation](./README.md)
- 🔧 See [Troubleshooting Guide](./TROUBLESHOOTING_RUNBOOK.md)
- 💬 Join our [Community Forum](https://community.dashbuilder.io)
- 📧 Email [support@dashbuilder.io](mailto:support@dashbuilder.io)

---

*Last Updated: January 2025 | Version 2.0*