# NRDOT v2 API Reference

## Table of Contents
- [Metrics API](#metrics-api)
- [Configuration API](#configuration-api)
- [Control Loop API](#control-loop-api)
- [OTTL Functions](#ottl-functions)
- [Environment Variables](#environment-variables)
- [Webhook Endpoints](#webhook-endpoints)

---

## Metrics API

The NRDOT framework exposes metrics via Prometheus format on port 8888.

### Endpoint: GET /metrics

Returns all metrics in Prometheus exposition format.

```bash
curl http://localhost:8888/metrics
```

### Core Metrics

#### nrdot_process_series_total
Total number of process metric series before optimization.

```
# TYPE nrdot_process_series_total gauge
# HELP nrdot_process_series_total Total number of process series before filtering
nrdot_process_series_total{host="server1"} 3245
```

#### nrdot_process_series_kept
Number of process metric series after optimization.

```
# TYPE nrdot_process_series_kept gauge
# HELP nrdot_process_series_kept Number of process series kept after filtering
nrdot_process_series_kept{host="server1",profile="balanced"} 487
```

#### nrdot_process_coverage_critical
Percentage of critical processes being monitored.

```
# TYPE nrdot_process_coverage_critical gauge
# HELP nrdot_process_coverage_critical Coverage percentage for critical processes
nrdot_process_coverage_critical{host="server1"} 0.98
```

#### nrdot_estimated_cost_per_hour
Estimated cost per hour in configured currency.

```
# TYPE nrdot_estimated_cost_per_hour gauge
# HELP nrdot_estimated_cost_per_hour Estimated telemetry cost per hour
nrdot_estimated_cost_per_hour{host="server1",currency="USD"} 0.75
```

### Collector Metrics

#### otelcol_process_cpu_seconds
CPU usage of the collector process.

```
# TYPE otelcol_process_cpu_seconds counter
# HELP otelcol_process_cpu_seconds Total CPU user and system time in seconds
otelcol_process_cpu_seconds 124.5
```

#### otelcol_process_memory_rss
Memory usage of the collector process.

```
# TYPE otelcol_process_memory_rss gauge
# HELP otelcol_process_memory_rss Total physical memory (RSS) used in bytes
otelcol_process_memory_rss 52428800
```

### Example Query

```python
import requests

def get_nrdot_metrics():
    response = requests.get('http://localhost:8888/metrics')
    metrics = {}
    
    for line in response.text.split('\n'):
        if line.startswith('nrdot_'):
            parts = line.split(' ')
            if len(parts) >= 2:
                metric_name = parts[0].split('{')[0]
                value = float(parts[1])
                metrics[metric_name] = value
    
    return metrics

# Usage
metrics = get_nrdot_metrics()
print(f"Series reduction: {metrics.get('nrdot_process_series_kept', 0) / metrics.get('nrdot_process_series_total', 1) * 100:.1f}%")
```

---

## Configuration API

### Reading Configuration

#### Get Current Profile
```bash
yq eval '.state.active_profile' /etc/nrdot-collector-host/optimization.yaml
```

#### Get Profile Settings
```bash
# Get all settings for a profile
yq eval '.profiles.balanced' /etc/nrdot-collector-host/optimization.yaml

# Get specific threshold
yq eval '.profiles.balanced.thresholds.cpu_threshold_percent' /etc/nrdot-collector-host/optimization.yaml
```

### Updating Configuration

#### Change Active Profile
```bash
yq eval -i '.state.active_profile = "aggressive"' /etc/nrdot-collector-host/optimization.yaml
systemctl reload nrdot-collector-host
```

#### Update Threshold
```bash
yq eval -i '.profiles.balanced.thresholds.memory_threshold_mb = 150' /etc/nrdot-collector-host/optimization.yaml
```

#### Add Process Pattern
```bash
# Add to critical processes
yq eval -i '.process_classification.critical_system.patterns.common += ["^my-critical-app$"]' /etc/nrdot-collector-host/optimization.yaml
```

### Configuration Schema

```yaml
# Root configuration object
type: object
required: [version, state, cost_model, process_classification, profiles]
properties:
  version:
    type: string
    pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$"
  
  state:
    type: object
    required: [active_profile, last_updated, updated_by]
    properties:
      active_profile:
        type: string
        enum: [conservative, balanced, aggressive, emergency]
      last_updated:
        type: string
        format: date-time
      updated_by:
        type: string
  
  cost_model:
    type: object
    required: [currency, per_million_datapoints]
    properties:
      currency:
        type: string
        pattern: "^[A-Z]{3}$"
      per_million_datapoints:
        type: number
        minimum: 0
  
  process_classification:
    type: object
    patternProperties:
      "^[a-z_]+$":
        type: object
        required: [score, patterns]
        properties:
          score:
            type: number
            minimum: 0
            maximum: 1
          patterns:
            type: object
  
  profiles:
    type: object
    patternProperties:
      "^[a-z_]+$":
        type: object
        required: [description, thresholds, limits]
```

---

## Control Loop API

### Control Commands

#### Force Profile Change
```bash
# Via systemd
systemctl kill -s USR1 nrdot-control-loop  # Force re-evaluation
systemctl kill -s USR2 nrdot-control-loop  # Dump current state
```

#### Query State
```bash
# Get recent profile changes
jq -s '.' /var/lib/nrdot/state/profile_changes.jsonl | tail -5

# Get decision history
grep "Decision:" /var/log/nrdot/control-loop.log | tail -10
```

### Control Loop Signals

| Signal | Action |
|--------|--------|
| SIGHUP | Reload configuration |
| SIGUSR1 | Force immediate evaluation |
| SIGUSR2 | Dump state to log |
| SIGTERM | Graceful shutdown |

### State File Format

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "from": "balanced",
  "to": "aggressive",
  "reason": "Series count too high: 8500 > 5000",
  "metrics": {
    "series_total": 10000,
    "series_kept": 8500,
    "coverage": 0.96,
    "cost_hour": 2.125
  }
}
```

---

## OTTL Functions

OpenTelemetry Transformation Language functions used in NRDOT.

### IsMatch
Tests if a string matches a regular expression.

```yaml
- set(attributes["process.importance"], 1.0) 
  where IsMatch(resource.attributes["process.executable.name"], "^(nginx|apache)$")
```

### Concat
Concatenates strings.

```yaml
- set(attributes["process.class"], 
  Concat([resource.attributes["process.owner"], "_", resource.attributes["process.executable.name"]], ""))
```

### ConvertCase
Converts string case.

```yaml
- set(resource.attributes["process.name.lower"], 
  ConvertCase(resource.attributes["process.executable.name"], "lower"))
```

### Replace
Replaces string patterns.

```yaml
- set(attributes["process.normalized"], 
  Replace(resource.attributes["process.executable.name"], "[0-9]+", "N"))
```

### Custom NRDOT Functions

#### ClassifyProcess
Returns process classification based on patterns.

```yaml
- set(attributes["process.class"], 
  ClassifyProcess(resource.attributes["process.executable.name"]))
```

#### CalculateImportance
Calculates importance score based on multiple factors.

```yaml
- set(attributes["process.importance"], 
  CalculateImportance(
    resource.attributes["process.executable.name"],
    value,  # CPU usage
    resource.attributes["process.memory.physical_usage"]
  ))
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| NEW_RELIC_LICENSE_KEY | New Relic ingest license key | `abcd1234...` |
| HOSTNAME | Host identifier | `prod-web-01` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| OTEL_EXPORTER_OTLP_ENDPOINT | New Relic OTLP endpoint | `https://otlp.nr-data.net` |
| NRDOT_RING | Experiment ring assignment | `0` |
| NRDOT_PROFILE | Initial profile override | `balanced` |
| NRDOT_TARGET_SERIES | Target series count | `5000` |
| NRDOT_MAX_SERIES | Maximum allowed series | `10000` |
| NRDOT_MIN_COVERAGE | Minimum coverage threshold | `0.95` |
| NRDOT_MAX_COST_HOUR | Maximum cost per hour | `0.10` |
| NRDOT_COST_CURRENCY | Currency for cost calculations | `USD` |
| NRDOT_COST_PER_MILLION | Cost per million data points | `0.25` |
| OTEL_LOG_LEVEL | Collector log level | `info` |
| NRDOT_DEBUG | Enable debug mode | `false` |

### Setting Variables

```bash
# System-wide
echo "NEW_RELIC_LICENSE_KEY=your-key" >> /etc/environment

# Service-specific
systemctl edit nrdot-collector-host
# Add:
[Service]
Environment="NEW_RELIC_LICENSE_KEY=your-key"

# Via environment file
cat > /etc/default/nrdot-collector-host <<EOF
NEW_RELIC_LICENSE_KEY=your-key
NRDOT_PROFILE=aggressive
EOF
```

---

## Webhook Endpoints

### Profile Change Webhook

Configure webhooks to receive notifications on profile changes.

```yaml
# In optimization.yaml
webhooks:
  profile_change:
    url: "https://your-webhook.com/nrdot/profile-change"
    headers:
      Authorization: "Bearer ${env:WEBHOOK_TOKEN}"
    retry: 3
```

#### Webhook Payload

```json
{
  "event": "profile_change",
  "timestamp": "2024-01-15T10:30:00Z",
  "host": "prod-web-01",
  "change": {
    "from": "balanced",
    "to": "aggressive",
    "reason": "Series count too high: 8500 > 5000"
  },
  "metrics": {
    "series_total": 10000,
    "series_kept": 8500,
    "coverage": 0.96,
    "cost_hour": 2.125
  }
}
```

### Alert Webhook

Receive alerts for critical conditions.

```yaml
webhooks:
  alerts:
    url: "https://your-webhook.com/nrdot/alerts"
    conditions:
      - coverage_below: 0.90
      - cost_above: 5.00
      - series_above: 15000
```

#### Alert Payload

```json
{
  "event": "alert",
  "timestamp": "2024-01-15T10:35:00Z",
  "host": "prod-web-01",
  "severity": "critical",
  "condition": "coverage_below",
  "message": "Critical process coverage dropped to 87%",
  "current_value": 0.87,
  "threshold": 0.90
}
```

### Implementing Webhook Handler

```python
from flask import Flask, request, jsonify
import hmac
import hashlib

app = Flask(__name__)
WEBHOOK_SECRET = "your-webhook-secret"

def verify_signature(payload, signature):
    expected = hmac.new(
        WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

@app.route('/nrdot/webhook', methods=['POST'])
def handle_webhook():
    # Verify signature
    signature = request.headers.get('X-NRDOT-Signature')
    if not verify_signature(request.data, signature):
        return jsonify({'error': 'Invalid signature'}), 401
    
    # Process event
    data = request.json
    event_type = data.get('event')
    
    if event_type == 'profile_change':
        handle_profile_change(data)
    elif event_type == 'alert':
        handle_alert(data)
    
    return jsonify({'status': 'ok'})

def handle_profile_change(data):
    print(f"Profile changed on {data['host']}: "
          f"{data['change']['from']} -> {data['change']['to']}")
    # Implement your logic here

def handle_alert(data):
    print(f"Alert on {data['host']}: {data['message']}")
    # Implement your alerting logic here

if __name__ == '__main__':
    app.run(port=8080)
```

---

## API Client Examples

### Python Client

```python
import requests
import yaml
import time

class NRDOTClient:
    def __init__(self, host='localhost'):
        self.host = host
        self.metrics_url = f'http://{host}:8888/metrics'
        self.config_path = '/etc/nrdot-collector-host/optimization.yaml'
    
    def get_metrics(self):
        """Fetch current metrics"""
        response = requests.get(self.metrics_url)
        return self._parse_prometheus(response.text)
    
    def get_profile(self):
        """Get current active profile"""
        with open(self.config_path) as f:
            config = yaml.safe_load(f)
        return config['state']['active_profile']
    
    def set_profile(self, profile):
        """Change active profile"""
        with open(self.config_path) as f:
            config = yaml.safe_load(f)
        
        config['state']['active_profile'] = profile
        config['state']['last_updated'] = time.strftime('%Y-%m-%dT%H:%M:%SZ')
        config['state']['updated_by'] = 'api-client'
        
        with open(self.config_path, 'w') as f:
            yaml.dump(config, f)
        
        # Reload collector
        os.system('systemctl reload nrdot-collector-host')
    
    def get_cost_reduction(self):
        """Calculate current cost reduction percentage"""
        metrics = self.get_metrics()
        total = metrics.get('nrdot_process_series_total', 1)
        kept = metrics.get('nrdot_process_series_kept', 0)
        return (1 - kept/total) * 100
    
    def _parse_prometheus(self, text):
        """Parse Prometheus format metrics"""
        metrics = {}
        for line in text.split('\n'):
            if line and not line.startswith('#'):
                parts = line.split(' ')
                if len(parts) >= 2:
                    name = parts[0].split('{')[0]
                    value = float(parts[1])
                    metrics[name] = value
        return metrics

# Usage
client = NRDOTClient()
print(f"Current profile: {client.get_profile()}")
print(f"Cost reduction: {client.get_cost_reduction():.1f}%")
```

### Bash Client

```bash
#!/bin/bash
# nrdot-api.sh - Simple NRDOT API client

METRICS_URL="http://localhost:8888/metrics"
CONFIG_FILE="/etc/nrdot-collector-host/optimization.yaml"

get_metric() {
    local metric=$1
    curl -s "$METRICS_URL" | grep "^$metric" | awk '{print $2}' | head -1
}

get_profile() {
    yq eval '.state.active_profile' "$CONFIG_FILE"
}

set_profile() {
    local profile=$1
    yq eval -i ".state.active_profile = \"$profile\"" "$CONFIG_FILE"
    yq eval -i ".state.last_updated = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" "$CONFIG_FILE"
    systemctl reload nrdot-collector-host
}

get_cost_reduction() {
    local total=$(get_metric "nrdot_process_series_total")
    local kept=$(get_metric "nrdot_process_series_kept")
    echo "scale=1; (1 - $kept / $total) * 100" | bc
}

# Usage
case "$1" in
    metrics)
        echo "Total series: $(get_metric nrdot_process_series_total)"
        echo "Kept series: $(get_metric nrdot_process_series_kept)"
        echo "Coverage: $(get_metric nrdot_process_coverage_critical)"
        echo "Cost/hour: $(get_metric nrdot_estimated_cost_per_hour)"
        ;;
    profile)
        if [ -n "$2" ]; then
            set_profile "$2"
            echo "Profile changed to: $2"
        else
            echo "Current profile: $(get_profile)"
        fi
        ;;
    cost)
        echo "Cost reduction: $(get_cost_reduction)%"
        ;;
    *)
        echo "Usage: $0 {metrics|profile [name]|cost}"
        exit 1
        ;;
esac
```