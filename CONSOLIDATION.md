# DashBuilder/NRDOT Consolidated Architecture

This document describes the ### Configuration

Unified configuration approach:

- `/configs/` - Main configurations
  - `collector-base.yaml` - Base OpenTelemetry collector configuration
  - `collector-profiles/` - Profile-specific overlays
    - `baseline.yaml` - No optimizations
    - `conservative.yaml` - Moderate optimizations
    - `balanced.yaml` - Balanced optimizations
    - `aggressive.yaml` - Maximum optimizations

## Benefits of Consolidation

1. **Reduced Duplication**: Eliminated duplicate code and configurations
2. **Improved Maintainability**: Easier to update and maintain
3. **Consistent Behavior**: Unified logic across environments
4. **Simplified Deployment**: Single Docker Compose with profiles
5. **Modular Design**: Clear separation of concerns
6. **Better Documentation**: Centralized documentation of components
7. **Standardized Scripts**: Common interfaces for all scriptsructure for the DashBuilder and NRDOT projects. The consolidation aims to reduce duplication, improve maintainability, and ensure consistent behavior across different deployment scenarios.

## Consolidated Structure

### Docker Compose

We now use a single Docker Compose file with profiles:

- `docker-compose.yml` - Main consolidated Docker Compose file
  - Profiles:
    - `dashbuilder` - Just the DashBuilder app
    - `cli` - CLI-only mode
    - `nrdot` - NRDOT service only
    - `otel` - OpenTelemetry collector only
    - `monitoring` - Monitoring tools only
    - `experiments` - Experimental configurations
    - `full` - Complete stack deployment
    - `dev` - Development configuration

Example usage:
```bash
# Development setup
docker compose --profile dev up

# CLI only
docker compose --profile cli up

# Full deployment
docker compose --profile full up

# Run experiments
docker compose --profile experiments up
```

### Dockerfiles

We now use a consolidated multistage Dockerfile approach:

- `Dockerfile.consolidated` - Main Dockerfile with multiple targets:
  - `builder` - Base build stage with all dependencies
  - `dashbuilder` - DashBuilder application
  - `nrdot` - NRDOT application
  - `development` - Development environment with live reload

- `Dockerfile.otel` - OpenTelemetry collector (kept separate due to different base image)

Example usage:
```bash
# Build DashBuilder
docker build -f Dockerfile.consolidated --target dashbuilder .

# Build NRDOT
docker build -f Dockerfile.consolidated --target nrdot .
```

### Scripts

Common script libraries and consolidated scripts:

- `/lib/common/` - Common utilities
  - `logging.js` - Unified logging utilities
  - `nr-api.js` - New Relic API utilities
  - `config.js` - Configuration utilities

- `/scripts/` - Main scripts
  - `control-loop.js` - Unified control loop with multiple backends
    - `backends/local-backend.js` - Local filesystem backend
    - `backends/docker-backend.js` - Docker containers backend
    - `backends/nr1-backend.js` - New Relic One API backend
  - `validate.sh` - Unified validation script with multiple modes
  - `metrics-generator.sh` - Unified metrics generator
  - `generate-configs.sh` - Config generator for collector profiles

### Configuration

Unified configuration approach:

- `/configs/` - Main configurations
  - `collector-base.yaml` - Base OpenTelemetry collector configuration
  - `collector-profiles/` - Profile-specific overlays
    - `baseline.yaml`
    - `conservative.yaml` 
    - `balanced.yaml`
    - `aggressive.yaml`

## Benefits of Consolidation

1. **Reduced Duplication**: Eliminated duplicate code and configurations
2. **Improved Maintainability**: Easier to update and maintain
3. **Consistent Behavior**: Unified logic across environments
4. **Simplified Deployment**: Single Docker Compose with profiles
5. **Modular Design**: Clear separation of concerns
6. **Better Documentation**: Centralized documentation of components

## Migration Guide

When migrating from the previous structure:

1. Use the consolidated Docker Compose with the appropriate profile
2. Use the new scripts with their command-line arguments
3. Use the base configuration with profile overlays

Example migration commands:
```bash
# Old way
docker compose -f docker-compose-experiments.yml up

# New way
docker compose --profile experiments up
```

## Next Steps

1. Complete implementation of the consolidated control loop backends
2. Add more comprehensive validation modes
3. Create profile-specific configuration overlays
4. Update documentation to reflect the new structure
