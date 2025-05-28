# How to Get Your New Relic License Key

## The Issue
Your current license key in `.env` is a placeholder:
```
46cb357917adfc2dffad66c887659fe4FFFFNRAL
                                    ^^^^
```

The "FFFF" indicates this is not a real license key.

## Get Your Real License Key

1. **Log into New Relic**:
   - US: https://one.newrelic.com
   - EU: https://one.eu.newrelic.com

2. **Navigate to API Keys**:
   - Click on your username in the bottom left
   - Select "Administration"
   - Go to "API keys"
   - OR direct link: https://one.newrelic.com/admin-portal/api-keys/home

3. **Find Your License Key**:
   - Look for "INGEST - LICENSE" key type
   - It should be 40 characters + "NRAL" at the end
   - Example format: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0NRAL`

4. **Update Your .env File**:
   ```bash
   # Edit the .env file
   nano .env
   
   # Replace this line:
   NEW_RELIC_LICENSE_KEY=46cb357917adfc2dffad66c887659fe4FFFFNRAL
   
   # With your actual key:
   NEW_RELIC_LICENSE_KEY=your_actual_40_character_key_NRAL
   ```

5. **For EU Region Users**:
   If your New Relic account is in the EU region, also add:
   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.eu01.nr-data.net
   ```

## Quick Test After Updating

```bash
# Reload environment
source ./load-env.sh

# Test the key
./troubleshoot-newrelic.sh

# If successful, deploy 5 VMs
./fix-nrdot-deployment.sh
```

## Security Note
- Never commit your real license key to git
- The `.gitignore` file is already configured to exclude `.env`
- Keep your license key secure