# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DashBuilder is a comprehensive platform for New Relic dashboard management integrated with NRDOT v2 (New Relic Dot) process optimization. It delivers 70-85% telemetry cost reduction while maintaining 95%+ critical process coverage.

## Development Notes
- do not focus on cross functional aspects like security performance etc at this point we are only concernened in making everything work funcionally end to end. all experiments should run with all data and metrics we want to track
- keep iterating, the moment your todo list has only few items left - work on adding more items to your todo
- lets not create alternate configs like simple docer etc - do not ever cheat like this by creating alternate simpler paths - fix main path we have and lets runt he same for everything. having sai that clean up and consolidate such files through out the repo

## Core Purpose: NRDOT Experimentation

The primary purpose of DashBuilder is to run systematic experiments comparing NRDOT configurations:

1. **Experiment Framework**: Located in `/experiments/` - orchestrates controlled tests
2. **Configuration Profiles**: Different optimization levels (conservative, balanced, aggressive)
3. **Metrics Collection**: Automated collection of cost, coverage, and performance metrics
4. **Comparison Analysis**: Side-by-side evaluation of configurations
5. **Docker-based Testing**: Isolated containers for each configuration

### Running Experiments
```bash
# Quick 5-minute test
npm run experiment:quick

# Full experiment
npm run experiment:run cost-optimization-basic

# View results
npm run experiment:results
``` 

## Out of Scope
- Add Grafana dashboard templates
    ☐ Create performance benchmarking suite
    ☐ Add multi-region deployment support

## Key Commands

### Development Setup
```bash
# Initial setup (interactive)
npm run setup

# Test New Relic API connection
npm run test:connection

# Run full diagnostics
npm run diagnostics:all

# Test metric submission
npm run test:metrics
```

### Consolidated Tools
- **Connection Testing**: `npm run test:connection` - Tests all New Relic endpoints
- **Diagnostics**: `npm run diagnostics` - Full system health check
- **Metric Finder**: `node scripts/find-metrics.js` - Explore metrics in NRDB
- **Metric Testing**: `npm run test:metrics` - Test metric submission paths