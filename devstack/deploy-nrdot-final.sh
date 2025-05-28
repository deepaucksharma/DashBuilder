#!/bin/bash

# Final NRDOT Deployment Script
# Incorporates all learnings and best practices

set -e

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Load environment variables securely
load_environment() {
    # Check for .env file
    if [ ! -f "$SCRIPT_DIR/.env" ]; then
        echo "ERROR: .env file not found"
        echo "Please create .env from .env.template"
        exit 1
    fi
    
    # Source environment
    source "$SCRIPT_DIR/.env"
    
    # Validate required variables
    local required_vars=(
        "NEW_RELIC_LICENSE_KEY"
        "NEW_RELIC_ACCOUNT_ID"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            echo "ERROR: $var not set in .env"
            exit 1
        fi
    done
    
    # Validate API key format
    if [[ ! "$NEW_RELIC_LICENSE_KEY" =~ NRAL$ ]]; then
        echo "ERROR: License key must end with NRAL"
        exit 1
    fi
    
    echo "✓ Environment loaded and validated"
}

# Select collector profile
select_profile() {
    local profile_dir="$SCRIPT_DIR/collector-profiles"
    
    echo "=== Select Collector Profile ==="
    echo "1) NRDOT Host (Standard)"
    echo "2) NRDOT Plus (Enhanced)"
    echo "3) OpenTelemetry Contrib"
    echo "4) Custom Configuration"
    echo ""
    
    read -p "Select profile (1-4): " choice
    
    case $choice in
        1)
            source "$profile_dir/nrdot-host.env"
            echo "✓ Using NRDOT Host profile"
            ;;
        2)
            source "$profile_dir/nrdot-plus-complete.env"
            echo "✓ Using NRDOT Plus profile"
            ;;
        3)
            source "$profile_dir/otel-contrib.env"
            echo "✓ Using OpenTelemetry Contrib profile"
            ;;
        4)
            if [ -f "$SCRIPT_DIR/collector-config-advanced.env" ]; then
                source "$SCRIPT_DIR/collector-config-advanced.env"
                echo "✓ Using custom configuration"
            else
                echo "ERROR: collector-config-advanced.env not found"
                exit 1
            fi
            ;;
        *)
            echo "Invalid choice"
            exit 1
            ;;
    esac
}

# Generate secure configuration
generate_config() {
    local config_file="$1"
    
    echo "Generating secure configuration..."
    
    # Base configuration based on collector type
    case "$COLLECTOR_TYPE" in
        nrdot)
            cat > "$config_file" <<'EOF'
# NRDOT Configuration
extensions:
  health_check:
    endpoint: 0.0.0.0:13133

service:
  extensions: [health_check]
  telemetry:
    logs:
      level: ${LOG_LEVEL}
EOF
            ;;
            
        nrdot-plus)
            # Generate comprehensive NRDOT Plus config
            cat > "$config_file" <<'EOF'
# NRDOT Plus Configuration
extensions:
  health_check:
    endpoint: 0.0.0.0:13133
  
receivers:
  hostmetrics:
    collection_interval: 30s
    root_path: /hostfs
    scrapers:
      cpu:
      memory:
      disk:
      filesystem:
      network:
      load:
      processes:
      process:
        include:
          match_type: regexp
          names: [".*"]

processors:
  batch:
    timeout: 10s
    send_batch_size: 1000
  
  memory_limiter:
    check_interval: 1s
    limit_mib: ${MEMORY_LIMIT_MIB:-512}
  
  resource:
    attributes:
      - key: account.id
        value: "${NEW_RELIC_ACCOUNT_ID}"
        action: upsert

exporters:
  otlphttp:
    endpoint: ${OTLP_ENDPOINT:-https://otlp.nr-data.net}
    headers:
      api-key: ${NEW_RELIC_LICENSE_KEY}
    compression: gzip
    timeout: 30s
    retry:
      enabled: true
      initial_interval: 1s
      max_interval: 30s

service:
  extensions: [health_check]
  pipelines:
    metrics:
      receivers: [hostmetrics]
      processors: [memory_limiter, resource, batch]
      exporters: [otlphttp]
  telemetry:
    logs:
      level: ${LOG_LEVEL:-info}
EOF
            ;;
            
        otel|*)
            # Standard OpenTelemetry config
            cat > "$config_file" <<'EOF'
receivers:
  hostmetrics:
    collection_interval: 30s
    scrapers:
      cpu:
      memory:
      disk:
      filesystem:
      load:
      network:
      processes:
      process:
        include:
          match_type: regexp
          names: [".*"]
        metrics:
          process.cpu.utilization:
            enabled: true
          process.cpu.time:
            enabled: true
          process.memory.usage:
            enabled: true
          process.memory.virtual:
            enabled: true

processors:
  batch:
    timeout: 10s
  
  resource:
    attributes:
      - key: service.name
        value: openstack-vm
        action: upsert
      - key: environment
        value: production
        action: upsert
      - key: account.id
        value: "${NEW_RELIC_ACCOUNT_ID}"
        action: upsert

exporters:
  otlphttp:
    endpoint: https://otlp.nr-data.net:4318
    headers:
      api-key: ${NEW_RELIC_LICENSE_KEY}
    compression: gzip
    timeout: 30s

service:
  pipelines:
    metrics:
      receivers: [hostmetrics]
      processors: [resource, batch]
      exporters: [otlphttp]
  
  telemetry:
    logs:
      level: ${LOG_LEVEL:-info}
EOF
            ;;
    esac
    
    echo "✓ Configuration generated"
}

# Deploy collectors with security best practices
deploy_collectors() {
    local num_collectors="${NUM_COLLECTORS:-5}"
    
    echo "Deploying $num_collectors collectors..."
    
    # Stop existing collectors
    docker stop $(docker ps -q --filter "name=$COLLECTOR_NAME_PREFIX") 2>/dev/null || true
    docker rm $(docker ps -aq --filter "name=$COLLECTOR_NAME_PREFIX") 2>/dev/null || true
    
    # Generate config
    local config_file="/tmp/collector-config-$$-secure.yaml"
    generate_config "$config_file"
    
    # Deploy each collector
    for i in $(seq 1 $num_collectors); do
        local name="${COLLECTOR_NAME_PREFIX}-${i}"
        local hostname="${COLLECTOR_NAME_PREFIX}-${i}"
        
        echo "Starting $name..."
        
        # Build docker command with security options
        docker run -d \
            --name "$name" \
            --hostname "$hostname" \
            --user "${RUN_AS_USER:-10001}:${RUN_AS_GROUP:-10001}" \
            --cap-drop=ALL \
            --cap-add=SYS_PTRACE \
            --security-opt="no-new-privileges:true" \
            --read-only \
            --tmpfs /tmp \
            -e NEW_RELIC_LICENSE_KEY \
            -e NEW_RELIC_ACCOUNT_ID \
            -e LOG_LEVEL="${LOG_LEVEL:-info}" \
            -e MEMORY_LIMIT_MIB="${MEMORY_LIMIT_MIB:-512}" \
            -e OTLP_ENDPOINT="${OTLP_ENDPOINT:-https://otlp.nr-data.net}" \
            -e OTEL_RESOURCE_ATTRIBUTES="host.name=$hostname,host.id=$hostname,service.name=openstack-vm,environment=production" \
            -v "${config_file}:${CONFIG_PATH:-/config.yaml}:ro" \
            -v /proc:/host/proc:ro \
            -v /sys:/host/sys:ro \
            -v /:/hostfs:ro \
            -p "$((4316 + i)):4317" \
            -p "$((4317 + i)):4318" \
            --memory="${MEMORY_LIMIT:-1g}" \
            --cpus="${CPU_LIMIT:-1}" \
            --restart=unless-stopped \
            --log-opt max-size=10m \
            --log-opt max-file=3 \
            "$COLLECTOR_IMAGE" \
            --config="${CONFIG_PATH:-/config.yaml}"
        
        if [ $? -eq 0 ]; then
            echo "✓ Started $name"
        else
            echo "✗ Failed to start $name"
        fi
    done
    
    # Clean up config file
    rm -f "$config_file"
}

# Verify deployment
verify_deployment() {
    echo ""
    echo "=== Verifying Deployment ==="
    
    sleep 10
    
    local running=0
    local total="${NUM_COLLECTORS:-5}"
    
    for i in $(seq 1 $total); do
        local name="${COLLECTOR_NAME_PREFIX}-${i}"
        if docker ps | grep -q "$name"; then
            echo "✓ $name is running"
            ((running++))
        else
            echo "✗ $name is not running"
        fi
    done
    
    echo ""
    echo "Deployment Status: $running/$total collectors running"
    
    if [ $running -eq $total ]; then
        echo "✅ All collectors deployed successfully!"
    else
        echo "⚠️  Some collectors failed to start"
        echo "Check logs with: docker logs ${COLLECTOR_NAME_PREFIX}-1"
    fi
}

# Display next steps
show_next_steps() {
    echo ""
    echo "=== Next Steps ==="
    echo ""
    echo "1. Verify data in New Relic:"
    echo "   https://one.newrelic.com/data-explorer?accountId=$NEW_RELIC_ACCOUNT_ID"
    echo ""
    echo "2. Basic query:"
    echo "   FROM Metric SELECT count(*) WHERE service.name = 'openstack-vm' SINCE 10 minutes ago"
    echo ""
    echo "3. Check logs:"
    echo "   docker logs ${COLLECTOR_NAME_PREFIX}-1"
    echo ""
    echo "4. Monitor health:"
    echo "   curl http://localhost:$((4317 + 1))/health"
    echo ""
    echo "Account: $NEW_RELIC_ACCOUNT_ID"
    echo "Region: US (https://otlp.nr-data.net)"
}

# Main execution
main() {
    echo "=== NRDOT Secure Deployment ==="
    echo ""
    
    # Load and validate environment
    load_environment
    
    # Select collector profile
    select_profile
    
    # Deploy collectors
    deploy_collectors
    
    # Verify deployment
    verify_deployment
    
    # Show next steps
    show_next_steps
}

# Run main function
main "$@"