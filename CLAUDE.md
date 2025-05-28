# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DashBuilder is a comprehensive platform for New Relic dashboard management integrated with NRDOT v2 (New Relic Dot) process optimization. It delivers 70-85% telemetry cost reduction while maintaining 95%+ critical process coverage.

## Development Notes
- do not focus on cross functional aspects like security performance etc at this point we are only concernened in making everything work funcionally end to end. all experiments should run with all data and metrics we want to track
- keep iterating, the moment your todo list has only few items left - work on adding more items to your todo 

## Out of Scope
- Add Grafana dashboard templates
    ☐ Create performance benchmarking suite
    ☐ Add multi-region deployment support

## Key Commands

### Development Setup
```bash
# Initial setup (interactive)
./setup.sh

# Install all workspace dependencies
npm run install:all

# Test New Relic API connection
npm run test:connection

# Validate entire setup
npm run validate:all
```