# NRDOT v2 Quick Start Guide

[← Validation](07-validation.md) | [Index](index.md) | [Overview →](01-overview.md)

---

## 🚀 Get Started in 5 Minutes

Welcome to NRDOT v2! This guide will help you get up and running with the Nginx Reverse-proxy Dashboard Orchestration Tool quickly and easily.

> **Prerequisites**: Linux/Windows Server 2019+, 4GB RAM, Python 3.8+, Docker (optional)

---

## Installation

### Option 1: Quick Install (Recommended)

```bash
# Download and run the installer
curl -sSL https://get.nrdot.io | bash

# Or with specific version
curl -sSL https://get.nrdot.io | bash -s -- --version=2.0.0
```

### Option 2: Docker

```bash
# Using Docker Compose
git clone https://github.com/nrdot/nrdot-v2.git
cd nrdot-v2
docker-compose up -d

# Access dashboard at http://localhost:8080
```

### Option 3: Manual Installation

```bash
# Clone repository
git clone https://github.com/nrdot/nrdot-v2.git
cd nrdot-v2

# Install dependencies
pip3 install -r requirements.txt

# Run setup
python3 setup.py install

# Start NRDOT
nrdot start
```

---

## First Dashboard

### 1. Access the Dashboard

Open your browser and navigate to:
```
http://localhost:8080
```

Default credentials:
- **Username**: `admin`
- **Password**: `changeme`

> **⚠️ Important**: Change the default password immediately after first login!

### 2. Create Your First Backend Pool

```yaml
# Quick configuration example
name: my-app
backends:
  - address: 192.168.1.10:8080
    weight: 100
  - address: 192.168.1.11:8080
    weight: 100
health_check:
  type: http
  path: /health
  interval: 5s
```

### 3. Apply Configuration

Click **"Apply Changes"** in the dashboard or use the CLI:

```bash
nrdot apply -f config.yaml
```

---

## Basic Configuration

### Minimal Configuration File

```yaml
# /etc/nrdot/config.yaml
nrdot:
  version: "2.0"
  
services:
  - name: web-app
    domains:
      - example.com
    backends:
      - address: 10.0.1.10:8080
      - address: 10.0.1.11:8080
```

### Health Check Configuration

```yaml
health_checks:
  default:
    type: http
    path: /health
    interval: 5s
    timeout: 3s
    healthy_threshold: 2
    unhealthy_threshold: 3
```

---

## Common Tasks

### Adding a Backend

**Via Dashboard:**
1. Navigate to **Backends** → **Add Backend**
2. Enter backend details
3. Click **Save**

**Via CLI:**
```bash
nrdot backend add --name app-server-3 --address 10.0.1.12:8080 --pool production
```

### Enabling SSL

```yaml
ssl:
  certificates:
    - name: main-cert
      domains:
        - example.com
        - www.example.com
      auto_renew:
        enabled: true
        provider: letsencrypt
        email: admin@example.com
```

### Setting Up Monitoring

```bash
# Enable Prometheus metrics
nrdot monitoring enable --type prometheus --port 9090

# View metrics
curl http://localhost:9090/metrics
```

---

## CLI Commands

### Essential Commands

```bash
# Service management
nrdot start                    # Start NRDOT service
nrdot stop                     # Stop NRDOT service
nrdot restart                  # Restart NRDOT service
nrdot status                   # Check service status

# Configuration
nrdot config validate          # Validate configuration
nrdot config apply             # Apply configuration changes
nrdot config rollback          # Rollback to previous config

# Backend management
nrdot backend list             # List all backends
nrdot backend enable <id>      # Enable a backend
nrdot backend disable <id>     # Disable a backend

# Health checks
nrdot health status            # View health status
nrdot health check <backend>   # Check specific backend
```

### Advanced Commands

```bash
# Debugging
nrdot debug logs --tail        # Tail logs
nrdot debug events             # View events
nrdot debug trace <request-id> # Trace a request

# Performance
nrdot perf stats               # View performance stats
nrdot perf profile --duration 60  # Profile for 60 seconds
```

---

## Troubleshooting

### Common Issues

<table>
<tr>
<th>Issue</th>
<th>Solution</th>
</tr>
<tr>
<td><strong>Dashboard not accessible</strong></td>
<td>

```bash
# Check if service is running
nrdot status

# Check logs
nrdot logs --tail 50

# Verify port is not in use
sudo lsof -i :8080
```

</td>
</tr>
<tr>
<td><strong>Backend health checks failing</strong></td>
<td>

```bash
# Test backend directly
curl http://backend-address/health

# Check health check configuration
nrdot health config --backend <name>

# View health check logs
nrdot logs --filter health
```

</td>
</tr>
<tr>
<td><strong>Configuration not applying</strong></td>
<td>

```bash
# Validate configuration
nrdot config validate

# Check for syntax errors
yamllint /etc/nrdot/config.yaml

# Force reload
nrdot config reload --force
```

</td>
</tr>
</table>

### Getting Help

```bash
# Built-in help
nrdot help
nrdot <command> --help

# View documentation
nrdot docs

# Check version
nrdot version
```

---

## Best Practices

### 1. **Use Version Control**

```bash
cd /etc/nrdot
git init
git add .
git commit -m "Initial NRDOT configuration"
```

### 2. **Regular Backups**

```bash
# Enable automatic backups
nrdot backup enable --schedule "0 2 * * *" --retain 7

# Manual backup
nrdot backup create --name "before-major-change"
```

### 3. **Monitor Everything**

```yaml
monitoring:
  prometheus:
    enabled: true
  grafana:
    enabled: true
    dashboards:
      - nrdot-overview
      - backend-health
      - performance-metrics
```

### 4. **Secure Your Installation**

```bash
# Enable HTTPS for dashboard
nrdot security enable-https

# Set up authentication
nrdot auth configure --provider ldap

# Enable audit logging
nrdot audit enable
```

---

## Example Configurations

### Load Balancer for Web Application

```yaml
services:
  - name: web-app
    domains:
      - app.example.com
    
    load_balancing:
      algorithm: least_conn
      
    backends:
      - address: web1.internal:8080
        weight: 100
      - address: web2.internal:8080
        weight: 100
      - address: web3.internal:8080
        weight: 50  # Lower spec server
        
    health_check:
      type: http
      path: /api/health
      interval: 5s
      
    ssl:
      enabled: true
      redirect_http: true
```

### API Gateway Configuration

```yaml
services:
  - name: api-gateway
    domains:
      - api.example.com
      
    rate_limiting:
      enabled: true
      rules:
        - path: /api/*
          rate: 100r/s
          burst: 200
          
    backends:
      - address: api1.internal:3000
      - address: api2.internal:3000
      
    headers:
      add:
        X-Request-ID: $request_id
        X-Real-IP: $remote_addr
```

---

## Resources

### Documentation
- 📖 [Full Documentation](index.md)
- 🏗️ [Architecture Overview](01-overview.md)
- ⚙️ [Configuration Guide](02-configuration.md)
- 📊 [Monitoring Setup](05-monitoring.md)

### Community
- 💬 [Discord Server](https://discord.gg/nrdot)
- 🐛 [Report Issues](https://github.com/nrdot/v2/issues)
- 📝 [Blog](https://blog.nrdot.io)
- 🎥 [Video Tutorials](https://youtube.com/nrdot)

### Support
- 📧 Email: support@nrdot.io
- 📞 Enterprise Support: +1-555-NRDOT-20
- 🎫 [Support Portal](https://support.nrdot.io)

---

## Contributing

We welcome contributions! Here's how to get started:

```bash
# Fork and clone
git clone https://github.com/YOUR-USERNAME/nrdot-v2.git

# Create a branch
git checkout -b feature/my-feature

# Make changes and test
make test

# Submit PR
git push origin feature/my-feature
```

See our [Contributing Guide](CONTRIBUTING.md) for more details.

---

## What's Next?

Now that you have NRDOT running:

1. **Explore the Dashboard** - Familiarize yourself with all features
2. **Set Up Monitoring** - Configure Prometheus and Grafana
3. **Add Your Backends** - Start managing your services
4. **Configure Alerts** - Set up notifications for important events
5. **Join the Community** - Connect with other NRDOT users

---

<div align="center">

### 🎉 Congratulations!

You're now ready to use NRDOT v2. If you encounter any issues or have questions, don't hesitate to reach out to our community or check the documentation.

**Happy Load Balancing!** 🚀

---

[← Validation](07-validation.md) | [Index](index.md) | [Overview →](01-overview.md)

*NRDOT v2.0 Quick Start Guide*

</div>