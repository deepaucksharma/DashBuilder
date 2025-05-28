# Complete Setup Guide: OpenStack DevStack with NRDOT Collector

## Quick Start (5 Minutes)

### 1. Set Your License Key
```bash
# Edit .env file and add your New Relic license key
echo 'NEW_RELIC_LICENSE_KEY=your-actual-license-key-here' >> .env
source ./load-env.sh
```

### 2. Test NRDOT Locally First
```bash
# This verifies your license key and connectivity
./install-nrdot-binary.sh
# Choose option 1 for direct binary run
```

### 3. Verify Data in New Relic
Go to: https://one.newrelic.com/nr1-core/infrastructure/hosts

Look for a host with:
- `service.name = "test-direct"`
- `instrumentation.provider = "opentelemetry"`

## Full OpenStack + NRDOT Setup

### Option A: Using Multipass (Recommended for macOS)

```bash
# 1. Install and setup DevStack in VM
./setup-multipass-devstack.sh

# 2. Deploy VMs with NRDOT
source ./openrc
cd automation/scripts
./deploy-web-stack.sh nrdot-test

# 3. Verify
./verify-nrdot.sh
```

### Option B: Using Docker (Simpler but Limited)

```bash
# 1. Start NRDOT collector
./install-nrdot-binary.sh
# Choose option 2 for Docker

# 2. Send test data
./verify-nrdot.sh

# 3. Deploy test applications
cd automation/terraform
terraform init
terraform apply -var="new_relic_license_key=$NEW_RELIC_LICENSE_KEY"
```

### Option C: Direct Binary Installation

```bash
# Download and run NRDOT directly
export collector_distro="nrdot-collector-host"
export collector_version="1.1.0"
export collector_arch="amd64"  # or arm64 for M1/M2 Macs
export license_key="$NEW_RELIC_LICENSE_KEY"

curl -L -o collector.tar.gz \
  "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${collector_version}/${collector_distro}_${collector_version}_linux_${collector_arch}.tar.gz"

tar -xzf collector.tar.gz

NEW_RELIC_LICENSE_KEY="${license_key}" \
OTEL_RESOURCE_ATTRIBUTES="service.name=my-service,environment=dev" \
./nrdot-collector-host --config ./config.yaml
```

## Automation Options

### 1. Terraform (Infrastructure as Code)
```bash
cd automation/terraform
terraform init
terraform plan -var="new_relic_license_key=$NEW_RELIC_LICENSE_KEY"
terraform apply -auto-approve
```

### 2. Ansible (Configuration Management)
```bash
cd automation/ansible
ansible-playbook deploy-vms.yml
ansible-playbook deploy-nrdot.yml
```

### 3. Python SDK (Programmatic)
```python
from openstack_automation import OpenStackAutomation

automation = OpenStackAutomation()
server = automation.launch_instance(
    name="nrdot-vm",
    enable_nrdot=True  # Automatically installs NRDOT
)
```

### 4. Shell Scripts (Quick Deployment)
```bash
cd automation/scripts
./deploy-web-stack.sh my-app
```

## Verification Steps

### 1. Check Local NRDOT
```bash
# Check if running
ps aux | grep nrdot
docker ps | grep nrdot

# View logs
docker logs nrdot-test
tail -f ~/nrdot-test/nrdot.log
```

### 2. Test Connectivity
```bash
# Test OTLP endpoint
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'

# Should return an error about empty spans (this is good!)
```

### 3. New Relic Queries

```sql
-- Find all NRDOT hosts
FROM SystemSample 
SELECT * 
WHERE instrumentation.provider = 'opentelemetry' 
SINCE 30 minutes ago

-- Find specific test data
FROM Span 
SELECT * 
WHERE service.name LIKE '%nrdot%' 
SINCE 1 hour ago

-- Check OpenStack VMs
FROM SystemSample 
SELECT * 
WHERE cloud.provider = 'openstack' 
OR service.name LIKE '%openstack%' 
SINCE 1 hour ago
```

## Troubleshooting

### Common Issues

1. **"License key not set"**
   ```bash
   # Check your .env file
   grep NEW_RELIC_LICENSE_KEY .env
   # Make sure it's not the placeholder value
   ```

2. **"No data in New Relic"**
   - Wait 2-3 minutes for data to appear
   - Check NRDOT logs for errors
   - Verify network connectivity to otlp.nr-data.net
   - Ensure license key is valid

3. **"Container keeps exiting"**
   ```bash
   # Check logs
   docker logs nrdot-test
   # Try running interactively
   docker run -it --rm \
     -e NEW_RELIC_LICENSE_KEY="$NEW_RELIC_LICENSE_KEY" \
     newrelic/nrdot-collector-host:latest
   ```

4. **"DevStack won't start"**
   - Use Multipass instead of Docker for DevStack
   - Ensure you have enough resources (8GB RAM, 40GB disk)

### Debug Mode

```bash
# Enable debug logging
NEW_RELIC_LICENSE_KEY="$NEW_RELIC_LICENSE_KEY" \
./nrdot-collector-host \
  --config ./config.yaml \
  --config 'yaml:service::telemetry::logs::level: debug'
```

## Official Documentation Links

### New Relic
- [NRDOT Collector Host](https://github.com/newrelic/nrdot-collector-releases/tree/main/distributions/nrdot-collector-host)
- [OpenTelemetry Setup](https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/opentelemetry-setup/)
- [Infrastructure Monitoring](https://docs.newrelic.com/docs/infrastructure/infrastructure-monitoring/get-started/get-started-infrastructure-monitoring/)
- [NRQL Reference](https://docs.newrelic.com/docs/query-your-data/nrql-new-relic-query-language/get-started/introduction-nrql-new-relics-query-language/)

### OpenStack
- [DevStack Documentation](https://docs.openstack.org/devstack/latest/)
- [OpenStack CLI](https://docs.openstack.org/python-openstackclient/latest/)

### GitHub
- [NRDOT Releases](https://github.com/newrelic/nrdot-collector-releases/releases)
- [Examples](https://github.com/newrelic/nrdot-collector-releases/tree/main/examples)

## Clean Up

```bash
# Stop NRDOT
docker stop nrdot-test nrdot-binary 2>/dev/null
pkill -f nrdot-collector-host

# Remove OpenStack resources
cd automation/scripts
./cleanup-stack.sh nrdot-test

# Stop DevStack VM
multipass stop devstack-vm

# Full cleanup
docker system prune -a
multipass delete devstack-vm && multipass purge
```

## Next Steps

1. **Production Deployment**: Use the cloud-init templates for automated deployment
2. **Monitoring**: Set up alerts in New Relic for your OpenStack infrastructure
3. **Scaling**: Use Heat templates for auto-scaling with NRDOT pre-installed
4. **Integration**: Connect your applications to send telemetry through NRDOT

## Support

- **New Relic Support**: https://support.newrelic.com
- **Community Forum**: https://discuss.newrelic.com
- **GitHub Issues**: https://github.com/newrelic/nrdot-collector-releases/issues