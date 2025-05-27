# NRDOT-Plus Collector Distribution

NRDOT-Plus is an enhanced distribution of the New Relic OpenTelemetry collector that includes built-in process metrics optimization, delivering 70-85% cost reduction out of the box.

## What's Included

- **NRDOT Collector**: Full OpenTelemetry collector with New Relic distribution enhancements
- **Process Optimization**: Pre-configured optimization profiles and intelligent filtering
- **Control Loop**: Automatic profile management based on cost and coverage targets
- **Cross-Platform Support**: Windows and Linux process patterns included
- **Zero-Config Setup**: Works immediately with just a license key

## Quick Start

### One-Line Install

```bash
# Linux
curl -Ls https://download.newrelic.com/nrdot-plus/install.sh | sudo bash

# With license key
curl -Ls https://download.newrelic.com/nrdot-plus/install.sh | sudo NEW_RELIC_LICENSE_KEY=YOUR_KEY_HERE bash
```

### Package Installation

#### Debian/Ubuntu
```bash
wget https://download.newrelic.com/nrdot-plus/nrdot-plus_latest_amd64.deb
sudo dpkg -i nrdot-plus_latest_amd64.deb
sudo systemctl start nrdot-plus
```

#### RHEL/CentOS
```bash
wget https://download.newrelic.com/nrdot-plus/nrdot-plus-latest.x86_64.rpm
sudo rpm -i nrdot-plus-latest.x86_64.rpm
sudo systemctl start nrdot-plus
```

## Key Features

### 1. Automatic Cost Optimization
- Reduces process metrics volume by 70-85%
- Maintains 95%+ coverage of critical processes
- Automatic profile switching based on conditions

### 2. Intelligent Process Classification
- 6-tier classification system
- Pre-configured patterns for common software
- Customizable classifications

### 3. Production-Ready Control Loop
- Anti-thrashing protection
- Gradual profile transitions
- Emergency mode for crisis situations

### 4. Enterprise Features
- A/B testing framework with rings
- Webhook notifications
- Comprehensive API

## Configuration

The collector automatically optimizes process metrics using the included profiles:

- **Conservative**: Maximum visibility (50% reduction)
- **Balanced**: Recommended default (70% reduction)
- **Aggressive**: Maximum savings (85% reduction)
- **Emergency**: Crisis mode (95% reduction)

### Setting License Key

```bash
# Environment variable
export NEW_RELIC_LICENSE_KEY=YOUR_KEY_HERE

# Or in /etc/default/nrdot-plus
echo "NEW_RELIC_LICENSE_KEY=YOUR_KEY_HERE" | sudo tee -a /etc/default/nrdot-plus
```

### Customizing Optimization

Edit `/etc/nrdot-plus/optimization.yaml`:

```yaml
# Change active profile
state:
  active_profile: "aggressive"  # or conservative, balanced, emergency

# Add custom process patterns
process_classification:
  custom_critical:
    score: 0.95
    patterns:
      common:
        - "^my-critical-app$"
```

## Monitoring

### Local Metrics
```bash
# View optimization metrics
curl http://localhost:8888/metrics | grep nrdot_

# Check current profile
nrdot-plus-ctl status
```

### New Relic Dashboards
Pre-built dashboards available at:
https://one.newrelic.com/dashboards/nrdot-plus

## Upgrading from NRDOT Collector

NRDOT-Plus is a drop-in replacement:

```bash
# Stop old collector
sudo systemctl stop nrdot-collector-host

# Install NRDOT-Plus
curl -Ls https://download.newrelic.com/nrdot-plus/install.sh | sudo bash

# Your existing config is preserved and enhanced
```

## Support

- Documentation: https://docs.newrelic.com/nrdot-plus
- GitHub: https://github.com/newrelic/nrdot-plus
- Support: nrdot-plus@newrelic.com

## License

This distribution includes:
- OpenTelemetry Collector (Apache 2.0)
- New Relic OTel Distribution components (Apache 2.0)
- NRDOT-Plus enhancements (Apache 2.0)