#!/bin/bash
# Script to apply Docker best practices to existing NRDOT setup

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Applying Docker Best Practices to NRDOT v2...${NC}"

# Create backup of existing files
echo -e "${YELLOW}Creating backups...${NC}"
mkdir -p backups/original
[ -f Dockerfile ] && cp Dockerfile backups/original/
[ -f docker-compose.yml ] && cp docker-compose.yml backups/original/
[ -f docker-entrypoint.sh ] && cp docker-entrypoint.sh backups/original/

# Update existing Dockerfile with best practices
echo -e "${BLUE}Updating Dockerfile with best practices...${NC}"
cat > Dockerfile.best-practices << 'EOF'
# Best Practices NRDOT + DashBuilder Dockerfile
# Multi-stage build for optimized layers and security

# Stage 1: Base dependencies
FROM node:20-alpine AS base
RUN apk add --no-cache \
    ca-certificates \
    curl \
    bash \
    && rm -rf /var/cache/apk/*

# Stage 2: Builder for Node.js dependencies
FROM base AS node-builder
WORKDIR /build
# Copy package files first for better caching
COPY package*.json ./
COPY scripts/package*.json ./scripts/
COPY orchestrator/package*.json ./orchestrator/
COPY nrdot-nr1-app/package*.json ./nrdot-nr1-app/
COPY automation/package*.json ./automation/

# Install dependencies with clean install
RUN npm ci --only=production && \
    cd scripts && npm ci --only=production && \
    cd ../orchestrator && npm ci --only=production && \
    cd ../nrdot-nr1-app && npm ci --only=production && \
    cd ../automation && npm ci --only=production

# Stage 3: OpenTelemetry Collector binary
FROM alpine:3.19 AS otel-builder
ARG OTEL_VERSION=0.96.0
RUN apk add --no-cache curl && \
    curl -L https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTEL_VERSION}/otelcol-contrib_${OTEL_VERSION}_linux_amd64.tar.gz | \
    tar -xz -C /tmp && \
    chmod +x /tmp/otelcol-contrib && \
    mv /tmp/otelcol-contrib /usr/local/bin/

# Stage 4: Production image
FROM alpine:3.19
LABEL maintainer="DashBuilder Team"
LABEL description="NRDOT v2 with DashBuilder - Production Ready"

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    curl \
    bash \
    nodejs \
    npm \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 nrdot && \
    adduser -D -u 1001 -G nrdot nrdot

# Set up directory structure
RUN mkdir -p \
    /app \
    /etc/otel \
    /etc/otel/profiles \
    /var/lib/nrdot \
    /var/log/nrdot \
    /tmp/nrdot \
    && chown -R nrdot:nrdot /app /etc/otel /var/lib/nrdot /var/log/nrdot /tmp/nrdot

# Copy OTEL collector binary
COPY --from=otel-builder /usr/local/bin/otelcol-contrib /usr/local/bin/otelcol-contrib

# Copy application files
WORKDIR /app
COPY --chown=nrdot:nrdot . .

# Copy node modules from builder
COPY --from=node-builder --chown=nrdot:nrdot /build/node_modules ./node_modules
COPY --from=node-builder --chown=nrdot:nrdot /build/scripts/node_modules ./scripts/node_modules
COPY --from=node-builder --chown=nrdot:nrdot /build/orchestrator/node_modules ./orchestrator/node_modules
COPY --from=node-builder --chown=nrdot:nrdot /build/nrdot-nr1-app/node_modules ./nrdot-nr1-app/node_modules
COPY --from=node-builder --chown=nrdot:nrdot /build/automation/node_modules ./automation/node_modules

# Copy configuration files
COPY --chown=nrdot:nrdot configs/collector-profiles/*.yaml /etc/otel/profiles/
COPY --chown=nrdot:nrdot docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Switch to non-root user
USER nrdot

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:13133/health || exit 1

# Expose ports
EXPOSE 4317 4318 8888 8889 13133 8090

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]

# Default command
CMD ["collector"]
EOF

# Update docker-entrypoint.sh with best practices
echo -e "${BLUE}Updating entrypoint script...${NC}"
cat > docker-entrypoint.sh << 'EOF'
#!/bin/bash
set -euo pipefail

# Signal handlers for graceful shutdown
trap 'echo "Received SIGTERM, shutting down gracefully..."; shutdown' SIGTERM
trap 'echo "Received SIGINT, shutting down gracefully..."; shutdown' SIGINT

shutdown() {
    if [ -n "${CHILD_PID:-}" ]; then
        kill -TERM "$CHILD_PID" 2>/dev/null || true
        wait "$CHILD_PID" 2>/dev/null || true
    fi
    exit 0
}

# Validate environment
if [ -z "${NEW_RELIC_LICENSE_KEY:-}" ]; then
    echo "ERROR: NEW_RELIC_LICENSE_KEY is required"
    exit 1
fi

if [ -z "${NEW_RELIC_API_KEY:-}" ]; then
    echo "ERROR: NEW_RELIC_API_KEY is required"
    exit 1
fi

# Set defaults
export NODE_ENV="${NODE_ENV:-production}"
export OPTIMIZATION_MODE="${OPTIMIZATION_MODE:-balanced}"
export CONTROL_LOOP_INTERVAL="${CONTROL_LOOP_INTERVAL:-300}"
export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-https://otlp.nr-data.net}"
export OTEL_EXPORTER_OTLP_HEADERS="${OTEL_EXPORTER_OTLP_HEADERS:-api-key=${NEW_RELIC_LICENSE_KEY}}"

# Handle different service types
case "${1:-collector}" in
    "collector")
        echo "Starting NRDOT Collector in ${OPTIMIZATION_MODE} mode..."
        exec /usr/local/bin/otelcol-contrib \
            --config="/etc/otel/profiles/${OPTIMIZATION_MODE}.yaml" &
        CHILD_PID=$!
        wait $CHILD_PID
        ;;
    "control-loop")
        echo "Starting Control Loop..."
        cd /app
        exec node scripts/control-loop.js docker "${OPTIMIZATION_MODE}" "${CONTROL_LOOP_INTERVAL}" &
        CHILD_PID=$!
        wait $CHILD_PID
        ;;
    "monitor")
        echo "Starting DashBuilder Monitor..."
        cd /app
        exec node orchestrator/monitor.js &
        CHILD_PID=$!
        wait $CHILD_PID
        ;;
    *)
        exec "$@"
        ;;
esac
EOF

chmod +x docker-entrypoint.sh

# Create docker-compose.best-practices.yml
echo -e "${BLUE}Creating production docker-compose configuration...${NC}"
cat > docker-compose.best-practices.yml << 'EOF'
version: '3.9'

x-common-variables: &common-variables
  NODE_ENV: ${NODE_ENV:-production}
  LOG_LEVEL: ${LOG_LEVEL:-info}
  NEW_RELIC_LICENSE_KEY: ${NEW_RELIC_LICENSE_KEY}
  NEW_RELIC_API_KEY: ${NEW_RELIC_API_KEY}
  NEW_RELIC_ACCOUNT_ID: ${NEW_RELIC_ACCOUNT_ID}
  NEW_RELIC_REGION: ${NEW_RELIC_REGION:-US}

x-resource-limits: &resource-limits
  deploy:
    resources:
      limits:
        cpus: '1.0'
        memory: 512M
      reservations:
        cpus: '0.25'
        memory: 128M

x-logging: &default-logging
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
      compress: "true"

services:
  nrdot-collector:
    build:
      context: .
      dockerfile: Dockerfile.best-practices
    image: dashbuilder/nrdot:latest
    container_name: nrdot-collector
    command: ["collector"]
    environment:
      <<: *common-variables
      OPTIMIZATION_MODE: ${OPTIMIZATION_MODE:-balanced}
    ports:
      - "127.0.0.1:4317:4317"
      - "127.0.0.1:4318:4318"
      - "127.0.0.1:8888:8888"
      - "127.0.0.1:13133:13133"
    volumes:
      - ./configs/collector-profiles:/etc/otel/profiles:ro
      - nrdot-data:/var/lib/nrdot
    <<: [*resource-limits, *default-logging]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:13133/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  control-loop:
    build:
      context: .
      dockerfile: Dockerfile.best-practices
    image: dashbuilder/nrdot:latest
    container_name: nrdot-control-loop
    command: ["control-loop"]
    environment:
      <<: *common-variables
      OPTIMIZATION_MODE: ${OPTIMIZATION_MODE:-balanced}
      CONTROL_LOOP_INTERVAL: ${CONTROL_LOOP_INTERVAL:-300}
    volumes:
      - ./scripts:/app/scripts:ro
      - nrdot-data:/var/lib/nrdot
    <<: [*resource-limits, *default-logging]
    restart: unless-stopped
    depends_on:
      - nrdot-collector

  monitor:
    build:
      context: .
      dockerfile: Dockerfile.best-practices
    image: dashbuilder/nrdot:latest
    container_name: dashbuilder-monitor
    command: ["monitor"]
    environment:
      <<: *common-variables
    volumes:
      - ./orchestrator:/app/orchestrator:ro
      - nrdot-data:/var/lib/nrdot
    <<: [*resource-limits, *default-logging]
    restart: unless-stopped
    depends_on:
      - nrdot-collector

volumes:
  nrdot-data:
    driver: local
EOF

echo -e "${GREEN}✓ Docker best practices files created!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review the created files:"
echo "   - Dockerfile.best-practices"
echo "   - docker-compose.best-practices.yml"
echo "   - docker-entrypoint.sh (updated)"
echo ""
echo "2. Build the new image:"
echo "   docker build -f Dockerfile.best-practices -t dashbuilder/nrdot:latest ."
echo ""
echo "3. Run with best practices:"
echo "   docker-compose -f docker-compose.best-practices.yml up"
echo ""
echo "4. Or use the Makefile:"
echo "   make setup"
echo "   make build"
echo "   make run"