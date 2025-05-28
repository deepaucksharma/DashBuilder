#!/usr/bin/env node

/**
 * Unified Validation Framework
 * Consolidates all validation logic into a single JS module
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

// Import shared utilities
const { NRApiClient } = require('../core/api-client');
const logger = require('../utils/logger');
const { validateConfig } = require('../utils/validators');

class ValidationFramework {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '../..');
        this.results = {
            passed: [],
            failed: [],
            warnings: []
        };
        this.apiClient = null;
    }

    async initialize() {
        // Load environment variables
        require('dotenv').config({ path: path.join(this.projectRoot, '.env') });
        
        // Initialize API client if credentials available
        if (process.env.NEW_RELIC_API_KEY && process.env.NEW_RELIC_ACCOUNT_ID) {
            this.apiClient = new NRApiClient({
                apiKey: process.env.NEW_RELIC_API_KEY,
                accountId: process.env.NEW_RELIC_ACCOUNT_ID,
                region: process.env.NEW_RELIC_REGION || 'US'
            });
        }
    }

    // Core validation methods
    async validateEnvironment() {
        logger.info('Validating environment setup...');
        
        const requiredEnvVars = [
            'NEW_RELIC_LICENSE_KEY',
            'NEW_RELIC_API_KEY',
            'NEW_RELIC_ACCOUNT_ID'
        ];
        
        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                this.results.failed.push(`Missing required environment variable: ${envVar}`);
            } else {
                this.results.passed.push(`Environment variable ${envVar} is set`);
            }
        }
    }

    async validateOTELConfig() {
        logger.info('Validating OpenTelemetry configuration...');
        
        const configPaths = [
            'configs/collector-baseline.yaml',
            'configs/collector-comprehensive.yaml',
            'configs/collector-experiment-tracking.yaml'
        ];
        
        for (const configPath of configPaths) {
            const fullPath = path.join(this.projectRoot, configPath);
            
            if (!fs.existsSync(fullPath)) {
                this.results.warnings.push(`Config file not found: ${configPath}`);
                continue;
            }
            
            try {
                const config = yaml.load(fs.readFileSync(fullPath, 'utf8'));
                
                // Validate structure
                if (!config.receivers || !config.processors || !config.exporters) {
                    this.results.failed.push(`Invalid OTEL config structure in ${configPath}`);
                    continue;
                }
                
                // Check for New Relic exporter
                if (config.exporters && config.exporters.otlp) {
                    this.results.passed.push(`Valid OTEL config: ${configPath}`);
                } else {
                    this.results.warnings.push(`No OTLP exporter configured in ${configPath}`);
                }
                
            } catch (error) {
                this.results.failed.push(`Failed to parse ${configPath}: ${error.message}`);
            }
        }
    }

    async validateDockerSetup() {
        logger.info('Validating Docker setup...');
        
        try {
            // Check if Docker is installed
            execSync('docker --version', { stdio: 'pipe' });
            this.results.passed.push('Docker is installed');
        } catch (error) {
            this.results.failed.push('Docker is not installed or not in PATH');
            return;
        }
        
        try {
            // Check if docker-compose exists
            if (!fs.existsSync(path.join(this.projectRoot, 'docker-compose.yml'))) {
                this.results.failed.push('docker-compose.yml not found');
                return;
            }
            
            // Validate docker-compose syntax
            execSync('docker-compose config', { 
                cwd: this.projectRoot,
                stdio: 'pipe'
            });
            this.results.passed.push('docker-compose.yml is valid');
            
            // Check if services are running
            const psOutput = execSync('docker-compose ps', {
                cwd: this.projectRoot,
                stdio: 'pipe'
            }).toString();
            
            if (psOutput.includes('otel-collector')) {
                if (psOutput.includes('Up')) {
                    this.results.passed.push('OTEL Collector container is running');
                } else {
                    this.results.warnings.push('OTEL Collector container exists but is not running');
                }
            }
            
        } catch (error) {
            this.results.failed.push(`Docker validation error: ${error.message}`);
        }
    }

    async validateNRDOTSetup() {
        logger.info('Validating NRDOT setup...');
        
        // Check optimization config
        const optimizationPath = path.join(this.projectRoot, 'configs/optimization.yaml');
        if (!fs.existsSync(optimizationPath)) {
            this.results.failed.push('optimization.yaml not found');
        } else {
            try {
                const config = yaml.load(fs.readFileSync(optimizationPath, 'utf8'));
                if (config.profiles && config.settings) {
                    this.results.passed.push('Valid optimization.yaml configuration');
                } else {
                    this.results.failed.push('Invalid optimization.yaml structure');
                }
            } catch (error) {
                this.results.failed.push(`Failed to parse optimization.yaml: ${error.message}`);
            }
        }
        
        // Check control loop script
        const controlLoopPath = path.join(this.projectRoot, 'scripts/control-loop.js');
        if (fs.existsSync(controlLoopPath)) {
            this.results.passed.push('Control loop script found');
        } else {
            this.results.failed.push('Control loop script not found');
        }
    }

    async validateDataCollection() {
        logger.info('Validating data collection...');
        
        if (!this.apiClient) {
            this.results.warnings.push('Cannot validate data collection - API client not initialized');
            return;
        }
        
        try {
            // Check if we're receiving process samples
            const query = `SELECT count(*) FROM ProcessSample WHERE agentName = 'nrdot-otel' SINCE 5 minutes ago`;
            const result = await this.apiClient.query(query);
            
            if (result && result.results && result.results[0].count > 0) {
                this.results.passed.push(`Receiving ProcessSample data: ${result.results[0].count} samples`);
            } else {
                this.results.warnings.push('No ProcessSample data received in last 5 minutes');
            }
            
            // Check for metrics
            const metricsQuery = `SELECT count(*) FROM Metric WHERE metricName LIKE 'nrdot.%' SINCE 5 minutes ago`;
            const metricsResult = await this.apiClient.query(metricsQuery);
            
            if (metricsResult && metricsResult.results && metricsResult.results[0].count > 0) {
                this.results.passed.push(`Receiving NRDOT metrics: ${metricsResult.results[0].count} data points`);
            } else {
                this.results.warnings.push('No NRDOT metrics received in last 5 minutes');
            }
            
        } catch (error) {
            this.results.failed.push(`Data collection validation error: ${error.message}`);
        }
    }

    async validateExperiments() {
        logger.info('Validating experiment framework...');
        
        const experimentsDir = path.join(this.projectRoot, 'experiments');
        
        // Check experiment profiles
        const profilesDir = path.join(experimentsDir, 'profiles');
        if (fs.existsSync(profilesDir)) {
            const profiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('.yaml'));
            if (profiles.length > 0) {
                this.results.passed.push(`Found ${profiles.length} experiment profiles`);
            } else {
                this.results.warnings.push('No experiment profiles found');
            }
        } else {
            this.results.failed.push('Experiment profiles directory not found');
        }
        
        // Check orchestrator
        const orchestratorPath = path.join(experimentsDir, 'orchestrator/experiment-orchestrator.js');
        if (fs.existsSync(orchestratorPath)) {
            this.results.passed.push('Experiment orchestrator found');
        } else {
            this.results.failed.push('Experiment orchestrator not found');
        }
    }

    async runAllValidations() {
        await this.initialize();
        
        await this.validateEnvironment();
        await this.validateOTELConfig();
        await this.validateDockerSetup();
        await this.validateNRDOTSetup();
        await this.validateDataCollection();
        await this.validateExperiments();
        
        this.printResults();
        
        return this.results.failed.length === 0;
    }

    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('VALIDATION RESULTS');
        console.log('='.repeat(60) + '\n');
        
        if (this.results.passed.length > 0) {
            console.log('✅ PASSED:');
            this.results.passed.forEach(item => console.log(`   - ${item}`));
            console.log('');
        }
        
        if (this.results.warnings.length > 0) {
            console.log('⚠️  WARNINGS:');
            this.results.warnings.forEach(item => console.log(`   - ${item}`));
            console.log('');
        }
        
        if (this.results.failed.length > 0) {
            console.log('❌ FAILED:');
            this.results.failed.forEach(item => console.log(`   - ${item}`));
            console.log('');
        }
        
        const total = this.results.passed.length + this.results.warnings.length + this.results.failed.length;
        console.log(`Summary: ${this.results.passed.length}/${total} checks passed`);
        console.log(`Warnings: ${this.results.warnings.length}`);
        console.log(`Failures: ${this.results.failed.length}`);
        console.log('='.repeat(60) + '\n');
    }
}

// CLI interface
if (require.main === module) {
    const validator = new ValidationFramework();
    
    validator.runAllValidations()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            logger.error('Validation failed:', error);
            process.exit(1);
        });
}

module.exports = ValidationFramework;