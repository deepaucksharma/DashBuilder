import { selectors } from '../config/browser.js';
import { waitAndClick, waitAndType, takeScreenshot } from '../utils/helpers.js';

export class LoginPage {
  constructor(page) {
    this.page = page;
    this.loginUrl = process.env.NEW_RELIC_LOGIN_URL;
  }

  async navigate() {
    await this.page.goto(this.loginUrl, { waitUntil: 'networkidle2' });
    await takeScreenshot(this.page, 'login-page');
  }

  async login(email = process.env.NEW_RELIC_EMAIL, password = process.env.NEW_RELIC_PASSWORD) {
    console.log('🔐 Logging in to New Relic...');
    
    await this.page.waitForSelector(selectors.login.emailInput);
    await waitAndType(this.page, selectors.login.emailInput, email);
    
    await waitAndType(this.page, selectors.login.passwordInput, password);
    await takeScreenshot(this.page, 'login-filled');
    
    await waitAndClick(this.page, selectors.login.submitButton);
    
    try {
      await this.page.waitForNavigation({ 
        waitUntil: 'networkidle2',
        timeout: 10000 
      });
    } catch (e) {
      console.log('⚠️  Navigation timeout - checking for MFA...');
    }
    
    const mfaRequired = await this.page.$(selectors.login.mfaInput).catch(() => null);
    if (mfaRequired) {
      console.log('📱 MFA required - please enter code manually');
      await this.page.waitForNavigation({ 
        waitUntil: 'networkidle2',
        timeout: 60000 
      });
    }
    
    const loggedIn = await this.page.url().includes('one.newrelic.com');
    if (loggedIn) {
      console.log('✅ Successfully logged in!');
      await takeScreenshot(this.page, 'login-success');
      return true;
    }
    
    throw new Error('Login failed');
  }
}