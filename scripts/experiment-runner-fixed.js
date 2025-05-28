#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Experiment runner for NRDOT optimization
class ExperimentRunner {
    constructor() {
        this.config = {
            accountId: process.env.NEW_RELIC_ACCOUNT_ID,
            apiKey: process.env.NEW_RELIC_API_KEY,
            experimentDuration: parseInt(process.env.EXPERIMENT_DURATION) || 3600, // 1 hour
            baselineCollection: 300, // 5 minutes baseline
            profiles: ['conservative', 'balanced', 'aggressive'],
            metricsInterval: 60 // Collect metrics every minute
        };

        this.experiments = [];
        this.currentExperiment = null;
    }

    async queryMetrics(query) {
        try {
            const response = await axios({
                method: 'POST',
                url: 'https://api.newrelic.com/graphql',
                headers: {
                    'Content-Type': 'application/json',
                    'API-Key': this.config.apiKey
                },
                data: {
                    query: `{
                        actor {
                            account(id: ${this.config.accountId}) {
                                nrql(query: "${query}") {
                                    results
                                }
                            }
                        }
                    }`
                }
            });

            return response.data?.data?.actor?.account?.nrql?.results || [];
        } catch (error) {
            console.error('Error querying metrics:', error.message);
            return [];
        }
    }

    async collectMetrics() {
        const metrics = {
            timestamp: new Date().toISOString(),
            profile: this.currentExperiment?.profile || 'unknown'
        };

        // Collect process count
        const processQuery = `SELECT uniqueCount(dimensions.process.executable.name) as processCount FROM Metric WHERE metricName = 'process.cpu.utilization' SINCE 5 minutes ago`;
        const processResult = await this.queryMetrics(processQuery);
        metrics.processCount = processResult[0]?.processCount || 0;

        // Collect data points rate
        const dataPointsQuery = `SELECT rate(sum(otelcol_receiver_accepted_data_points), 1 minute) as dataPointsPerMinute FROM Metric SINCE 5 minutes ago`;
        const dataPointsResult = await this.queryMetrics(dataPointsQuery);
        metrics.dataPointsPerMinute = dataPointsResult[0]?.dataPointsPerMinute || 0;

        // Collect average CPU utilization
        const cpuQuery = `SELECT average(system.cpu.utilization) as avgCpu FROM Metric SINCE 5 minutes ago`;
        const cpuResult = await this.queryMetrics(cpuQuery);
        metrics.avgCpuUtilization = cpuResult[0]?.avgCpu || 0;

        // Calculate cost estimate
        const costPerMillion = parseFloat(process.env.COST_PER_MILLION_DATAPOINTS) || 0.25;
        metrics.estimatedCostPerHour = (metrics.dataPointsPerMinute * 60 / 1000000) * costPerMillion;

        // Calculate efficiency score (processes per dollar)
        metrics.efficiencyScore = metrics.estimatedCostPerHour > 0 
            ? metrics.processCount / metrics.estimatedCostPerHour 
            : 0;

        return metrics;
    }

    async switchProfile(profile) {
        console.log(`Switching to profile: ${profile}`);
        
        try {
            // Update environment variable
            process.env.OPTIMIZATION_MODE = profile;
            
            // Update the control loop's profile setting
            await execAsync(`docker exec nrdot-control-loop sh -c "echo '${profile}' > /tmp/current-profile"`);
            
            // Restart the collector service
            await execAsync(`docker restart nrdot-collector`);
            
            // Wait for collector to be healthy
            await this.waitForCollector();
            
            return true;
        } catch (error) {
            console.error(`Failed to switch profile: ${error.message}`);
            return false;
        }
    }

    async waitForCollector(maxAttempts = 30) {
        console.log('Waiting for collector to be ready...');
        
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await axios.get('http://localhost:13133/health');
                if (response.status === 200) {
                    console.log('Collector is ready');
                    return true;
                }
            } catch (error) {
                // Expected to fail initially
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        throw new Error('Collector failed to become ready');
    }

    async runExperiment(profile) {
        console.log(`\n=== Starting experiment for profile: ${profile} ===`);
        
        this.currentExperiment = {
            profile,
            startTime: new Date(),
            metrics: [],
            summary: {}
        };

        // Switch to the profile
        const switched = await this.switchProfile(profile);
        if (!switched) {
            console.error('Failed to switch profile, skipping experiment');
            return null;
        }

        // Wait for baseline
        console.log(`Collecting ${this.config.baselineCollection}s baseline...`);
        await new Promise(resolve => setTimeout(resolve, this.config.baselineCollection * 1000));

        // Collect metrics during experiment
        const experimentEnd = Date.now() + (this.config.experimentDuration * 1000);
        while (Date.now() < experimentEnd) {
            const metrics = await this.collectMetrics();
            this.currentExperiment.metrics.push(metrics);
            
            console.log(`[${new Date().toISOString()}] ${profile}: ` +
                `Processes: ${metrics.processCount}, ` +
                `DPM: ${metrics.dataPointsPerMinute.toFixed(0)}, ` +
                `Cost/hr: $${metrics.estimatedCostPerHour.toFixed(2)}, ` +
                `Efficiency: ${metrics.efficiencyScore.toFixed(1)}`
            );

            // Wait for next collection
            await new Promise(resolve => 
                setTimeout(resolve, this.config.metricsInterval * 1000)
            );
        }

        // Calculate summary statistics
        this.currentExperiment.endTime = new Date();
        this.currentExperiment.summary = this.calculateSummary(this.currentExperiment.metrics);
        
        this.experiments.push(this.currentExperiment);
        return this.currentExperiment;
    }

    calculateSummary(metrics) {
        if (metrics.length === 0) return {};

        const values = {
            processCount: metrics.map(m => m.processCount),
            dataPointsPerMinute: metrics.map(m => m.dataPointsPerMinute),
            estimatedCostPerHour: metrics.map(m => m.estimatedCostPerHour),
            efficiencyScore: metrics.map(m => m.efficiencyScore)
        };

        const summary = {};
        for (const [key, vals] of Object.entries(values)) {
            summary[key] = {
                avg: vals.reduce((a, b) => a + b, 0) / vals.length,
                min: Math.min(...vals),
                max: Math.max(...vals),
                last: vals[vals.length - 1]
            };
        }

        return summary;
    }

    async generateReport() {
        console.log('\n=== Experiment Results Summary ===\n');

        const report = {
            runDate: new Date().toISOString(),
            duration: this.config.experimentDuration,
            profiles: this.config.profiles,
            experiments: this.experiments.map(exp => ({
                profile: exp.profile,
                duration: (exp.endTime - exp.startTime) / 1000,
                summary: exp.summary
            })),
            recommendations: this.generateRecommendations()
        };

        // Print summary table
        console.log('Profile Comparison:');
        console.log('==================');
        for (const exp of this.experiments) {
            console.log(`\n${exp.profile.toUpperCase()}:`);
            console.log(`  Avg Processes: ${exp.summary.processCount.avg.toFixed(0)}`);
            console.log(`  Avg DPM: ${exp.summary.dataPointsPerMinute.avg.toFixed(0)}`);
            console.log(`  Avg Cost/hr: $${exp.summary.estimatedCostPerHour.avg.toFixed(2)}`);
            console.log(`  Avg Efficiency: ${exp.summary.efficiencyScore.avg.toFixed(1)} processes/$`);
        }

        // Save detailed report
        const filename = `experiment-results-${Date.now()}.json`;
        await fs.writeFile(filename, JSON.stringify(report, null, 2));
        console.log(`\nDetailed report saved to: ${filename}`);

        return report;
    }

    generateRecommendations() {
        if (this.experiments.length === 0) return { error: 'No experiments completed' };

        // Find best profile based on efficiency
        const bestEfficiency = this.experiments.reduce((best, exp) => {
            return exp.summary.efficiencyScore.avg > best.summary.efficiencyScore.avg ? exp : best;
        });

        // Find best profile based on cost
        const lowestCost = this.experiments.reduce((best, exp) => {
            return exp.summary.estimatedCostPerHour.avg < best.summary.estimatedCostPerHour.avg ? exp : best;
        });

        // Find best profile based on coverage
        const bestCoverage = this.experiments.reduce((best, exp) => {
            return exp.summary.processCount.avg > best.summary.processCount.avg ? exp : best;
        });

        return {
            bestEfficiency: bestEfficiency.profile,
            lowestCost: lowestCost.profile,
            bestCoverage: bestCoverage.profile,
            recommendation: this.determineOptimalProfile()
        };
    }

    determineOptimalProfile() {
        // Simple scoring algorithm
        const scores = {};
        
        for (const exp of this.experiments) {
            const profile = exp.profile;
            scores[profile] = 0;
            
            // Cost score (lower is better)
            const costScore = 1 / (exp.summary.estimatedCostPerHour.avg + 1);
            scores[profile] += costScore * 0.4; // 40% weight
            
            // Coverage score (higher is better)
            const coverageScore = exp.summary.processCount.avg / 100; // Normalize
            scores[profile] += coverageScore * 0.4; // 40% weight
            
            // Efficiency score
            const efficiencyScore = exp.summary.efficiencyScore.avg / 100; // Normalize
            scores[profile] += efficiencyScore * 0.2; // 20% weight
        }

        // Find profile with highest score
        return Object.entries(scores).reduce((best, [profile, score]) => {
            return score > best[1] ? [profile, score] : best;
        }, ['unknown', 0])[0];
    }

    async run() {
        console.log('NRDOT Experiment Runner');
        console.log('======================');
        console.log(`Account ID: ${this.config.accountId}`);
        console.log(`Experiment Duration: ${this.config.experimentDuration}s per profile`);
        console.log(`Profiles to test: ${this.config.profiles.join(', ')}`);
        console.log('');

        // Run experiments for each profile
        for (const profile of this.config.profiles) {
            await this.runExperiment(profile);
            
            // Wait between experiments
            if (profile !== this.config.profiles[this.config.profiles.length - 1]) {
                console.log('\nWaiting 60s before next experiment...');
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }

        // Generate and display report
        await this.generateReport();
    }
}

// Run if called directly
if (require.main === module) {
    const runner = new ExperimentRunner();
    runner.run().catch(console.error);
}

module.exports = ExperimentRunner;