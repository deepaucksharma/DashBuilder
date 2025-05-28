# Scripts Directory Index

This directory contains all operational scripts for the DashBuilder/NRDOT v2 platform, organized by function.

## Directory Structure

```
scripts/
├── deployment/          # Deployment and setup scripts
├── validation/          # Validation and testing scripts
├── monitoring/          # Monitoring and diagnostics scripts
├── utils/              # Utility and helper scripts
├── src/                # CLI source code (nr-guardian)
├── examples/           # Example workflows and data
├── otel-configs/       # OpenTelemetry configurations
├── systemd/            # Systemd service files
├── tests/              # Test scripts
└── docs/               # Script documentation
```

## Core Scripts

### Main Entry Points

| Script | Purpose | Usage |
|--------|---------|-------|
| **CLI Tool** | Complete validation & management engine | `npm run cli -- <command>` |
| **Deployment** | Deploy NRDOT with Docker/native | `./deployment/deploy-nrdot.sh` |
| **Validation** | Comprehensive system validation | `./validation/validate-nrdot.sh` |

## Deployment Scripts (`deployment/`)

| Script | Purpose | Platform | Description |
|--------|---------|----------|-------------|
| `deploy-nrdot.sh` | **Primary deployment script** | Docker/Native | Unified NRDOT deployment with profiles |
| `setup-nrdot-v2.sh` | Legacy native setup | Native | Original systemd-based setup |
| `deploy-nrdot-k8s.sh` | Kubernetes deployment | K8s | Deploy to Kubernetes cluster |
| `run-nrdot-end-to-end.sh` | End-to-end deployment | Docker | Step-by-step guided deployment |
| `run-nrdot-docker.sh` | Docker-specific deployment | Docker | Docker container deployment |

**Recommended:** Use `deploy-nrdot.sh` for new deployments.

## Validation Scripts (`validation/`)

| Script | Purpose | Scope | Description |
|--------|---------|-------|-------------|
| `validate-nrdot.sh` | **Primary validation script** | All | Auto-detects platform, comprehensive validation |
| `validate-complete-setup.sh` | Legacy full validation | All | Original comprehensive validation |
| `validate-otel-config.sh` | Configuration validation | Config | OpenTelemetry config validation |
| `automated-continuous-validation.sh` | Continuous monitoring | Runtime | Automated validation system |

**Recommended:** Use `validate-nrdot.sh` for all validation needs.

## Monitoring Scripts (`monitoring/`)

| Script | Purpose | Use Case | Description |
|--------|---------|----------|-------------|
| `health-check-comprehensive.sh` | System health check | Diagnostics | Comprehensive health validation |
| `generate-real-metrics.sh` | Test data generation | Testing | Generate realistic test metrics |
| `fix-zero-ingestion.sh` | Auto-fix ingestion issues | Troubleshooting | Automatically fix zero ingestion |
| `nrdot-dashboard-queries.sh` | Dashboard query validation | Dashboards | Validate dashboard NRQL queries |
| `nrdot-dashboard-queries-fixed.sh` | Fixed dashboard queries | Dashboards | Updated with correct queries |

## Utility Scripts (`utils/`)

| Script | Purpose | Use Case | Description |
|--------|---------|----------|-------------|
| `manage-collector-env.sh` | Environment management | Config | Manage collector environment variables |
| `generate-noise-patterns.sh` | Test data patterns | Testing | Generate test noise patterns |
| `fix-processsample-queries.js` | Query fixes | Maintenance | Fix ProcessSample queries |
| `fix-bc-usage.sh` | Dependency fixes | Maintenance | Replace bc with awk calculations |
| `get-license-key.sh` | License key retrieval | Setup | Retrieve New Relic license key |
| `test-otel-quick.sh` | Quick OTEL test | Testing | Quick OpenTelemetry test |

## CLI Tool (`src/`)

The **nr-guardian** CLI tool is the primary interface for DashBuilder operations:

### Available Commands

```bash
# Schema operations
npm run cli -- schema discover-event-types
npm run cli -- schema describe-event-type <eventType>

# NRQL operations  
npm run cli -- nrql validate <query>
npm run cli -- nrql optimize <query>

# Dashboard operations
npm run cli -- dashboard list
npm run cli -- dashboard export <dashboardId>
npm run cli -- dashboard import <file>

# Entity operations
npm run cli -- entity search --type <entityType>
npm run cli -- entity describe <guid>

# Data ingestion operations
npm run cli -- ingest get-data-volume --days <n>
npm run cli -- ingest get-cardinality <eventType> <attribute>

# LLM enhancement operations
npm run cli -- llm context --type dashboard
npm run cli -- llm enhance-query <query>
```

## Quick Start

### 1. Initial Setup
```bash
# Run main setup (interactive)
./setup.sh

# Or deploy NRDOT directly
./deployment/deploy-nrdot.sh --mode=docker --profile=balanced
```

### 2. Validation
```bash
# Run comprehensive validation
./validation/validate-nrdot.sh

# Or quick validation
./validation/validate-nrdot.sh quick
```

### 3. Monitoring
```bash
# Check system health
./monitoring/health-check-comprehensive.sh

# Generate test data
./monitoring/generate-real-metrics.sh
```

## Development Workflow

### Adding New Scripts

1. **Determine Category**: deployment, validation, monitoring, or utils
2. **Follow Naming Convention**: `verb-noun-context.sh`
3. **Add Documentation**: Update this INDEX.md
4. **Add Tests**: Create test in `tests/` directory
5. **Make Executable**: `chmod +x script-name.sh`

### Script Standards

- **Shebang**: Use `#!/bin/bash`
- **Error Handling**: Include `set -e` for most scripts
- **Logging**: Use consistent log functions (see existing scripts)
- **Help**: Include `--help` option
- **Documentation**: Add header comments explaining purpose

### Testing Scripts

```bash
# Run all script tests
cd tests && npm test

# Test specific script
./tests/test-specific-script.sh
```

## Maintenance

### Regular Cleanup Tasks

1. **Remove deprecated scripts** after migration periods
2. **Update documentation** when scripts change
3. **Test all scripts** against current environment
4. **Review permissions** and security settings

### Script Lifecycle

- **Active**: Current, supported scripts
- **Legacy**: Older scripts kept for compatibility
- **Deprecated**: Scripts scheduled for removal
- **Archived**: Historical scripts (moved to archive/)

## Troubleshooting

### Common Issues

1. **Permission Denied**: Check script permissions with `ls -la`
2. **Command Not Found**: Ensure script is executable (`chmod +x`)
3. **Missing Dependencies**: Check prerequisite tools are installed
4. **Environment Variables**: Verify .env file is properly configured

### Getting Help

- **Script Help**: Most scripts support `--help` flag
- **CLI Help**: `npm run cli -- --help`
- **Documentation**: Check individual script headers
- **Issues**: Report to project repository

---

*Last Updated: $(date)*  
*Generated by NRDOT v2 Platform*