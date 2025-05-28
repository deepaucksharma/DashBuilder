# NRDOT Collector Integration with OpenStack VMs

This guide explains how the NRDOT collector has been integrated into the OpenStack automation tools to automatically deploy and configure monitoring on each VM.

## Overview

NRDOT Collector Host is automatically deployed on every VM to:
- Monitor host metrics (CPU, memory, disk, network)
- Collect system logs
- Enrich telemetry data with OpenStack metadata
- Send all data to New Relic via OTLP

## Configuration

### Environment Variables

Set these in your `.env` file:
```bash
# Required
NEW_RELIC_LICENSE_KEY=your_license_key_here

# Optional
ENVIRONMENT=production
NEW_RELIC_MEMORY_LIMIT_MIB=100
```

### Source the environment
```bash
source ./load-env.sh
```

## Usage Examples

### 1. Terraform Deployment

```bash
cd automation/terraform

# Deploy with NRDOT collector
terraform apply \
  -var="new_relic_license_key=$NEW_RELIC_LICENSE_KEY" \
  -var="environment=production" \
  -var="instance_count=3"
```

### 2. Ansible Deployment

```bash
cd automation/ansible

# Deploy VMs with NRDOT
ansible-playbook deploy-vms.yml
ansible-playbook deploy-nrdot.yml
```

### 3. Python SDK

```python
from openstack_automation import OpenStackAutomation

# NRDOT is enabled by default
automation = OpenStackAutomation()
server = automation.launch_instance(
    name="my-vm",
    enable_nrdot=True  # Default
)
```

### 4. Shell Script

```bash
cd automation/scripts

# Deploy with NRDOT (reads NEW_RELIC_LICENSE_KEY from env)
./deploy-web-stack.sh my-project
```

## What Gets Deployed

Each VM automatically gets:
1. **NRDOT Collector Service** - Running as systemd service
2. **Host Metrics Collection** - CPU, memory, disk, network metrics
3. **Log Collection** - System logs from /var/log
4. **Resource Detection** - Automatic cloud metadata enrichment
5. **OTLP Endpoints** - Local endpoints for application telemetry

## Monitoring Your VMs

### New Relic UI
1. Go to New Relic One
2. Navigate to Infrastructure > Hosts
3. Filter by `cloud.provider:openstack`
4. View metrics, logs, and traces

### Useful Queries
```sql
-- Find all OpenStack VMs
FROM SystemSample SELECT * WHERE cloud.provider = 'openstack'

-- CPU usage by VM
FROM SystemSample SELECT average(cpuPercent) 
WHERE cloud.provider = 'openstack' 
FACET host.name TIMESERIES

-- Logs from specific VM
FROM Log SELECT * 
WHERE host.name = 'app-server-1' 
AND cloud.provider = 'openstack'
```

## Sending Application Telemetry

Applications running on the VMs can send telemetry to the local NRDOT collector:

### OpenTelemetry SDK Configuration
```python
# Python example
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

# Send to local NRDOT collector
exporter = OTLPSpanExporter(
    endpoint="localhost:4317",
    insecure=True
)
```

### Environment Variables for Apps
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_SERVICE_NAME=my-app
```

## Troubleshooting

### Check NRDOT Status
```bash
# SSH into VM
ssh -i keypair.pem ubuntu@<floating-ip>

# Check service status
sudo systemctl status nrdot-collector-host

# View logs
sudo journalctl -u nrdot-collector-host -f

# Check configuration
cat /etc/nrdot-collector-host/nrdot-collector-host.env
```

### Common Issues

1. **No host entity in New Relic**
   - Check if host.id is being set correctly
   - Verify license key is valid

2. **Service not starting**
   - Check logs for errors
   - Verify download URL is accessible
   - Check disk space

3. **No metrics/logs**
   - Verify network connectivity to otlp.nr-data.net
   - Check firewall rules

## Customization

### Enable Process Metrics
Add to cloud-init or user data:
```bash
/usr/bin/nrdot-collector-host \
  --config /etc/nrdot-collector-host/config.yaml \
  --config='yaml:receivers::hostmetrics::scrapers::process: { metrics: { process.cpu.utilization: { enabled: true } } }'
```

### Custom Resource Attributes
Set via environment:
```bash
OTEL_RESOURCE_ATTRIBUTES="team=backend,app=api,env=prod"
```

### Adjust Memory Limit
```bash
NEW_RELIC_MEMORY_LIMIT_MIB=200
```

## Security Considerations

1. **License Key** - Always use environment variables, never hardcode
2. **Network** - NRDOT only needs outbound HTTPS to New Relic
3. **Permissions** - Runs as dedicated user (nrdot-collector-host)
4. **Logs** - Only system logs are collected by default

## Performance Impact

- CPU: < 1% average usage
- Memory: 50-100MB (configurable)
- Disk: Minimal (logs are streamed)
- Network: Compressed OTLP protocol

## Support

- NRDOT Documentation: https://github.com/newrelic/nrdot-collector-releases
- New Relic Support: https://support.newrelic.com
- OpenStack Integration Issues: Create issue in this repo