# NRDOT v2 Windows Setup Script
# This script sets up NRDOT v2 on Windows with all dependencies

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "NRDOT v2 Windows Installation Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator"))
{
    Write-Host "This script requires Administrator privileges. Please run as Administrator." -ForegroundColor Red
    Exit 1
}

# Function to check if a command exists
function Test-Command {
    param($Command)
    try {
        if (Get-Command $Command -ErrorAction Stop) {
            return $true
        }
    } catch {
        return $false
    }
}

Write-Host "`n[1/8] Checking Prerequisites..." -ForegroundColor Yellow

# Check for Node.js
if (Test-Command "node") {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found. Installing via Chocolatey..." -ForegroundColor Red
    
    # Install Chocolatey if not present
    if (!(Test-Command "choco")) {
        Write-Host "Installing Chocolatey..." -ForegroundColor Yellow
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    }
    
    # Install Node.js
    choco install nodejs -y
    refreshenv
}

# Check for Git
if (Test-Command "git") {
    $gitVersion = git --version
    Write-Host "✓ Git found: $gitVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Git not found. Installing..." -ForegroundColor Red
    choco install git -y
    refreshenv
}

# Check for Chrome (for browser automation)
if (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe") {
    Write-Host "✓ Chrome found" -ForegroundColor Green
} else {
    Write-Host "✗ Chrome not found. Installing..." -ForegroundColor Red
    choco install googlechrome -y
}

Write-Host "`n[2/8] Setting up project directories..." -ForegroundColor Yellow

# Create project structure
$projectPath = "$env:USERPROFILE\DashBuilder"
if (!(Test-Path $projectPath)) {
    New-Item -ItemType Directory -Path $projectPath -Force | Out-Null
}

Set-Location $projectPath

# Clone or update repository
if (Test-Path ".git") {
    Write-Host "Updating existing repository..." -ForegroundColor Yellow
    git pull origin main
} else {
    Write-Host "Cloning repository..." -ForegroundColor Yellow
    git clone https://github.com/deepaucksharma/DashBuilder.git .
}

Write-Host "`n[3/8] Installing dependencies..." -ForegroundColor Yellow

# Install main dependencies
Write-Host "Installing main dependencies..." -ForegroundColor Yellow
npm install

# Install CLI dependencies
Write-Host "Installing CLI dependencies..." -ForegroundColor Yellow
Set-Location scripts
npm install
Set-Location ..

# Install automation dependencies
Write-Host "Installing automation dependencies..." -ForegroundColor Yellow
Set-Location automation
npm install
Set-Location ..

Write-Host "`n[4/8] Setting up New Relic credentials..." -ForegroundColor Yellow

# Check if .env exists
$envPath = "scripts\.env"
if (Test-Path $envPath) {
    Write-Host "✓ .env file found" -ForegroundColor Green
    $useExisting = Read-Host "Use existing credentials? (Y/N)"
    if ($useExisting -ne "Y") {
        $setupNewCreds = $true
    }
} else {
    $setupNewCreds = $true
}

if ($setupNewCreds) {
    Write-Host "`nPlease provide your New Relic credentials:" -ForegroundColor Cyan
    
    $nrEmail = Read-Host "New Relic Email"
    $nrPassword = Read-Host "New Relic Password" -AsSecureString
    $nrAccountId = Read-Host "New Relic Account ID"
    $nrRegion = Read-Host "New Relic Region (US/EU) [default: US]"
    
    if ([string]::IsNullOrWhiteSpace($nrRegion)) {
        $nrRegion = "US"
    }
    
    # Convert secure string to plain text
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($nrPassword)
    $nrPasswordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    
    Write-Host "`n[5/8] Creating API keys automatically..." -ForegroundColor Yellow
    
    # Create temporary env for automation
    $automationEnv = @"
NEW_RELIC_EMAIL=$nrEmail
NEW_RELIC_PASSWORD=$nrPasswordPlain
NEW_RELIC_LOGIN_URL=https://login.newrelic.com/login
NEW_RELIC_API_KEYS_URL=https://one.newrelic.com/api-keys
NEW_RELIC_DASHBOARDS_URL=https://one.newrelic.com/dashboards
HEADLESS=false
TIMEOUT=30000
SCREENSHOT_DIR=./screenshots
"@
    
    Set-Content -Path "automation\.env" -Value $automationEnv
    
    Write-Host "Launching browser to create API keys..." -ForegroundColor Yellow
    Write-Host "Please complete any MFA requirements in the browser window..." -ForegroundColor Cyan
    
    Set-Location automation
    $keyCreationOutput = node src/examples/create-api-keys.js
    
    # Extract API key from output
    $apiKeyMatch = $keyCreationOutput | Select-String -Pattern "Value: ([A-Za-z0-9-]+)"
    if ($apiKeyMatch) {
        $apiKey = $apiKeyMatch.Matches[0].Groups[1].Value
        Write-Host "✓ API Key created successfully!" -ForegroundColor Green
    } else {
        Write-Host "Could not automatically create API key. Please create one manually." -ForegroundColor Yellow
        $apiKey = Read-Host "Enter your New Relic User API Key"
    }
    
    Set-Location ..
    
    # Create .env files
    $scriptsEnv = @"
# New Relic Configuration
NEW_RELIC_API_KEY=$apiKey
NEW_RELIC_ACCOUNT_ID=$nrAccountId
NEW_RELIC_REGION=$nrRegion
NEW_RELIC_INGEST_KEY=

# NRDOT v2 Settings
NRDOT_PROFILE=Conservative
NRDOT_TARGET_COVERAGE=95
NRDOT_COST_REDUCTION_TARGET=40
"@
    
    Set-Content -Path "scripts\.env" -Value $scriptsEnv
    Write-Host "✓ Created scripts/.env" -ForegroundColor Green
}

Write-Host "`n[6/8] Setting up monitoring configuration..." -ForegroundColor Yellow

# Create monitoring directory
New-Item -ItemType Directory -Path "monitoring" -Force | Out-Null

# Create collector config
$collectorConfig = @"
# Windows-specific NRDOT v2 Collector Configuration
extensions:
  health_check:
    endpoint: 0.0.0.0:13133
    path: "/health"

receivers:
  windowsperfcounters:
    collection_interval: 60s
    perfcounters:
      - object: "Process"
        instances: ["*"]
        counters:
          - name: "% Processor Time"
          - name: "Private Bytes"
          - name: "Working Set"
          - name: "IO Read Bytes/sec"
          - name: "IO Write Bytes/sec"

processors:
  memory_limiter:
    check_interval: 100ms
    limit_percentage: 75
    spike_limit_percentage: 25
  
  attributes/classify:
    actions:
      - key: importance_score
        action: upsert
        value: |
          Switch(
            Case(Contains(process.name, "sqlservr"), 0.95),
            Case(Contains(process.name, "w3wp"), 0.85),
            Case(Contains(process.name, "java"), 0.80),
            Case(Contains(process.name, "node"), 0.75),
            Case(Contains(process.name, "chrome"), 0.30),
            Default(0.40)
          )

exporters:
  otlp/newrelic:
    endpoint: https://otlp.nr-data.net:4317
    headers:
      api-key: ${env:NEW_RELIC_API_KEY}

service:
  pipelines:
    metrics:
      receivers: [windowsperfcounters]
      processors: [memory_limiter, attributes/classify]
      exporters: [otlp/newrelic]
"@

Set-Content -Path "configs\collector-config-windows.yaml" -Value $collectorConfig

Write-Host "`n[7/8] Creating sample dashboards..." -ForegroundColor Yellow

# Create sample dashboard
Set-Location scripts

$dashboardCreation = @"
const dashboard = {
  name: 'NRDOT v2 - Windows Process Monitoring',
  description: 'Automated process monitoring dashboard for Windows with NRDOT v2',
  permissions: 'PUBLIC_READ_WRITE',
  pages: [{
    name: 'Process Overview',
    description: 'Windows process metrics with cost optimization',
    widgets: [
      {
        title: 'Process Count by Category',
        configuration: {
          bar: {
            queries: [{
              accountId: $nrAccountId,
              query: "SELECT count(*) FROM ProcessSample FACET processDisplayName WHERE hostname LIKE '%' LIMIT 20"
            }]
          }
        },
        layout: { column: 1, row: 1, width: 6, height: 3 }
      },
      {
        title: 'CPU Usage by Process',
        configuration: {
          line: {
            queries: [{
              accountId: $nrAccountId,
              query: "SELECT average(cpuPercent) FROM ProcessSample FACET processDisplayName TIMESERIES AUTO"
            }]
          }
        },
        layout: { column: 7, row: 1, width: 6, height: 3 }
      },
      {
        title: 'Memory Usage by Process',
        configuration: {
          area: {
            queries: [{
              accountId: $nrAccountId,
              query: "SELECT average(memoryUsedBytes/1024/1024) as 'Memory MB' FROM ProcessSample FACET processDisplayName TIMESERIES AUTO"
            }]
          }
        },
        layout: { column: 1, row: 4, width: 6, height: 3 }
      },
      {
        title: 'Process Health Score',
        configuration: {
          billboard: {
            queries: [{
              accountId: $nrAccountId,
              query: "SELECT average(cpuPercent) as 'Avg CPU %', average(memoryUsedBytes/1024/1024) as 'Avg Memory MB', uniqueCount(processDisplayName) as 'Process Count' FROM ProcessSample"
            }]
          }
        },
        layout: { column: 7, row: 4, width: 6, height: 3 }
      }
    ]
  }]
};

console.log(JSON.stringify(dashboard, null, 2));
"@

$dashboardJson = node -e $dashboardCreation > sample-dashboard.json

Write-Host "Creating dashboard in New Relic..." -ForegroundColor Yellow
node src/cli.js dashboard create --file sample-dashboard.json

Set-Location ..

Write-Host "`n[8/8] Final setup and verification..." -ForegroundColor Yellow

# Create startup script
$startupScript = @"
@echo off
echo Starting NRDOT v2 Services...
echo.

echo [1/3] Starting State Manager...
cd %USERPROFILE%\DashBuilder
start /B node orchestrator\monitor.js

echo [2/3] Starting Dashboard Monitoring...
cd scripts
start /B node src\cli.js dashboard list --watch

echo [3/3] Opening New Relic Dashboard...
start https://one.newrelic.com/dashboards

echo.
echo NRDOT v2 is running!
echo Press Ctrl+C to stop all services.
pause
"@

Set-Content -Path "start-nrdot.bat" -Value $startupScript

# Create PowerShell startup script
$psStartupScript = @"
Write-Host "Starting NRDOT v2 Services..." -ForegroundColor Cyan

# Start monitoring
Write-Host "[1/3] Starting State Manager..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectPath'; node orchestrator/monitor.js" -WindowStyle Minimized

# Start dashboard monitoring  
Write-Host "[2/3] Starting Dashboard Monitoring..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectPath\scripts'; node src/cli.js dashboard list --watch" -WindowStyle Minimized

# Open browser
Write-Host "[3/3] Opening New Relic Dashboard..." -ForegroundColor Yellow
Start-Process "https://one.newrelic.com/dashboards"

Write-Host "`nNRDOT v2 is running!" -ForegroundColor Green
Write-Host "Check the minimized windows for service status." -ForegroundColor Gray
"@

Set-Content -Path "Start-NRDOT.ps1" -Value $psStartupScript

# Final verification
Write-Host "`n=====================================" -ForegroundColor Green
Write-Host "✓ NRDOT v2 Installation Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

Write-Host "`nInstallation Summary:" -ForegroundColor Cyan
Write-Host "- Project Location: $projectPath" -ForegroundColor White
Write-Host "- API Key: Configured in scripts\.env" -ForegroundColor White
Write-Host "- Sample Dashboard: Created in New Relic" -ForegroundColor White
Write-Host "- Monitoring Profile: Conservative (default)" -ForegroundColor White

Write-Host "`nQuick Start Commands:" -ForegroundColor Cyan
Write-Host "1. Start NRDOT: .\Start-NRDOT.ps1" -ForegroundColor White
Write-Host "2. List dashboards: cd scripts && npm run cli dashboard list" -ForegroundColor White
Write-Host "3. Validate NRQL: cd scripts && npm run cli nrql validate `"<query>`"" -ForegroundColor White
Write-Host "4. Check costs: cd scripts && npm run cli ingest costs" -ForegroundColor White

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Review the created dashboard in New Relic" -ForegroundColor White
Write-Host "2. Customize process importance scores in configs\collector-config-windows.yaml" -ForegroundColor White
Write-Host "3. Set up Windows Task Scheduler for automatic startup" -ForegroundColor White
Write-Host "4. Configure alerts for process anomalies" -ForegroundColor White

# Ask to start services
$startNow = Read-Host "`nStart NRDOT v2 services now? (Y/N)"
if ($startNow -eq "Y") {
    & .\Start-NRDOT.ps1
}