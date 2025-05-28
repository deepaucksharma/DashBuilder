#!/bin/bash
#
# Simple NRDOT Collector Binary Installation
# Multiple creative approaches to get NRDOT working

set -e

# Configuration from environment or defaults
COLLECTOR_DISTRO="${COLLECTOR_DISTRO:-nrdot-collector-host}"
COLLECTOR_VERSION="${COLLECTOR_VERSION:-1.1.0}"
COLLECTOR_ARCH="${COLLECTOR_ARCH:-amd64}"
LICENSE_KEY="${NEW_RELIC_LICENSE_KEY:-$LICENSE_KEY}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_section() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

# Check license key
if [ -z "$LICENSE_KEY" ]; then
    log_error "License key not set! Use:"
    echo "export NEW_RELIC_LICENSE_KEY='your-key-here'"
    echo "OR"
    echo "export LICENSE_KEY='your-key-here'"
    exit 1
fi

# Method 1: Direct Binary Download and Run
method1_direct_run() {
    log_section "Method 1: Direct Binary Run"
    
    mkdir -p ~/nrdot-test && cd ~/nrdot-test
    
    log_info "Downloading NRDOT collector..."
    curl -L -o collector.tar.gz \
        "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${COLLECTOR_VERSION}/${COLLECTOR_DISTRO}_${COLLECTOR_VERSION}_linux_${COLLECTOR_ARCH}.tar.gz"
    
    tar -xzf collector.tar.gz
    
    log_info "Running NRDOT collector..."
    NEW_RELIC_LICENSE_KEY="${LICENSE_KEY}" \
    OTEL_RESOURCE_ATTRIBUTES="service.name=test-direct,host.id=$(hostname)" \
    ./nrdot-collector-host --config ./config.yaml &
    
    NRDOT_PID=$!
    log_info "NRDOT running with PID: $NRDOT_PID"
    
    sleep 5
    if kill -0 $NRDOT_PID 2>/dev/null; then
        log_info "✓ NRDOT is running!"
        log_info "Check logs: tail -f ~/nrdot-test/nrdot.log"
        log_info "Stop with: kill $NRDOT_PID"
    else
        log_error "NRDOT failed to start"
    fi
}

# Method 2: Docker with Binary
method2_docker_binary() {
    log_section "Method 2: Docker Container with Binary"
    
    cat > /tmp/Dockerfile.nrdot << 'EOF'
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG COLLECTOR_VERSION=1.1.0
ARG COLLECTOR_ARCH=amd64
RUN curl -L -o collector.tar.gz \
    "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${COLLECTOR_VERSION}/nrdot-collector-host_${COLLECTOR_VERSION}_linux_${COLLECTOR_ARCH}.tar.gz" && \
    tar -xzf collector.tar.gz && \
    rm collector.tar.gz
EXPOSE 4317 4318
ENTRYPOINT ["./nrdot-collector-host"]
CMD ["--config", "./config.yaml"]
EOF
    
    log_info "Building Docker image..."
    docker build -f /tmp/Dockerfile.nrdot -t nrdot-binary:latest /tmp
    
    log_info "Running NRDOT in Docker..."
    docker run -d --name nrdot-binary \
        -e NEW_RELIC_LICENSE_KEY="${LICENSE_KEY}" \
        -e OTEL_RESOURCE_ATTRIBUTES="service.name=test-docker,host.id=docker-$(hostname)" \
        -p 4317:4317 -p 4318:4318 \
        nrdot-binary:latest
    
    if docker ps | grep -q nrdot-binary; then
        log_info "✓ NRDOT Docker container running!"
        log_info "Logs: docker logs -f nrdot-binary"
    fi
}

# Method 3: Systemd Service
method3_systemd_service() {
    log_section "Method 3: Systemd Service (requires sudo)"
    
    # Download binary
    sudo mkdir -p /opt/nrdot
    cd /opt/nrdot
    
    sudo curl -L -o collector.tar.gz \
        "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${COLLECTOR_VERSION}/${COLLECTOR_DISTRO}_${COLLECTOR_VERSION}_linux_${COLLECTOR_ARCH}.tar.gz"
    
    sudo tar -xzf collector.tar.gz
    sudo chmod +x nrdot-collector-host
    
    # Create config with license key
    sudo tee /opt/nrdot/nrdot.env > /dev/null << EOF
NEW_RELIC_LICENSE_KEY=${LICENSE_KEY}
OTEL_RESOURCE_ATTRIBUTES=service.name=systemd-nrdot,host.id=$(hostname)
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net
EOF
    
    # Create systemd service
    sudo tee /etc/systemd/system/nrdot-binary.service > /dev/null << 'EOF'
[Unit]
Description=NRDOT Collector Binary
After=network.target

[Service]
Type=simple
User=nobody
Group=nogroup
EnvironmentFile=/opt/nrdot/nrdot.env
ExecStart=/opt/nrdot/nrdot-collector-host --config /opt/nrdot/config.yaml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable nrdot-binary
    sudo systemctl start nrdot-binary
    
    if sudo systemctl is-active nrdot-binary >/dev/null; then
        log_info "✓ NRDOT systemd service running!"
        log_info "Status: sudo systemctl status nrdot-binary"
        log_info "Logs: sudo journalctl -u nrdot-binary -f"
    fi
}

# Method 4: Portable Script
method4_portable_script() {
    log_section "Method 4: Portable All-in-One Script"
    
    cat > ~/run-nrdot-portable.sh << 'SCRIPT'
#!/bin/bash
# Portable NRDOT runner - works anywhere!

# Auto-detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64) ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Configuration
NRDOT_DIR="${HOME}/.nrdot"
COLLECTOR_VERSION="${COLLECTOR_VERSION:-1.1.0}"
LICENSE_KEY="${NEW_RELIC_LICENSE_KEY:-$LICENSE_KEY}"

if [ -z "$LICENSE_KEY" ]; then
    echo "Error: Set NEW_RELIC_LICENSE_KEY environment variable"
    exit 1
fi

# Create directory
mkdir -p "$NRDOT_DIR"
cd "$NRDOT_DIR"

# Download if not exists
if [ ! -f "nrdot-collector-host" ]; then
    echo "Downloading NRDOT collector..."
    curl -L -o collector.tar.gz \
        "https://github.com/newrelic/nrdot-collector-releases/releases/download/v${COLLECTOR_VERSION}/nrdot-collector-host_${COLLECTOR_VERSION}_linux_${ARCH}.tar.gz"
    tar -xzf collector.tar.gz
    rm collector.tar.gz
fi

# Run with screen/tmux if available
if command -v tmux >/dev/null; then
    tmux new-session -d -s nrdot \
        "NEW_RELIC_LICENSE_KEY='${LICENSE_KEY}' OTEL_RESOURCE_ATTRIBUTES='service.name=portable,host.id=$(hostname)' ./nrdot-collector-host --config ./config.yaml"
    echo "NRDOT running in tmux session 'nrdot'"
    echo "Attach with: tmux attach -t nrdot"
elif command -v screen >/dev/null; then
    screen -dmS nrdot bash -c \
        "NEW_RELIC_LICENSE_KEY='${LICENSE_KEY}' OTEL_RESOURCE_ATTRIBUTES='service.name=portable,host.id=$(hostname)' ./nrdot-collector-host --config ./config.yaml"
    echo "NRDOT running in screen session 'nrdot'"
    echo "Attach with: screen -r nrdot"
else
    # Run in background with nohup
    nohup env NEW_RELIC_LICENSE_KEY="${LICENSE_KEY}" \
        OTEL_RESOURCE_ATTRIBUTES="service.name=portable,host.id=$(hostname)" \
        ./nrdot-collector-host --config ./config.yaml > nrdot.log 2>&1 &
    echo "NRDOT running in background (PID: $!)"
    echo "Logs: tail -f ${NRDOT_DIR}/nrdot.log"
fi
SCRIPT
    
    chmod +x ~/run-nrdot-portable.sh
    log_info "Created portable script: ~/run-nrdot-portable.sh"
    log_info "Run it anywhere with: ~/run-nrdot-portable.sh"
}

# Method 5: Cloud-Init Template
method5_cloud_init() {
    log_section "Method 5: Cloud-Init Template for VMs"
    
    cat > ~/nrdot-cloud-init.yaml << EOF
#cloud-config
write_files:
  - path: /tmp/install-nrdot.sh
    permissions: '0755'
    content: |
      #!/bin/bash
      export COLLECTOR_VERSION="${COLLECTOR_VERSION}"
      export LICENSE_KEY="${LICENSE_KEY}"
      
      # Detect architecture
      ARCH=\$(uname -m)
      case \$ARCH in
          x86_64) ARCH="amd64" ;;
          aarch64) ARCH="arm64" ;;
      esac
      
      # Download and install
      cd /opt
      curl -L -o collector.tar.gz \\
          "https://github.com/newrelic/nrdot-collector-releases/releases/download/v\${COLLECTOR_VERSION}/nrdot-collector-host_\${COLLECTOR_VERSION}_linux_\${ARCH}.tar.gz"
      tar -xzf collector.tar.gz
      
      # Create systemd service
      cat > /etc/systemd/system/nrdot.service << 'SERVICE'
      [Unit]
      Description=NRDOT Collector
      After=network.target
      
      [Service]
      Type=simple
      Environment="NEW_RELIC_LICENSE_KEY=\${LICENSE_KEY}"
      Environment="OTEL_RESOURCE_ATTRIBUTES=service.name=cloud-vm,host.id=\$(hostname)"
      ExecStart=/opt/nrdot-collector-host --config /opt/config.yaml
      Restart=always
      
      [Install]
      WantedBy=multi-user.target
      SERVICE
      
      systemctl daemon-reload
      systemctl enable nrdot
      systemctl start nrdot

runcmd:
  - /tmp/install-nrdot.sh
EOF
    
    log_info "Created cloud-init template: ~/nrdot-cloud-init.yaml"
    log_info "Use this when creating VMs in any cloud"
}

# Method 6: Test Container
method6_test_container() {
    log_section "Method 6: Quick Test Container"
    
    docker run -it --rm \
        -e NEW_RELIC_LICENSE_KEY="${LICENSE_KEY}" \
        -e OTEL_RESOURCE_ATTRIBUTES="service.name=quick-test,host.id=test-$(date +%s)" \
        --name nrdot-quick-test \
        ubuntu:22.04 bash -c "
            apt-get update && apt-get install -y curl ca-certificates
            curl -L -o collector.tar.gz \
                'https://github.com/newrelic/nrdot-collector-releases/releases/download/v${COLLECTOR_VERSION}/${COLLECTOR_DISTRO}_${COLLECTOR_VERSION}_linux_${COLLECTOR_ARCH}.tar.gz'
            tar -xzf collector.tar.gz
            ./nrdot-collector-host --config ./config.yaml
        "
}

# Main menu
main() {
    echo -e "${BLUE}NRDOT Collector Installation Methods${NC}"
    echo "License Key: ${LICENSE_KEY:0:10}..."
    echo ""
    echo "1) Direct Binary Run (simplest)"
    echo "2) Docker Container with Binary"
    echo "3) Systemd Service (requires sudo)"
    echo "4) Portable Script (run anywhere)"
    echo "5) Cloud-Init Template (for VMs)"
    echo "6) Quick Test Container"
    echo "7) Run ALL methods"
    echo ""
    read -p "Select method (1-7): " choice
    
    case $choice in
        1) method1_direct_run ;;
        2) method2_docker_binary ;;
        3) method3_systemd_service ;;
        4) method4_portable_script ;;
        5) method5_cloud_init ;;
        6) method6_test_container ;;
        7) 
            method1_direct_run
            method2_docker_binary
            method4_portable_script
            method5_cloud_init
            ;;
        *) log_error "Invalid choice" ;;
    esac
    
    log_section "Next Steps"
    echo "1. Check New Relic for data:"
    echo "   https://one.newrelic.com/nr1-core/infrastructure/hosts"
    echo ""
    echo "2. Look for hosts with these service names:"
    echo "   - test-direct"
    echo "   - test-docker"
    echo "   - systemd-nrdot"
    echo "   - portable"
    echo ""
    echo "3. Run NRQL query:"
    echo "   FROM SystemSample SELECT * WHERE instrumentation.provider = 'opentelemetry' SINCE 10 minutes ago"
}

# Run main function
main