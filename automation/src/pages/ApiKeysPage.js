import { selectors } from '../config/browser.js';
import { waitAndClick, waitAndType, takeScreenshot, copyToClipboard } from '../utils/helpers.js';
import chalk from 'chalk';

export class ApiKeysPage {
  constructor(page) {
    this.page = page;
    this.apiKeysUrl = process.env.NEW_RELIC_API_KEYS_URL;
  }

  async navigate() {
    await this.page.goto(this.apiKeysUrl, { waitUntil: 'networkidle2' });
    await takeScreenshot(this.page, 'api-keys-page');
  }

  async createApiKey(keyName, keyType = 'USER', accountId = null) {
    console.log(`🔑 Creating ${keyType} API key: ${keyName}`);
    
    await waitAndClick(this.page, selectors.apiKeys.createButton);
    await this.page.waitForTimeout(1000);
    
    if (keyType) {
      await this.page.select(selectors.apiKeys.keyTypeSelect, keyType);
    }
    
    await waitAndType(this.page, selectors.apiKeys.keyNameInput, keyName);
    
    if (accountId) {
      await this.page.select(selectors.apiKeys.accountSelect, accountId);
    }
    
    await takeScreenshot(this.page, 'api-key-form');
    await waitAndClick(this.page, selectors.apiKeys.generateButton);
    
    await this.page.waitForSelector(selectors.apiKeys.keyValue, { timeout: 10000 });
    const keyValue = await this.page.$eval(selectors.apiKeys.keyValue, el => el.textContent);
    
    await copyToClipboard(keyValue);
    console.log(chalk.green(`✅ API Key created and copied to clipboard!`));
    console.log(chalk.yellow(`Key: ${keyValue.substring(0, 10)}...`));
    
    await takeScreenshot(this.page, 'api-key-created');
    
    return {
      name: keyName,
      type: keyType,
      value: keyValue,
      accountId
    };
  }

  async getExistingKeys() {
    const keys = await this.page.$$eval('[data-testid="api-key-row"]', rows => {
      return rows.map(row => ({
        name: row.querySelector('[data-testid="key-name"]')?.textContent,
        type: row.querySelector('[data-testid="key-type"]')?.textContent,
        created: row.querySelector('[data-testid="key-created"]')?.textContent,
        lastUsed: row.querySelector('[data-testid="key-last-used"]')?.textContent
      }));
    });
    
    return keys;
  }

  async deleteKey(keyName) {
    const deleteButton = await this.page.$(`[data-testid="api-key-row"]:has-text("${keyName}") button[aria-label="Delete"]`);
    if (deleteButton) {
      await deleteButton.click();
      await this.page.waitForTimeout(500);
      
      const confirmButton = await this.page.$('button:has-text("Confirm")');
      if (confirmButton) {
        await confirmButton.click();
        console.log(chalk.red(`🗑️  Deleted key: ${keyName}`));
      }
    }
  }
}