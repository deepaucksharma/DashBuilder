import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { logger } from './logger.js';

export class ConfigManager {
  constructor() {
    this.config = {
      version: '1.0.0',
      created: new Date().toISOString(),
      newrelic: {},
      apiKeys: {},
      components: [],
      monitoring: {},
      workflows: {}
    };
    this.configPath = path.join(process.cwd(), '.dashbuilder');
  }

  async loadFromFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const extension = path.extname(filePath).toLowerCase();
      
      if (extension === '.json') {
        this.config = { ...this.config, ...JSON.parse(content) };
      } else if (extension === '.yaml' || extension === '.yml') {
        this.config = { ...this.config, ...yaml.parse(content) };
      }
      
      logger.info(`Configuration loaded from ${filePath}`);
    } catch (error) {
      logger.error(`Failed to load configuration: ${error.message}`);
      throw error;
    }
  }

  async save(filePath = null) {
    const savePath = filePath || path.join(this.configPath, 'config.json');
    
    try {
      await fs.mkdir(path.dirname(savePath), { recursive: true });
      await fs.writeFile(savePath, JSON.stringify(this.config, null, 2));
      logger.info(`Configuration saved to ${savePath}`);
    } catch (error) {
      logger.error(`Failed to save configuration: ${error.message}`);
      throw error;
    }
  }

  set(key, value) {
    const keys = key.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  get(key) {
    const keys = key.split('.');
    let current = this.config;
    
    for (const k of keys) {
      if (!current[k]) return undefined;
      current = current[k];
    }
    
    return current;
  }

  async generateEnvFiles() {
    const envMappings = {
      'scripts/.env': {
        NEW_RELIC_API_KEY: this.get('apiKeys.userKey'),
        NEW_RELIC_ACCOUNT_ID: this.get('newrelic.accountId'),
        NEW_RELIC_REGION: this.get('newrelic.region'),
        NEW_RELIC_INGEST_KEY: this.get('apiKeys.ingestKey')
      },
      'automation/.env': {
        NEW_RELIC_EMAIL: this.get('newrelic.email'),
        NEW_RELIC_PASSWORD: this.get('newrelic.password'),
        NEW_RELIC_LOGIN_URL: 'https://login.newrelic.com/login',
        NEW_RELIC_API_KEYS_URL: 'https://one.newrelic.com/api-keys',
        NEW_RELIC_DASHBOARDS_URL: 'https://one.newrelic.com/dashboards'
      }
    };

    for (const [filePath, vars] of Object.entries(envMappings)) {
      const content = Object.entries(vars)
        .filter(([_, value]) => value)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      await fs.writeFile(filePath, content);
      logger.info(`Generated ${filePath}`);
    }
  }

  async validate() {
    const required = [
      'newrelic.accountId',
      'newrelic.region',
      'apiKeys.userKey'
    ];

    const missing = required.filter(key => !this.get(key));
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    return true;
  }

  async merge(otherConfig) {
    this.config = this.deepMerge(this.config, otherConfig);
  }

  deepMerge(target, source) {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}