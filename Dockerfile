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
# Skip automation as it's excluded in .dockerignore

# Install dependencies with clean install
RUN npm ci --only=production && \
    mkdir -p scripts && cd scripts && npm ci --only=production || true && cd .. && \
    mkdir -p orchestrator && cd orchestrator && npm ci --only=production || true && cd ..

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

# Copy node modules from builder (if they exist)
COPY --from=node-builder --chown=nrdot:nrdot /build/node_modules ./node_modules
RUN if [ -d /build/scripts/node_modules ]; then cp -r /build/scripts/node_modules ./scripts/; fi || true
RUN if [ -d /build/orchestrator/node_modules ]; then cp -r /build/orchestrator/node_modules ./orchestrator/; fi || true

# Copy configuration files
COPY --chown=nrdot:nrdot configs/collector-profiles/*.yaml /etc/otel/profiles/
COPY --chown=nrdot:nrdot deployment/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
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
