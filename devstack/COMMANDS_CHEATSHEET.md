# NRDOT + OpenStack Commands Cheat Sheet

## 🚀 Quick Start Commands

```bash
# 1. Set up environment
source ./load-env.sh

# 2. Quick test NRDOT
./quick-test.sh

# 3. Install NRDOT (interactive menu)
./install-nrdot-binary.sh

# 4. Verify setup
./verify-nrdot.sh
```

## 📦 NRDOT Binary Installation

```bash
# Direct binary installation (one-liner)
export collector_version="1.1.0" && \
export collector_arch="amd64" && \
curl -L "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${collector_version}/nrdot-collector-host_${collector_version}_linux_${collector_arch}.tar.gz" | \
tar -xz && \
NEW_RELIC_LICENSE_KEY="$NEW_RELIC_LICENSE_KEY" ./nrdot-collector-host --config ./config.yaml
```

## 🐳 Docker Commands

```bash
# Run NRDOT in Docker
docker run -d --name nrdot \
  -e NEW_RELIC_LICENSE_KEY="$NEW_RELIC_LICENSE_KEY" \
  -e OTEL_RESOURCE_ATTRIBUTES="service.name=docker-test" \
  -p 4317:4317 -p 4318:4318 \
  newrelic/nrdot-collector-host:latest

# View logs
docker logs -f nrdot

# Stop
docker stop nrdot && docker rm nrdot
```

## 🖥️ Multipass Commands (DevStack)

```bash
# Setup DevStack VM
./setup-multipass-devstack.sh

# Access VM
multipass shell devstack-vm

# Get VM IP
multipass info devstack-vm | grep IPv4

# Stop/Start VM
multipass stop devstack-vm
multipass start devstack-vm

# Delete VM
multipass delete devstack-vm && multipass purge
```

## ☁️ OpenStack Commands

```bash
# Source credentials
source ./openrc

# List resources
openstack server list
openstack network list
openstack floating ip list

# Deploy with NRDOT
cd automation/scripts
./deploy-web-stack.sh my-project

# Monitor instances
./monitor-instances.sh my-project

# Cleanup
./cleanup-stack.sh my-project
```

## 🔧 Terraform Commands

```bash
cd automation/terraform

# Initialize
terraform init

# Plan with NRDOT
terraform plan \
  -var="new_relic_license_key=$NEW_RELIC_LICENSE_KEY" \
  -var="instance_count=3"

# Apply
terraform apply -auto-approve \
  -var="new_relic_license_key=$NEW_RELIC_LICENSE_KEY"

# Destroy
terraform destroy -auto-approve
```

## 📋 Ansible Commands

```bash
cd automation/ansible

# Deploy VMs
ansible-playbook deploy-vms.yml

# Deploy NRDOT
ansible-playbook deploy-nrdot.yml

# Configure all
ansible-playbook configure-vms.yml
```

## 🐍 Python Commands

```bash
cd automation/python

# Install dependencies
pip install -r requirements.txt

# Run automation
python openstack_automation.py

# Batch operations
python batch_operations.py
```

## 📊 New Relic Queries

```sql
-- Find all NRDOT hosts
FROM SystemSample SELECT * 
WHERE instrumentation.provider = 'opentelemetry' 
SINCE 30 minutes ago

-- Find OpenStack VMs
FROM SystemSample SELECT * 
WHERE cloud.provider = 'openstack' 
SINCE 1 hour ago

-- Check specific service
FROM Span SELECT * 
WHERE service.name LIKE '%nrdot%' 
SINCE 1 hour ago

-- View logs
FROM Log SELECT * 
WHERE collector.name = 'nrdot-collector-host' 
SINCE 30 minutes ago
```

## 🔍 Troubleshooting Commands

```bash
# Check NRDOT processes
ps aux | grep nrdot
docker ps | grep nrdot

# Test OTLP endpoint
curl -I http://localhost:4318/v1/traces

# Test New Relic connectivity
curl -X POST https://otlp.nr-data.net/v1/traces \
  -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# View NRDOT logs
docker logs nrdot
journalctl -u nrdot-collector-host -f
tail -f ~/nrdot-test/nrdot.log

# Debug mode
./nrdot-collector-host --config config.yaml \
  --config 'yaml:service::telemetry::logs::level: debug'
```

## 🧹 Cleanup Commands

```bash
# Stop all NRDOT
docker stop $(docker ps -q --filter "name=nrdot")
pkill -f nrdot-collector-host

# Remove OpenStack resources
for server in $(openstack server list -f value -c ID); do
  openstack server delete $server
done

# Clean Docker
docker system prune -a

# Remove files
rm -rf ~/nrdot-test ~/.nrdot
```

## 📝 Configuration Examples

### Environment Variables
```bash
export NEW_RELIC_LICENSE_KEY="your-key-here"
export OTEL_RESOURCE_ATTRIBUTES="service.name=my-app,environment=prod"
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.nr-data.net"
export NEW_RELIC_MEMORY_LIMIT_MIB=100
```

### YAML Config Override
```bash
./nrdot-collector-host --config config.yaml \
  --config 'yaml:receivers::hostmetrics::collection_interval: 30s' \
  --config 'yaml:receivers::hostmetrics::scrapers::process: { metrics: { process.cpu.utilization: { enabled: true } } }'
```

## 🔗 Useful Links

- NRDOT Releases: https://github.com/newrelic/nrdot-collector-releases/releases
- New Relic UI: https://one.newrelic.com
- OpenStack Dashboard: http://localhost/dashboard (admin/secret)
- NRQL Console: https://one.newrelic.com/nrql-console