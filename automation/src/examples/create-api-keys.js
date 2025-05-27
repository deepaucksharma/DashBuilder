import { launchBrowser } from '../config/browser.js';
import { LoginPage } from '../pages/LoginPage.js';
import { ApiKeysPage } from '../pages/ApiKeysPage.js';
import { promptForCredentials, promptForApiKeyDetails } from '../utils/prompts.js';
import { saveCredentials, loadCredentials } from '../utils/helpers.js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

async function createApiKeys() {
  console.log(chalk.blue.bold('\n🚀 New Relic API Key Creator\n'));
  
  let browser;
  
  try {
    let credentials = await loadCredentials();
    
    if (!credentials) {
      credentials = await promptForCredentials();
      if (credentials.saveCredentials) {
        await saveCredentials({
          email: credentials.email,
          password: credentials.password
        });
      }
    }
    
    const keyDetails = await promptForApiKeyDetails();
    
    console.log(chalk.cyan('\n🌐 Launching browser...\n'));
    browser = await launchBrowser();
    const page = await browser.newPage();
    
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    await loginPage.login(credentials.email, credentials.password);
    
    const apiKeysPage = new ApiKeysPage(page);
    await apiKeysPage.navigate();
    
    console.log(chalk.cyan('\n📋 Existing API Keys:\n'));
    const existingKeys = await apiKeysPage.getExistingKeys();
    existingKeys.forEach(key => {
      console.log(`  - ${key.name} (${key.type}) - Created: ${key.created}`);
    });
    
    const apiKey = await apiKeysPage.createApiKey(
      keyDetails.keyName,
      keyDetails.keyType,
      keyDetails.accountId
    );
    
    console.log(chalk.green.bold('\n✨ API Key Created Successfully!\n'));
    console.log(chalk.white('Key Details:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Name: ${chalk.cyan(apiKey.name)}`);
    console.log(`Type: ${chalk.cyan(apiKey.type)}`);
    console.log(`Value: ${chalk.yellow(apiKey.value)}`);
    if (apiKey.accountId) {
      console.log(`Account: ${chalk.cyan(apiKey.accountId)}`);
    }
    console.log(chalk.gray('─'.repeat(50)));
    
    await saveCredentials({
      ...credentials,
      apiKeys: {
        [apiKey.type.toLowerCase()]: apiKey.value
      }
    }, 'api-keys.json');
    
    console.log(chalk.green('\n✅ API key has been copied to your clipboard!'));
    console.log(chalk.gray('You can now use it in your applications.\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error creating API key:'), error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createApiKeys();
}

export { createApiKeys };