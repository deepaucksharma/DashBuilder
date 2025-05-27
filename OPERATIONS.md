# NRDOT v2 Ultimate Operations Runbook

## Quick Reference

### Emergency Commands
```bash
# Emergency stop all optimization
sudo systemctl stop nrdot-collector-host
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh emergency_stop

# Force conservative profile
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh force_profile conservative

# Check system health
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh health_check
```

### Key Metrics Dashboard
- **Cost Reduction**: Target 85%+ | Alert if <70%
- **SLA Compliance**: Target 99%+ | Alert if <95%
- **Data Loss**: Target <0.1% | Alert if >1%
- **ML Confidence**: Target >80% | Alert if <60%

## Daily Operations

### Morning Health Check
```bash
# Run comprehensive health check
./scripts/health-check.sh

# Review overnight metrics
curl -s http://localhost:8081/api/metrics/summary

# Check for any alerts
grep -i "alert\|error\|warn" /var/log/nrdot/*.log | tail -20
```

### Weekly Review Process
1. **Cost Analysis**: Review cost trends and savings
2. **Performance Review**: Analyze ML model accuracy
3. **Capacity Planning**: Check resource utilization trends
4. **Configuration Updates**: Apply any pending optimizations

## Troubleshooting Guide

### High Error Rates
```bash
# Check collector status
sudo systemctl status nrdot-collector-host

# Review error logs
sudo journalctl -u nrdot-collector-host -f

# Switch to safe profile
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh force_profile conservative
```

### Cost Explosion
```bash
# Immediate response
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh emergency_stop

# Analyze cause
python3 /usr/local/bin/nrdot-ml-predictor.py --analyze-cost-spike

# Gradual recovery
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh gradual_recovery
```

### ML Prediction Failures
```bash
# Check ML engine status
curl -s http://localhost:8081/health

# Restart ML engine
sudo systemctl restart nrdot-ml-engine

# Fallback to rule-based optimization
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh disable_ml
```

### Data Loss Detection
```bash
# Immediate assessment
python3 /usr/local/bin/nrdot-ml-predictor.py --check-data-integrity

# Stop aggressive optimization
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh force_profile conservative

# Generate data loss report
./scripts/data-loss-report.sh
```

## Configuration Management

### Profile Switching
```bash
# List available profiles
/usr/local/bin/nrdot-control-loop-ultimate.sh list_profiles

# Switch profile with validation
/usr/local/bin/nrdot-control-loop-ultimate.sh change_profile balanced

# Validate configuration
/usr/local/bin/nrdot-control-loop-ultimate.sh validate_config
```

### Experiment Management
```bash
# Start new experiment
curl -X POST http://localhost:8081/api/experiments \
  -H "Content-Type: application/json" \
  -d '{"name":"cardinality_test","duration":3600,"profile":"aggressive"}'

# Monitor experiment
curl -s http://localhost:8081/api/experiments/current

# Stop experiment early
curl -X DELETE http://localhost:8081/api/experiments/current
```

## Performance Benchmarks

### Expected Performance Metrics
- **Throughput**: 100K+ spans/second
- **Latency**: <100ms p99 processing time
- **Memory**: <4GB per collector instance
- **CPU**: <2 cores per collector instance
- **Cost Reduction**: 85%+ compared to baseline

### Benchmark Commands
```bash
# Run performance test
./scripts/performance-test.sh

# Generate benchmark report
./scripts/benchmark-report.sh

# Compare with baseline
./scripts/compare-baseline.sh
```

## Backup and Recovery

### Backup Procedures
```bash
# Manual backup
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh backup_config

# Verify backup integrity
./scripts/verify-backup.sh

# List available backups
ls -la /var/backups/nrdot/
```

### Recovery Procedures
```bash
# Restore from backup
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh restore_config <backup_date>

# Validate restored configuration
sudo /usr/local/bin/nrdot-control-loop-ultimate.sh validate_config

# Restart services
sudo systemctl restart nrdot-collector-host
sudo systemctl restart nrdot-ml-engine
```

## Monitoring and Alerting

### Key Alerts
1. **Cost Spike**: >20% increase in 1 hour
2. **Error Rate**: >5% of requests failing
3. **Data Loss**: Any missing critical telemetry
4. **ML Degradation**: Confidence <60%
5. **SLA Breach**: Availability <99%

### Alert Response
```bash
# Acknowledge alert
curl -X POST http://localhost:8082/api/alerts/ack/<alert_id>

# Get alert details
curl -s http://localhost:8082/api/alerts/<alert_id>

# Escalate if needed
./scripts/escalate-alert.sh <alert_id>
```

## Capacity Planning

### Growth Metrics
- **Data Volume**: Track daily ingestion rates
- **Cardinality**: Monitor unique metric combinations
- **Storage**: Plan for 30-day retention minimum
- **Compute**: Scale based on throughput requirements

### Scaling Commands
```bash
# Scale collector instances
./scripts/scale-collectors.sh <target_count>

# Update resource limits
./scripts/update-resources.sh

# Plan capacity for next quarter
./scripts/capacity-plan.sh 90
```

## Security Operations

### Access Management
```bash
# Rotate API keys
./scripts/rotate-keys.sh

# Update certificates
sudo ./scripts/update-certs.sh

# Audit access logs
./scripts/audit-access.sh
```

### Security Monitoring
```bash
# Check for anomalous access
./scripts/security-check.sh

# Review authentication logs
sudo journalctl -u nrdot-auth -f

# Generate security report
./scripts/security-report.sh
```

## Integration Management

### New Relic Integration
```bash
# Test API connectivity
curl -H "Api-Key: $NEW_RELIC_API_KEY" \
  https://api.newrelic.com/v2/applications.json

# Verify data flow
./scripts/verify-nr-data.sh

# Update integration settings
./scripts/update-nr-config.sh
```

### Third-party Integrations
```bash
# Test Prometheus integration
curl -s http://localhost:9090/metrics

# Verify Grafana dashboards
./scripts/verify-grafana.sh

# Update webhook endpoints
./scripts/update-webhooks.sh
```

## Maintenance Windows

### Weekly Maintenance
```bash
# Pre-maintenance checklist
./scripts/pre-maintenance.sh

# Apply updates
sudo ./scripts/apply-updates.sh

# Post-maintenance verification
./scripts/post-maintenance.sh
```

### Monthly Maintenance
```bash
# Full system audit
./scripts/monthly-audit.sh

# Performance optimization
./scripts/optimize-performance.sh

# Generate monthly report
./scripts/monthly-report.sh
```

## Contact Information

### Escalation Matrix
1. **L1 Support**: ops-team@company.com
2. **L2 Support**: sre-team@company.com  
3. **L3 Support**: architecture-team@company.com
4. **Emergency**: +1-555-ONCALL

### Key Personnel
- **Primary SRE**: John Doe (john.doe@company.com)
- **Backup SRE**: Jane Smith (jane.smith@company.com)
- **Architect**: Bob Johnson (bob.johnson@company.com)

---

**Last Updated**: $(date)
**Version**: 3.0.0
**Next Review**: $(date -d "+1 month")