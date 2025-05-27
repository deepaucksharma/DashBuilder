import { selectors } from '../config/browser.js';
import { waitAndClick, waitAndType, takeScreenshot } from '../utils/helpers.js';
import chalk from 'chalk';

export class DashboardPage {
  constructor(page) {
    this.page = page;
    this.dashboardsUrl = process.env.NEW_RELIC_DASHBOARDS_URL;
  }

  async navigate() {
    await this.page.goto(this.dashboardsUrl, { waitUntil: 'networkidle2' });
    await takeScreenshot(this.page, 'dashboards-list');
  }

  async searchDashboard(dashboardName) {
    console.log(`🔍 Searching for dashboard: ${dashboardName}`);
    
    await waitAndType(this.page, selectors.dashboard.searchInput, dashboardName);
    await this.page.waitForTimeout(2000);
    
    const results = await this.page.$$(selectors.dashboard.dashboardTile);
    console.log(`Found ${results.length} matching dashboards`);
    
    return results;
  }

  async openDashboard(dashboardName) {
    const results = await this.searchDashboard(dashboardName);
    
    if (results.length > 0) {
      await results[0].click();
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
      await takeScreenshot(this.page, 'dashboard-opened');
      
      console.log(chalk.green(`✅ Opened dashboard: ${dashboardName}`));
      return true;
    }
    
    console.log(chalk.red(`❌ Dashboard not found: ${dashboardName}`));
    return false;
  }

  async verifyWidgets(expectedWidgets = []) {
    console.log('🔍 Verifying dashboard widgets...');
    
    await this.page.waitForSelector(selectors.dashboard.widgetContainer, { timeout: 10000 });
    const widgets = await this.page.$$(selectors.dashboard.widgetContainer);
    
    console.log(`Found ${widgets.length} widgets on dashboard`);
    
    const widgetDetails = await Promise.all(widgets.map(async (widget, index) => {
      const title = await widget.$eval('[data-testid="widget-title"]', el => el.textContent).catch(() => 'Untitled');
      const type = await widget.getAttribute('data-widget-type').catch(() => 'unknown');
      
      return { index, title, type };
    }));
    
    widgetDetails.forEach(widget => {
      console.log(`  Widget ${widget.index + 1}: ${widget.title} (${widget.type})`);
    });
    
    if (expectedWidgets.length > 0) {
      const missingWidgets = expectedWidgets.filter(expected => 
        !widgetDetails.some(actual => actual.title.includes(expected))
      );
      
      if (missingWidgets.length > 0) {
        console.log(chalk.yellow(`⚠️  Missing widgets: ${missingWidgets.join(', ')}`));
      } else {
        console.log(chalk.green('✅ All expected widgets found!'));
      }
    }
    
    await takeScreenshot(this.page, 'dashboard-widgets');
    return widgetDetails;
  }

  async getPublicUrl() {
    console.log('🔗 Getting public dashboard URL...');
    
    await waitAndClick(this.page, selectors.dashboard.shareButton);
    await this.page.waitForTimeout(1000);
    
    const publicUrlToggle = await this.page.$(selectors.dashboard.publicUrlToggle);
    if (publicUrlToggle) {
      const isEnabled = await publicUrlToggle.isChecked();
      if (!isEnabled) {
        await publicUrlToggle.click();
        await this.page.waitForTimeout(1000);
      }
      
      const publicUrl = await this.page.$eval('[data-testid="public-url-input"]', el => el.value).catch(() => null);
      
      if (publicUrl) {
        console.log(chalk.green(`✅ Public URL: ${publicUrl}`));
        return publicUrl;
      }
    }
    
    console.log(chalk.yellow('⚠️  Could not get public URL'));
    return null;
  }

  async exportDashboard() {
    console.log('📤 Exporting dashboard...');
    
    const exportButton = await this.page.$('button:has-text("Export")');
    if (exportButton) {
      await exportButton.click();
      await this.page.waitForTimeout(1000);
      
      const jsonExport = await this.page.$eval('[data-testid="export-json"]', el => el.textContent).catch(() => null);
      
      if (jsonExport) {
        console.log(chalk.green('✅ Dashboard exported successfully'));
        return JSON.parse(jsonExport);
      }
    }
    
    console.log(chalk.yellow('⚠️  Could not export dashboard'));
    return null;
  }
}