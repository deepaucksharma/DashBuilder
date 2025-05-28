# Configurable Collector Deployment

This setup allows you to easily switch between different NRDOT distributions or any OpenTelemetry collector.

## Quick Start

### Use NRDOT Host Collector
```bash
./switch-collector.sh
# Select option 1
```

### Use Custom Collector
1. Edit `collector-config.env`
2. Set your collector image and configuration
3. Run `./deploy-configurable-collectors.sh`

## Configuration Files

### collector-config.env
Main configuration file with all deployment parameters:
- `COLLECTOR_IMAGE`: Docker image to use
- `COLLECTOR_TYPE`: Either "nrdot" or "otel"
- `NUM_COLLECTORS`: Number of collectors to deploy
- Plus many more options

### Collector Profiles
Pre-configured profiles in `collector-profiles/`:
- `nrdot-host.env`: NRDOT host monitoring
- `nrdot-k8s.env`: NRDOT Kubernetes monitoring  
- `otel-contrib.env`: Standard OpenTelemetry

## Examples

### Deploy NRDOT Host Collector
```bash
# Option 1: Use the switcher
./switch-collector.sh
# Select 1, then y to deploy

# Option 2: Manual
cp collector-profiles/nrdot-host.env collector-config.env
./deploy-configurable-collectors.sh
```

### Deploy Custom Collector
```bash
# Edit configuration
vim collector-config.env

# Set your image
COLLECTOR_IMAGE=myregistry/mycollector:v1.0.0

# Deploy
./deploy-configurable-collectors.sh
```

### Deploy with Different Number of Instances
```bash
# Edit collector-config.env
NUM_COLLECTORS=10

# Deploy 10 instances
./deploy-configurable-collectors.sh
```

## Advanced Configuration

### Custom Resource Attributes
Edit `RESOURCE_ATTRIBUTES_TEMPLATE` in collector-config.env:
```
RESOURCE_ATTRIBUTES_TEMPLATE="service.name=my-service,host.id={{HOSTNAME}},index={{INDEX}}"
```

### Additional Volume Mounts
```
ADDITIONAL_VOLUMES="/custom/path:/container/path:ro,/another:/path:rw"
```

### Custom Environment Variables
```
ADDITIONAL_ENV_VARS="MY_VAR=value,ANOTHER_VAR=value2"
```

### Network Configuration
- Set `NETWORK_MODE=host` for host network
- Set `PID_MODE=host` for process visibility

## NRDOT Specific Configuration

### For NRDOT Host Collector
```bash
COLLECTOR_IMAGE=newrelic/nrdot-collector-host:latest
COLLECTOR_TYPE=nrdot
CONFIG_PATH=/etc/nrdot-collector-host/config.yaml
COLLECTOR_ARGS='--config yaml:receivers::hostmetrics::root_path: /hostfs'
```

### For NRDOT K8s Collector
```bash
COLLECTOR_IMAGE=newrelic/nrdot-collector-k8s:latest
COLLECTOR_TYPE=nrdot
CONFIG_PATH=/etc/nrdot-collector-k8s/config.yaml
COLLECTOR_ARGS=''
```

## Troubleshooting

### Check Logs
```bash
docker logs nrdot-vm-1
```

### Verify Configuration
```bash
docker exec nrdot-vm-1 cat /config.yaml
```

### Test Different Images
```bash
# Test official NRDOT
COLLECTOR_IMAGE=newrelic/nrdot-collector-host:latest ./deploy-configurable-collectors.sh

# Test your custom build
COLLECTOR_IMAGE=myregistry/custom-nrdot:test ./deploy-configurable-collectors.sh
```

## Integration with CI/CD

```bash
# Set configuration via environment
export COLLECTOR_IMAGE=myregistry/nrdot:${BUILD_TAG}
export NUM_COLLECTORS=3
./deploy-configurable-collectors.sh
```

## Notes

- The script automatically handles differences between NRDOT and standard OTEL collectors
- Configuration is generated dynamically based on collector type
- All collectors share the same base configuration
- Each collector gets unique ports and resource attributes