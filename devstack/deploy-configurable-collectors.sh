#!/bin/bash

# Configurable collector deployment script
# Works with NRDOT or any OpenTelemetry distribution

set -e

# Load environment variables
source /Users/deepaksharma/devstack/.env
source /Users/deepaksharma/devstack/collector-config.env

echo "=== Configurable Collector Deployment ==="
echo "Collector Image: $COLLECTOR_IMAGE"
echo "Collector Type: $COLLECTOR_TYPE"
echo "Number of Collectors: $NUM_COLLECTORS"
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"
echo ""

# Function to stop existing collectors
stop_collectors() {
    echo "Stopping existing collectors..."
    docker stop $(docker ps -q --filter "name=$COLLECTOR_NAME_PREFIX") 2>/dev/null || true
    docker rm $(docker ps -aq --filter "name=$COLLECTOR_NAME_PREFIX") 2>/dev/null || true
    echo "✓ Cleaned up existing collectors"
}

# Function to generate config based on collector type
generate_config() {
    local config_file="$1"
    
    if [ "$COLLECTOR_TYPE" = "nrdot" ]; then
        # NRDOT specific config
        cat > "$config_file" <<EOF
# NRDOT Configuration
# This is a minimal config - NRDOT has built-in defaults
extensions:
  health_check:

service:
  extensions: [health_check]
EOF
    else
        # Standard OpenTelemetry config
        cat > "$config_file" <<EOF
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
          names:
            - ".*"
        metrics:
          process.cpu.utilization:
            enabled: true
          process.cpu.time:
            enabled: true
          process.memory.usage:
            enabled: true
          process.memory.virtual:
            enabled: true
          process.disk.io:
            enabled: true

processors:
  resource:
    attributes:
      - key: service.name
        value: openstack-vm
        action: upsert
      - key: environment  
        value: production
        action: upsert
      - key: account.id
        value: "$NEW_RELIC_ACCOUNT_ID"
        action: upsert
  
  filter/processes:
    metrics:
      datapoint:
        - 'metric.name == "process.cpu.utilization" and value_double < 0.001'
  
  batch:
    timeout: 10s
    send_batch_size: 1000

exporters:
  otlphttp:
    endpoint: https://otlp.nr-data.net:4318
    headers:
      api-key: \${NEW_RELIC_LICENSE_KEY}
    compression: gzip
    timeout: 30s

service:
  pipelines:
    metrics:
      receivers: [hostmetrics]
      processors: [resource, filter/processes, batch]
      exporters: [otlphttp]
  
  telemetry:
    logs:
      level: info
EOF
    fi
}

# Function to build docker run command
build_docker_command() {
    local index=$1
    local name="${COLLECTOR_NAME_PREFIX}-${index}"
    local hostname="openstack-vm-${index}"
    
    # Replace template variables
    local resource_attrs=$(echo "$RESOURCE_ATTRIBUTES_TEMPLATE" | sed "s/{{INDEX}}/$index/g" | sed "s/{{HOSTNAME}}/$hostname/g")
    
    # Build port mappings
    local grpc_port=$((BASE_GRPC_PORT + index - 1))
    local http_port=$((BASE_HTTP_PORT + index - 1))
    local health_port=$((BASE_HEALTH_PORT + index - 1))
    
    # Start building command
    local cmd="docker run -d --name $name --hostname $hostname"
    
    # Add environment variables
    cmd="$cmd -e NEW_RELIC_LICENSE_KEY=\"$NEW_RELIC_LICENSE_KEY\""
    cmd="$cmd -e NEW_RELIC_ACCOUNT_ID=\"$NEW_RELIC_ACCOUNT_ID\""
    cmd="$cmd -e OTEL_RESOURCE_ATTRIBUTES=\"$resource_attrs\""
    
    # Add NRDOT specific env vars
    if [ "$COLLECTOR_TYPE" = "nrdot" ]; then
        cmd="$cmd -e OTEL_EXPORTER_OTLP_ENDPOINT=\"https://otlp.nr-data.net\""
        cmd="$cmd -e OTEL_EXPORTER_OTLP_HEADERS=\"api-key=$NEW_RELIC_LICENSE_KEY\""
    fi
    
    # Add additional env vars
    if [ -n "$ADDITIONAL_ENV_VARS" ]; then
        IFS=',' read -ra ENVS <<< "$ADDITIONAL_ENV_VARS"
        for env in "${ENVS[@]}"; do
            cmd="$cmd -e $env"
        done
    fi
    
    # Add volume mounts
    cmd="$cmd -v /tmp/collector-config.yaml:$CONFIG_PATH:ro"
    
    if [ "$MOUNT_HOST_FS" = "true" ]; then
        cmd="$cmd -v /:/hostfs:ro"
    fi
    
    if [ "$MOUNT_PROC" = "true" ]; then
        cmd="$cmd -v /proc:/host/proc:ro"
    fi
    
    if [ "$MOUNT_SYS" = "true" ]; then
        cmd="$cmd -v /sys:/host/sys:ro"
    fi
    
    # Add additional volumes
    if [ -n "$ADDITIONAL_VOLUMES" ]; then
        IFS=',' read -ra VOLS <<< "$ADDITIONAL_VOLUMES"
        for vol in "${VOLS[@]}"; do
            cmd="$cmd -v $vol"
        done
    fi
    
    # Add port mappings
    cmd="$cmd -p ${grpc_port}:4317"
    cmd="$cmd -p ${http_port}:4318"
    
    if [ "$COLLECTOR_TYPE" != "nrdot" ]; then
        cmd="$cmd -p ${health_port}:13133"
    fi
    
    # Add network and PID mode
    if [ "$NETWORK_MODE" = "host" ]; then
        cmd="$cmd --network host"
    fi
    
    if [ "$PID_MODE" = "host" ]; then
        cmd="$cmd --pid host"
    fi
    
    # Add any additional docker options
    if [ -n "$DOCKER_RUN_OPTS" ]; then
        cmd="$cmd $DOCKER_RUN_OPTS"
    fi
    
    # Add image
    cmd="$cmd $COLLECTOR_IMAGE"
    
    # Add collector arguments
    if [ "$COLLECTOR_TYPE" = "nrdot" ]; then
        cmd="$cmd --config $CONFIG_PATH"
        if [ -n "$COLLECTOR_ARGS" ]; then
            cmd="$cmd $COLLECTOR_ARGS"
        fi
    else
        cmd="$cmd --config=$CONFIG_PATH"
    fi
    
    echo "$cmd"
}

# Main deployment
stop_collectors

echo ""
echo "Generating configuration..."
generate_config "/tmp/collector-config.yaml"

echo "Deploying $NUM_COLLECTORS collectors..."
echo ""

for i in $(seq 1 $NUM_COLLECTORS); do
    echo "Deploying ${COLLECTOR_NAME_PREFIX}-${i}..."
    
    cmd=$(build_docker_command $i)
    
    # Execute the command
    if eval $cmd; then
        echo "✓ Started ${COLLECTOR_NAME_PREFIX}-${i}"
    else
        echo "✗ Failed to start ${COLLECTOR_NAME_PREFIX}-${i}"
    fi
done

echo ""
echo "=== Deployment Summary ==="
echo "Collector Type: $COLLECTOR_TYPE"
echo "Image: $COLLECTOR_IMAGE"
echo "Config Path: $CONFIG_PATH"
echo ""

# Wait and verify
sleep 10

echo "=== Verification ==="
for i in $(seq 1 $NUM_COLLECTORS); do
    name="${COLLECTOR_NAME_PREFIX}-${i}"
    if docker ps | grep -q "$name"; then
        echo "✓ $name is running"
    else
        echo "✗ $name is not running"
        # Show error logs
        echo "  Error logs:"
        docker logs $name 2>&1 | tail -5 | sed 's/^/    /'
    fi
done

echo ""
echo "=== Configuration Details ==="
echo "To use a different collector distribution:"
echo "1. Edit collector-config.env"
echo "2. Set COLLECTOR_IMAGE to your desired image"
echo "3. Set COLLECTOR_TYPE to 'nrdot' or 'otel'"
echo "4. Adjust other settings as needed"
echo "5. Run this script again"
echo ""
echo "Examples:"
echo "- NRDOT Host: COLLECTOR_IMAGE=newrelic/nrdot-collector-host:latest"
echo "- NRDOT K8s: COLLECTOR_IMAGE=newrelic/nrdot-collector-k8s:latest"
echo "- Custom: COLLECTOR_IMAGE=your-registry/your-collector:tag"