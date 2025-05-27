# Deployment Playbook

[← Monitoring](05-monitoring.md) | [Index](index.md) | [Validation →](07-validation.md)

---

## Table of Contents

- [Deployment Overview](#deployment-overview)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Deployment Strategies](#deployment-strategies)
- [Infrastructure Requirements](#infrastructure-requirements)
- [Installation Procedures](#installation-procedures)
- [Configuration Management](#configuration-management)
- [Performance Tuning](#performance-tuning)
- [Backup & Recovery](#backup--recovery)
- [Rollback Procedures](#rollback-procedures)
- [Post-Deployment Validation](#post-deployment-validation)

---

## Deployment Overview

This playbook provides comprehensive guidance for deploying NRDOT v2 in production environments. It covers various deployment scenarios, from single-server installations to highly available multi-region deployments.

### Deployment Models

```
┌─────────────────────────────────────────────────────────────┐
│                    Deployment Models                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Single Server        HA Cluster         Multi-Region       │
│  ┌─────────┐        ┌─────────┐        ┌─────────┐        │
│  │ NRDOT   │        │ NRDOT-1 │        │Region-1 │        │
│  │ Nginx   │        │ Nginx   │        │ NRDOT   │        │
│  │ Redis   │        ├─────────┤        ├─────────┤        │
│  │ Postgres│        │ NRDOT-2 │        │Region-2 │        │
│  └─────────┘        │ Nginx   │        │ NRDOT   │        │
│                     ├─────────┤        ├─────────┤        │
│                     │Shared   │        │Region-3 │        │
│                     │Storage  │        │ NRDOT   │        │
│                     └─────────┘        └─────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Timeline

<table>
<tr>
<th>Phase</th>
<th>Duration</th>
<th>Activities</th>
</tr>
<tr>
<td><strong>Planning</strong></td>
<td>1-2 weeks</td>
<td>Requirements gathering, architecture design, resource allocation</td>
</tr>
<tr>
<td><strong>Preparation</strong></td>
<td>3-5 days</td>
<td>Infrastructure setup, dependency installation, security hardening</td>
</tr>
<tr>
<td><strong>Installation</strong></td>
<td>1-2 days</td>
<td>NRDOT installation, initial configuration, integration setup</td>
</tr>
<tr>
<td><strong>Testing</strong></td>
<td>2-3 days</td>
<td>Functional testing, load testing, failover testing</td>
</tr>
<tr>
<td><strong>Go-Live</strong></td>
<td>1 day</td>
<td>Production cutover, monitoring setup, documentation</td>
</tr>
</table>

---

## Pre-Deployment Checklist

### Technical Requirements

- [ ] **Infrastructure**
  - [ ] Servers provisioned with required specifications
  - [ ] Network connectivity verified between all components
  - [ ] DNS entries configured
  - [ ] SSL certificates obtained and validated
  - [ ] Firewall rules configured

- [ ] **Software Dependencies**
  - [ ] Operating system updated and patched
  - [ ] Required packages installed (nginx, python, redis, etc.)
  - [ ] Python virtual environment prepared
  - [ ] Database server installed and configured

- [ ] **Security**
  - [ ] Security scanning completed
  - [ ] Access controls implemented
  - [ ] Encryption keys generated
  - [ ] Audit logging enabled
  - [ ] Backup encryption configured

### Organizational Requirements

- [ ] **Documentation**
  - [ ] Architecture diagram finalized
  - [ ] Network topology documented
  - [ ] Runbook prepared
  - [ ] Contact list updated

- [ ] **Approvals**
  - [ ] Change request approved
  - [ ] Maintenance window scheduled
  - [ ] Stakeholders notified
  - [ ] Rollback plan approved

---

## Deployment Strategies

### Blue-Green Deployment

```yaml
# blue-green-deployment.yaml
deployment:
  strategy: blue-green
  
  environments:
    blue:
      servers:
        - blue-1.example.com
        - blue-2.example.com
      version: "1.9.5"
      status: active
      
    green:
      servers:
        - green-1.example.com
        - green-2.example.com
      version: "2.0.0"
      status: staging
      
  process:
    - step: deploy_to_green
      actions:
        - install_nrdot_v2
        - configure_services
        - run_health_checks
        
    - step: test_green
      actions:
        - smoke_tests
        - load_tests
        - integration_tests
        
    - step: switch_traffic
      actions:
        - update_load_balancer
        - monitor_metrics
        - verify_functionality
        
    - step: decommission_blue
      wait: 24h
      actions:
        - backup_configuration
        - shutdown_services
```

### Canary Deployment

```python
# deployment/canary.py
class CanaryDeployment:
    """Manage canary deployment process"""
    
    def __init__(self, config):
        self.config = config
        self.metrics_collector = MetricsCollector()
        
    async def deploy(self):
        """Execute canary deployment"""
        # Stage 1: Deploy to canary servers (10%)
        await self.deploy_canary(percentage=10)
        
        # Monitor for 30 minutes
        if await self.monitor_canary(duration=1800):
            # Stage 2: Increase to 50%
            await self.increase_canary(percentage=50)
            
            # Monitor for 1 hour
            if await self.monitor_canary(duration=3600):
                # Stage 3: Full deployment
                await self.complete_deployment()
            else:
                await self.rollback()
        else:
            await self.rollback()
            
    async def monitor_canary(self, duration):
        """Monitor canary metrics"""
        start_time = time.time()
        
        while time.time() - start_time < duration:
            metrics = await self.metrics_collector.get_canary_metrics()
            
            if not self.validate_metrics(metrics):
                logger.error("Canary metrics validation failed")
                return False
                
            await asyncio.sleep(30)
            
        return True
```

### Rolling Deployment

```bash
#!/bin/bash
# rolling-deployment.sh

set -e

SERVERS=("server1" "server2" "server3" "server4")
BATCH_SIZE=2
VERSION="2.0.0"

deploy_batch() {
    local batch=("$@")
    
    echo "Deploying to batch: ${batch[*]}"
    
    for server in "${batch[@]}"; do
        echo "Removing $server from load balancer..."
        nrdot backend disable --server "$server"
        
        echo "Deploying NRDOT v$VERSION to $server..."
        ssh "$server" "sudo /opt/nrdot/upgrade.sh $VERSION"
        
        echo "Running health checks on $server..."
        if nrdot health check --server "$server"; then
            echo "Re-enabling $server in load balancer..."
            nrdot backend enable --server "$server"
        else
            echo "Health check failed for $server!"
            exit 1
        fi
    done
}

# Deploy in batches
for ((i=0; i<${#SERVERS[@]}; i+=BATCH_SIZE)); do
    batch=("${SERVERS[@]:i:BATCH_SIZE}")
    deploy_batch "${batch[@]}"
    
    echo "Waiting for metrics to stabilize..."
    sleep 300
done

echo "Rolling deployment completed successfully!"
```

---

## Infrastructure Requirements

### Hardware Specifications

<table>
<tr>
<th>Component</th>
<th>Small (< 1000 req/s)</th>
<th>Medium (< 10k req/s)</th>
<th>Large (< 100k req/s)</th>
</tr>
<tr>
<td><strong>CPU</strong></td>
<td>4 cores</td>
<td>8 cores</td>
<td>16+ cores</td>
</tr>
<tr>
<td><strong>RAM</strong></td>
<td>8 GB</td>
<td>16 GB</td>
<td>32+ GB</td>
</tr>
<tr>
<td><strong>Storage</strong></td>
<td>100 GB SSD</td>
<td>250 GB SSD</td>
<td>500+ GB NVMe</td>
</tr>
<tr>
<td><strong>Network</strong></td>
<td>1 Gbps</td>
<td>10 Gbps</td>
<td>25+ Gbps</td>
</tr>
</table>

### Network Architecture

```yaml
# network-architecture.yaml
network:
  zones:
    dmz:
      subnet: 10.1.0.0/24
      components:
        - load_balancers
        - edge_proxies
        
    application:
      subnet: 10.2.0.0/24
      components:
        - nrdot_servers
        - application_servers
        
    data:
      subnet: 10.3.0.0/24
      components:
        - databases
        - cache_servers
        
  security_groups:
    nrdot_sg:
      ingress:
        - port: 80
          source: 0.0.0.0/0
        - port: 443
          source: 0.0.0.0/0
        - port: 8080
          source: 10.0.0.0/8
      egress:
        - port: all
          destination: 0.0.0.0/0
```

---

## Installation Procedures

### Automated Installation

```bash
#!/bin/bash
# install-production.sh

set -euo pipefail

# Configuration
NRDOT_VERSION="${NRDOT_VERSION:-2.0.0}"
INSTALL_DIR="/opt/nrdot"
CONFIG_DIR="/etc/nrdot"
DATA_DIR="/var/lib/nrdot"
LOG_DIR="/var/log/nrdot"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Pre-installation checks
pre_install_checks() {
    log "Running pre-installation checks..."
    
    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        error "Cannot determine OS version"
    fi
    
    # Check root/sudo
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
    fi
    
    # Check disk space
    available_space=$(df -BG ${INSTALL_DIR%/*} | awk 'NR==2 {print $4}' | sed 's/G//')
    if [[ $available_space -lt 10 ]]; then
        error "Insufficient disk space. At least 10GB required."
    fi
    
    # Check ports
    for port in 80 443 8080; do
        if lsof -i :$port >/dev/null 2>&1; then
            warning "Port $port is already in use"
        fi
    done
    
    log "Pre-installation checks passed"
}

# Install system dependencies
install_dependencies() {
    log "Installing system dependencies..."
    
    # Update package manager
    apt-get update || yum update -y
    
    # Install packages
    PACKAGES="nginx python3 python3-pip redis-server postgresql postgresql-contrib git curl jq"
    
    if command -v apt-get >/dev/null; then
        apt-get install -y $PACKAGES
    elif command -v yum >/dev/null; then
        yum install -y $PACKAGES
    else
        error "Unsupported package manager"
    fi
    
    # Install Python packages
    pip3 install --upgrade pip
    pip3 install virtualenv
    
    log "Dependencies installed successfully"
}

# Create directory structure
create_directories() {
    log "Creating directory structure..."
    
    mkdir -p {$INSTALL_DIR,$CONFIG_DIR,$DATA_DIR,$LOG_DIR}
    mkdir -p $CONFIG_DIR/{ssl,conf.d,backends}
    mkdir -p $DATA_DIR/{cache,state,backups}
    mkdir -p $LOG_DIR/{nginx,app,audit}
    
    # Create nrdot user
    if ! id -u nrdot >/dev/null 2>&1; then
        useradd -r -s /bin/false -d $DATA_DIR nrdot
    fi
    
    # Set permissions
    chown -R nrdot:nrdot $DATA_DIR $LOG_DIR
    chmod 750 $CONFIG_DIR
    
    log "Directory structure created"
}

# Download and install NRDOT
install_nrdot() {
    log "Installing NRDOT v${NRDOT_VERSION}..."
    
    cd /tmp
    
    # Download release
    curl -L -o nrdot-${NRDOT_VERSION}.tar.gz \
        "https://github.com/nrdot/nrdot/releases/download/v${NRDOT_VERSION}/nrdot-${NRDOT_VERSION}.tar.gz"
    
    # Verify checksum
    curl -L -o nrdot-${NRDOT_VERSION}.tar.gz.sha256 \
        "https://github.com/nrdot/nrdot/releases/download/v${NRDOT_VERSION}/nrdot-${NRDOT_VERSION}.tar.gz.sha256"
    
    if ! sha256sum -c nrdot-${NRDOT_VERSION}.tar.gz.sha256; then
        error "Checksum verification failed"
    fi
    
    # Extract
    tar -xzf nrdot-${NRDOT_VERSION}.tar.gz -C $INSTALL_DIR --strip-components=1
    
    # Install Python dependencies
    cd $INSTALL_DIR
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    
    log "NRDOT installed successfully"
}

# Configure services
configure_services() {
    log "Configuring services..."
    
    # PostgreSQL
    sudo -u postgres psql <<EOF
CREATE DATABASE nrdot;
CREATE USER nrdot WITH ENCRYPTED PASSWORD 'secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE nrdot TO nrdot;
EOF
    
    # Redis
    cat > /etc/redis/redis-nrdot.conf <<EOF
port 6379
bind 127.0.0.1
protected-mode yes
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
dir $DATA_DIR/redis
EOF
    
    # Nginx
    cp $INSTALL_DIR/config/nginx/nrdot.conf /etc/nginx/sites-available/
    ln -sf /etc/nginx/sites-available/nrdot.conf /etc/nginx/sites-enabled/
    
    # Systemd service
    cp $INSTALL_DIR/config/systemd/nrdot.service /etc/systemd/system/
    systemctl daemon-reload
    
    log "Services configured"
}

# Initial configuration
initial_configuration() {
    log "Creating initial configuration..."
    
    cat > $CONFIG_DIR/config.yaml <<EOF
nrdot:
  version: "${NRDOT_VERSION}"
  environment: "production"
  
  database:
    host: "localhost"
    port: 5432
    name: "nrdot"
    user: "nrdot"
    password: "secure_password_here"
    
  redis:
    host: "localhost"
    port: 6379
    
  logging:
    level: "info"
    file: "$LOG_DIR/app/nrdot.log"
    
  api:
    host: "0.0.0.0"
    port: 8080
    
  nginx:
    config_dir: "/etc/nginx"
    reload_command: "systemctl reload nginx"
EOF
    
    # Set permissions
    chmod 640 $CONFIG_DIR/config.yaml
    chown root:nrdot $CONFIG_DIR/config.yaml
    
    log "Initial configuration created"
}

# Start services
start_services() {
    log "Starting services..."
    
    systemctl enable redis-server postgresql nginx nrdot
    systemctl start redis-server postgresql nginx
    
    # Initialize database
    cd $INSTALL_DIR
    source venv/bin/activate
    python manage.py db init
    python manage.py db migrate
    
    # Start NRDOT
    systemctl start nrdot
    
    # Wait for service to be ready
    for i in {1..30}; do
        if curl -s http://localhost:8080/health >/dev/null; then
            log "NRDOT is running and healthy"
            break
        fi
        sleep 2
    done
    
    log "All services started"
}

# Post-installation tasks
post_install() {
    log "Running post-installation tasks..."
    
    # Generate admin password
    ADMIN_PASSWORD=$(openssl rand -base64 32)
    
    # Create admin user
    cd $INSTALL_DIR
    source venv/bin/activate
    python manage.py create-admin --username admin --password "$ADMIN_PASSWORD"
    
    # Save credentials
    cat > $CONFIG_DIR/admin-credentials.txt <<EOF
NRDOT Admin Credentials
======================
URL: http://$(hostname -f):8080
Username: admin
Password: $ADMIN_PASSWORD

Please change this password after first login!
EOF
    
    chmod 600 $CONFIG_DIR/admin-credentials.txt
    
    # Display summary
    cat <<EOF

${GREEN}====================================
NRDOT v${NRDOT_VERSION} Installation Complete!
====================================${NC}

Dashboard URL: http://$(hostname -f):8080
Configuration: $CONFIG_DIR/config.yaml
Logs: $LOG_DIR/

Admin credentials saved to:
$CONFIG_DIR/admin-credentials.txt

Next steps:
1. Access the dashboard and change admin password
2. Configure your backend servers
3. Set up monitoring
4. Review security settings

For documentation, visit:
https://docs.nrdot.io/

EOF
}

# Main installation flow
main() {
    log "Starting NRDOT v${NRDOT_VERSION} installation..."
    
    pre_install_checks
    install_dependencies
    create_directories
    install_nrdot
    configure_services
    initial_configuration
    start_services
    post_install
    
    log "Installation completed successfully!"
}

# Run main function
main "$@"
```

---

## Configuration Management

### GitOps Workflow

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - test
  - deploy

variables:
  NRDOT_CONFIG_REPO: "git@gitlab.com:company/nrdot-config.git"

validate-config:
  stage: validate
  script:
    - nrdot config validate --file config/*.yaml
    - nrdot config lint --file config/*.yaml
    
test-config:
  stage: test
  script:
    - nrdot config test --environment staging
    - ./scripts/integration-tests.sh
    
deploy-production:
  stage: deploy
  only:
    - main
  script:
    - ./scripts/deploy-config.sh production
  environment:
    name: production
```

### Configuration Versioning

```python
# config/versioning.py
import hashlib
import json
from datetime import datetime

class ConfigVersionManager:
    """Manage configuration versions"""
    
    def __init__(self, storage_backend):
        self.storage = storage_backend
        
    def create_version(self, config: dict, user: str, message: str) -> str:
        """Create a new configuration version"""
        version = {
            "id": self._generate_version_id(config),
            "timestamp": datetime.utcnow().isoformat(),
            "user": user,
            "message": message,
            "config": config,
            "checksum": self._calculate_checksum(config)
        }
        
        # Store version
        self.storage.save(f"versions/{version['id']}", version)
        
        # Update current version pointer
        self.storage.save("current_version", version['id'])
        
        return version['id']
        
    def rollback(self, version_id: str) -> bool:
        """Rollback to a specific version"""
        version = self.storage.get(f"versions/{version_id}")
        
        if not version:
            raise ValueError(f"Version {version_id} not found")
            
        # Create rollback version
        rollback_version = self.create_version(
            version['config'],
            "system",
            f"Rollback to version {version_id}"
        )
        
        return rollback_version
```

---

## Performance Tuning

### System Optimization

```bash
#!/bin/bash
# optimize-system.sh

# Kernel parameters for high-performance networking
cat > /etc/sysctl.d/99-nrdot-performance.conf <<EOF
# Network performance tuning
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_max_tw_buckets = 2000000
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 10
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_keepalive_time = 60
net.ipv4.tcp_keepalive_intvl = 10
net.ipv4.tcp_keepalive_probes = 6
net.ipv4.tcp_mtu_probing = 1

# Memory tuning
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5

# File descriptor limits
fs.file-max = 2097152
fs.nr_open = 2097152
EOF

sysctl -p /etc/sysctl.d/99-nrdot-performance.conf

# Update limits
cat > /etc/security/limits.d/99-nrdot.conf <<EOF
nrdot soft nofile 1048576
nrdot hard nofile 1048576
nrdot soft nproc 65535
nrdot hard nproc 65535
EOF

# Nginx optimization
cat > /etc/nginx/conf.d/performance.conf <<EOF
worker_processes auto;
worker_cpu_affinity auto;
worker_rlimit_nofile 1048576;

events {
    worker_connections 65535;
    use epoll;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 100;
    
    # Buffer sizes
    client_body_buffer_size 128k;
    client_max_body_size 10m;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 16k;
    output_buffers 1 32k;
    postpone_output 1460;
    
    # Caching
    open_file_cache max=200000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;
}
EOF
```

### Application Tuning

```yaml
# performance-config.yaml
performance:
  # Connection pooling
  connection_pools:
    database:
      min_connections: 10
      max_connections: 100
      connection_timeout: 5s
      idle_timeout: 300s
      
    redis:
      min_connections: 5
      max_connections: 50
      connection_timeout: 2s
      
  # Caching
  caching:
    backend_status:
      ttl: 10s
      max_entries: 10000
      
    configuration:
      ttl: 60s
      max_entries: 1000
      
  # Threading
  threading:
    worker_threads: 16
    event_loop_threads: 4
    io_threads: 8
    
  # Batch processing
  batch_processing:
    config_updates:
      batch_size: 100
      batch_timeout: 5s
      
    metric_collection:
      batch_size: 1000
      batch_timeout: 10s
```

---

## Backup & Recovery

### Backup Strategy

```bash
#!/bin/bash
# backup-nrdot.sh

set -euo pipefail

# Configuration
BACKUP_DIR="/backup/nrdot"
RETENTION_DAYS=30
S3_BUCKET="company-nrdot-backups"
ENCRYPTION_KEY="/etc/nrdot/backup-key.pem"

# Create backup
create_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_name="nrdot_backup_${timestamp}"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    echo "Creating backup: $backup_name"
    
    # Create backup directory
    mkdir -p "$backup_path"
    
    # Backup configuration
    tar -czf "${backup_path}/config.tar.gz" \
        -C /etc/nrdot . \
        --exclude='*.log' \
        --exclude='*.tmp'
    
    # Backup database
    PGPASSWORD=$DB_PASSWORD pg_dump \
        -h localhost \
        -U nrdot \
        -d nrdot \
        -f "${backup_path}/database.sql"
    
    # Backup Redis
    redis-cli --rdb "${backup_path}/redis.rdb"
    
    # Create manifest
    cat > "${backup_path}/manifest.json" <<EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "version": "$(nrdot version)",
    "hostname": "$(hostname -f)",
    "components": {
        "config": "config.tar.gz",
        "database": "database.sql",
        "redis": "redis.rdb"
    }
}
EOF
    
    # Encrypt backup
    tar -czf - -C "$BACKUP_DIR" "$backup_name" | \
        openssl enc -aes-256-cbc -salt -pass file:"$ENCRYPTION_KEY" \
        > "${backup_path}.tar.gz.enc"
    
    # Upload to S3
    aws s3 cp "${backup_path}.tar.gz.enc" \
        "s3://${S3_BUCKET}/${backup_name}.tar.gz.enc" \
        --storage-class STANDARD_IA
    
    # Cleanup local files
    rm -rf "$backup_path"
    
    echo "Backup completed: ${backup_name}"
}

# Cleanup old backups
cleanup_backups() {
    echo "Cleaning up old backups..."
    
    # Local cleanup
    find "$BACKUP_DIR" -name "nrdot_backup_*.tar.gz.enc" \
        -mtime +$RETENTION_DAYS -delete
    
    # S3 cleanup
    aws s3 ls "s3://${S3_BUCKET}/" | \
        grep "nrdot_backup_" | \
        awk '{print $4}' | \
        while read -r file; do
            file_date=$(echo "$file" | grep -oE '[0-9]{8}')
            cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y%m%d)
            
            if [[ $file_date -lt $cutoff_date ]]; then
                aws s3 rm "s3://${S3_BUCKET}/${file}"
            fi
        done
}

# Main
main() {
    create_backup
    cleanup_backups
}

main "$@"
```

### Recovery Procedures

```python
# recovery/restore.py
import os
import subprocess
import tempfile
from pathlib import Path

class DisasterRecovery:
    """Disaster recovery procedures"""
    
    def __init__(self, backup_location: str):
        self.backup_location = backup_location
        
    def restore_from_backup(self, backup_id: str) -> bool:
        """Restore system from backup"""
        try:
            # Download backup
            backup_file = self._download_backup(backup_id)
            
            # Decrypt backup
            decrypted_dir = self._decrypt_backup(backup_file)
            
            # Verify backup integrity
            if not self._verify_backup(decrypted_dir):
                raise ValueError("Backup verification failed")
                
            # Stop services
            self._stop_services()
            
            # Restore components
            self._restore_config(decrypted_dir)
            self._restore_database(decrypted_dir)
            self._restore_redis(decrypted_dir)
            
            # Start services
            self._start_services()
            
            # Verify restoration
            return self._verify_restoration()
            
        except Exception as e:
            logger.error(f"Restoration failed: {e}")
            self._rollback()
            raise
```

---

## Rollback Procedures

### Automated Rollback

```yaml
# rollback-config.yaml
rollback:
  triggers:
    - name: high_error_rate
      condition: "error_rate > 5%"
      duration: 5m
      action: automatic
      
    - name: health_check_failure
      condition: "healthy_backends < 50%"
      duration: 2m
      action: automatic
      
    - name: memory_exhaustion
      condition: "memory_usage > 90%"
      duration: 10m
      action: manual_approval
      
  procedures:
    - name: configuration_rollback
      steps:
        - backup_current_state
        - restore_previous_config
        - reload_services
        - verify_functionality
        
    - name: version_rollback
      steps:
        - stop_services
        - restore_previous_version
        - migrate_data_backward
        - start_services
        - verify_functionality
```

### Manual Rollback Script

```bash
#!/bin/bash
# rollback-nrdot.sh

set -euo pipefail

# Get previous version
CURRENT_VERSION=$(nrdot version)
PREVIOUS_VERSION=$(nrdot version history | head -2 | tail -1)

echo "Rolling back from $CURRENT_VERSION to $PREVIOUS_VERSION"

# Confirmation
read -p "Are you sure? (yes/no): " confirmation
if [[ $confirmation != "yes" ]]; then
    echo "Rollback cancelled"
    exit 0
fi

# Create backup of current state
echo "Creating backup of current state..."
/opt/nrdot/scripts/backup-nrdot.sh

# Stop services
echo "Stopping services..."
systemctl stop nrdot nginx

# Rollback application
echo "Rolling back application..."
cd /opt/nrdot
git checkout "v${PREVIOUS_VERSION}"
source venv/bin/activate
pip install -r requirements.txt

# Rollback database
echo "Rolling back database..."
python manage.py db downgrade

# Rollback configuration
echo "Rolling back configuration..."
cp /backup/nrdot/config-${PREVIOUS_VERSION}.yaml /etc/nrdot/config.yaml

# Start services
echo "Starting services..."
systemctl start nginx nrdot

# Verify
echo "Verifying rollback..."
if nrdot health check; then
    echo "Rollback completed successfully!"
else
    echo "Rollback verification failed!"
    exit 1
fi
```

---

## Post-Deployment Validation

### Validation Checklist

- [ ] **Service Health**
  - [ ] All services running and healthy
  - [ ] No errors in logs
  - [ ] Memory and CPU usage normal
  - [ ] Disk space adequate

- [ ] **Functionality**
  - [ ] Dashboard accessible
  - [ ] API endpoints responding
  - [ ] Backend health checks working
  - [ ] Configuration updates applying

- [ ] **Performance**
  - [ ] Response times within SLA
  - [ ] Throughput meets requirements
  - [ ] No performance degradation
  - [ ] Resource utilization optimal

- [ ] **Security**
  - [ ] SSL certificates valid
  - [ ] Authentication working
  - [ ] Firewall rules correct
  - [ ] No security warnings

### Automated Validation

```python
# validation/post_deployment.py
class PostDeploymentValidator:
    """Validate deployment success"""
    
    def __init__(self):
        self.checks = []
        self.results = {}
        
    async def run_all_checks(self) -> ValidationReport:
        """Run all post-deployment checks"""
        
        # Service checks
        await self.check_services()
        
        # API checks
        await self.check_api_endpoints()
        
        # Performance checks
        await self.check_performance()
        
        # Security checks
        await self.check_security()
        
        # Generate report
        return self.generate_report()
        
    async def check_services(self):
        """Check all services are running"""
        services = ['nrdot', 'nginx', 'redis-server', 'postgresql']
        
        for service in services:
            status = await self._check_service_status(service)
            self.results[f"service_{service}"] = status
            
    async def check_api_endpoints(self):
        """Check API endpoints"""
        endpoints = [
            '/health',
            '/api/v2/config',
            '/api/v2/backends',
            '/metrics'
        ]
        
        for endpoint in endpoints:
            response = await self._check_endpoint(endpoint)
            self.results[f"endpoint_{endpoint}"] = response.status == 200
```

---

<div align="center">

[← Monitoring](05-monitoring.md) | [Index](index.md) | [Validation →](07-validation.md)

*NRDOT v2.0 Documentation - Deployment Playbook*

</div>