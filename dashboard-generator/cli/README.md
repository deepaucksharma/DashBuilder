# Dashboard Generator CLI

Command-line interface for the Dashboard Generation Platform.

## Installation

```bash
# Global installation
npm install -g @dashbuilder/dashboard-generator

# Or use locally
npm install
npm link
```

## Setup

Create a `.env` file with your New Relic credentials:

```env
NEW_RELIC_API_KEY=your_api_key
NEW_RELIC_ACCOUNT_ID=your_account_id
```

## Commands

### Generate Dashboard

#### Interactive Mode
```bash
dashgen generate -i
# or
dashgen generate --interactive
```

#### Command Line Mode
```bash
dashgen generate \
  --name "My Dashboard" \
  --template system-health \
  --metrics "system.*" "cpu.*" \
  --exclude "*.debug.*" \
  --layout balanced \
  --deploy
```

Options:
- `-n, --name <name>`: Dashboard name
- `-t, --template <template>`: Template to use
- `-m, --metrics <patterns...>`: Metric patterns to include
- `-e, --exclude <patterns...>`: Metric patterns to exclude
- `-l, --layout <preference>`: Layout preference (compact|balanced|detailed)
- `-o, --output <file>`: Save dashboard to file
- `-d, --deploy`: Deploy dashboard immediately
- `-i, --interactive`: Interactive mode

### List Templates
```bash
dashgen templates
```

### Discover Metrics
```bash
# Discover all metrics
dashgen metrics

# Filter by pattern
dashgen metrics --pattern "cpu.*"

# Filter by namespace
dashgen metrics --namespace system

# Limit results
dashgen metrics --limit 100
```

### Search Metrics
```bash
# Search for CPU metrics
dashgen search cpu

# Limit results
dashgen search memory --limit 10
```

### Deploy Dashboard
```bash
# Deploy from JSON file
dashgen deploy dashboard.json
```

### Validate Dashboard
```bash
# Validate dashboard structure
dashgen validate dashboard.json
```

### Quick Generate Commands

#### System Health Dashboard
```bash
# Generate only
dashgen quick:system

# Generate and deploy
dashgen quick:system --deploy
```

#### Application Performance Dashboard
```bash
# Generate only
dashgen quick:app

# Generate and deploy
dashgen quick:app --deploy
```

## Examples

### Generate System Health Dashboard
```bash
dashgen generate \
  --name "Production System Health" \
  --template system-health \
  --metrics "system.*" "host.*" \
  --layout detailed \
  --output system-health.json \
  --deploy
```

### Interactive Dashboard Generation
```bash
dashgen generate -i
```

This will prompt you for:
- Dashboard name
- Description
- Template selection
- Metric patterns
- Layout preference
- Deployment option

### Search and Generate Dashboard
```bash
# First, search for metrics
dashgen search cpu --limit 20

# Then generate dashboard with found metrics
dashgen generate \
  --name "CPU Monitoring" \
  --metrics "system.cpu.*" "process.cpu.*" \
  --deploy
```

### Generate and Save Dashboard
```bash
dashgen generate \
  --name "Application Dashboard" \
  --template application-performance \
  --output app-dashboard.json
```

### Deploy Saved Dashboard
```bash
dashgen deploy app-dashboard.json
```

## Workflow Examples

### 1. Complete Dashboard Creation Workflow
```bash
# Step 1: Discover available metrics
dashgen metrics --pattern "app.*"

# Step 2: Generate dashboard
dashgen generate \
  --name "App Performance" \
  --template application-performance \
  --metrics "app.request.*" "app.response.*" \
  --output app-perf.json

# Step 3: Validate
dashgen validate app-perf.json

# Step 4: Deploy
dashgen deploy app-perf.json
```

### 2. Quick System Monitoring Setup
```bash
# Generate and deploy in one command
dashgen quick:system --deploy
```

### 3. Custom Dashboard with Exclusions
```bash
dashgen generate \
  --name "Production Metrics" \
  --metrics "*" \
  --exclude "*.debug.*" "*.test.*" "*.internal.*" \
  --layout compact \
  --deploy
```

## Tips

1. **Use Interactive Mode**: When creating complex dashboards, use `-i` for guided setup
2. **Save Before Deploy**: Always save dashboards with `-o` before deploying
3. **Validate First**: Use `validate` command to check dashboard before deployment
4. **Pattern Matching**: Use wildcards (`*`) in metric patterns for flexibility
5. **Check Available Metrics**: Use `metrics` command to see what's available

## Troubleshooting

### Authentication Errors
Ensure your `.env` file contains valid:
- `NEW_RELIC_API_KEY`
- `NEW_RELIC_ACCOUNT_ID`

### No Metrics Found
- Check metric patterns are correct
- Verify metrics exist in the time range
- Use `metrics` command to list available metrics

### Deployment Fails
- Validate dashboard structure first
- Check API key has dashboard write permissions
- Ensure account ID is correct

## Advanced Usage

### Custom Templates
Place custom template files in `~/.dashgen/templates/` and reference by name:

```bash
dashgen generate --template my-custom-template
```

### Batch Processing
Generate multiple dashboards from a script:

```bash
#!/bin/bash
for service in api web worker; do
  dashgen generate \
    --name "$service Dashboard" \
    --metrics "$service.*" \
    --output "$service-dashboard.json"
done
```