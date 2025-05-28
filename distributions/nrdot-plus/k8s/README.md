# NRDOT v2 Kubernetes Deployment

This directory contains Kubernetes manifests for deploying NRDOT v2 in a Kubernetes cluster.

## Quick Start

1. **Create namespace and apply base resources:**
```bash
kubectl apply -f namespace.yaml
```

2. **Create the license key secret:**
```bash
kubectl create secret generic nrdot-license \
  -n nrdot-system \
  --from-literal=license-key=YOUR_NEW_RELIC_LICENSE_KEY
```

3. **Deploy using Kustomize:**
```bash
kubectl apply -k .
```

Or manually:
```bash
kubectl apply -f rbac.yaml
kubectl apply -f configmap.yaml
kubectl apply -f daemonset.yaml
kubectl apply -f service.yaml
```

4. **Verify deployment:**
```bash
# Check pods are running
kubectl get pods -n nrdot-system

# Check metrics endpoint
kubectl port-forward -n nrdot-system daemonset/nrdot-collector 8889:8889
curl http://localhost:8889/metrics

# Check logs
kubectl logs -n nrdot-system -l app.kubernetes.io/name=nrdot -f
```

## Architecture Options

### Option 1: DaemonSet (Default)
- Runs on every node
- Monitors local processes
- Best for comprehensive monitoring
- Use: `daemonset.yaml`

### Option 2: Deployment (Gateway)
- Centralized collection
- Receives metrics from other sources
- Best for aggregation scenarios
- Use: `deployment.yaml` + `hpa.yaml`

## Files Description

- **namespace.yaml**: Creates the nrdot-system namespace
- **rbac.yaml**: ServiceAccount, ClusterRole, and bindings for permissions
- **configmap.yaml**: Contains collector and optimization configurations
- **secret.yaml**: Template for New Relic license key (DO NOT commit actual keys)
- **daemonset.yaml**: DaemonSet for node-level process monitoring
- **deployment.yaml**: Alternative deployment for gateway mode
- **service.yaml**: Services for metrics and OTLP endpoints
- **hpa.yaml**: Horizontal Pod Autoscaler for deployment mode
- **monitoring.yaml**: Prometheus ServiceMonitor and alerts
- **kustomization.yaml**: Kustomize configuration for easy deployment

## Configuration

### Environment Variables
Set in the pod spec:
- `NEW_RELIC_LICENSE_KEY`: Your New Relic license key
- `NRDOT_ENVIRONMENT`: Environment name (production, staging, etc.)
- `NRDOT_VERSION`: Version tag

### Resource Limits
Default limits (adjust based on your needs):
- CPU: 500m (request: 100m)
- Memory: 512Mi (request: 128Mi)

### Security Context
- Runs as non-root user (UID 1001)
- Read-only root filesystem
- All capabilities dropped
- No privilege escalation

## Monitoring

### Prometheus Integration
If using Prometheus Operator:
```bash
kubectl apply -f monitoring.yaml
```

This creates:
- ServiceMonitor for automatic scraping
- PrometheusRule for alerting
- PodMonitor for pod-level metrics

### Built-in Metrics
Access metrics at:
- `:8888/metrics` - Internal telemetry
- `:8889/metrics` - Prometheus format
- `:13133/` - Health check
- `:55679/debug/tracez` - Debug traces

## Troubleshooting

### Check collector status:
```bash
kubectl describe pods -n nrdot-system
kubectl logs -n nrdot-system -l app.kubernetes.io/name=nrdot --tail=100
```

### Verify configuration:
```bash
kubectl get configmap -n nrdot-system nrdot-config -o yaml
```

### Test connectivity to New Relic:
```bash
kubectl exec -n nrdot-system -it daemonset/nrdot-collector -- wget -O- https://otlp.nr-data.net/v1/metrics
```

## Production Checklist

- [ ] Set appropriate resource limits based on node capacity
- [ ] Configure node selectors/tolerations for specific nodes
- [ ] Set up proper secret management (not plain text)
- [ ] Configure monitoring and alerting
- [ ] Set up log aggregation
- [ ] Plan for upgrades and rollbacks
- [ ] Configure network policies if needed
- [ ] Set up backup of configurations

## Upgrading

1. Update the image tag in kustomization.yaml
2. Apply changes: `kubectl apply -k .`
3. Monitor rollout: `kubectl rollout status -n nrdot-system daemonset/nrdot-collector`
4. Rollback if needed: `kubectl rollout undo -n nrdot-system daemonset/nrdot-collector`