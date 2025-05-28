# NR1 App Deployment Guide

## Current Status

1. **NR1 App Setup**: ✅ Complete
   - UUID generated: `7bc3af02-51fa-4ff3-874c-9f3c80985a54`
   - Dependencies installed
   - App structure ready

2. **API Authentication**: ❌ Issues
   - Current User API Key (NNRAK) is returning authentication errors
   - Query Key (NRIQ) works for NRQL queries only
   - License Key is for data ingestion only

## What You Need

### 1. Valid User API Key
To deploy the NR1 app or create dashboards via API, you need a valid User API Key with the following permissions:
- NerdGraph access
- Dashboard creation
- Entity management

### 2. How to Get a Valid User API Key
1. Log in to New Relic One: https://one.newrelic.com
2. Click on your user avatar (top right)
3. Select "API keys"
4. Create a new User key with these permissions:
   - NerdGraph
   - Admin
   - Dashboards

### 3. Update .env File
Replace the current `NEW_RELIC_USER_API_KEY` with your new key.

## Deployment Options

### Option 1: Manual NR1 SDK Installation (Recommended)
1. Visit https://developer.newrelic.com
2. Download the NR1 SDK for your platform
3. Install it following the official guide
4. Run:
   ```bash
   cd nrdot-nr1-app
   nr1 nerdpack:publish
   nr1 nerdpack:deploy
   ```

### Option 2: Deploy Dashboards via API
Once you have a valid User API Key:
```bash
cd /Users/deepaksharma/DashBuilder
node scripts/create-nrdot-dashboard.js
```

### Option 3: Use New Relic One UI
1. Go to https://one.newrelic.com
2. Navigate to Dashboards
3. Import the JSON files from `/dashboards` directory

## Available Dashboards

1. **nrdot-main.json**: Main NRDOT system metrics
2. **nrdot-comprehensive.json**: Comprehensive monitoring
3. **experiment-dashboard.json**: Experiment tracking
4. **kpi-dashboard.json**: Key performance indicators

## Next Steps

1. Generate a new User API Key in New Relic One
2. Update the .env file with the new key
3. Choose your deployment method
4. Deploy the NR1 app or dashboards

## Troubleshooting

If you continue to have authentication issues:
1. Verify your account ID is correct
2. Ensure the API key has proper permissions
3. Check if you're using the correct region (US vs EU)
4. Try regenerating the API key

## Alternative: Quick Dashboard Deploy

If you just want to see the dashboards without the NR1 app:
1. Log in to New Relic One
2. Go to Dashboards → Import dashboard
3. Copy/paste the JSON from any dashboard file in `/dashboards`