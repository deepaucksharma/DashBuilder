import inquirer from 'inquirer';
import chalk from 'chalk';

export async function promptForCredentials() {
  console.log(chalk.cyan('🔐 New Relic Login Credentials'));
  console.log(chalk.gray('Your credentials are only used for this session\n'));
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Email:',
      validate: input => input.includes('@') || 'Please enter a valid email'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '*',
      validate: input => input.length > 0 || 'Password is required'
    },
    {
      type: 'confirm',
      name: 'saveCredentials',
      message: 'Save credentials for future use?',
      default: false
    }
  ]);
  
  return answers;
}

export async function promptForApiKeyDetails() {
  console.log(chalk.cyan('\n🔑 API Key Configuration'));
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'keyName',
      message: 'API Key Name:',
      default: `DashBuilder-${new Date().toISOString().split('T')[0]}`
    },
    {
      type: 'list',
      name: 'keyType',
      message: 'Key Type:',
      choices: [
        { name: 'User Key (recommended)', value: 'USER' },
        { name: 'Ingest - License Key', value: 'INGEST' },
        { name: 'Browser Key', value: 'BROWSER' }
      ],
      default: 'USER'
    },
    {
      type: 'input',
      name: 'accountId',
      message: 'Account ID (optional):',
      validate: input => !input || /^\d+$/.test(input) || 'Account ID must be numeric'
    }
  ]);
  
  return answers;
}

export async function promptForDashboardSearch() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'dashboardName',
      message: 'Dashboard name to search for:',
      validate: input => input.length > 0 || 'Dashboard name is required'
    },
    {
      type: 'checkbox',
      name: 'verifications',
      message: 'What would you like to verify?',
      choices: [
        { name: 'Widget count and types', value: 'widgets' },
        { name: 'Data sources', value: 'dataSources' },
        { name: 'Public URL availability', value: 'publicUrl' },
        { name: 'Export dashboard JSON', value: 'export' },
        { name: 'Take screenshots', value: 'screenshots' }
      ],
      default: ['widgets', 'screenshots']
    }
  ]);
  
  return answers;
}

export async function confirmAction(message) {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: true
    }
  ]);
  
  return confirmed;
}