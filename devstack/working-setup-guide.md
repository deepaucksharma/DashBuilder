# Working Setup Guide: OpenStack + NRDOT Collector

## Official Documentation References

### New Relic Documentation
- **NRDOT Collector**: https://docs.newrelic.com/docs/infrastructure/host-integrations/installation/nrdot-collector/
- **OpenTelemetry**: https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/opentelemetry-introduction/
- **Infrastructure Monitoring**: https://docs.newrelic.com/docs/infrastructure/infrastructure-monitoring/get-started/get-started-infrastructure-monitoring/
- **OTLP Endpoint Reference**: https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/opentelemetry-setup/#otlp

### GitHub Documentation
- **NRDOT Releases**: https://github.com/newrelic/nrdot-collector-releases
- **OpenTelemetry Collector**: https://github.com/open-telemetry/opentelemetry-collector
- **DevStack**: https://github.com/openstack/devstack

## Working Setup Options

### Option 1: Local NRDOT Testing (Quickest)

This verifies your New Relic connectivity before deploying to OpenStack.

```bash
# 1. Test NRDOT locally first
./test-nrdot-locally.sh

# 2. Verify data in New Relic
# Go to: https://one.newrelic.com/nr1-core/infrastructure/hosts
# Look for host.id = "docker-test"
```

### Option 2: Using Multipass (Recommended for Mac)

Since DevStack has issues running in Docker on Mac, use Multipass:

```bash
# 1. Install Multipass
brew install --cask multipass

# 2. Create Ubuntu VM
multipass launch --name devstack --cpus 4 --memory 8G --disk 40G 22.04

# 3. Install DevStack in VM
multipass exec devstack -- bash -c '
git clone https://opendev.org/openstack/devstack
cd devstack
cat > local.conf << EOF
[[local|localrc]]
ADMIN_PASSWORD=secret
DATABASE_PASSWORD=secret
RABBIT_PASSWORD=secret
SERVICE_PASSWORD=secret
HOST_IP=$(hostname -I | awk "{print \$1}")
EOF
./stack.sh
'

# 4. Get VM IP
DEVSTACK_IP=$(multipass info devstack | grep IPv4 | awk '{print $2}')
echo "DevStack IP: $DEVSTACK_IP"

# 5. Update your openrc
sed "s/localhost/$DEVSTACK_IP/g" openrc.template > openrc
```

### Option 3: Production-Ready Cloud Deployment

Use actual cloud providers that support NRDOT natively:

#### AWS with Terraform
```hcl
# Use official New Relic AWS integration
# https://docs.newrelic.com/docs/infrastructure/amazon-integrations/get-started/introduction-aws-integrations/

resource "aws_instance" "app" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.micro"
  
  user_data = templatefile("cloud-init-nrdot.yaml", {
    new_relic_license_key = var.new_relic_license_key
    environment          = "production"
  })
  
  tags = {
    Name = "nrdot-monitored-instance"
  }
}
```

## NRDOT Collector Configuration

### Official Installation Methods

Based on [NRDOT official docs](https://github.com/newrelic/nrdot-collector-releases#installation):

#### 1. Package Installation (DEB/RPM)
```bash
# Ubuntu/Debian
wget https://github.com/newrelic/nrdot-collector-releases/releases/download/v1.1.0/nrdot-collector-host_1.1.0_linux_amd64.deb
sudo dpkg -i nrdot-collector-host_1.1.0_linux_amd64.deb

# RHEL/CentOS
wget https://github.com/newrelic/nrdot-collector-releases/releases/download/v1.1.0/nrdot-collector-host_1.1.0_linux_x86_64.rpm
sudo rpm -i nrdot-collector-host_1.1.0_linux_x86_64.rpm
```

#### 2. Docker Installation
```bash
docker run -d \
  --name nrdot-collector \
  --restart unless-stopped \
  -v /:/hostfs:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e NEW_RELIC_LICENSE_KEY=$NEW_RELIC_LICENSE_KEY \
  -e OTEL_RESOURCE_ATTRIBUTES="service.name=my-service,environment=production" \
  -p 4317:4317 \
  -p 4318:4318 \
  newrelic/nrdot-collector-host:latest \
  --config /etc/nrdot-collector-host/config.yaml \
  --config 'yaml:receivers::hostmetrics::root_path: /hostfs'
```

### Environment Variables (Official)

From [New Relic OTLP docs](https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/opentelemetry-setup/):

```bash
# Required
export NEW_RELIC_LICENSE_KEY="your-license-key"

# Optional but recommended
export OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.nr-data.net"
export OTEL_RESOURCE_ATTRIBUTES="service.name=my-service,environment=production,team=backend"
export NEW_RELIC_MEMORY_LIMIT_MIB=100
```

## Sending Data to New Relic

### 1. Direct OTLP Export
```yaml
# Based on: https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/opentelemetry-setup/#otlp
exporters:
  otlphttp:
    endpoint: https://otlp.nr-data.net
    headers:
      api-key: ${NEW_RELIC_LICENSE_KEY}
```

### 2. Via Local NRDOT Collector
```python
# Application sends to local NRDOT
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

exporter = OTLPSpanExporter(
    endpoint="localhost:4317",
    insecure=True
)
```

## Verification in New Relic

### Using New Relic UI
1. **Infrastructure**: https://one.newrelic.com/nr1-core/infrastructure/hosts
2. **APM & Services**: https://one.newrelic.com/nr1-core/apm-and-services
3. **Logs**: https://one.newrelic.com/nr1-core/logging/logs

### NRQL Queries (Official Examples)
From [New Relic NRQL docs](https://docs.newrelic.com/docs/query-your-data/nrql-new-relic-query-language/get-started/introduction-nrql-new-relics-query-language/):

```sql
-- Find NRDOT hosts
FROM SystemSample SELECT * WHERE instrumentation.provider = 'opentelemetry'

-- View metrics
FROM Metric SELECT * WHERE otel.library.name LIKE '%nrdot%'

-- Check traces
FROM Span SELECT * WHERE otel.library.name IS NOT NULL

-- View logs
FROM Log SELECT * WHERE collector.name = 'nrdot-collector-host'
```

## Complete Working Example

### 1. Local Docker Compose Setup
```yaml
# docker-compose-complete.yml
version: '3.8'

services:
  # NRDOT Collector
  nrdot:
    image: newrelic/nrdot-collector-host:latest
    container_name: nrdot-local
    environment:
      - NEW_RELIC_LICENSE_KEY=${NEW_RELIC_LICENSE_KEY}
      - OTEL_RESOURCE_ATTRIBUTES=service.name=local-dev,environment=development
    ports:
      - "4317:4317"  # OTLP gRPC
      - "4318:4318"  # OTLP HTTP
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /:/hostfs:ro
    command: |
      --config /etc/nrdot-collector-host/config.yaml
      --config 'yaml:receivers::hostmetrics::root_path: /hostfs'

  # Sample app that sends to NRDOT
  sample-app:
    build: ./sample-app
    environment:
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://nrdot:4317
      - OTEL_SERVICE_NAME=sample-app
    depends_on:
      - nrdot
```

### 2. Kubernetes Deployment
Based on [NRDOT K8s examples](https://github.com/newrelic/nrdot-collector-releases/tree/main/examples/kubernetes):

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nrdot-collector
spec:
  selector:
    matchLabels:
      app: nrdot-collector
  template:
    metadata:
      labels:
        app: nrdot-collector
    spec:
      containers:
      - name: nrdot-collector
        image: newrelic/nrdot-collector-host:latest
        env:
        - name: NEW_RELIC_LICENSE_KEY
          valueFrom:
            secretKeyRef:
              name: newrelic-license-key
              key: license-key
        - name: OTEL_RESOURCE_ATTRIBUTES
          value: "k8s.cluster.name=my-cluster"
        volumeMounts:
        - name: hostfs
          mountPath: /hostfs
          readOnly: true
      volumes:
      - name: hostfs
        hostPath:
          path: /
```

## Troubleshooting with Official Tools

### 1. NRDOT Debug Mode
From [NRDOT troubleshooting](https://github.com/newrelic/nrdot-collector-releases/blob/main/distributions/nrdot-collector-host/TROUBLESHOOTING.md):

```bash
# Enable debug logging
nrdot-collector-host \
  --config /etc/nrdot-collector-host/config.yaml \
  --config 'yaml:service::telemetry::logs::level: debug'
```

### 2. New Relic Diagnostics
```bash
# Download New Relic Diagnostics
curl -O https://download.newrelic.com/nrdiag/nrdiag_latest.zip
unzip nrdiag_latest.zip

# Run diagnostics
./nrdiag -t Infrastructure/*
```

### 3. OTLP Validation
```bash
# Test OTLP endpoint
curl -X POST https://otlp.nr-data.net/v1/traces \
  -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
# Should return 400 with "invalid data format" (expected for empty payload)
```

## Best Practices from Official Docs

### 1. Resource Attributes
From [New Relic best practices](https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/opentelemetry-concepts/):

```yaml
# Always include these attributes
service.name: "your-service"
service.version: "1.0.0"
environment: "production"
team: "backend"
```

### 2. Security
From [New Relic security docs](https://docs.newrelic.com/docs/security/):
- Never commit license keys
- Use environment variables or secrets management
- Rotate keys regularly
- Use separate keys for different environments

### 3. Performance
From [NRDOT performance guide](https://github.com/newrelic/nrdot-collector-releases#performance):
- Set appropriate memory limits
- Use batch processors
- Configure proper sampling
- Monitor collector metrics

## Support Resources

### Official Support
- **New Relic Support**: https://support.newrelic.com
- **Community Forum**: https://discuss.newrelic.com
- **GitHub Issues**: https://github.com/newrelic/nrdot-collector-releases/issues

### Documentation
- **New Relic Docs**: https://docs.newrelic.com
- **OpenTelemetry Docs**: https://opentelemetry.io/docs/
- **NRDOT GitHub**: https://github.com/newrelic/nrdot-collector-releases

### Training
- **New Relic University**: https://learn.newrelic.com
- **OpenTelemetry Tutorials**: https://opentelemetry.io/docs/tutorials/