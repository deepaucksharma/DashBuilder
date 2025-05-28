# Docker Configuration

This directory contains Docker configurations for the DashBuilder/NRDOT v2 platform.

## Available Profiles

The main `docker-compose.yml` uses profiles to organize services:

### Core Profiles
- **`dashbuilder`** - Just the DashBuilder application
- **`cli`** - DashBuilder CLI tools
- **`nrdot`** - Complete NRDOT monitoring system
- **`otel`** - Standalone OpenTelemetry collector
- **`full`** - Everything (DashBuilder + NRDOT + monitoring)

### Specialized Profiles
- **`monitoring`** - Prometheus, Grafana, metrics generator, ingestion monitor
- **`experiments`** - Multiple NRDOT profiles for A/B testing
- **`debug`** - Diagnostic containers

## Quick Start

```bash
# Just DashBuilder
docker-compose --profile dashbuilder up

# Complete NRDOT system
docker-compose --profile nrdot up

# Everything with monitoring
docker-compose --profile full up

# Run experiments
docker-compose --profile experiments up
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
NEW_RELIC_API_KEY=your-user-api-key
NEW_RELIC_ACCOUNT_ID=your-account-id

# Optional
NEW_RELIC_REGION=US
NEW_RELIC_INGEST_KEY=your-ingest-key
NRDOT_PROFILE=balanced
NRDOT_TARGET_COVERAGE=95
NRDOT_COST_REDUCTION_TARGET=70
```

## Available Dockerfiles

- **`Dockerfile`** - Main DashBuilder application
- **`Dockerfile.multistage`** - Optimized multi-stage build for DashBuilder
- **`Dockerfile.nrdot`** - Complete NRDOT system (720 lines, full monitoring stack)
- **`distributions/nrdot-plus/Dockerfile.otel`** - Lightweight OpenTelemetry collector

## Service Endpoints

When running the full stack:

| Service | Port | Description |
|---------|------|-------------|
| Web Dashboard | 8080 | Main NRDOT dashboard |
| API Server | 3000 | REST API endpoints |
| WebSocket | 3001 | Real-time updates |
| Prometheus | 8888 | OTEL collector metrics |
| Health Check | 13133 | Service health |
| OTLP gRPC | 4317 | OpenTelemetry ingestion |
| OTLP HTTP | 4318 | OpenTelemetry ingestion |
| Prometheus UI | 9090 | Monitoring dashboard |
| Grafana | 3002 | Visualization (admin/nrdot) |

## Archived Files

The `archive/` directory contains older Docker configurations that have been consolidated:

- Legacy Dockerfiles
- Previous docker-compose configurations
- Experimental setups

These are kept for reference but should not be used in production.