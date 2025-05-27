# 🚀 NRDOT v2 Windows Installation Guide

This guide will help you install NRDOT v2 on your Windows PC with automatic API key creation and dashboard setup.

## Prerequisites

- Windows 10/11 with Administrator privileges
- Internet connection
- New Relic account credentials

## Quick Setup (Recommended)

### Step 1: Open PowerShell as Administrator

1. Press `Win + X`
2. Select "Windows PowerShell (Admin)" or "Terminal (Admin)"

### Step 2: Run the Automated Setup

Copy and paste this command:

```powershell
# Download and run the setup script
cd $env:USERPROFILE
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/deepaucksharma/DashBuilder/main/setup-nrdot-windows.ps1" -OutFile "setup-nrdot.ps1"
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
.\setup-nrdot.ps1
```

The script will:
1. ✅ Install Node.js and Git if needed
2. ✅ Clone the DashBuilder repository
3. ✅ Install all dependencies
4. ✅ Create API keys automatically (browser will open)
5. ✅ Set up monitoring configuration
6. ✅ Create sample dashboards
7. ✅ Configure the .env file

## Manual Setup (Alternative)

If you prefer to set up manually:

### Step 1: Install Prerequisites

```powershell
# Install Chocolatey (if not installed)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Node.js and Git
choco install nodejs git googlechrome -y

# Refresh environment
refreshenv
```

### Step 2: Clone and Setup Project

```powershell
# Navigate to your preferred directory
cd $env:USERPROFILE

# Clone the repository
git clone https://github.com/deepaucksharma/DashBuilder.git
cd DashBuilder

# Install dependencies
npm install
cd scripts && npm install && cd ..
cd automation && npm install && cd ..
```

### Step 3: Create New Relic API Key

1. **Automated Method** (Recommended):
   ```powershell
   cd automation
   # Create .env file with your credentials
   @"
   NEW_RELIC_EMAIL=your-email@example.com
   NEW_RELIC_PASSWORD=your-password
   "@ | Out-File -FilePath .env -Encoding utf8
   
   # Run key creation
   node src/examples/create-api-keys.js
   ```

2. **Manual Method**:
   - Go to https://one.newrelic.com/api-keys
   - Click "Create key"
   - Select "User" key type
   - Name it "NRDOT-v2"
   - Copy the key

### Step 4: Configure Environment

Create `scripts\.env` file:

```powershell
cd scripts
@"
# New Relic Configuration
NEW_RELIC_API_KEY=YOUR_API_KEY_HERE
NEW_RELIC_ACCOUNT_ID=YOUR_ACCOUNT_ID_HERE
NEW_RELIC_REGION=US

# NRDOT v2 Settings
NRDOT_PROFILE=Conservative
NRDOT_TARGET_COVERAGE=95
NRDOT_COST_REDUCTION_TARGET=40
"@ | Out-File -FilePath .env -Encoding utf8
```

### Step 5: Create Sample Dashboard

```powershell
# Create and upload dashboard
node src/cli.js dashboard create --file ../examples/nrdot-process-dashboard.json
```

## 🎯 Using NRDOT v2

### Start Monitoring Services

```powershell
# From DashBuilder directory
.\Start-NRDOT.ps1
```

### Common Commands

```powershell
# List all dashboards
cd scripts
node src/cli.js dashboard list

# Validate NRQL query
node src/cli.js nrql validate "SELECT count(*) FROM ProcessSample"

# Check process coverage
node src/cli.js entity get-process-coverage --target-coverage 95

# Analyze costs
node src/cli.js ingest analyze-process-costs --since "7 days ago"

# Generate optimized dashboard
node src/cli.js dashboard generate-process-dashboard --profile Conservative
```

### Process Intelligence Commands

```powershell
# Discover process patterns
node src/cli.js schema get-process-intelligence --since "1 day ago"

# Find high-cost processes
node src/cli.js ingest find-high-volume-processes --threshold 100000

# Optimize sampling rates
node src/cli.js ingest optimize-sampling-rates --target-cost-reduction 40
```

## 📊 Viewing Your Dashboards

1. Go to https://one.newrelic.com/dashboards
2. Look for "NRDOT v2 - Windows Process Monitoring"
3. The dashboard will show:
   - Process counts by category
   - CPU usage trends
   - Memory usage patterns
   - Process health scores

## 🔧 Configuration

### Monitoring Profiles

Edit `scripts\.env` to change monitoring profile:

```env
NRDOT_PROFILE=Conservative  # Lowest cost, 15 widgets max
NRDOT_PROFILE=Moderate     # Balanced, 25 widgets max
NRDOT_PROFILE=Aggressive   # Performance focus, 35 widgets max
NRDOT_PROFILE=Critical     # High priority, 50 widgets max
NRDOT_PROFILE=Emergency    # Incident mode, 100 widgets max
```

### Process Importance Scoring

Edit `configs\collector-config-windows.yaml` to customize:

```yaml
processors:
  attributes/classify:
    actions:
      - key: importance_score
        value: |
          Switch(
            Case(Contains(process.name, "your-critical-app"), 0.95),
            Case(Contains(process.name, "database"), 0.90),
            # Add your custom rules here
          )
```

## 🚨 Troubleshooting

### API Key Issues

```powershell
# Test API connection
cd scripts
node src/cli.js nrql query "SELECT 1"
```

### No Process Data

1. Check if Windows Performance Counters are enabled:
   ```powershell
   Get-Counter -ListSet "Process"
   ```

2. Verify account ID in `.env` file

3. Check collector logs:
   ```powershell
   cd monitoring
   Get-Content collector.log -Tail 50
   ```

### Browser Automation Fails

1. Ensure Chrome is installed
2. Disable headless mode in `automation\.env`:
   ```env
   HEADLESS=false
   ```
3. Complete MFA manually when browser opens

## 📈 Next Steps

1. **Customize Process Filters**: Add your application-specific patterns
2. **Set Up Alerts**: Configure alerts for process anomalies
3. **Schedule Reports**: Use Task Scheduler for daily reports
4. **Enable Experiments**: Test optimization strategies

## 🆘 Getting Help

- Check logs in `logs/` directory
- Run diagnostics: `node src/cli.js diagnose`
- GitHub Issues: https://github.com/deepaucksharma/DashBuilder/issues

---

**Happy Monitoring with NRDOT v2! 🎉**

*Achieving 95% critical process coverage with 40% cost reduction*