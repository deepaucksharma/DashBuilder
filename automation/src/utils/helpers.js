import fs from 'fs/promises';
import path from 'path';
import clipboardy from 'clipboardy';
import chalk from 'chalk';

export async function waitAndClick(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

export async function waitAndType(page, selector, text, timeout = 5000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, text);
}

export async function takeScreenshot(page, name) {
  const screenshotDir = process.env.SCREENSHOT_DIR || './screenshots';
  await fs.mkdir(screenshotDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${name}-${timestamp}.png`;
  const filepath = path.join(screenshotDir, filename);
  
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(chalk.gray(`📸 Screenshot saved: ${filename}`));
}

export async function copyToClipboard(text) {
  try {
    await clipboardy.write(text);
    console.log(chalk.green('📋 Copied to clipboard!'));
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not copy to clipboard:', error.message));
  }
}

export async function waitForText(page, text, timeout = 10000) {
  await page.waitForFunction(
    text => document.body.innerText.includes(text),
    { timeout },
    text
  );
}

export async function saveCredentials(credentials, filename = 'credentials.json') {
  const configDir = './config';
  await fs.mkdir(configDir, { recursive: true });
  
  const filepath = path.join(configDir, filename);
  await fs.writeFile(filepath, JSON.stringify(credentials, null, 2));
  
  console.log(chalk.green(`💾 Credentials saved to ${filepath}`));
}

export async function loadCredentials(filename = 'credentials.json') {
  const filepath = path.join('./config', filename);
  
  try {
    const data = await fs.readFile(filepath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log(chalk.yellow('⚠️  No saved credentials found'));
    return null;
  }
}

export async function retry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(chalk.yellow(`⚠️  Attempt ${i + 1} failed, retrying in ${delay}ms...`));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}