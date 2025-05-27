import { launchBrowser } from '../config/browser.js';
import { LoginPage } from '../pages/LoginPage.js';
import { DashboardPage } from '../pages/DashboardPage.js';
import { promptForDashboardSearch } from '../utils/prompts.js';
import { loadCredentials, formatDuration } from '../utils/helpers.js';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function verifyDashboard() {
  console.log(chalk.blue.bold('\n🔍 New Relic Dashboard Verifier\n'));
  
  const startTime = Date.now();
  let browser;
  
  try {
    const credentials = await loadCredentials();
    if (!credentials) {
      console.log(chalk.red('❌ No saved credentials found. Please run create-api-keys.js first.'));
      process.exit(1);
    }
    
    const { dashboardName, verifications } = await promptForDashboardSearch();
    
    console.log(chalk.cyan('\n🌐 Launching browser...\n'));
    browser = await launchBrowser();
    const page = await browser.newPage();
    
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    await loginPage.login(credentials.email, credentials.password);
    
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.navigate();
    
    const opened = await dashboardPage.openDashboard(dashboardName);
    
    if (!opened) {
      console.log(chalk.red(`\n❌ Dashboard "${dashboardName}" not found`));
      process.exit(1);
    }
    
    console.log(chalk.green(`\n✅ Dashboard "${dashboardName}" opened successfully!\n`));
    
    const results = {
      dashboardName,
      timestamp: new Date().toISOString(),
      verifications: {}
    };
    
    if (verifications.includes('widgets')) {
      console.log(chalk.cyan('\n📊 Verifying Widgets...\n'));
      const widgets = await dashboardPage.verifyWidgets();
      results.verifications.widgets = widgets;
      console.log(chalk.green(`\n✅ Found ${widgets.length} widgets`));
    }
    
    if (verifications.includes('publicUrl')) {
      console.log(chalk.cyan('\n🔗 Getting Public URL...\n'));
      const publicUrl = await dashboardPage.getPublicUrl();
      results.verifications.publicUrl = publicUrl;
      
      if (publicUrl) {
        console.log(chalk.white('\nPublic Dashboard URL:'));
        console.log(chalk.blue.underline(publicUrl));
      }
    }
    
    if (verifications.includes('export')) {
      console.log(chalk.cyan('\n📤 Exporting Dashboard...\n'));
      const exportData = await dashboardPage.exportDashboard();
      results.verifications.export = exportData;
      
      if (exportData) {
        const exportPath = path.join('./exports', `${dashboardName.replace(/\s+/g, '-')}-${Date.now()}.json`);
        await fs.mkdir('./exports', { recursive: true });
        await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2));
        console.log(chalk.green(`\n✅ Dashboard exported to: ${exportPath}`));
      }
    }
    
    const resultsPath = path.join('./reports', `verification-${Date.now()}.json`);
    await fs.mkdir('./reports', { recursive: true });
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
    
    const duration = formatDuration(Date.now() - startTime);
    
    console.log(chalk.green.bold('\n✨ Dashboard Verification Complete!\n'));
    console.log(chalk.white('Summary:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`Dashboard: ${chalk.cyan(dashboardName)}`);
    console.log(`Duration: ${chalk.cyan(duration)}`);
    console.log(`Report: ${chalk.cyan(resultsPath)}`);
    console.log(chalk.gray('─'.repeat(50)));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error verifying dashboard:'), error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyDashboard();
}

export { verifyDashboard };