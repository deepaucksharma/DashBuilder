#!/bin/bash

# Advanced Collector Deployment Script
# Supports NRDOT, NRDOT PLUS, and custom OpenTelemetry distributions

set -e

# Load configurations
source /Users/deepaksharma/devstack/.env
source /Users/deepaksharma/devstack/collector-config-advanced.env

echo "=== Advanced Collector Deployment ==="
echo "Collector Type: $COLLECTOR_TYPE"
echo "Collector Variant: $COLLECTOR_VARIANT"
echo "Image: $COLLECTOR_IMAGE"
echo "Cloud Provider: ${CLOUD_PROVIDER:-none}"
echo ""

# Function to validate configuration
validate_config() {
    local errors=0
    
    # Check required variables
    if [ -z "$COLLECTOR_IMAGE" ]; then
        echo "ERROR: COLLECTOR_IMAGE not set"
        ((errors++))
    fi
    
    if [ -z "$NEW_RELIC_LICENSE_KEY" ]; then
        echo "ERROR: NEW_RELIC_LICENSE_KEY not set"
        ((errors++))
    fi
    
    # Validate collector type
    case "$COLLECTOR_TYPE" in
        nrdot|nrdot-plus|otel|custom)
            ;;
        *)
            echo "ERROR: Invalid COLLECTOR_TYPE: $COLLECTOR_TYPE"
            ((errors++))
            ;;
    esac
    
    return $errors
}

# Function to generate base configuration
generate_base_config() {
    local config_file="$1"
    
    case "$COLLECTOR_TYPE" in
        nrdot)
            generate_nrdot_config "$config_file"
            ;;
        nrdot-plus)
            generate_nrdot_plus_config "$config_file"
            ;;
        otel|custom)
            generate_otel_config "$config_file"
            ;;
    esac
}

# Generate NRDOT configuration
generate_nrdot_config() {
    local config_file="$1"
    
    cat > "$config_file" <<EOF
# NRDOT Configuration
# Minimal config - NRDOT has built-in defaults

extensions:
  health_check:
    endpoint: 0.0.0.0:${BASE_HEALTH_PORT}

service:
  extensions: [health_check]
  telemetry:
    logs:
      level: ${LOG_LEVEL}
EOF
}

# Generate NRDOT PLUS configuration
generate_nrdot_plus_config() {
    local config_file="$1"
    
    cat > "$config_file" <<EOF
# NRDOT PLUS Configuration

extensions:
  health_check:
    endpoint: 0.0.0.0:${BASE_HEALTH_PORT}
EOF

    # Add profiling if enabled
    if [ "$ENABLE_PROFILING" = "true" ]; then
        cat >> "$config_file" <<EOF
  pprof:
    endpoint: 0.0.0.0:${PROFILING_PORT}
EOF
    fi

    # Add z-pages if enabled
    if [ "$ENABLE_ZPAGES" = "true" ]; then
        cat >> "$config_file" <<EOF
  zpages:
    endpoint: 0.0.0.0:${ZPAGES_PORT}
EOF
    fi

    cat >> "$config_file" <<EOF

receivers:
  hostmetrics:
    collection_interval: ${HOSTMETRICS_COLLECTION_INTERVAL}
    scrapers: [${HOSTMETRICS_SCRAPERS}]
EOF

    # Add additional receivers
    if [ "$ENABLE_PROMETHEUS_RECEIVER" = "true" ]; then
        cat >> "$config_file" <<EOF
  prometheus:
    config:
      scrape_configs:
        - job_name: 'prometheus'
          scrape_interval: 30s
          static_configs:
            - targets: ['localhost:${PROMETHEUS_RECEIVER_PORT}']
EOF
    fi

    cat >> "$config_file" <<EOF

processors:
  batch:
    timeout: ${BATCH_TIMEOUT}
    send_batch_size: ${BATCH_SIZE}
  
  memory_limiter:
    check_interval: 1s
    limit_mib: ${MEMORY_LIMIT_MIB}
    spike_limit_mib: ${MEMORY_SPIKE_LIMIT_MIB}

exporters:
  otlphttp:
    endpoint: ${OTLP_ENDPOINT}
    headers:
      ${OTLP_HEADERS//,/\\n      }
    compression: gzip
    timeout: 30s

service:
  extensions: [health_check$([ "$ENABLE_PROFILING" = "true" ] && echo ", pprof")$([ "$ENABLE_ZPAGES" = "true" ] && echo ", zpages")]
  pipelines:
    metrics:
      receivers: [hostmetrics$([ "$ENABLE_PROMETHEUS_RECEIVER" = "true" ] && echo ", prometheus")]
      processors: [memory_limiter, batch]
      exporters: [otlphttp]
  telemetry:
    logs:
      level: ${LOG_LEVEL}
EOF
}

# Generate OpenTelemetry configuration
generate_otel_config() {
    local config_file="$1"
    
    # This is the full OTEL config we've been using
    cat > "$config_file" <<EOF
receivers:
  hostmetrics:
    collection_interval: ${HOSTMETRICS_COLLECTION_INTERVAL}
    root_path: ${HOSTMETRICS_ROOT_PATH}
    scrapers:
EOF
    
    # Add scrapers
    IFS=',' read -ra SCRAPERS <<< "$HOSTMETRICS_SCRAPERS"
    for scraper in "${SCRAPERS[@]}"; do
        echo "      ${scraper}:" >> "$config_file"
        
        # Add process-specific config
        if [ "$scraper" = "process" ]; then
            cat >> "$config_file" <<EOF
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
EOF
        fi
    done

    # Add additional receivers if enabled
    if [ "$ENABLE_FILELOG_RECEIVER" = "true" ]; then
        cat >> "$config_file" <<EOF

  filelog:
    include: [${FILELOG_PATHS}]
    start_at: beginning
EOF
    fi

    cat >> "$config_file" <<EOF

processors:
  batch:
    timeout: ${BATCH_TIMEOUT}
    send_batch_size: ${BATCH_SIZE}
  
  memory_limiter:
    check_interval: 1s
    limit_mib: ${MEMORY_LIMIT_MIB}
    spike_limit_mib: ${MEMORY_SPIKE_LIMIT_MIB}
  
  resource:
    attributes:
      - key: service.name
        value: openstack-vm
        action: upsert
      - key: environment
        value: production
        action: upsert
EOF

    # Add cloud provider attributes
    if [ -n "$CLOUD_PROVIDER" ]; then
        cat >> "$config_file" <<EOF
      - key: cloud.provider
        value: ${CLOUD_PROVIDER}
        action: upsert
EOF
    fi

    cat >> "$config_file" <<EOF

exporters:
  otlphttp:
    endpoint: ${OTLP_ENDPOINT}
    headers:
EOF
    
    # Parse headers
    IFS=',' read -ra HEADERS <<< "$OTLP_HEADERS"
    for header in "${HEADERS[@]}"; do
        echo "      ${header}" >> "$config_file"
    done
    
    cat >> "$config_file" <<EOF
    compression: gzip
    timeout: 30s

extensions:
  health_check:
    endpoint: 0.0.0.0:${BASE_HEALTH_PORT}

service:
  extensions: [health_check]
  pipelines:
    metrics:
      receivers: [hostmetrics]
      processors: [memory_limiter, resource, batch]
      exporters: [otlphttp]
EOF

    # Add logs pipeline if filelog is enabled
    if [ "$ENABLE_FILELOG_RECEIVER" = "true" ]; then
        cat >> "$config_file" <<EOF
    logs:
      receivers: [filelog]
      processors: [memory_limiter, resource, batch]
      exporters: [otlphttp]
EOF
    fi

    cat >> "$config_file" <<EOF
  telemetry:
    logs:
      level: ${LOG_LEVEL}
    metrics:
      level: detailed
      address: 0.0.0.0:8888
EOF
}

# Function to build Docker command
build_docker_command() {
    local index=$1
    local name="${COLLECTOR_NAME_PREFIX}-${index}"
    local hostname="${COLLECTOR_NAME_PREFIX}-${index}"
    
    # Start building command
    local cmd="docker run -d"
    
    # Add name and hostname
    cmd="$cmd --name $name --hostname $hostname"
    
    # Add resource limits if specified
    if [ -n "$CPU_LIMIT" ]; then
        cmd="$cmd --cpus=$CPU_LIMIT"
    fi
    if [ -n "$MEMORY_LIMIT" ]; then
        cmd="$cmd --memory=$MEMORY_LIMIT"
    fi
    
    # Add capabilities if specified
    if [ -n "$CAPABILITIES" ]; then
        IFS=',' read -ra CAPS <<< "$CAPABILITIES"
        for cap in "${CAPS[@]}"; do
            cmd="$cmd --cap-add=$cap"
        done
    fi
    
    # Add security options
    if [ -n "$SECURITY_OPT" ]; then
        cmd="$cmd --security-opt $SECURITY_OPT"
    fi
    
    # Add user if specified
    if [ -n "$RUN_AS_USER" ]; then
        cmd="$cmd --user $RUN_AS_USER"
        if [ -n "$RUN_AS_GROUP" ]; then
            cmd="$cmd:$RUN_AS_GROUP"
        fi
    fi
    
    # Add network mode
    if [ "$NETWORK_MODE" != "bridge" ]; then
        cmd="$cmd --network $NETWORK_MODE"
    fi
    
    # Add PID mode
    if [ "$PID_MODE" = "host" ]; then
        cmd="$cmd --pid host"
    fi
    
    # Add environment variables
    cmd="$cmd -e NEW_RELIC_LICENSE_KEY=\"$NEW_RELIC_LICENSE_KEY\""
    cmd="$cmd -e NEW_RELIC_ACCOUNT_ID=\"$NEW_RELIC_ACCOUNT_ID\""
    
    # Add resource attributes
    local resource_attrs=$(echo "$RESOURCE_ATTRIBUTES_TEMPLATE" | sed "s/{{INDEX}}/$index/g" | sed "s/{{HOSTNAME}}/$hostname/g")
    if [ -n "$ADDITIONAL_RESOURCE_ATTRS" ]; then
        resource_attrs="$resource_attrs,$ADDITIONAL_RESOURCE_ATTRS"
    fi
    cmd="$cmd -e OTEL_RESOURCE_ATTRIBUTES=\"$resource_attrs\""
    
    # Add NRDOT specific env vars
    if [[ "$COLLECTOR_TYPE" == "nrdot"* ]]; then
        cmd="$cmd -e OTEL_EXPORTER_OTLP_ENDPOINT=\"$OTLP_ENDPOINT\""
        cmd="$cmd -e OTEL_EXPORTER_OTLP_HEADERS=\"$OTLP_HEADERS\""
        
        # Add NRDOT PLUS specific vars
        if [ "$COLLECTOR_TYPE" = "nrdot-plus" ]; then
            if [ -n "$NRDOT_PLUS_FEATURES" ]; then
                cmd="$cmd -e NRDOT_PLUS_FEATURES=\"$NRDOT_PLUS_FEATURES\""
            fi
            if [ -n "$NRDOT_PLUS_TENANT_ID" ]; then
                cmd="$cmd -e NRDOT_PLUS_TENANT_ID=\"$NRDOT_PLUS_TENANT_ID\""
            fi
            if [ -n "$NRDOT_PLUS_CLUSTER_NAME" ]; then
                cmd="$cmd -e NRDOT_PLUS_CLUSTER_NAME=\"$NRDOT_PLUS_CLUSTER_NAME\""
            fi
        fi
    fi
    
    # Add cloud provider env vars
    if [ -n "$CLOUD_PROVIDER" ]; then
        cmd="$cmd -e CLOUD_PROVIDER=\"$CLOUD_PROVIDER\""
        if [ -n "$CLOUD_REGION" ]; then
            cmd="$cmd -e CLOUD_REGION=\"$CLOUD_REGION\""
        fi
    fi
    
    # Add log level
    cmd="$cmd -e OTEL_LOG_LEVEL=\"$LOG_LEVEL\""
    
    # Add additional env vars
    if [ -n "$ADDITIONAL_ENV_VARS" ]; then
        IFS=',' read -ra ENVS <<< "$ADDITIONAL_ENV_VARS"
        for env in "${ENVS[@]}"; do
            cmd="$cmd -e \"$env\""
        done
    fi
    
    # Add volume mounts
    cmd="$cmd -v /tmp/collector-config-${index}.yaml:$CONFIG_PATH:ro"
    
    if [ "$MOUNT_HOST_FS" = "true" ]; then
        cmd="$cmd -v /:/hostfs:ro"
    fi
    
    if [ "$MOUNT_PROC" = "true" ]; then
        cmd="$cmd -v /proc:/host/proc:ro"
    fi
    
    if [ "$MOUNT_SYS" = "true" ]; then
        cmd="$cmd -v /sys:/host/sys:ro"
    fi
    
    # Add certificate volumes
    if [ -n "$CERT_VOLUMES" ]; then
        IFS=',' read -ra VOLS <<< "$CERT_VOLUMES"
        for vol in "${VOLS[@]}"; do
            cmd="$cmd -v $vol"
        done
    fi
    
    # Add plugin volumes
    if [ -n "$PLUGIN_VOLUMES" ]; then
        IFS=',' read -ra VOLS <<< "$PLUGIN_VOLUMES"
        for vol in "${VOLS[@]}"; do
            cmd="$cmd -v $vol"
        done
    fi
    
    # Add additional volumes
    if [ -n "$ADDITIONAL_VOLUMES" ]; then
        IFS=',' read -ra VOLS <<< "$ADDITIONAL_VOLUMES"
        for vol in "${VOLS[@]}"; do
            cmd="$cmd -v $vol"
        done
    fi
    
    # Add port mappings
    local grpc_port=$((BASE_GRPC_PORT + index - 1))
    local http_port=$((BASE_HTTP_PORT + index - 1))
    local health_port=$((BASE_HEALTH_PORT + index - 1))
    
    if [ "$NETWORK_MODE" != "host" ]; then
        cmd="$cmd -p ${grpc_port}:4317"
        cmd="$cmd -p ${http_port}:4318"
        cmd="$cmd -p ${health_port}:${BASE_HEALTH_PORT}"
        
        # Add additional ports
        if [ -n "$ADDITIONAL_PORTS" ]; then
            IFS=',' read -ra PORTS <<< "$ADDITIONAL_PORTS"
            for port in "${PORTS[@]}"; do
                cmd="$cmd -p $port"
            done
        fi
    fi
    
    # Add Docker labels
    if [ -n "$DOCKER_LABELS" ]; then
        IFS=',' read -ra LABELS <<< "$DOCKER_LABELS"
        for label in "${LABELS[@]}"; do
            cmd="$cmd --label $label"
        done
    fi
    
    # Add runtime if specified
    if [ -n "$DOCKER_RUNTIME" ]; then
        cmd="$cmd --runtime=$DOCKER_RUNTIME"
    fi
    
    # Add additional Docker options
    if [ -n "$DOCKER_RUN_OPTS" ]; then
        cmd="$cmd $DOCKER_RUN_OPTS"
    fi
    
    # Add image
    cmd="$cmd $COLLECTOR_IMAGE"
    
    # Add collector arguments
    if [[ "$COLLECTOR_TYPE" == "nrdot"* ]]; then
        cmd="$cmd --config $CONFIG_PATH"
    else
        cmd="$cmd --config=$CONFIG_PATH"
    fi
    
    # Add additional config files
    if [ -n "$ADDITIONAL_CONFIGS" ]; then
        IFS=',' read -ra CONFIGS <<< "$ADDITIONAL_CONFIGS"
        for config in "${CONFIGS[@]}"; do
            cmd="$cmd --config=$config"
        done
    fi
    
    # Add feature gates
    if [ -n "$FEATURE_GATES" ]; then
        cmd="$cmd --feature-gates=$FEATURE_GATES"
    fi
    
    # Add plugin directory
    if [ -n "$PLUGIN_DIR" ]; then
        cmd="$cmd --plugin-dir=$PLUGIN_DIR"
    fi
    
    # Add collector-specific arguments
    if [ -n "$COLLECTOR_ARGS" ]; then
        cmd="$cmd $COLLECTOR_ARGS"
    fi
    
    echo "$cmd"
}

# Main execution
echo "Validating configuration..."
if ! validate_config; then
    echo "Configuration validation failed!"
    exit 1
fi

echo "✓ Configuration validated"
echo ""

# Stop existing collectors
echo "Stopping existing collectors..."
docker stop $(docker ps -q --filter "name=$COLLECTOR_NAME_PREFIX") 2>/dev/null || true
docker rm $(docker ps -aq --filter "name=$COLLECTOR_NAME_PREFIX") 2>/dev/null || true
echo "✓ Cleaned up existing collectors"
echo ""

# Run pre-start script if specified
if [ -n "$PRE_START_SCRIPT" ] && [ -f "$PRE_START_SCRIPT" ]; then
    echo "Running pre-start script..."
    bash "$PRE_START_SCRIPT"
fi

# Deploy collectors
echo "Deploying $NUM_COLLECTORS collectors..."
echo ""

for i in $(seq 1 $NUM_COLLECTORS); do
    echo "Configuring ${COLLECTOR_NAME_PREFIX}-${i}..."
    
    # Generate config for this instance
    generate_base_config "/tmp/collector-config-${i}.yaml"
    
    # Build and execute Docker command
    cmd=$(build_docker_command $i)
    
    echo "Starting ${COLLECTOR_NAME_PREFIX}-${i}..."
    if eval $cmd; then
        echo "✓ Started ${COLLECTOR_NAME_PREFIX}-${i}"
    else
        echo "✗ Failed to start ${COLLECTOR_NAME_PREFIX}-${i}"
    fi
    echo ""
done

# Run post-start script if specified
if [ -n "$POST_START_SCRIPT" ] && [ -f "$POST_START_SCRIPT" ]; then
    echo "Running post-start script..."
    bash "$POST_START_SCRIPT"
fi

# Wait and verify
echo "Waiting for collectors to initialize..."
sleep 10

echo ""
echo "=== Deployment Verification ==="
success_count=0
for i in $(seq 1 $NUM_COLLECTORS); do
    name="${COLLECTOR_NAME_PREFIX}-${i}"
    if docker ps | grep -q "$name"; then
        echo "✓ $name is running"
        ((success_count++))
    else
        echo "✗ $name is not running"
        # Show error logs
        if docker logs $name 2>&1 | grep -q "error"; then
            echo "  Recent errors:"
            docker logs $name 2>&1 | grep -i error | tail -3 | sed 's/^/    /'
        fi
    fi
done

echo ""
echo "=== Deployment Summary ==="
echo "Successfully deployed: $success_count/$NUM_COLLECTORS collectors"
echo "Collector Type: $COLLECTOR_TYPE"
echo "Collector Variant: $COLLECTOR_VARIANT"
echo "Image: $COLLECTOR_IMAGE"
if [ -n "$CLOUD_PROVIDER" ]; then
    echo "Cloud Provider: $CLOUD_PROVIDER"
fi
echo ""

# Show relevant queries based on configuration
echo "=== New Relic Queries ==="
echo "1. All metrics:"
echo "   FROM Metric SELECT count(*) WHERE service.name = 'openstack-vm' SINCE 10 minutes ago"
echo ""

if [[ "$HOSTMETRICS_SCRAPERS" == *"process"* ]]; then
    echo "2. Process metrics:"
    echo "   FROM Metric SELECT uniques(process.name) WHERE service.name = 'openstack-vm' SINCE 10 minutes ago"
    echo ""
fi

if [ -n "$CLOUD_PROVIDER" ]; then
    echo "3. Cloud provider metrics:"
    echo "   FROM Metric SELECT count(*) WHERE cloud.provider = '$CLOUD_PROVIDER' SINCE 10 minutes ago"
    echo ""
fi

echo "Account: $NEW_RELIC_ACCOUNT_ID"
echo "Direct link: https://one.newrelic.com/data-explorer?accountId=$NEW_RELIC_ACCOUNT_ID"