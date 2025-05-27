import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import chalk from 'chalk';
import inquirer from 'inquirer';
import clipboardy from 'clipboardy';

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Load environment variables
dotenv.config();

const config = {
  loginUrl: process.env.NEW_RELIC_LOGIN_URL || 'https://login.newrelic.com/login',
  apiKeysUrl: process.env.NEW_RELIC_API_KEYS_URL || 'https://one.newrelic.com/api-keys',
  dashboardsUrl: process.env.NEW_RELIC_DASHBOARDS_URL || 'https://one.newrelic.com/dashboards',
  headless: false, // Always show browser for Google login
  timeout: parseInt(process.env.TIMEOUT) || 60000, // Increased timeout for manual login
  screenshotDir: process.env.SCREENSHOT_DIR || './screenshots'
};

async function setupNewRelicWithGoogleLogin() {
  console.log(chalk.blue('🚀 Starting New Relic Setup with Google Login\n'));
  
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });

  try {
    const page = await browser.newPage();
    
    // Navigate to New Relic login
    console.log(chalk.blue('📍 Navigating to New Relic login page...'));
    await page.goto(config.loginUrl, { waitUntil: 'networkidle2' });
    
    // Wait for Google login button
    console.log(chalk.yellow('\n🔐 Please click on "Sign in with Google" button'));
    console.log(chalk.yellow('   Then complete the Google authentication process'));
    console.log(chalk.yellow('   The script will continue once you\'re logged in\n'));
    
    // Wait for successful login (detected by URL change or specific element)
    await page.waitForFunction(
      () => {
        return window.location.href.includes('one.newrelic.com') || 
               document.querySelector('[data-test-id="user-menu"]') !== null;
      },
      { timeout: 300000 } // 5 minute timeout for manual login
    );
    
    console.log(chalk.green('✅ Successfully logged in!\n'));
    
    // Ask what to do next
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Create API Keys', value: 'api-keys' },
          { name: 'View Dashboards', value: 'dashboards' },
          { name: 'Full NRDOT Setup', value: 'nrdot-setup' },
          { name: 'Just Browse', value: 'browse' },
          { name: 'Exit', value: 'exit' }
        ]
      }
    ]);
    
    switch (action) {
      case 'api-keys':
        console.log(chalk.blue('\n📝 Navigating to API Keys page...'));
        await page.goto(config.apiKeysUrl, { waitUntil: 'networkidle2' });
        console.log(chalk.green('✅ API Keys page loaded'));
        console.log(chalk.yellow('\nYou can now create API keys manually'));
        console.log(chalk.yellow('The browser will remain open for you to work'));
        break;
        
      case 'dashboards':
        console.log(chalk.blue('\n📊 Navigating to Dashboards...'));
        await page.goto(config.dashboardsUrl, { waitUntil: 'networkidle2' });
        console.log(chalk.green('✅ Dashboards page loaded'));
        break;
        
      case 'nrdot-setup':
        console.log(chalk.blue('\n🎯 Starting NRDOT Setup...'));
        // Navigate to specific NRDOT setup pages
        console.log(chalk.yellow('This would implement full NRDOT setup automation'));
        console.log(chalk.yellow('For now, navigating to API keys for manual setup'));
        await page.goto(config.apiKeysUrl, { waitUntil: 'networkidle2' });
        break;
        
      case 'browse':
        console.log(chalk.green('\n✅ Browser is ready for manual navigation'));
        break;
        
      case 'exit':
        await browser.close();
        return;
    }
    
    // Keep browser open for manual interaction
    console.log(chalk.cyan('\n💡 Browser will remain open for manual interaction'));
    console.log(chalk.cyan('Press Ctrl+C when you\'re done to close the browser'));
    
    // Keep the script running
    await new Promise(() => {});
    
  } catch (error) {
    console.error(chalk.red('❌ Error:', error.message));
    
    // Take screenshot on error
    try {
      const page = (await browser.pages())[0];
      await page.screenshot({ 
        path: `${config.screenshotDir}/error-${Date.now()}.png`,
        fullPage: true 
      });
      console.log(chalk.yellow('📸 Screenshot saved for debugging'));
    } catch (screenshotError) {
      console.error(chalk.red('Failed to take screenshot:', screenshotError.message));
    }
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n👋 Closing browser and exiting...'));
  process.exit(0);
});

// Run the setup
setupNewRelicWithGoogleLogin();