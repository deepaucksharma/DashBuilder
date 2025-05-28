# NR1 App Deployment Guide

## Current Status

The NR1 app has been updated to use the shared components library, including:
- NRQL Validator component
- Visual Query Builder component

## Deployment Challenge

The standard `nr1` CLI tool for nerdpack development is not available through standard npm channels. The `newrelic` CLI binary we have does not include nerdpack commands.

## Alternative Deployment Approach

Since we cannot use the standard `nr1 nerdpack:serve` and `nr1 nerdpack:build` commands, we have several options:

### Option 1: Manual Build and Deploy

1. **Create a webpack configuration** to bundle the nerdlets
2. **Use the NerdGraph API** to deploy the application
3. **Upload the bundled assets** to New Relic

### Option 2: Find the Official NR1 CLI

The official NR1 CLI might be available through:
- New Relic Developer site download
- New Relic One catalog
- Direct download from New Relic support

### Option 3: Use the New Relic Platform UI

1. Navigate to the New Relic One catalog
2. Use the "Upload private app" feature
3. Upload the nerdpack as a zip file

## Current App Configuration

- **App ID**: `nrdot-host-process-optimization`
- **UUID**: `7bc3af02-51fa-4ff3-874c-9f3c80985a54`
- **Version**: `2.0.0`
- **Account ID**: `3630072`

## Components Ready for Deployment

1. **Console Nerdlet** (`/nerdlets/console/`)
   - Visual Query Builder integration
   - NRQL validation
   - Real-time query execution

2. **Overview Nerdlet** (`/nerdlets/overview/`)
   - KPI cards
   - Cost analysis
   - Coverage metrics

## Next Steps

1. Contact New Relic support or check developer documentation for the official NR1 CLI
2. Alternatively, create a custom build process using webpack
3. Test the deployment process with a minimal nerdpack first

## Temporary Workaround

For now, we can:
1. Create a development build using standard React build tools
2. Test the components in a standalone environment
3. Prepare for deployment once we have the proper CLI tools

## Files to Include in Deployment

```
nrdot-nr1-app/
├── nr1.json
├── package.json
├── icon.png (if available)
├── catalog/
│   ├── config.json
│   └── documentation.md
├── launchers/
│   └── overview-launcher/
│       └── nr1.json
├── nerdlets/
│   ├── console/
│   │   ├── index.js
│   │   ├── nr1.json
│   │   ├── styles.scss
│   │   └── components/
│   └── overview/
│       ├── index.js
│       ├── nr1.json
│       ├── styles.scss
│       └── components/
└── node_modules/
    └── @dashbuilder/shared-components/ (linked)
```

## Manual Testing Approach

Until we get the proper CLI:

1. **Create a test harness** that simulates the NR1 environment
2. **Use React DevTools** to test component functionality
3. **Validate NRQL queries** using the New Relic Query Builder UI
4. **Test API calls** using the NerdGraph API explorer