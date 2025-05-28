import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';
import { testConnection, validateQuery } from '../../lib/shared/index.js';

const execAsync = promisify(exec);

export class ValidationService {
  constructor() {
    this.validators = {
      apiConnectivity: this.validateApiConnectivity.bind(this),
      cliInstallation: this.validateCliInstallation.bind(this),
      automationSetup: this.validateAutomationSetup.bind(this),
      nr1App: this.validateNr1App.bind(this),
      dependencies: this.validateDependencies.bind(this),
      configuration: this.validateConfiguration.bind(this)
    };
  }

  async validateAll(config) {
    const results = {
      timestamp: new Date().toISOString(),
      isValid: true,
      passed: [],
      failed: [],
      warnings: []
    };

    for (const [name, validator] of Object.entries(this.validators)) {
      try {
        logger.verbose(`Running validator: ${name}`);
        const result = await validator(config);
        
        if (result.status === 'passed') {
          results.passed.push({ name, ...result });
        } else if (result.status === 'warning') {
          results.warnings.push(result.message);
        } else {
          results.failed.push({ name, ...result });
          results.isValid = false;
        }
      } catch (error) {
        results.failed.push({
          name,
          status: 'failed',
          error: error.message
        });
        results.isValid = false;
      }
    }

    await this.saveValidationReport(results);
    return results;
  }

  async validateApiConnectivity(config) {
    try {
      const apiKey = config.get('apiKeys.userKey');
      const accountId = config.get('newrelic.accountId');
      
      if (!apiKey || !accountId) {
        return {
          status: 'failed',
          message: 'Missing API key or account ID'
        };
      }

      // Set environment variables for the shared library
      process.env.NEW_RELIC_API_KEY = apiKey;
      process.env.NEW_RELIC_ACCOUNT_ID = accountId;

      // Test API connectivity using direct function call
      const result = await testConnection();

      return {
        status: result.connected ? 'passed' : 'failed',
        message: result.message
      };
    } catch (error) {
      return {
        status: 'failed',
        message: 'API connectivity test failed',
        error: error.message
      };
    }
  }

  async validateCliInstallation(config) {
    try {
      const packagePath = path.join(process.cwd(), 'scripts', 'package.json');
      await fs.access(packagePath);

      const { stdout } = await execAsync('cd scripts && npm list --depth=0');
      
      return {
        status: 'passed',
        message: 'CLI installation verified'
      };
    } catch (error) {
      return {
        status: 'failed',
        message: 'CLI not properly installed',
        error: error.message
      };
    }
  }

  async validateAutomationSetup(config) {
    try {
      const components = config.get('components') || [];
      
      if (!components.includes('automation')) {
        return {
          status: 'passed',
          message: 'Automation not configured (skipped)'
        };
      }

      const envPath = path.join(process.cwd(), 'automation', '.env');
      await fs.access(envPath);

      return {
        status: 'passed',
        message: 'Automation setup verified'
      };
    } catch (error) {
      return {
        status: 'warning',
        message: 'Automation setup incomplete',
        error: error.message
      };
    }
  }

  async validateNr1App(config) {
    try {
      const components = config.get('components') || [];
      
      if (!components.includes('nr1')) {
        return {
          status: 'passed',
          message: 'NR1 app not configured (skipped)'
        };
      }

      const nr1Path = path.join(process.cwd(), 'nrdot-nr1-app', 'nr1.json');
      await fs.access(nr1Path);

      const { stdout } = await execAsync('cd nrdot-nr1-app && npm list --depth=0');

      return {
        status: 'passed',
        message: 'NR1 app setup verified'
      };
    } catch (error) {
      return {
        status: 'warning',
        message: 'NR1 app setup incomplete',
        error: error.message
      };
    }
  }

  async validateDependencies(config) {
    try {
      const { stdout: npmVersion } = await execAsync('npm --version');
      const { stdout: nodeVersion } = await execAsync('node --version');

      const nodeMatch = nodeVersion.match(/v(\d+)\.(\d+)/);
      const nodeMajor = parseInt(nodeMatch[1]);

      if (nodeMajor < 16) {
        return {
          status: 'failed',
          message: `Node.js version ${nodeVersion} is too old. Required: v16+`
        };
      }

      return {
        status: 'passed',
        message: `Dependencies verified (Node ${nodeVersion}, npm ${npmVersion})`
      };
    } catch (error) {
      return {
        status: 'failed',
        message: 'Failed to verify dependencies',
        error: error.message
      };
    }
  }

  async validateConfiguration(config) {
    const required = [
      'newrelic.accountId',
      'newrelic.region',
      'apiKeys.userKey'
    ];

    const missing = required.filter(key => !config.get(key));

    if (missing.length > 0) {
      return {
        status: 'failed',
        message: `Missing required configuration: ${missing.join(', ')}`
      };
    }

    // Validate account ID format
    const accountId = config.get('newrelic.accountId');
    if (!/^\d+$/.test(accountId)) {
      return {
        status: 'failed',
        message: 'Invalid account ID format'
      };
    }

    // Validate region
    const region = config.get('newrelic.region');
    if (!['US', 'EU'].includes(region)) {
      return {
        status: 'failed',
        message: 'Invalid region. Must be US or EU'
      };
    }

    return {
      status: 'passed',
      message: 'Configuration validated'
    };
  }

  async saveValidationReport(results) {
    try {
      const reportsDir = path.join(process.cwd(), 'reports');
      await fs.mkdir(reportsDir, { recursive: true });

      const reportPath = path.join(
        reportsDir,
        `validation-${new Date().toISOString().split('T')[0]}.json`
      );

      await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
      logger.verbose(`Validation report saved to ${reportPath}`);
    } catch (error) {
      logger.error('Failed to save validation report:', error);
    }
  }
}