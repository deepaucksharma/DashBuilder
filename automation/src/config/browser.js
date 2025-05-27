import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

dotenv.config();

puppeteer.use(StealthPlugin());

export const browserConfig = {
  headless: process.env.HEADLESS === 'true',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--window-size=1920,1080'
  ],
  defaultViewport: {
    width: 1920,
    height: 1080
  },
  timeout: parseInt(process.env.TIMEOUT) || 30000
};

export async function launchBrowser() {
  return await puppeteer.launch(browserConfig);
}

export const selectors = {
  login: {
    emailInput: 'input[name="login[email]"]',
    passwordInput: 'input[name="login[password]"]',
    submitButton: 'button[type="submit"]',
    mfaInput: 'input[name="mfa_code"]'
  },
  apiKeys: {
    createButton: 'button:has-text("Create key")',
    keyTypeSelect: 'select[name="key_type"]',
    keyNameInput: 'input[name="key_name"]',
    accountSelect: 'select[name="account_id"]',
    generateButton: 'button:has-text("Generate key")',
    copyButton: 'button[aria-label="Copy"]',
    keyValue: '[data-testid="api-key-value"]'
  },
  dashboard: {
    searchInput: 'input[placeholder*="Search"]',
    dashboardTile: '[data-testid="dashboard-tile"]',
    widgetContainer: '[data-testid="widget-container"]',
    shareButton: 'button:has-text("Share")',
    publicUrlToggle: 'input[name="public_url"]'
  }
};