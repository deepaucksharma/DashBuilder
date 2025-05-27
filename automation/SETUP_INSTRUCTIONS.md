# New Relic Automation Setup Instructions

## Prerequisites

You need to install Chrome/Chromium dependencies first:

### For Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libasound2
```

### For WSL (Windows Subsystem for Linux):
Since you're on WSL, you might want to use Windows Chrome instead. Alternative approach:

1. **Option 1: Install Chrome in WSL** (may have display issues)
   ```bash
   # Install dependencies as above
   # Then install Chrome
   wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
   sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
   sudo apt-get update
   sudo apt-get install google-chrome-stable
   ```

2. **Option 2: Manual Browser Setup** (Recommended for WSL)
   - Open your browser manually on Windows
   - Navigate to: https://login.newrelic.com/login
   - Sign in with Google
   - Once logged in, navigate to the API Keys page: https://one.newrelic.com/api-keys

## Manual Steps for NRDOT Setup

### 1. Create API Keys
1. Go to: https://one.newrelic.com/api-keys
2. Click "Create key"
3. Create a **User API Key** with these permissions:
   - Name: `NRDOT-Plus Admin`
   - Account: Your account
   - Key type: `User`
   - Copy and save the key

### 2. Get Your Account ID
1. In New Relic One, click on your name in the top right
2. Select "API keys" or "Administration"
3. Your Account ID is displayed at the top
4. Copy this number

### 3. Update Environment Files

#### For NRDOT scripts (/home/deepak/DashBuilder/scripts/.env):
```env
NEW_RELIC_API_KEY=<your-user-api-key>
NEW_RELIC_ACCOUNT_ID=<your-account-id>
NEW_RELIC_REGION=US  # or EU
```

#### For general NRDOT (/home/deepak/DashBuilder/.env):
```env
NEW_RELIC_LICENSE_KEY=<your-license-key>
NEW_RELIC_ACCOUNT_ID=<your-account-id>
NEW_RELIC_API_KEY=<your-user-api-key>
```

### 4. Test Your Setup
```bash
# Test the CLI tools
cd /home/deepak/DashBuilder/scripts
npm run cli -- schema list-event-types

# Should return a list of event types if configured correctly
```

## Alternative: Use API to Create Keys

If you already have one API key, you can use it to create more:

```bash
cd /home/deepak/DashBuilder/scripts
npm run cli -- entity search "name LIKE '%'" --limit 1
```

This will validate your API connection is working.

## Next Steps

Once you have your API keys set up:

1. **Deploy NRDOT Dashboard**:
   ```bash
   cd /home/deepak/DashBuilder
   npm run workflow:create-dashboard
   ```

2. **Run NRDOT Analysis**:
   ```bash
   cd /home/deepak/DashBuilder/scripts
   npm run cli -- schema get-process-intelligence
   ```

3. **Check Process Coverage**:
   ```bash
   npm run cli -- entity get-process-coverage --entity-type HOST
   ```

## Troubleshooting

### WSL Display Issues
If running GUI apps in WSL:
1. Install X server on Windows (VcXsrv or X410)
2. Set display variable: `export DISPLAY=:0`
3. Or use headless mode with screenshots

### Permission Issues
Make sure your API key has the right permissions:
- NerdGraph access
- Read access to your accounts
- Entity read permissions

### Connection Issues
- Check your firewall allows outbound HTTPS
- Verify proxy settings if behind corporate network
- Test with: `curl https://api.newrelic.com/v2/applications.json`