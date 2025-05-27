import { launchBrowser } from '../config/browser.js';
import { LoginPage } from '../pages/LoginPage.js';
import { ApiKeysPage } from '../pages/ApiKeysPage.js';
import { DashboardPage } from '../pages/DashboardPage.js';
import { promptForCredentials, confirmAction } from '../utils/prompts.js';
import { saveCredentials, formatDuration } from '../utils/helpers.js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

dotenv.config();
const execAsync = promisify(exec);

async function fullSetup() {
  console.log(chalk.blue.bold('\n🚀 DashBuilder Full Setup Automation\n'));
  console.log(chalk.gray('This will guide you through the complete setup process:\n'));
  console.log('  1. Create New Relic API keys');
  console.log('  2. Configure DashBuilder CLI');
  console.log('  3. Create sample dashboards');
  console.log('  4. Verify dashboard creation\n');
  
  const startTime = Date.now();
  let browser;
  
  try {
    const confirmed = await confirmAction('Start the full setup process?');
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
    
    await saveCredentials({
      email: credentials.email,
      apiKeys: {
        user: userKey.value,
        ingest: ingestKey.value,
        accountId: userKey.accountId
      }
    }, 'dashbuilder-keys.json');
    
    console.log(chalk.cyan('\n⚙️  Step 4: Configuring DashBuilder CLI\n'));
    
    const envContent = `NEW_RELIC_API_KEY=${userKey.value}
NEW_RELIC_ACCOUNT_ID=${userKey.accountId || 'YOUR_ACCOUNT_ID'}
NEW_RELIC_REGION=US`;
    
    await fs.writeFile('../scripts/.env', envContent);
    console.log(chalk.green('✅ Created scripts/.env file'));
    
    console.log(chalk.cyan('\n📊 Step 5: Creating sample dashboard\n'));
    
    try {
      const { stdout } = await execAsync('npm run dashboard:create -- --file examples/sample-dashboard.json', {
        cwd: '../scripts'
      });
      console.log(chalk.green('✅ Sample dashboard created!'));
      console.log(chalk.gray(stdout));
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not create dashboard automatically'));
      console.log(chalk.gray('You can create it manually with: npm run dashboard:create'));
    }
    
    console.log(chalk.cyan('\n🔍 Step 6: Verifying dashboard in browser\n'));
    
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.navigate();
    
    const opened = await dashboardPage.openDashboard('DashBuilder Sample');
    if (opened) {
      const widgets = await dashboardPage.verifyWidgets();
      const publicUrl = await dashboardPage.getPublicUrl();
      
      console.log(chalk.green('\n✅ Dashboard verified successfully!'));
      console.log(`  - Widgets: ${widgets.length}`);
      if (publicUrl) {
        console.log(`  - Public URL: ${publicUrl}`);
      }
    }
    
    const duration = formatDuration(Date.now() - startTime);
    
    console.log(chalk.green.bold('\n✨ Setup Complete!\n'));
    console.log(chalk.white('Next Steps:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log('1. Your API keys are saved in ./config/dashbuilder-keys.json');
    console.log('2. The CLI is configured in ../scripts/.env');
    console.log('3. You can now use the DashBuilder CLI commands:');
    console.log(chalk.cyan('   - npm run dashboard:list'));
    console.log(chalk.cyan('   - npm run dashboard:create'));
    console.log(chalk.cyan('   - npm run nrql:query'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`\nTotal setup time: ${chalk.cyan(duration)}`);
    
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
  fullSetup();
}

export { fullSetup };