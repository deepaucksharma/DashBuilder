# DashBuilder/NRDOT Consolidated Project Structure

After consolidation, the project structure has been reorganized for better maintainability, reduced duplication, and clearer organization. This document summarizes the consolidated project structure.

## Core Files and Directories

```
DashBuilder/
├── docker-compose.yml           # Main Docker Compose file with profiles
├── Dockerfile                   # Main consolidated Dockerfile with multi-stage builds
├── Dockerfile.otel              # OpenTelemetry collector Dockerfile (kept separate)
├── quick-start.sh               # Quick start script for demonstrating functionality
├── consolidate-setup.sh         # Setup script for transitioning to consolidated structure
├── cleanup-redundant.sh         # Script to clean up redundant files
├── CONSOLIDATION.md             # Documentation of consolidation process
├── FILE_CONSOLIDATION_MAP.md    # Mapping between original and consolidated files
│
├── configs/                     # Configuration files
│   ├── collector-base.yaml      # Base OpenTelemetry collector configuration
│   ├── collector-profiles/      # Profile-specific overlays
│   │   ├── baseline.yaml        # No optimizations
│   │   ├── conservative.yaml    # Moderate optimizations
│   │   ├── balanced.yaml        # Balanced optimizations
│   │   └── aggressive.yaml      # Maximum optimizations
│   └── generated/               # Generated complete configurations
│
├── lib/                         # Common libraries
│   └── common/                  # Shared utilities
│       ├── logging.js           # Unified logging utilities
│       └── nr-api.js            # New Relic API client
│
├── scripts/                     # Consolidated scripts
│   ├── control-loop.js          # Unified control loop with multiple backends
│   ├── validate.sh              # Unified validation script with multiple modes
│   ├── metrics-generator.sh     # Unified metrics generator
│   ├── generate-configs.sh      # Configuration generator
│   ├── lib/                     # Script library files
│   │   └── common.sh            # Common shell script utilities
│   └── backends/                # Control loop backends
│       ├── local-backend.js     # Local filesystem backend
│       ├── docker-backend.js    # Docker container backend
│       └── nr1-backend.js       # New Relic One API backend
│
└── archive/                     # Archived redundant files
```

## Docker Compose Profiles

The consolidated `docker-compose.yml` supports multiple deployment profiles:

- `dashbuilder` - Just the DashBuilder app
- `cli` - CLI-only mode
- `nrdot` - NRDOT service only
- `otel` - OpenTelemetry collector only
- `monitoring` - Monitoring tools only
- `experiments` - Experimental configurations
- `full` - Complete stack deployment

Example usage:
```bash
# Development setup
docker compose --profile dev up

# CLI only
docker compose --profile cli up

# Full deployment
docker compose --profile full up
```

## Dockerfile Targets

The consolidated `Dockerfile` uses multi-stage builds with targets:

- `builder` - Base build stage with all dependencies
- `dashbuilder` - DashBuilder application
- `nrdot` - NRDOT application
- `development` - Development environment with live reload

Example usage:
```bash
# Build DashBuilder
docker build --target dashbuilder .

# Build NRDOT
docker build --target nrdot .
```

## Consolidated Scripts

### Control Loop

The consolidated control loop (`scripts/control-loop.js`) supports multiple backends:

- `local` - Uses local filesystem
- `docker` - Uses Docker containers
- `nr1` - Uses New Relic One API

Example usage:
```bash
# Run with local backend and balanced profile
node scripts/control-loop.js local balanced

# Run with Docker backend and aggressive profile
node scripts/control-loop.js docker aggressive
```

### Validation

The consolidated validation script (`scripts/validate.sh`) supports multiple modes:

- `basic` - Basic validation
- `deployment` - Deployment validation
- `complete` - Complete validation
- `continuous` - Continuous validation

Example usage:
```bash
# Run basic validation
./scripts/validate.sh basic

# Run complete validation
./scripts/validate.sh complete
```

### Metrics Generator

The consolidated metrics generator (`scripts/metrics-generator.sh`) supports multiple profiles:

- `light` - Few metrics with minimal dimensions
- `normal` - Moderate number of metrics
- `heavy` - Many metrics with many dimensions

Example usage:
```bash
# Run with normal profile
./scripts/metrics-generator.sh normal

# Run with heavy profile and 5-second interval
./scripts/metrics-generator.sh heavy 5
```

## Configuration System

The configuration system is now modular with a base configuration and profile-specific overlays:

```bash
# Generate complete configurations
./scripts/generate-configs.sh

# Start with specific profile
docker compose --profile nrdot -e CONFIG_FILE=configs/generated/collector-balanced.yaml up -d
```

## Quick Start

The quick start script demonstrates the consolidated functionality:

```bash
# Run quick start script
./quick-start.sh
```
