import { launchBrowser } from '../config/browser.js';
import { LoginPage } from '../pages/LoginPage.js';
import { ApiKeysPage } from '../pages/ApiKeysPage.js';
import { promptForCredentials, confirmAction } from '../utils/prompts.js';
import { saveCredentials, formatDuration } from '../utils/helpers.js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

async function createEnvKeys() {
  console.log(chalk.blue.bold('\n🚀 DashBuilder API Key Creation & .env Setup\n'));
  console.log(chalk.gray('This will:\n'));
  console.log('  1. Log in to your New Relic account');
  console.log('  2. Create API keys (User & Ingest)');
  console.log('  3. Update .env files automatically\n');
  
  const startTime = Date.now();
  let browser;
  
  try {
    const confirmed = await confirmAction('Start the API key creation process?');
    if (!confirmed) {
      console.log(chalk.yellow('\n⚠️  Setup cancelled'));
      process.exit(0);
    }
    
    console.log(chalk.cyan('\n📝 Step 1: Getting credentials\n'));
    const credentials = await promptForCredentials();
    
    console.log(chalk.cyan('\n🌐 Launching browser...\n'));
    browser = await launchBrowser();
    const page = await browser.newPage();
    
    console.log(chalk.cyan('\n🔐 Step 2: Logging in to New Relic\n'));
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    await loginPage.login(credentials.email, credentials.password);
    
    console.log(chalk.cyan('\n🔑 Step 3: Creating API keys\n'));
    const apiKeysPage = new ApiKeysPage(page);
    await apiKeysPage.navigate();
    
    const userKey = await apiKeysPage.createApiKey('DashBuilder-UserKey', 'USER');
    const ingestKey = await apiKeysPage.createApiKey('DashBuilder-IngestKey', 'INGEST');
    
    // Save to config for reference
    await saveCredentials({
      email: credentials.email,
      apiKeys: {
        user: userKey.value,
        ingest: ingestKey.value,
        accountId: userKey.accountId
      }
    }, 'dashbuilder-keys.json');
    
    console.log(chalk.cyan('\n⚙️  Step 4: Updating .env files\n'));
    
    // Update root .env
    const rootEnvContent = `# New Relic Configuration
NEW_RELIC_API_KEY=${userKey.value}
NEW_RELIC_ACCOUNT_ID=${userKey.accountId || 'YOUR_ACCOUNT_ID'}
NEW_RELIC_LICENSE_KEY=${ingestKey.value}
NEW_RELIC_REGION=US

# NRDOT Configuration
NRDOT_PROFILE=balanced
NRDOT_TARGET_SERIES=5000
NRDOT_MAX_SERIES=10000
NRDOT_MIN_COVERAGE=0.95
NRDOT_MAX_COST_HOUR=0.10

# Environment
NODE_ENV=production`;
    
    const rootEnvPath = path.join(process.cwd(), '../../.env');
    await fs.writeFile(rootEnvPath, rootEnvContent);
    console.log(chalk.green(`✅ Updated ${rootEnvPath}`));
    
    // Update scripts/.env
    const scriptsEnvContent = `NEW_RELIC_API_KEY=${userKey.value}
NEW_RELIC_ACCOUNT_ID=${userKey.accountId || 'YOUR_ACCOUNT_ID'}
NEW_RELIC_REGION=US`;
    
    const scriptsDir = path.join(process.cwd(), '../../scripts');
    await fs.mkdir(scriptsDir, { recursive: true });
    const scriptsEnvPath = path.join(scriptsDir, '.env');
    await fs.writeFile(scriptsEnvPath, scriptsEnvContent);
    console.log(chalk.green(`✅ Updated ${scriptsEnvPath}`));
    
    const duration = formatDuration(Date.now() - startTime);
    
    console.log(chalk.green.bold('\n✨ Setup Complete!\n'));
    console.log(chalk.white('Results:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`User API Key: ${chalk.cyan(userKey.value.substring(0, 10) + '...')}`);
    console.log(`Ingest Key: ${chalk.cyan(ingestKey.value.substring(0, 10) + '...')}`);
    console.log(`Account ID: ${chalk.cyan(userKey.accountId || 'To be set manually')}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`\n${chalk.green('✅')} .env files have been updated`);
    console.log(`${chalk.green('✅')} Keys saved to automation/config/dashbuilder-keys.json`);
    console.log(`\nTotal time: ${chalk.cyan(duration)}`);
    
    console.log(chalk.yellow('\n⚠️  Next Steps:'));
    console.log('1. If Account ID was not detected, update it in .env files');
    console.log('2. Test the connection: npm run test:connection');
    console.log('3. Start using DashBuilder CLI commands!');
    
  } catch (error) {
    console.error(chalk.red('\n❌ Setup failed:'), error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createEnvKeys();
}

export { createEnvKeys };