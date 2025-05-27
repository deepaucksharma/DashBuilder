# NRDOT v2 Framework Changelog

All notable changes to the NRDOT v2 framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-11-28

### Added
- Complete production-ready framework for 70-85% process metrics cost reduction
- Single configuration file architecture (`optimization.yaml`)
- Cross-platform support (Windows + Linux process patterns)
- Hardened control loop with anti-thrashing protection
- EWMA-based anomaly detection (experimental)
- Ring-based A/B testing framework
- Comprehensive monitoring dashboards and alerts
- Emergency mode for crisis situations
- Webhook support for profile changes and alerts
- API endpoints for programmatic control

### Changed
- Simplified from multi-file to single configuration approach
- Replaced complex ML features with proven OTTL constructs
- Unified metric naming (underscores throughout)
- Parameterized cost model (environment variables)
- Atomic configuration updates with validation
- Improved process classification with 6 tiers

### Fixed
- Windows process pattern escaping
- YAML validation issues
- Memory leak in control loop
- Thrashing during high variance periods
- Coverage calculation accuracy

### Removed
- Experimental features not supported by OpenTelemetry
- Complex variance calculations (EWMA only now)
- Hardcoded cost assumptions

## [2.0.0-rc.3] - 2024-11-27

### Fixed
- Corrected all technical issues identified in review
- Validated OTTL syntax compatibility
- Fixed metric naming inconsistencies
- Resolved configuration complexity issues

## [2.0.0-rc.2] - 2024-11-26

### Added
- Extended cross-platform patterns
- Container runtime classifications
- CI/CD tool patterns
- Development IDE detection

### Changed
- Improved control loop decision logic
- Enhanced thrashing protection
- Better cost calculation accuracy

## [2.0.0-rc.1] - 2024-11-25

### Added
- Initial release candidate
- Core optimization framework
- Basic process classification
- Control loop implementation

## [1.0.0] - 2024-11-01

### Added
- Original NRDOT framework concept
- Basic process filtering
- Manual profile management

---

## Upgrade Guide

### From 1.0.0 to 2.0.0

1. **Backup existing configuration:**
   ```bash
   cp -r /etc/nrdot-collector-host /etc/nrdot-collector-host.bak
   ```

2. **Download new configuration:**
   ```bash
   curl -O https://raw.githubusercontent.com/newrelic/nrdot-configs/main/optimization.yaml
   curl -O https://raw.githubusercontent.com/newrelic/nrdot-configs/main/config.yaml
   ```

3. **Migrate custom patterns:**
   - Copy your custom process patterns from old config
   - Add them to `process_classification` in `optimization.yaml`

4. **Update environment variables:**
   ```bash
   # Add new required variables
   echo "NRDOT_RING=$(( $(hostname | cksum | cut -d' ' -f1) % 8 ))" >> /etc/default/nrdot-collector-host
   ```

5. **Install control loop:**
   ```bash
   /opt/nrdot/scripts/quickstart.sh --upgrade
   ```

6. **Restart services:**
   ```bash
   systemctl restart nrdot-collector-host
   systemctl start nrdot-control-loop
   ```

---

## Support

For questions or issues:
- GitHub Issues: https://github.com/newrelic/nrdot-collector-releases/issues
- Documentation: https://docs.newrelic.com/nrdot
- Email: nrdot-support@newrelic.com