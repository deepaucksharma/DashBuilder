# Configuration Architecture

[← Overview](01-overview.md) | [Index](index.md) | [Control Loop →](03-control-loop.md)

---

## Table of Contents

- [Configuration Overview](#configuration-overview)
- [YAML Structure](#yaml-structure)
- [Backend Definitions](#backend-definitions)
- [Health Checks](#health-checks)
- [SSL Configuration](#ssl-configuration)
- [Load Balancing](#load-balancing)
- [Advanced Patterns](#advanced-patterns)
- [Configuration Validation](#configuration-validation)
- [Best Practices](#best-practices)

---

## Configuration Overview

NRDOT v2 uses a declarative configuration approach with YAML as the primary format. The configuration system is designed to be:

- **Human-readable**: Clear structure with meaningful defaults
- **Version-controlled**: Git-friendly format for tracking changes
- **Validatable**: Schema validation before application
- **Extensible**: Plugin support for custom configurations

> **💡 Quick Tip**  
> Use the dashboard's visual editor to generate initial configurations, then fine-tune in YAML for advanced scenarios.

---

## YAML Structure

### Basic Configuration Template

```yaml
# /etc/nrdot/config.yaml
nrdot:
  version: "2.0"
  metadata:
    name: "production-cluster"
    environment: "production"
    description: "Main production load balancer configuration"
    tags:
      - critical
      - customer-facing
  
  global:
    # Global settings applied to all services
    timeouts:
      connect: 5s
      read: 30s
      write: 30s
    
    error_handling:
      retry_count: 3
      retry_delay: 1s
      circuit_breaker:
        enabled: true
        threshold: 5
        timeout: 30s
    
    logging:
      level: info
      format: json
      destinations:
        - file: /var/log/nrdot/access.log
        - syslog: localhost:514
    
  services:
    - name: web-app
      domains:
        - example.com
        - www.example.com
      backends:
        - id: web-1
          address: 10.0.1.10:8080
          weight: 100
        - id: web-2
          address: 10.0.1.11:8080
          weight: 100
```

### Configuration Hierarchy

```
nrdot/
├── config.yaml           # Main configuration
├── services/            # Service-specific configs
│   ├── web-app.yaml
│   ├── api.yaml
│   └── admin.yaml
├── backends/            # Backend pool definitions
│   ├── production.yaml
│   └── staging.yaml
└── ssl/                # SSL certificates
    ├── certs/
    └── keys/
```

---

## Backend Definitions

### Backend Pool Configuration

```yaml
backends:
  - name: app-pool
    description: "Main application server pool"
    
    # Load balancing algorithm
    algorithm: least_conn  # Options: round_robin, least_conn, ip_hash, weighted
    
    # Session persistence
    session_affinity:
      enabled: true
      type: cookie         # Options: cookie, ip, header
      cookie_name: "NRDOT_SESSION"
      cookie_path: "/"
      cookie_ttl: 3600
    
    # Backend servers
    servers:
      - id: app-1
        address: 192.168.1.10
        port: 8080
        weight: 100
        max_connections: 1000
        
        # Server-specific settings
        metadata:
          datacenter: "us-east-1a"
          rack: "A1"
          
      - id: app-2
        address: 192.168.1.11
        port: 8080
        weight: 100
        max_connections: 1000
        backup: true  # Backup server
```

### Dynamic Backend Discovery

```yaml
backends:
  - name: dynamic-pool
    discovery:
      type: consul
      config:
        address: "consul.service.consul:8500"
        service: "web-app"
        tags:
          - production
          - http
        refresh_interval: 10s
        
    # Automatic scaling
    scaling:
      min_servers: 2
      max_servers: 10
      scale_up_threshold: 80    # CPU percentage
      scale_down_threshold: 20
      cooldown: 300s
```

---

## Health Checks

### Basic Health Check

```yaml
health_checks:
  - name: http-check
    type: http
    config:
      path: /health
      method: GET
      interval: 5s
      timeout: 3s
      healthy_threshold: 2
      unhealthy_threshold: 3
      
      # Expected response
      expected:
        status: 200
        body_contains: "healthy"
        headers:
          - name: "X-Health-Status"
            value: "OK"
```

### Advanced Health Checks

```yaml
health_checks:
  - name: tcp-check
    type: tcp
    config:
      port: 3306
      interval: 10s
      timeout: 5s
      
  - name: script-check
    type: script
    config:
      command: "/usr/local/bin/check-app.sh"
      args:
        - "--timeout=5"
        - "--verbose"
      interval: 30s
      timeout: 10s
      
  - name: composite-check
    type: composite
    config:
      checks:
        - http-check
        - tcp-check
      require_all: false  # At least one must pass
```

### Health Check Actions

```yaml
health_checks:
  - name: auto-recovery
    type: http
    config:
      path: /health
      interval: 5s
      
    # Actions on state change
    actions:
      on_failure:
        - type: remove_from_pool
          grace_period: 30s
        - type: alert
          channels:
            - email: ops@example.com
            - slack: "#alerts"
            
      on_recovery:
        - type: gradual_traffic
          ramp_up_time: 60s
          initial_weight: 10
```

---

## SSL Configuration

### Basic SSL Setup

```yaml
ssl:
  # Default SSL settings
  default:
    protocols:
      - TLSv1.2
      - TLSv1.3
    ciphers: "ECDHE+AESGCM:ECDHE+AES256:!aNULL:!MD5"
    prefer_server_ciphers: true
    session_cache: "shared:SSL:10m"
    session_timeout: 10m
    
  # Certificate management
  certificates:
    - name: main-cert
      domains:
        - example.com
        - "*.example.com"
      cert_file: /etc/ssl/certs/example.com.crt
      key_file: /etc/ssl/private/example.com.key
      chain_file: /etc/ssl/certs/example.com.chain.pem
      
    - name: api-cert
      domains:
        - api.example.com
      auto_renew:
        enabled: true
        provider: letsencrypt
        email: admin@example.com
```

### SSL Advanced Features

```yaml
ssl:
  # OCSP Stapling
  ocsp:
    enabled: true
    responder: "http://ocsp.example.com"
    verify: true
    
  # HTTP/2 Support
  http2:
    enabled: true
    max_concurrent_streams: 128
    initial_window_size: 65536
    
  # Security Headers
  security_headers:
    hsts:
      enabled: true
      max_age: 31536000
      include_subdomains: true
      preload: true
    
    content_security_policy: "default-src 'self'"
    x_frame_options: "SAMEORIGIN"
    x_content_type_options: "nosniff"
```

---

## Load Balancing

### Load Balancing Methods

```yaml
load_balancing:
  # Round Robin with weights
  - name: weighted-round-robin
    algorithm: round_robin
    servers:
      - address: 10.0.1.1:80
        weight: 3  # Gets 3x more requests
      - address: 10.0.1.2:80
        weight: 1
        
  # Least Connections
  - name: least-connections
    algorithm: least_conn
    servers:
      - address: 10.0.2.1:80
      - address: 10.0.2.2:80
    
  # IP Hash (Session Persistence)
  - name: ip-hash
    algorithm: ip_hash
    consistent_hashing: true
    servers:
      - address: 10.0.3.1:80
      - address: 10.0.3.2:80
```

### Advanced Load Balancing

```yaml
load_balancing:
  # Adaptive Load Balancing
  - name: adaptive
    algorithm: adaptive
    config:
      # Adjust weights based on response time
      metrics:
        - response_time
        - error_rate
        - cpu_usage
      
      update_interval: 10s
      
      # Weight adjustment rules
      rules:
        - metric: response_time
          condition: "> 500ms"
          action: "decrease_weight(10)"
        
        - metric: error_rate
          condition: "> 5%"
          action: "decrease_weight(50)"
```

---

## Advanced Patterns

### Multi-Region Configuration

```yaml
regions:
  - name: us-east
    primary: true
    endpoints:
      - address: lb-us-east-1.example.com
      - address: lb-us-east-2.example.com
    
    failover:
      target: us-west
      conditions:
        - type: health_check_failure
          threshold: 50%
        - type: latency
          threshold: 500ms
          
  - name: us-west
    primary: false
    endpoints:
      - address: lb-us-west-1.example.com
      - address: lb-us-west-2.example.com
```

### Canary Deployments

```yaml
canary:
  - name: feature-v2
    enabled: true
    
    # Traffic split
    traffic_split:
      canary: 10    # 10% to canary
      stable: 90    # 90% to stable
      
    # Canary pool
    canary_backends:
      - address: canary-1.example.com:8080
      - address: canary-2.example.com:8080
      
    # Stable pool
    stable_backends:
      - address: stable-1.example.com:8080
      - address: stable-2.example.com:8080
      
    # Promotion criteria
    promotion:
      automatic: true
      criteria:
        - metric: error_rate
          threshold: "< 1%"
          duration: 10m
        - metric: p99_latency
          threshold: "< 200ms"
          duration: 10m
```

### Rate Limiting

```yaml
rate_limiting:
  # Global rate limits
  global:
    requests_per_second: 10000
    burst: 1000
    
  # Per-client limits
  per_client:
    enabled: true
    key: "$remote_addr"  # Can also use $http_x_forwarded_for
    
    zones:
      - name: api_limit
        rate: "10r/s"
        burst: 20
        nodelay: true
        
      - name: download_limit
        rate: "1r/m"
        burst: 5
        
    # Whitelist
    whitelist:
      - 10.0.0.0/8
      - 192.168.0.0/16
```

---

## Configuration Validation

### Schema Validation

```yaml
# Schema definition example
schema:
  version: "2.0"
  rules:
    - field: "services[].name"
      type: string
      required: true
      pattern: "^[a-z0-9-]+$"
      
    - field: "services[].backends[].port"
      type: integer
      required: true
      min: 1
      max: 65535
      
    - field: "health_checks[].interval"
      type: duration
      required: true
      min: "1s"
      max: "5m"
```

### Validation Commands

```bash
# Validate configuration
nrdot config validate --file /etc/nrdot/config.yaml

# Test configuration (dry run)
nrdot config test --file /etc/nrdot/config.yaml

# Check specific service
nrdot config check-service --name web-app

# Validate with custom schema
nrdot config validate --schema /etc/nrdot/custom-schema.yaml
```

---

## Best Practices

### 1. **Configuration Organization**

```yaml
# Use includes for modular configuration
includes:
  - backends/*.yaml
  - services/*.yaml
  - security/policies.yaml
```

### 2. **Environment Variables**

```yaml
# Support for environment variables
database:
  host: ${DB_HOST:-localhost}
  port: ${DB_PORT:-5432}
  password: ${DB_PASSWORD}  # Required
```

### 3. **Configuration Templates**

```yaml
# Define reusable templates
templates:
  - name: standard-backend
    health_check:
      type: http
      path: /health
      interval: 5s
    timeouts:
      connect: 5s
      read: 30s

# Use templates
services:
  - name: app
    template: standard-backend
    backends:
      - address: 10.0.1.1:8080
```

### 4. **Secrets Management**

```yaml
# Reference external secrets
secrets:
  provider: vault
  config:
    address: https://vault.example.com
    path: secret/nrdot
    
ssl:
  certificates:
    - name: main
      cert_ref: "vault:secret/certs/main:certificate"
      key_ref: "vault:secret/certs/main:private_key"
```

### 5. **Configuration Versioning**

```yaml
# Track configuration versions
metadata:
  version: "1.2.3"
  last_modified: "2024-01-15T10:30:00Z"
  modified_by: "admin@example.com"
  change_log:
    - version: "1.2.3"
      date: "2024-01-15"
      changes:
        - "Added new backend server"
        - "Updated health check intervals"
```

---

## Troubleshooting

### Common Configuration Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| **Validation Errors** | Invalid YAML syntax | Use `yamllint` to check syntax |
| **Backend Not Found** | Incorrect addressing | Verify DNS resolution and network connectivity |
| **SSL Errors** | Certificate mismatch | Check certificate domains and expiration |
| **Health Check Failures** | Incorrect endpoints | Test endpoints manually with `curl` |

### Debug Mode

```yaml
# Enable debug logging for troubleshooting
debug:
  enabled: true
  components:
    - configuration
    - health_checks
    - load_balancer
  output:
    - console
    - file: /var/log/nrdot/debug.log
```

---

<div align="center">

[← Overview](01-overview.md) | [Index](index.md) | [Control Loop →](03-control-loop.md)

*NRDOT v2.0 Documentation - Configuration Architecture*

</div>