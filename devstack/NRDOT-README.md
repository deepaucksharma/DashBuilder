# NRDOT Collector Deployment System

A comprehensive, secure, and configurable system for deploying NRDOT and OpenTelemetry collectors.

## Quick Start

### 1. Setup Environment
```bash
# Copy template and add your API keys
cp .env.template .env
# Edit .env with your New Relic credentials
```

### 2. Deploy Collectors
```bash
# Option 1: Interactive deployment
./deploy-nrdot-final.sh

# Option 2: Direct deployment with profile
./switch-collector.sh  # Choose profile
./deploy-configurable-collectors.sh
```

### 3. Verify Data
Check your data at: https://one.newrelic.com/data-explorer

## Features

- ✅ **Multi-Distribution Support**: NRDOT, NRDOT Plus, OpenTelemetry
- ✅ **Security First**: Non-root, secrets management, least privilege
- ✅ **Configurable**: Profile system, environment templates
- ✅ **Process Metrics**: Full process visibility enabled
- ✅ **Cloud Ready**: Support for AWS, GCP, Azure metadata
- ✅ **Production Ready**: Health checks, monitoring, logging

## File Structure

```
devstack/
├── .env.template                    # Environment template (copy to .env)
├── .gitignore                       # Security-aware git ignore
│
├── deploy-nrdot-final.sh           # Main deployment script
├── deploy-configurable-collectors.sh # Advanced deployment
├── deploy-advanced-collectors.sh    # Full-featured deployment
├── switch-collector.sh              # Profile switcher
│
├── collector-config.env             # Basic configuration
├── collector-config-advanced.env    # Advanced configuration
│
├── collector-profiles/              # Pre-configured profiles
│   ├── nrdot-host.env              # NRDOT host monitoring
│   ├── nrdot-k8s.env               # NRDOT Kubernetes
│   ├── nrdot-plus-complete.env     # NRDOT Plus (enhanced)
│   ├── otel-contrib.env            # OpenTelemetry Contrib
│   └── custom-example.env          # Custom template
│
├── SECURITY-GUIDELINES.md           # Security best practices
├── COLLECTOR-CONFIG-README.md       # Configuration guide
├── NRDOT-DEPLOYMENT-SUMMARY.md      # Complete analysis
└── troubleshooting-analysis.md      # Troubleshooting guide
```

## Supported Collectors

### 1. NRDOT Host
- Standard New Relic distribution
- Optimized for host monitoring
- Built-in New Relic defaults

### 2. NRDOT Plus
- Enhanced distribution (if available)
- Additional receivers and processors
- Cloud-native features
- Multi-tenant support

### 3. OpenTelemetry Contrib
- Standard OpenTelemetry
- Maximum flexibility
- Community supported

### 4. Custom
- Any OTel-compatible collector
- Full configuration control

## Configuration

### Basic Example
```bash
# Set in .env
NEW_RELIC_LICENSE_KEY=xxxxx...NRAL
NEW_RELIC_ACCOUNT_ID=1234567
NUM_COLLECTORS=5
```

### Advanced Example
```bash
# Set in collector-config-advanced.env
COLLECTOR_IMAGE=mycompany/custom-nrdot:v2.0
CLOUD_PROVIDER=aws
ENABLE_PROMETHEUS_RECEIVER=true
MEMORY_LIMIT_MIB=1024
```

## Security

### API Key Management
- Never hardcode keys
- Use .env files (git-ignored)
- Rotate keys regularly

### Container Security
- Runs as non-root user
- Minimal capabilities
- Read-only root filesystem
- Resource limits enforced

### Network Security
- TLS enforced
- Limited port exposure
- localhost binding where possible

## Monitoring

### Health Checks
```bash
# Check collector health
curl http://localhost:4318/health

# View logs
docker logs nrdot-vm-1
```

### Queries
```sql
-- Basic check
FROM Metric SELECT count(*) 
WHERE service.name = 'openstack-vm' 
SINCE 10 minutes ago

-- Process metrics
FROM Metric SELECT average(process.cpu.utilization) 
WHERE service.name = 'openstack-vm' 
FACET process.name 
SINCE 10 minutes ago
```

## Troubleshooting

### No Data Visible
1. Check logs: `docker logs nrdot-vm-1`
2. Verify API key ends with `NRAL`
3. Confirm account ID is correct
4. Wait 2-3 minutes for initial data

### 403 Errors
- Wrong API key type (need License Key)
- Key not valid for account
- Region mismatch

### Container Crashes
- Check memory limits
- Verify configuration syntax
- Review security constraints

## Advanced Usage

### Custom Collector
```bash
# Edit configuration
vim collector-config-advanced.env

# Set custom image
COLLECTOR_IMAGE=myregistry/my-otel:latest
COLLECTOR_TYPE=custom

# Deploy
./deploy-advanced-collectors.sh
```

### Multi-Environment
```bash
# Development
NRDOT_PLUS_ENVIRONMENT=development ./deploy-nrdot-final.sh

# Production
NRDOT_PLUS_ENVIRONMENT=production ./deploy-nrdot-final.sh
```

## Contributing

1. Follow security guidelines
2. Test with multiple profiles
3. Document new features
4. Never commit secrets

## Support

- Review `NRDOT-DEPLOYMENT-SUMMARY.md` for detailed analysis
- Check `troubleshooting-analysis.md` for common issues
- Consult `SECURITY-GUIDELINES.md` for security questions

## License

This deployment system is provided as-is for use with New Relic NRDOT and OpenTelemetry collectors.