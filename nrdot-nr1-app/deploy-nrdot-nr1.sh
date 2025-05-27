#!/bin/bash
# deploy-nrdot-nr1.sh

set -euo pipefail

echo "=== NRDOT NR1 App Deployment ==="

# Check prerequisites
command -v nr1 >/dev/null 2>&1 || { echo "Error: nr1 CLI not installed"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm not installed"; exit 1; }

# Build the app
echo "Building NR1 app..."
npm install
npm run build

# Validate
echo "Validating app..."
nr1 nerdpack:validate

# Check bundle size
echo "Checking bundle size..."
npm run bundle-size

# Run tests
echo "Running tests..."
npm test

# Generate UUID if needed
if ! grep -q "uuid" nr1.json; then
    echo "Generating UUID..."
    nr1 nerdpack:uuid -gf
fi

# Publish
echo "Publishing to New Relic..."
nr1 nerdpack:publish

# Deploy to all accounts
echo "Deploying to all accounts..."
nr1 nerdpack:deploy --all

# Deploy quickstart
echo "Deploying quickstart..."
nr1 quickstarts:deploy nrdot-host-process

echo "=== Deployment Complete ==="
echo "Access your app at: https://one.newrelic.com/launcher/nrdot-host-process-optimization"