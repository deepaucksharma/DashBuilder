# File Consolidation Map

This document maps the relationships between original files and their consolidated versions in the DashBuilder/NRDOT project.

## Docker Compose Files

| Original File | Consolidated File | Notes |
|---------------|------------------|-------|
| `docker-compose.yml` | `docker-compose.consolidated.yml` | Main compose file with profiles |
| `docker-compose-complete.yml` | `docker-compose.consolidated.yml` | Merged using `full` profile |
| `docker-compose-experiments.yml` | `docker-compose.consolidated.yml` | Merged using `experiments` profile |

## Dockerfiles

| Original File | Consolidated File | Notes |
|---------------|------------------|-------|
| `Dockerfile` | `Dockerfile.consolidated` | Main consolidated Dockerfile with multi-stage builds |
| `Dockerfile.multistage` | `Dockerfile.consolidated` | Merged into consolidated version |
| `Dockerfile.nrdot` | `Dockerfile.consolidated` | Merged as `nrdot` target |
| `Dockerfile.otel` | Remains separate | Kept separate due to different base requirements |

## Control Loop Scripts

| Original File | Consolidated File | Notes |
|---------------|------------------|-------|
| `nrdot-config/control-loop.sh` | `scripts/control-loop.js` | Merged as `docker` mode |
| `nrdot-config/control-loop-working.sh` | `scripts/control-loop.js` | Merged as `docker` mode |
| `nrdot-nr1-app/scripts/nrdot-nr1-control-loop.sh` | `scripts/control-loop.js` | Merged as `nr1` mode |
| `distributions/nrdot-plus/scripts/control-loop.sh` | `scripts/control-loop.js` | Merged as `local` mode |

## Validation Scripts

| Original File | Consolidated File | Notes |
|---------------|------------------|-------|
| `scripts/validation/validate-complete-setup.sh` | `scripts/validate.sh` | Merged as `complete` mode |
| `scripts/validation/validate-nrdot.sh` | `scripts/validate.sh` | Merged as `basic` mode |
| `scripts/validation/validate-otel-config.sh` | `scripts/validate.sh` | Merged as `otel` mode |

## Metric Generators

| Original File | Consolidated File | Notes |
|---------------|------------------|-------|
| `scripts/generate-real-metrics.sh` | `scripts/metrics-generator.sh` | Merged as `normal` profile |
| `scripts/generate-test-metrics.sh` | `scripts/metrics-generator.sh` | Merged as `light` profile |

## Configuration Files

| Original File | Consolidated File | Notes |
|---------------|------------------|-------|
| `configs/collector-baseline.yaml` | `configs/collector-base.yaml` + `configs/collector-profiles/baseline.yaml` | Split into base + overlay |
| `configs/collector-conservative.yaml` | `configs/collector-base.yaml` + `configs/collector-profiles/conservative.yaml` | Split into base + overlay |
| `configs/collector-aggressive.yaml` | `configs/collector-base.yaml` + `configs/collector-profiles/aggressive.yaml` | Split into base + overlay |
| `configs/otel-config-optimized.yaml` | `configs/collector-base.yaml` + `configs/collector-profiles/balanced.yaml` | Split into base + overlay |

## Common Utilities

| Original Location | Consolidated Location | Notes |
|-------------------|----------------------|-------|
| Various logging functions | `lib/common/logging.js` | Unified JavaScript logging |
| Various bash logging functions | `scripts/lib/common.sh` | Unified bash logging |
| NR API utilities | `lib/common/nr-api.js` | Unified NR API client |

## How to Use This Map

If you need to reference functionality from an original file:

1. Find the original file in this map
2. Locate the consolidated file that contains the functionality
3. Look for the corresponding mode/profile in the consolidated file

## Migration Strategy

When migrating scripts that reference original files:

1. Update import paths to point to the consolidated files
2. Add the appropriate mode/profile parameters when calling the consolidated scripts
3. Test thoroughly to ensure functionality is preserved
