# Cross-Platform Patterns

[← Control Loop](03-control-loop.md) | [Index](index.md) | [Monitoring →](05-monitoring.md)

---

## Table of Contents

- [Platform Overview](#platform-overview)
- [Linux Implementation](#linux-implementation)
- [Windows Server Support](#windows-server-support)
- [Container Deployment](#container-deployment)
- [Kubernetes Integration](#kubernetes-integration)
- [Cloud Platform Patterns](#cloud-platform-patterns)
- [Platform-Specific Optimizations](#platform-specific-optimizations)
- [Testing Across Platforms](#testing-across-platforms)
- [Migration Strategies](#migration-strategies)

---

## Platform Overview

NRDOT v2 is designed with true cross-platform support, ensuring consistent behavior across different operating systems and deployment environments. Our platform abstraction layer handles OS-specific details transparently.

### Supported Platforms

<table>
<tr>
<th>Platform</th>
<th>Minimum Version</th>
<th>Architecture</th>
<th>Notes</th>
</tr>
<tr>
<td><strong>Linux</strong></td>
<td>Kernel 4.9+</td>
<td>x86_64, ARM64</td>
<td>Primary platform, full feature support</td>
</tr>
<tr>
<td><strong>Windows Server</strong></td>
<td>2019+</td>
<td>x86_64</td>
<td>Native support, PowerShell integration</td>
</tr>
<tr>
<td><strong>Docker</strong></td>
<td>19.03+</td>
<td>Multi-arch</td>
<td>Official images available</td>
</tr>
<tr>
<td><strong>Kubernetes</strong></td>
<td>1.19+</td>
<td>Any</td>
<td>Helm charts, operators available</td>
</tr>
</table>

### Platform Abstraction Layer

```python
# platform/base.py
from abc import ABC, abstractmethod
from typing import Dict, Any
import platform

class PlatformAdapter(ABC):
    """Base platform adapter interface"""
    
    @abstractmethod
    def get_system_info(self) -> Dict[str, Any]:
        """Get system information"""
        pass
        
    @abstractmethod
    def install_service(self, config: ServiceConfig) -> None:
        """Install as system service"""
        pass
        
    @abstractmethod
    def manage_firewall(self, rules: List[FirewallRule]) -> None:
        """Manage firewall rules"""
        pass
        
    @abstractmethod
    def get_nginx_path(self) -> str:
        """Get platform-specific Nginx path"""
        pass

class PlatformFactory:
    """Factory for creating platform-specific adapters"""
    
    @staticmethod
    def create() -> PlatformAdapter:
        system = platform.system().lower()
        
        if system == "linux":
            return LinuxAdapter()
        elif system == "windows":
            return WindowsAdapter()
        elif "docker" in platform.node().lower():
            return DockerAdapter()
        else:
            raise UnsupportedPlatformError(f"Platform {system} not supported")
```

---

## Linux Implementation

### Installation Script

```bash
#!/bin/bash
# install-linux.sh

set -e

# Detect distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo "Cannot detect Linux distribution"
    exit 1
fi

# Distribution-specific installation
case $OS in
    ubuntu|debian)
        echo "Installing for Debian-based system..."
        apt-get update
        apt-get install -y \
            nginx \
            python3-pip \
            redis-server \
            postgresql \
            supervisor
        ;;
        
    centos|rhel|fedora)
        echo "Installing for Red Hat-based system..."
        yum install -y epel-release
        yum install -y \
            nginx \
            python3-pip \
            redis \
            postgresql-server \
            supervisor
        ;;
        
    alpine)
        echo "Installing for Alpine Linux..."
        apk add --no-cache \
            nginx \
            py3-pip \
            redis \
            postgresql \
            supervisor
        ;;
        
    *)
        echo "Unsupported distribution: $OS"
        exit 1
        ;;
esac

# Install Python dependencies
pip3 install -r requirements.txt

# Create system user
useradd -r -s /bin/false nrdot || true

# Create directories
mkdir -p /etc/nrdot /var/log/nrdot /var/lib/nrdot
chown -R nrdot:nrdot /etc/nrdot /var/log/nrdot /var/lib/nrdot

# Install systemd service
cp nrdot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable nrdot
```

### Systemd Service Configuration

```ini
# /etc/systemd/system/nrdot.service
[Unit]
Description=NRDOT v2 Control Loop Service
Documentation=https://docs.nrdot.io
After=network.target nginx.service redis.service postgresql.service
Wants=nginx.service

[Service]
Type=notify
User=nrdot
Group=nrdot
WorkingDirectory=/opt/nrdot
Environment="NRDOT_CONFIG=/etc/nrdot/config.yaml"
ExecStartPre=/opt/nrdot/bin/nrdot config validate
ExecStart=/opt/nrdot/bin/nrdot start --daemon
ExecReload=/bin/kill -HUP $MAINPID
ExecStop=/opt/nrdot/bin/nrdot stop
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nrdot

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/nrdot /var/lib/nrdot /etc/nrdot

[Install]
WantedBy=multi-user.target
```

### Linux-Specific Features

```python
# platform/linux.py
import os
import subprocess
from pathlib import Path

class LinuxAdapter(PlatformAdapter):
    """Linux platform adapter"""
    
    def get_system_info(self) -> Dict[str, Any]:
        """Get Linux system information"""
        info = {
            "platform": "linux",
            "distribution": self._get_distribution(),
            "kernel": os.uname().release,
            "cpu_count": os.cpu_count(),
            "memory_mb": self._get_memory_info()
        }
        
        return info
        
    def install_service(self, config: ServiceConfig) -> None:
        """Install as systemd service"""
        service_file = self._generate_service_file(config)
        
        # Write service file
        service_path = Path("/etc/systemd/system/nrdot.service")
        service_path.write_text(service_file)
        
        # Enable and start service
        subprocess.run(["systemctl", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "enable", "nrdot"], check=True)
        subprocess.run(["systemctl", "start", "nrdot"], check=True)
        
    def manage_firewall(self, rules: List[FirewallRule]) -> None:
        """Manage iptables/firewalld rules"""
        if self._has_firewalld():
            self._manage_firewalld(rules)
        else:
            self._manage_iptables(rules)
```

---

## Windows Server Support

### Windows Installation

```powershell
# install-windows.ps1

param(
    [string]$InstallPath = "C:\Program Files\NRDOT",
    [string]$DataPath = "C:\ProgramData\NRDOT"
)

# Require Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator."
    exit 1
}

# Create directories
New-Item -ItemType Directory -Force -Path $InstallPath
New-Item -ItemType Directory -Force -Path $DataPath
New-Item -ItemType Directory -Force -Path "$DataPath\logs"
New-Item -ItemType Directory -Force -Path "$DataPath\config"

# Install Chocolatey if not present
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
}

# Install dependencies
choco install -y nginx python3 redis-64 postgresql

# Install Python packages
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# Configure Nginx for Windows
$nginxConfig = @"
worker_processes auto;
error_log $DataPath\logs\nginx-error.log;

events {
    worker_connections 1024;
}

http {
    access_log $DataPath\logs\nginx-access.log;
    include $DataPath\config\sites-enabled\*.conf;
}
"@

Set-Content -Path "C:\tools\nginx\conf\nginx.conf" -Value $nginxConfig

# Install as Windows Service
New-Service -Name "NRDOT" `
    -DisplayName "NRDOT v2 Control Loop" `
    -Description "Nginx Reverse-proxy Dashboard Orchestration Tool" `
    -BinaryPathName "$InstallPath\nrdot.exe --service" `
    -StartupType Automatic

# Configure Windows Firewall
New-NetFirewallRule -DisplayName "NRDOT Dashboard" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 8080 `
    -Action Allow

Write-Host "NRDOT installation completed successfully!" -ForegroundColor Green
```

### Windows Service Implementation

```python
# platform/windows.py
import win32serviceutil
import win32service
import win32event
import servicemanager
import socket
import sys
import os

class NRDOTWindowsService(win32serviceutil.ServiceFramework):
    """Windows service implementation"""
    
    _svc_name_ = "NRDOT"
    _svc_display_name_ = "NRDOT v2 Control Loop"
    _svc_description_ = "Nginx Reverse-proxy Dashboard Orchestration Tool"
    
    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        socket.setdefaulttimeout(60)
        self.is_running = True
        
    def SvcStop(self):
        """Stop the service"""
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        self.is_running = False
        
    def SvcDoRun(self):
        """Run the service"""
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, '')
        )
        
        self.main()
        
    def main(self):
        """Main service loop"""
        from nrdot.core import ControlLoop
        
        config_path = os.environ.get('NRDOT_CONFIG', 'C:\\ProgramData\\NRDOT\\config\\config.yaml')
        control_loop = ControlLoop(config_path)
        
        # Run control loop
        import asyncio
        asyncio.run(control_loop.start())
```

### Windows-Specific Configuration

```yaml
# Windows-specific configuration
platform:
  windows:
    # Service configuration
    service:
      name: "NRDOT"
      display_name: "NRDOT v2 Control Loop"
      startup_type: "automatic"
      recovery:
        first_failure: "restart"
        second_failure: "restart"
        subsequent_failures: "restart"
        reset_period: 86400  # 24 hours
        
    # Nginx paths
    nginx:
      executable: "C:\\tools\\nginx\\nginx.exe"
      config_dir: "C:\\ProgramData\\NRDOT\\nginx"
      
    # Logging
    logging:
      event_log: true
      file_log: "C:\\ProgramData\\NRDOT\\logs\\nrdot.log"
```

---

## Container Deployment

### Dockerfile

```dockerfile
# Multi-stage Dockerfile
FROM python:3.9-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev \
    libffi-dev \
    openssl-dev \
    make

# Install Python dependencies
COPY requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Final stage
FROM python:3.9-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    nginx \
    supervisor \
    redis \
    postgresql-client \
    curl \
    jq

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.9/site-packages /usr/local/lib/python3.9/site-packages

# Create user
RUN adduser -D -s /sbin/nologin nrdot

# Copy application
COPY . /opt/nrdot
WORKDIR /opt/nrdot

# Setup directories
RUN mkdir -p /etc/nrdot /var/log/nrdot /var/lib/nrdot && \
    chown -R nrdot:nrdot /etc/nrdot /var/log/nrdot /var/lib/nrdot

# Copy configuration
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Expose ports
EXPOSE 80 443 8080

# Run supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  nrdot:
    image: nrdot/nrdot:v2
    container_name: nrdot
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    environment:
      - NRDOT_ENV=production
      - NRDOT_CONFIG=/etc/nrdot/config.yaml
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://nrdot:password@postgres:5432/nrdot
    volumes:
      - ./config:/etc/nrdot
      - ./ssl:/etc/ssl/nrdot
      - nrdot-data:/var/lib/nrdot
      - nrdot-logs:/var/log/nrdot
    depends_on:
      - redis
      - postgres
    networks:
      - nrdot-network
      
  redis:
    image: redis:7-alpine
    container_name: nrdot-redis
    restart: unless-stopped
    volumes:
      - redis-data:/data
    networks:
      - nrdot-network
      
  postgres:
    image: postgres:15-alpine
    container_name: nrdot-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=nrdot
      - POSTGRES_USER=nrdot
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - nrdot-network

volumes:
  nrdot-data:
  nrdot-logs:
  redis-data:
  postgres-data:

networks:
  nrdot-network:
    driver: bridge
```

---

## Kubernetes Integration

### Helm Chart Structure

```yaml
# helm/nrdot/Chart.yaml
apiVersion: v2
name: nrdot
description: NRDOT v2 - Nginx Reverse-proxy Dashboard Orchestration Tool
type: application
version: 2.0.0
appVersion: "2.0"
keywords:
  - nginx
  - reverse-proxy
  - load-balancer
  - dashboard
maintainers:
  - name: NRDOT Team
    email: team@nrdot.io
```

### Kubernetes Deployment

```yaml
# helm/nrdot/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "nrdot.fullname" . }}
  labels:
    {{- include "nrdot.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "nrdot.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
      labels:
        {{- include "nrdot.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "nrdot.serviceAccountName" . }}
      containers:
      - name: nrdot
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: 80
          protocol: TCP
        - name: https
          containerPort: 443
          protocol: TCP
        - name: dashboard
          containerPort: 8080
          protocol: TCP
        livenessProbe:
          httpGet:
            path: /health
            port: dashboard
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: dashboard
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
        volumeMounts:
        - name: config
          mountPath: /etc/nrdot
        - name: data
          mountPath: /var/lib/nrdot
      volumes:
      - name: config
        configMap:
          name: {{ include "nrdot.fullname" . }}
      - name: data
        persistentVolumeClaim:
          claimName: {{ include "nrdot.fullname" . }}-data
```

### Kubernetes Operator

```go
// operator/controller.go
package controller

import (
    "context"
    "fmt"
    
    nrdotv2 "github.com/nrdot/operator/api/v2"
    corev1 "k8s.io/api/core/v1"
    "k8s.io/apimachinery/pkg/runtime"
    ctrl "sigs.k8s.io/controller-runtime"
    "sigs.k8s.io/controller-runtime/pkg/client"
)

type NRDOTReconciler struct {
    client.Client
    Scheme *runtime.Scheme
}

func (r *NRDOTReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // Fetch the NRDOT instance
    nrdot := &nrdotv2.NRDOT{}
    err := r.Get(ctx, req.NamespacedName, nrdot)
    if err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }
    
    // Reconcile ConfigMap
    configMap := r.configMapForNRDOT(nrdot)
    if err := r.createOrUpdate(ctx, configMap); err != nil {
        return ctrl.Result{}, err
    }
    
    // Reconcile Deployment
    deployment := r.deploymentForNRDOT(nrdot)
    if err := r.createOrUpdate(ctx, deployment); err != nil {
        return ctrl.Result{}, err
    }
    
    // Reconcile Service
    service := r.serviceForNRDOT(nrdot)
    if err := r.createOrUpdate(ctx, service); err != nil {
        return ctrl.Result{}, err
    }
    
    return ctrl.Result{}, nil
}
```

---

## Cloud Platform Patterns

### AWS Integration

```yaml
# AWS-specific configuration
cloud:
  provider: aws
  region: us-east-1
  
  # Auto-discovery
  discovery:
    enabled: true
    filters:
      - tag:Environment: production
      - tag:Service: web-app
      
  # ALB integration
  alb:
    enabled: true
    target_groups:
      - name: nrdot-backends
        health_check:
          path: /health
          interval: 30
          
  # CloudWatch integration
  monitoring:
    cloudwatch:
      enabled: true
      namespace: NRDOT
      metrics:
        - RequestCount
        - ResponseTime
        - ErrorRate
```

### Azure Integration

```yaml
# Azure-specific configuration
cloud:
  provider: azure
  subscription_id: ${AZURE_SUBSCRIPTION_ID}
  resource_group: nrdot-rg
  
  # Azure Load Balancer
  load_balancer:
    name: nrdot-lb
    sku: Standard
    backend_pools:
      - name: web-backends
        
  # Application Insights
  monitoring:
    app_insights:
      enabled: true
      instrumentation_key: ${APP_INSIGHTS_KEY}
      
  # Key Vault integration
  secrets:
    key_vault:
      name: nrdot-kv
      certificates:
        - name: ssl-cert
          version: latest
```

### GCP Integration

```yaml
# GCP-specific configuration
cloud:
  provider: gcp
  project_id: ${GCP_PROJECT_ID}
  
  # Instance groups
  instance_groups:
    - name: nrdot-backends
      zone: us-central1-a
      autoscaling:
        min: 2
        max: 10
        
  # Cloud Load Balancing
  load_balancing:
    type: HTTP(S)
    ssl_certificates:
      - projects/my-project/global/sslCertificates/my-cert
      
  # Stackdriver integration
  monitoring:
    stackdriver:
      enabled: true
      custom_metrics:
        - name: nrdot/request_count
          type: GAUGE
```

---

## Platform-Specific Optimizations

### Linux Optimizations

```bash
# /etc/sysctl.d/99-nrdot.conf
# Network optimizations for high-performance proxy

# Increase TCP buffer sizes
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728

# Increase connection tracking
net.netfilter.nf_conntrack_max = 1000000
net.nf_conntrack_max = 1000000

# Enable TCP Fast Open
net.ipv4.tcp_fastopen = 3

# Increase file descriptors
fs.file-max = 1000000
fs.nr_open = 1000000
```

### Windows Optimizations

```powershell
# Windows TCP/IP optimizations

# Increase dynamic port range
netsh int ipv4 set dynamicport tcp start=10000 num=55535

# Configure TCP settings
netsh int tcp set global autotuninglevel=normal
netsh int tcp set global chimney=enabled
netsh int tcp set global rss=enabled

# Increase connection limit
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" `
    -Name "TcpNumConnections" -Value 0xfffffe

# Configure HTTP.sys
netsh http add timeout timeouttype=IdleConnectionTimeout value=120
```

---

## Testing Across Platforms

### Platform Test Matrix

```yaml
# .github/workflows/platform-tests.yml
name: Cross-Platform Tests

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        python-version: ['3.8', '3.9', '3.10', '3.11']
        
    runs-on: ${{ matrix.os }}
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
        
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements.txt
        pip install -r requirements-test.txt
        
    - name: Run platform tests
      run: |
        pytest tests/platform/ -v --cov=nrdot.platform
        
    - name: Integration tests
      run: |
        python -m pytest tests/integration/ -v
```

### Platform-Specific Tests

```python
# tests/platform/test_adapters.py
import pytest
import platform
from nrdot.platform import PlatformFactory

class TestPlatformAdapters:
    """Test platform-specific adapters"""
    
    def test_platform_detection(self):
        """Test correct platform detection"""
        adapter = PlatformFactory.create()
        system_info = adapter.get_system_info()
        
        assert system_info['platform'] in ['linux', 'windows', 'darwin']
        
    @pytest.mark.skipif(platform.system() != 'Linux', reason="Linux only")
    def test_linux_service_installation(self):
        """Test Linux service installation"""
        adapter = PlatformFactory.create()
        config = ServiceConfig(name="nrdot-test")
        
        # Should not raise
        adapter.install_service(config)
        
    @pytest.mark.skipif(platform.system() != 'Windows', reason="Windows only")
    def test_windows_service_installation(self):
        """Test Windows service installation"""
        adapter = PlatformFactory.create()
        config = ServiceConfig(name="nrdot-test")
        
        # Should not raise
        adapter.install_service(config)
```

---

## Migration Strategies

### Platform Migration Guide

```yaml
# Migration configuration
migration:
  source:
    platform: linux
    version: "1.x"
    
  target:
    platform: kubernetes
    version: "2.0"
    
  strategy:
    type: blue-green
    phases:
      - name: prepare
        tasks:
          - backup_configuration
          - validate_target_platform
          
      - name: deploy
        tasks:
          - deploy_target_infrastructure
          - sync_configuration
          
      - name: cutover
        tasks:
          - redirect_traffic
          - monitor_health
          
      - name: cleanup
        tasks:
          - remove_old_infrastructure
          - update_documentation
```

### Migration Checklist

- [ ] **Pre-Migration**
  - [ ] Backup current configuration
  - [ ] Document custom modifications
  - [ ] Test migration in staging
  - [ ] Plan rollback strategy

- [ ] **Migration**
  - [ ] Deploy new platform
  - [ ] Sync configurations
  - [ ] Validate functionality
  - [ ] Monitor performance

- [ ] **Post-Migration**
  - [ ] Update monitoring
  - [ ] Update documentation
  - [ ] Train team on new platform
  - [ ] Decommission old platform

---

<div align="center">

[← Control Loop](03-control-loop.md) | [Index](index.md) | [Monitoring →](05-monitoring.md)

*NRDOT v2.0 Documentation - Cross-Platform Patterns*

</div>