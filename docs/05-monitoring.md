# Monitoring & Observability

[← Cross-Platform](04-cross-platform.md) | [Index](index.md) | [Deployment →](06-deployment.md)

---

## Table of Contents

- [Monitoring Overview](#monitoring-overview)
- [Metrics Collection](#metrics-collection)
- [Logging Architecture](#logging-architecture)
- [Dashboard Setup](#dashboard-setup)
- [Alerting Framework](#alerting-framework)
- [Distributed Tracing](#distributed-tracing)
- [Performance Monitoring](#performance-monitoring)
- [Security Monitoring](#security-monitoring)
- [Troubleshooting Guide](#troubleshooting-guide)

---

## Monitoring Overview

NRDOT v2 provides comprehensive monitoring and observability features built on industry-standard tools. Our monitoring stack ensures you have complete visibility into your reverse proxy infrastructure.

### Monitoring Stack Components

```
┌────────────────────────────────────────────────────────────┐
│                    Monitoring Stack                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ Prometheus  │  │   Grafana   │  │ AlertManager│      │
│  │  (Metrics)  │  │(Dashboards) │  │  (Alerts)   │      │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│         │                 │                 │              │
│  ┌──────┴─────────────────┴─────────────────┴──────┐      │
│  │              Metrics Pipeline                    │      │
│  └──────────────────────┬──────────────────────────┘      │
│                         │                                  │
│  ┌──────────────────────┴──────────────────────────┐      │
│  │                NRDOT Core                        │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐     │      │
│  │  │ Exporters│  │   Logs   │  │  Traces  │     │      │
│  │  └──────────┘  └──────────┘  └──────────┘     │      │
│  └──────────────────────────────────────────────────┘      │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Key Metrics Categories

<table>
<tr>
<th>Category</th>
<th>Metrics</th>
<th>Purpose</th>
</tr>
<tr>
<td><strong>Traffic</strong></td>
<td>Requests/sec, Response times, Status codes</td>
<td>Monitor load and performance</td>
</tr>
<tr>
<td><strong>Backend Health</strong></td>
<td>Up/Down status, Response times, Error rates</td>
<td>Track backend availability</td>
</tr>
<tr>
<td><strong>System Resources</strong></td>
<td>CPU, Memory, Disk I/O, Network</td>
<td>Ensure adequate resources</td>
</tr>
<tr>
<td><strong>Application</strong></td>
<td>Config reloads, Control loop cycles, Queue sizes</td>
<td>Monitor NRDOT internals</td>
</tr>
</table>

---

## Metrics Collection

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'production'
    region: 'us-east-1'

# Alerting
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

# Load rules
rule_files:
  - "alerts/*.yml"
  - "recording_rules/*.yml"

# Scrape configurations
scrape_configs:
  # NRDOT metrics
  - job_name: 'nrdot'
    static_configs:
      - targets: ['localhost:9090']
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        replacement: 'nrdot-primary'
        
  # Nginx metrics
  - job_name: 'nginx'
    static_configs:
      - targets: ['localhost:9113']
      
  # Node exporter for system metrics
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
      
  # Backend health checks
  - job_name: 'blackbox'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - http://backend1.example.com
          - http://backend2.example.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox:9115
```

### Custom Metrics Implementation

```python
# monitoring/metrics.py
from prometheus_client import Counter, Histogram, Gauge, Info
from functools import wraps
import time

# Define metrics
REQUEST_COUNT = Counter(
    'nrdot_requests_total',
    'Total number of requests',
    ['method', 'endpoint', 'status']
)

REQUEST_DURATION = Histogram(
    'nrdot_request_duration_seconds',
    'Request duration in seconds',
    ['method', 'endpoint']
)

BACKEND_STATUS = Gauge(
    'nrdot_backend_up',
    'Backend server status (1=up, 0=down)',
    ['backend', 'pool']
)

CONFIG_INFO = Info(
    'nrdot_config',
    'NRDOT configuration information'
)

ACTIVE_CONNECTIONS = Gauge(
    'nrdot_active_connections',
    'Number of active connections',
    ['backend']
)

def track_request_metrics(func):
    """Decorator to track request metrics"""
    @wraps(func)
    async def wrapper(request, *args, **kwargs):
        start_time = time.time()
        
        try:
            response = await func(request, *args, **kwargs)
            status = response.status
        except Exception as e:
            status = 500
            raise
        finally:
            duration = time.time() - start_time
            
            REQUEST_COUNT.labels(
                method=request.method,
                endpoint=request.path,
                status=status
            ).inc()
            
            REQUEST_DURATION.labels(
                method=request.method,
                endpoint=request.path
            ).observe(duration)
            
        return response
    
    return wrapper

class MetricsCollector:
    """Collect and export metrics"""
    
    def __init__(self):
        self.collectors = []
        
    async def collect_backend_metrics(self):
        """Collect backend health metrics"""
        backends = await self.get_backends()
        
        for backend in backends:
            status = await backend.health_check()
            BACKEND_STATUS.labels(
                backend=backend.id,
                pool=backend.pool
            ).set(1 if status.is_healthy else 0)
            
            ACTIVE_CONNECTIONS.labels(
                backend=backend.id
            ).set(backend.active_connections)
```

### Recording Rules

```yaml
# recording_rules/aggregations.yml
groups:
  - name: nrdot_aggregations
    interval: 30s
    rules:
      # Request rate by status
      - record: nrdot:request_rate_5m
        expr: |
          sum(rate(nrdot_requests_total[5m])) by (status)
          
      # Average response time
      - record: nrdot:response_time_avg_5m
        expr: |
          rate(nrdot_request_duration_seconds_sum[5m])
          /
          rate(nrdot_request_duration_seconds_count[5m])
          
      # Backend availability
      - record: nrdot:backend_availability
        expr: |
          avg(nrdot_backend_up) by (pool) * 100
          
      # Error rate
      - record: nrdot:error_rate_5m
        expr: |
          sum(rate(nrdot_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(nrdot_requests_total[5m]))
```

---

## Logging Architecture

### Structured Logging

```python
# logging/structured.py
import structlog
import json
from datetime import datetime

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

class NRDOTLogger:
    """Structured logger for NRDOT"""
    
    def __init__(self, name: str):
        self.logger = structlog.get_logger(name)
        
    def log_request(self, request, response, duration):
        """Log HTTP request"""
        self.logger.info(
            "http_request",
            method=request.method,
            path=request.path,
            status=response.status,
            duration_ms=duration * 1000,
            client_ip=request.client_ip,
            user_agent=request.headers.get('User-Agent'),
            request_id=request.id
        )
        
    def log_backend_event(self, event_type, backend, details):
        """Log backend-related events"""
        self.logger.info(
            "backend_event",
            event_type=event_type,
            backend_id=backend.id,
            backend_pool=backend.pool,
            **details
        )
        
    def log_config_change(self, change_type, config, user):
        """Log configuration changes"""
        self.logger.warning(
            "config_change",
            change_type=change_type,
            config_section=config.section,
            user=user,
            timestamp=datetime.utcnow().isoformat()
        )
```

### Log Aggregation with ELK

```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/nrdot/*.log
    json.keys_under_root: true
    json.add_error_key: true
    json.message_key: message
    
  - type: log
    enabled: true
    paths:
      - /var/log/nginx/access.log
    processors:
      - dissect:
          tokenizer: '%{client_ip} - - [%{timestamp}] "%{method} %{path} %{protocol}" %{status} %{bytes} "%{referer}" "%{user_agent}"'
          field: message
          
processors:
  - add_host_metadata:
      when.not.contains.tags: forwarded
  - add_docker_metadata: ~
  - add_kubernetes_metadata: ~
  
output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "nrdot-%{[agent.version]}-%{+yyyy.MM.dd}"
  
setup.template.name: "nrdot"
setup.template.pattern: "nrdot-*"
setup.template.settings:
  index.number_of_shards: 2
  index.number_of_replicas: 1
```

### Logstash Pipeline

```ruby
# logstash/pipeline/nrdot.conf
input {
  beats {
    port => 5044
  }
}

filter {
  # Parse JSON logs
  if [message] =~ /^\{.*\}$/ {
    json {
      source => "message"
    }
  }
  
  # Add GeoIP information
  if [client_ip] {
    geoip {
      source => "client_ip"
      target => "geoip"
    }
  }
  
  # Parse user agent
  if [user_agent] {
    useragent {
      source => "user_agent"
      target => "ua"
    }
  }
  
  # Calculate response time buckets
  if [duration_ms] {
    if [duration_ms] <= 100 {
      mutate { add_field => { "response_bucket" => "fast" } }
    } else if [duration_ms] <= 1000 {
      mutate { add_field => { "response_bucket" => "normal" } }
    } else {
      mutate { add_field => { "response_bucket" => "slow" } }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "nrdot-%{+YYYY.MM.dd}"
  }
}
```

---

## Dashboard Setup

### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "NRDOT v2 Overview",
    "uid": "nrdot-overview",
    "version": 1,
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
        "targets": [
          {
            "expr": "sum(rate(nrdot_requests_total[5m])) by (status)",
            "legendFormat": "{{status}}"
          }
        ]
      },
      {
        "title": "Response Time (p95)",
        "type": "graph",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(nrdot_request_duration_seconds_bucket[5m]))",
            "legendFormat": "p95"
          }
        ]
      },
      {
        "title": "Backend Health",
        "type": "stat",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
        "targets": [
          {
            "expr": "sum(nrdot_backend_up) by (pool)",
            "legendFormat": "{{pool}}"
          }
        ]
      },
      {
        "title": "Active Connections",
        "type": "gauge",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
        "targets": [
          {
            "expr": "sum(nrdot_active_connections)"
          }
        ]
      }
    ]
  }
}
```

### Custom Dashboard Templates

```yaml
# dashboards/templates/backend-detail.yaml
dashboard:
  title: "Backend Pool: {{ .Pool }}"
  templating:
    - name: pool
      type: query
      query: "label_values(nrdot_backend_up, pool)"
      
  panels:
    - title: "Backend Status"
      type: table
      query: |
        nrdot_backend_up{pool="$pool"}
        
    - title: "Request Distribution"
      type: piechart
      query: |
        sum(rate(nrdot_requests_total[5m])) by (backend)
        
    - title: "Response Times by Backend"
      type: heatmap
      query: |
        rate(nrdot_request_duration_seconds_bucket[5m])
        
    - title: "Error Rate by Backend"
      type: graph
      query: |
        sum(rate(nrdot_requests_total{status=~"5.."}[5m])) by (backend)
        /
        sum(rate(nrdot_requests_total[5m])) by (backend)
```

---

## Alerting Framework

### Alert Rules

```yaml
# alerts/nrdot.yml
groups:
  - name: nrdot_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          sum(rate(nrdot_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(nrdot_requests_total[5m]))
          > 0.05
        for: 5m
        labels:
          severity: critical
          component: nrdot
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }} over the last 5 minutes"
          
      # Backend down
      - alert: BackendDown
        expr: nrdot_backend_up == 0
        for: 1m
        labels:
          severity: warning
          component: backend
        annotations:
          summary: "Backend {{ $labels.backend }} is down"
          description: "Backend {{ $labels.backend }} in pool {{ $labels.pool }} has been down for 1 minute"
          
      # High response time
      - alert: HighResponseTime
        expr: |
          histogram_quantile(0.95, rate(nrdot_request_duration_seconds_bucket[5m]))
          > 1
        for: 5m
        labels:
          severity: warning
          component: performance
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is {{ $value }}s"
          
      # Control loop failure
      - alert: ControlLoopFailure
        expr: |
          rate(nrdot_control_loop_errors_total[5m]) > 0
        for: 2m
        labels:
          severity: critical
          component: control_loop
        annotations:
          summary: "Control loop errors detected"
          description: "Control loop is experiencing errors"
```

### AlertManager Configuration

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m
  smtp_from: 'nrdot@example.com'
  smtp_smarthost: 'smtp.example.com:587'
  smtp_auth_username: 'nrdot@example.com'
  smtp_auth_password: '${SMTP_PASSWORD}'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true
      
    - match:
        component: backend
      receiver: 'backend-team'
      
    - match:
        component: performance
      receiver: 'performance-team'

receivers:
  - name: 'default'
    email_configs:
      - to: 'ops@example.com'
        
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_SERVICE_KEY}'
        
  - name: 'backend-team'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_BACKEND}'
        channel: '#backend-alerts'
        
  - name: 'performance-team'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_PERF}'
        channel: '#performance'
```

---

## Distributed Tracing

### OpenTelemetry Integration

```python
# tracing/opentelemetry.py
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

# Configure tracer
trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

# Configure exporter
otlp_exporter = OTLPSpanExporter(
    endpoint="localhost:4317",
    insecure=True
)

# Add span processor
span_processor = BatchSpanProcessor(otlp_exporter)
trace.get_tracer_provider().add_span_processor(span_processor)

# Instrument libraries
RequestsInstrumentor().instrument()

class TracingMiddleware:
    """Add tracing to requests"""
    
    async def __call__(self, request, handler):
        with tracer.start_as_current_span(
            f"{request.method} {request.path}",
            attributes={
                "http.method": request.method,
                "http.url": str(request.url),
                "http.target": request.path,
                "http.host": request.host,
                "http.scheme": request.scheme,
                "http.user_agent": request.headers.get("User-Agent", ""),
            }
        ) as span:
            try:
                response = await handler(request)
                span.set_attribute("http.status_code", response.status)
                return response
            except Exception as e:
                span.record_exception(e)
                span.set_status(trace.Status(trace.StatusCode.ERROR))
                raise
```

### Jaeger Configuration

```yaml
# docker-compose.yml snippet for Jaeger
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "5775:5775/udp"
      - "6831:6831/udp"
      - "6832:6832/udp"
      - "5778:5778"
      - "16686:16686"  # UI
      - "14268:14268"
      - "14250:14250"
      - "9411:9411"
    environment:
      - COLLECTOR_ZIPKIN_HOST_PORT=:9411
      - COLLECTOR_OTLP_ENABLED=true
```

---

## Performance Monitoring

### Performance Metrics

```python
# monitoring/performance.py
import psutil
import asyncio
from prometheus_client import Gauge, Histogram

# System metrics
CPU_USAGE = Gauge('nrdot_cpu_usage_percent', 'CPU usage percentage')
MEMORY_USAGE = Gauge('nrdot_memory_usage_bytes', 'Memory usage in bytes')
DISK_IO_READ = Gauge('nrdot_disk_io_read_bytes', 'Disk I/O read bytes')
DISK_IO_WRITE = Gauge('nrdot_disk_io_write_bytes', 'Disk I/O write bytes')

# Application metrics
EVENT_PROCESSING_TIME = Histogram(
    'nrdot_event_processing_seconds',
    'Time to process events',
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
)

CONFIG_RELOAD_TIME = Histogram(
    'nrdot_config_reload_seconds',
    'Time to reload configuration'
)

class PerformanceMonitor:
    """Monitor system and application performance"""
    
    def __init__(self):
        self.interval = 10  # seconds
        
    async def start(self):
        """Start performance monitoring"""
        while True:
            await self.collect_metrics()
            await asyncio.sleep(self.interval)
            
    async def collect_metrics(self):
        """Collect performance metrics"""
        # System metrics
        CPU_USAGE.set(psutil.cpu_percent(interval=1))
        
        memory = psutil.virtual_memory()
        MEMORY_USAGE.set(memory.used)
        
        disk_io = psutil.disk_io_counters()
        DISK_IO_READ.set(disk_io.read_bytes)
        DISK_IO_WRITE.set(disk_io.write_bytes)
        
        # Application-specific metrics
        await self.collect_app_metrics()
```

### Performance Dashboard

```json
{
  "dashboard": {
    "title": "NRDOT Performance",
    "panels": [
      {
        "title": "CPU Usage",
        "targets": [{
          "expr": "nrdot_cpu_usage_percent"
        }]
      },
      {
        "title": "Memory Usage",
        "targets": [{
          "expr": "nrdot_memory_usage_bytes / 1024 / 1024 / 1024"
        }]
      },
      {
        "title": "Event Processing Time",
        "targets": [{
          "expr": "histogram_quantile(0.99, rate(nrdot_event_processing_seconds_bucket[5m]))"
        }]
      },
      {
        "title": "Config Reload Time",
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(nrdot_config_reload_seconds_bucket[5m]))"
        }]
      }
    ]
  }
}
```

---

## Security Monitoring

### Security Events

```python
# monitoring/security.py
from enum import Enum

class SecurityEventType(Enum):
    AUTH_FAILURE = "auth_failure"
    INVALID_CERT = "invalid_certificate"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    SUSPICIOUS_REQUEST = "suspicious_request"
    CONFIG_TAMPERING = "config_tampering"

class SecurityMonitor:
    """Monitor security-related events"""
    
    def __init__(self, logger):
        self.logger = logger
        self.event_counter = Counter(
            'nrdot_security_events_total',
            'Security events by type',
            ['event_type', 'severity']
        )
        
    async def log_security_event(self, event_type: SecurityEventType, details: dict):
        """Log a security event"""
        severity = self._determine_severity(event_type)
        
        self.logger.warning(
            "security_event",
            event_type=event_type.value,
            severity=severity,
            **details
        )
        
        self.event_counter.labels(
            event_type=event_type.value,
            severity=severity
        ).inc()
        
        if severity == "critical":
            await self._trigger_security_alert(event_type, details)
```

### Security Alerts

```yaml
# alerts/security.yml
groups:
  - name: security_alerts
    rules:
      - alert: AuthenticationFailures
        expr: |
          sum(rate(nrdot_security_events_total{event_type="auth_failure"}[5m])) > 10
        for: 2m
        labels:
          severity: warning
          category: security
        annotations:
          summary: "High number of authentication failures"
          
      - alert: RateLimitAbuse
        expr: |
          sum(rate(nrdot_security_events_total{event_type="rate_limit_exceeded"}[5m])) by (client_ip) > 100
        for: 1m
        labels:
          severity: critical
          category: security
        annotations:
          summary: "Potential DDoS attack from {{ $labels.client_ip }}"
```

---

## Troubleshooting Guide

### Common Issues and Solutions

<table>
<tr>
<th>Issue</th>
<th>Symptoms</th>
<th>Diagnosis</th>
<th>Solution</th>
</tr>
<tr>
<td><strong>Missing Metrics</strong></td>
<td>Gaps in Grafana graphs</td>
<td>Check Prometheus targets</td>
<td>Ensure exporters are running and accessible</td>
</tr>
<tr>
<td><strong>High Memory Usage</strong></td>
<td>OOM errors, slow performance</td>
<td>Check memory metrics and logs</td>
<td>Tune buffer sizes, enable swap</td>
</tr>
<tr>
<td><strong>Log Ingestion Delays</strong></td>
<td>Old logs in Kibana</td>
<td>Check Filebeat/Logstash status</td>
<td>Increase pipeline workers, check disk I/O</td>
</tr>
<tr>
<td><strong>Alert Fatigue</strong></td>
<td>Too many alerts</td>
<td>Review alert rules</td>
<td>Adjust thresholds, add grouping</td>
</tr>
</table>

### Debug Commands

```bash
# Check metrics endpoint
curl http://localhost:9090/metrics | grep nrdot_

# Test Prometheus query
curl -G http://localhost:9090/api/v1/query \
  --data-urlencode 'query=up{job="nrdot"}'

# Check log ingestion
curl -X GET "elasticsearch:9200/nrdot-*/_search?pretty" \
  -H 'Content-Type: application/json' \
  -d '{"query": {"match_all": {}}, "size": 1}'

# Verify alert configuration
promtool check rules /etc/prometheus/alerts/*.yml

# Test alert routing
amtool config routes test --config.file=/etc/alertmanager/alertmanager.yml
```

### Performance Tuning

```yaml
# Optimization settings for monitoring stack
monitoring:
  prometheus:
    retention: 30d
    storage:
      tsdb:
        wal_compression: true
        block_duration: 2h
        retention.size: 100GB
        
  elasticsearch:
    indices:
      number_of_shards: 2
      number_of_replicas: 1
      refresh_interval: 30s
      
  grafana:
    database:
      type: postgres
      max_open_conns: 100
      max_idle_conns: 10
```

---

<div align="center">

[← Cross-Platform](04-cross-platform.md) | [Index](index.md) | [Deployment →](06-deployment.md)

*NRDOT v2.0 Documentation - Monitoring & Observability*

</div>