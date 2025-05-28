#!/usr/bin/env node
/**
 * NRDOT Control Loop v2
 * Advanced monitoring and optimization for New Relic process telemetry
 */

const path = require('path');
const fs = require('fs').promises;
const yaml = require('js-yaml');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class NRDOTControlLoop {
    constructor() {
        this.config = {
            interval: parseInt(process.env.CONTROL_LOOP_INTERVAL || '300000'), // 5 minutes
            profile: process.env.OPTIMIZATION_PROFILE || 'balanced',
            accountId: process.env.NEW_RELIC_ACCOUNT_ID,
            apiKey: process.env.NEW_RELIC_API_KEY,
            licenseKey: process.env.NEW_RELIC_LICENSE_KEY,
            region: process.env.NEW_RELIC_REGION || 'US',
            debug: process.env.DEBUG === 'true',
            thresholds: {
                costWarning: parseFloat(process.env.COST_WARNING_THRESHOLD || '1000'),
                costCritical: parseFloat(process.env.COST_CRITICAL_THRESHOLD || '2000'),
                coverageMin: parseFloat(process.env.COVERAGE_MIN_THRESHOLD || '0.9'),
                performanceMin: parseFloat(process.env.PERFORMANCE_MIN_THRESHOLD || '0.8')
            }
        };
        
        this.state = {
            running: false,
            lastCheck: null,
            currentProfile: this.config.profile,
            metrics: {
                cost: 0,
                coverage: 0,
                performance: 0,
                cardinality: 0
            },
            history: []
        };
        
        this.optimizationConfig = null;
        this.nrqlClient = null;
    }

    async initialize() {
        // Load optimization configuration
        const configPath = path.join(__dirname, '../configs/optimization.yaml');
        const configContent = await fs.readFile(configPath, 'utf8');
        this.optimizationConfig = yaml.load(configContent);
        
        // Initialize New Relic API client
        this.nrqlClient = axios.create({
            baseURL: this.config.region === 'EU' 
                ? 'https://api.eu.newrelic.com/graphql'
                : 'https://api.newrelic.com/graphql',
            headers: {
                'API-Key': this.config.apiKey,
                'Content-Type': 'application/json'
            }
        });
    }

    async queryNRQL(query) {
        const graphqlQuery = {
            query: `{
                actor {
                    account(id: ${this.config.accountId}) {
                        nrql(query: "${query}") {
                            results
                        }
                    }
                }
            }`
        };

        try {
            const response = await this.nrqlClient.post('', graphqlQuery);
            return response.data.data.actor.account.nrql.results;
        } catch (error) {
            console.error('NRQL query failed:', error.message);
            throw error;
        }
    }

    async checkMetrics() {
        console.log('Checking real-time metrics from New Relic...');
        
        const queries = {
            // Cost estimation based on data points
            cost: `SELECT rate(sum(nrdot.metrics.datapoints), 1 month) * 0.25 / 1000000 as estimatedMonthlyCost FROM Metric WHERE nrdot.enabled = true SINCE 1 hour ago`,
            
            // Coverage calculation
            coverage: `SELECT uniqueCount(process.name) as monitored, uniqueCount(process.name) as total FROM ProcessSample SINCE 1 hour ago`,
            
            // Performance metrics
            performance: `SELECT average(duration.ms) as avgDuration FROM Transaction SINCE 1 hour ago`,
            
            // Cardinality check
            cardinality: `SELECT uniqueCount(process.name, host.name) as cardinality FROM ProcessSample SINCE 1 hour ago`
        };

        const results = {};
        
        for (const [metric, query] of Object.entries(queries)) {
            try {
                const result = await this.queryNRQL(query);
                results[metric] = result[0] || {};
                
                if (this.config.debug) {
                    console.log(`${metric} result:`, results[metric]);
                }
            } catch (error) {
                console.error(`Failed to get ${metric}:`, error.message);
                results[metric] = null;
            }
        }

        // Calculate final metrics
        this.state.metrics = {
            cost: results.cost?.estimatedMonthlyCost || 0,
            coverage: results.coverage ? (results.coverage.monitored / results.coverage.total) : 1,
            performance: results.performance?.avgDuration ? (1000 / results.performance.avgDuration) : 1,
            cardinality: results.cardinality?.cardinality || 0
        };

        return this.state.metrics;
    }

    determineOptimalProfile(metrics) {
        const { cost, coverage, performance } = metrics;
        const { thresholds } = this.config;
        
        // Decision logic for profile selection
        if (cost > thresholds.costCritical) {
            return 'aggressive'; // Emergency cost reduction
        } else if (cost > thresholds.costWarning && coverage > 0.95) {
            return 'balanced'; // Can afford to reduce coverage slightly
        } else if (coverage < thresholds.coverageMin) {
            return 'conservative'; // Need more coverage
        } else if (performance < thresholds.performanceMin) {
            return 'baseline'; // Need full visibility for troubleshooting
        } else {
            return this.state.currentProfile; // Keep current profile
        }
    }

    async updateCollectorConfig(newProfile) {
        if (newProfile === this.state.currentProfile) {
            console.log('No profile change needed');
            return;
        }

        console.log(`Switching from ${this.state.currentProfile} to ${newProfile} profile`);
        
        try {
            // Update environment variable for collector
            process.env.OPTIMIZATION_PROFILE = newProfile;
            
            // If running in Docker, restart the collector service
            if (process.env.RUNNING_IN_DOCKER === 'true') {
                await execAsync('pkill -HUP otelcol-contrib || true');
                console.log('Sent reload signal to collector');
            }
            
            // Update state file
            const stateFile = '/var/lib/nrdot/state.json';
            const state = {
                profile: newProfile,
                timestamp: new Date().toISOString(),
                reason: `Cost: $${this.state.metrics.cost.toFixed(2)}, Coverage: ${(this.state.metrics.coverage * 100).toFixed(1)}%`
            };
            
            await fs.writeFile(stateFile, JSON.stringify(state, null, 2)).catch(() => {
                // Ignore if can't write state file (permissions)
            });
            
            this.state.currentProfile = newProfile;
            
            // Record profile change
            await this.recordEvent('ProfileChanged', {
                from: this.state.currentProfile,
                to: newProfile,
                metrics: this.state.metrics
            });
            
        } catch (error) {
            console.error('Failed to update collector config:', error);
        }
    }

    async recordEvent(eventType, data) {
        // Send custom event to New Relic
        const event = {
            eventType: 'NRDOTControlLoop',
            timestamp: Date.now(),
            type: eventType,
            ...data
        };
        
        try {
            await axios.post(
                this.config.region === 'EU'
                    ? 'https://insights-collector.eu01.nr-data.net/v1/accounts/' + this.config.accountId + '/events'
                    : 'https://insights-collector.newrelic.com/v1/accounts/' + this.config.accountId + '/events',
                [event],
                {
                    headers: {
                        'X-License-Key': this.config.licenseKey,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error) {
            console.error('Failed to record event:', error.message);
        }
    }

    async runIteration() {
        console.log(`\n[${new Date().toISOString()}] Running control loop iteration...`);
        
        try {
            // Check current metrics
            const metrics = await this.checkMetrics();
            
            console.log('Current metrics:', {
                cost: `$${metrics.cost.toFixed(2)}/month`,
                coverage: `${(metrics.coverage * 100).toFixed(1)}%`,
                performance: `${(metrics.performance * 100).toFixed(1)}%`,
                cardinality: metrics.cardinality
            });
            
            // Determine optimal profile
            const optimalProfile = this.determineOptimalProfile(metrics);
            
            // Update configuration if needed
            await this.updateCollectorConfig(optimalProfile);
            
            // Store metrics history
            this.state.history.push({
                timestamp: new Date().toISOString(),
                metrics,
                profile: this.state.currentProfile
            });
            
            // Keep only last 24 hours of history
            const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
            this.state.history = this.state.history.filter(h => 
                new Date(h.timestamp).getTime() > dayAgo
            );
            
            this.state.lastCheck = new Date();
            
        } catch (error) {
            console.error('Control loop iteration failed:', error);
            await this.recordEvent('IterationFailed', { error: error.message });
        }
    }

    async start() {
        console.log('Starting NRDOT Control Loop v2...');
        console.log('Configuration:', {
            ...this.config,
            apiKey: '***',
            licenseKey: '***'
        });
        
        await this.initialize();
        
        this.state.running = true;
        
        // Run first iteration immediately
        await this.runIteration();
        
        // Set up interval
        this.intervalId = setInterval(async () => {
            if (this.state.running) {
                await this.runIteration();
            }
        }, this.config.interval);
        
        // Set up health check endpoint
        if (process.env.ENABLE_HEALTH_CHECK === 'true') {
            this.startHealthCheckServer();
        }
    }

    startHealthCheckServer() {
        const http = require('http');
        const port = process.env.HEALTH_CHECK_PORT || 8090;
        
        http.createServer((req, res) => {
            if (req.url === '/health') {
                const health = {
                    status: this.state.running ? 'healthy' : 'unhealthy',
                    lastCheck: this.state.lastCheck,
                    currentProfile: this.state.currentProfile,
                    metrics: this.state.metrics
                };
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(health, null, 2));
            } else {
                res.writeHead(404);
                res.end();
            }
        }).listen(port);
        
        console.log(`Health check server listening on port ${port}`);
    }

    stop() {
        console.log('Stopping NRDOT Control Loop...');
        this.state.running = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        // Record shutdown event
        this.recordEvent('Shutdown', {
            uptime: Date.now() - new Date(this.state.history[0]?.timestamp || Date.now()).getTime()
        });
    }
}

// Main execution
if (require.main === module) {
    const controlLoop = new NRDOTControlLoop();
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
        console.log('Received SIGTERM, shutting down gracefully...');
        controlLoop.stop();
        setTimeout(() => process.exit(0), 1000);
    });
    
    process.on('SIGINT', () => {
        console.log('Received SIGINT, shutting down gracefully...');
        controlLoop.stop();
        setTimeout(() => process.exit(0), 1000);
    });
    
    // Start the control loop
    controlLoop.start().catch(error => {
        console.error('Failed to start control loop:', error);
        process.exit(1);
    });
}

module.exports = { NRDOTControlLoop };