# DashBuilder Browser Automation

Automated browser tools for New Relic dashboard management, API key creation, and verification.

## Features

- 🔐 **Automated Login** - Handles New Relic authentication including MFA
- 🔑 **API Key Management** - Create and manage API keys programmatically  
- 📊 **Dashboard Verification** - Verify dashboard widgets and configurations
- 📸 **Screenshot Capture** - Automatic screenshots for documentation
- 📋 **Clipboard Integration** - Copy API keys directly to clipboard
- 🔄 **Full Setup Automation** - Complete end-to-end setup process

## Installation

```bash
cd automation
npm install
cp .env.example .env
# Edit .env with your credentials
```

## Usage

### Create API Keys

```bash
npm run create-keys
```

Interactive prompts will guide you through:
- Login credentials
- API key configuration (name, type, account)
- Automatic key creation and clipboard copy

### Verify Dashboard

```bash
npm run verify-dashboard
```

Features:
- Search and open dashboards
- Verify widget count and types
- Get public dashboard URLs
- Export dashboard JSON
- Take screenshots

### Full Setup (End-to-End)

```bash
npm run full-setup
```

Automates the complete setup:
1. Creates New Relic API keys
2. Configures DashBuilder CLI
3. Creates sample dashboards
4. Verifies dashboard creation

## Project Structure

```
automation/
├── src/
│   ├── config/          # Browser configuration
│   ├── pages/           # Page Object Models
│   │   ├── LoginPage.js
│   │   ├── ApiKeysPage.js
│   │   └── DashboardPage.js
│   ├── utils/           # Helper utilities
│   │   ├── helpers.js   # Common functions
│   │   └── prompts.js   # Interactive prompts
│   └── examples/        # Example scripts
│       ├── create-api-keys.js
│       ├── verify-dashboard.js
│       └── full-setup.js
├── screenshots/         # Captured screenshots
├── config/             # Saved credentials
├── reports/            # Verification reports
└── exports/            # Dashboard exports
```

## Environment Variables

```bash
# New Relic credentials
NEW_RELIC_EMAIL=your-email@example.com
NEW_RELIC_PASSWORD=your-password

# URLs
NEW_RELIC_LOGIN_URL=https://login.newrelic.com/login
NEW_RELIC_API_KEYS_URL=https://one.newrelic.com/api-keys
NEW_RELIC_DASHBOARDS_URL=https://one.newrelic.com/dashboards

# Browser settings
HEADLESS=false          # Set to true for headless mode
TIMEOUT=30000          # Default timeout in ms
SCREENSHOT_DIR=./screenshots
```

## Security Notes

- Credentials are stored locally and never transmitted
- Use `.env` files for sensitive data (gitignored)
- API keys are automatically copied to clipboard
- Screenshots may contain sensitive information

## Troubleshooting

### Login Issues
- Ensure correct email/password in .env
- Handle MFA manually when prompted
- Check for account access permissions

### Browser Issues
- Install Chrome/Chromium if not present
- Increase timeout for slow connections
- Use headless=false to debug visually

### API Key Creation
- Verify account permissions
- Check if key name already exists
- Ensure proper account selection

## Examples

### Programmatic Usage

```javascript
import { launchBrowser } from './src/config/browser.js';
import { LoginPage } from './src/pages/LoginPage.js';
import { ApiKeysPage } from './src/pages/ApiKeysPage.js';

async function createKey() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login();
  
  const apiKeysPage = new ApiKeysPage(page);
  await apiKeysPage.navigate();
  const key = await apiKeysPage.createApiKey('MyKey', 'USER');
  
  console.log('Created key:', key.value);
  await browser.close();
}
```

### Custom Verification

```javascript
import { DashboardPage } from './src/pages/DashboardPage.js';

async function verifyCustomDashboard(page, dashboardName) {
  const dashboardPage = new DashboardPage(page);
  await dashboardPage.navigate();
  await dashboardPage.openDashboard(dashboardName);
  
  const widgets = await dashboardPage.verifyWidgets([
    'CPU Usage',
    'Memory Usage',
    'Error Rate'
  ]);
  
  return widgets;
}
```