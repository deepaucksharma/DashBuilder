# Multi-stage Dockerfile for DashBuilder with NRDOT v2 integration

# Base stage with common dependencies
FROM node:18-alpine AS base
RUN apk add --no-cache bash git curl python3 make g++ ca-certificates
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package*.json ./
COPY scripts/package*.json ./scripts/
COPY nrdot-nr1-app/package*.json ./nrdot-nr1-app/
RUN npm ci --legacy-peer-deps && \
    cd scripts && npm ci --legacy-peer-deps && \
    cd ../nrdot-nr1-app && npm ci --legacy-peer-deps

# OTEL Collector stage
FROM otel/opentelemetry-collector-contrib:0.91.0 AS otel-collector

# Development stage
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/scripts/node_modules ./scripts/node_modules
COPY --from=deps /app/nrdot-nr1-app/node_modules ./nrdot-nr1-app/node_modules
COPY . .
RUN find . -name "*.sh" -type f -exec chmod +x {} \;
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

# Production build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/scripts/node_modules ./scripts/node_modules
COPY --from=deps /app/nrdot-nr1-app/node_modules ./nrdot-nr1-app/node_modules
COPY . .
RUN npm run build --if-present && \
    cd nrdot-nr1-app && npm run build --if-present

# Production stage
FROM base AS production
RUN apk add --no-cache tini
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/scripts/node_modules ./scripts/node_modules
COPY --from=builder /app/nrdot-nr1-app/node_modules ./nrdot-nr1-app/node_modules
COPY --from=builder /app .
RUN find . -name "*.sh" -type f -exec chmod +x {} \;
ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "orchestrator/monitor-enhanced.js"]

# NRDOT stage with OTEL collector
FROM alpine:3.19 AS nrdot
RUN apk add --no-cache bash curl jq bc procps nodejs npm
COPY --from=otel-collector /otelcol-contrib /usr/local/bin/otelcol-contrib
COPY --from=production /app/configs/collector-profiles /etc/otel/profiles
COPY --from=production /app/scripts/control-loop.sh /usr/local/bin/
COPY --from=production /app/nrdot-config /etc/nrdot
RUN chmod +x /usr/local/bin/control-loop.sh
ENV OTEL_RESOURCE_ATTRIBUTES="service.name=nrdot-collector,service.version=2.0"
CMD ["/usr/local/bin/otelcol-contrib", "--config=/etc/otel/profiles/balanced.yaml"]