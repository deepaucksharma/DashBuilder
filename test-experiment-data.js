#!/usr/bin/env node

import os from 'os';

// Test experiment data collection format
class TestExperimentData {
    constructor() {
        this.config = {
            profiles: ['conservative', 'balanced', 'aggressive'],
            metricsInterval: 60
        };
        this.hostname = os.hostname();
    }

    generateExperimentMetrics(profile) {
        const baseMetrics = {
            conservative: {
                processCount: 25,
                dataPointsPerMinute: 1500,
                avgCpu: 45,
                costPerHour: 0.09
            },
            balanced: {
                processCount: 50,
                dataPointsPerMinute: 3000,
                avgCpu: 55,
                costPerHour: 0.18
            },
            aggressive: {
                processCount: 100,
                dataPointsPerMinute: 6000,
                avgCpu: 70,
                costPerHour: 0.36
            }
        };

        const base = baseMetrics[profile];
        const variance = () => (Math.random() - 0.5) * 0.2; // ±10% variance

        return {
            timestamp: new Date().toISOString(),
            profile,
            processCount: Math.round(base.processCount * (1 + variance())),
            dataPointsPerMinute: Math.round(base.dataPointsPerMinute * (1 + variance())),
            avgCpuUtilization: base.avgCpu * (1 + variance()),
            estimatedCostPerHour: base.costPerHour * (1 + variance()),
            efficiencyScore: 0 // Will be calculated
        };
    }

    calculateEfficiencyScore(metrics) {
        metrics.efficiencyScore = metrics.estimatedCostPerHour > 0 
            ? metrics.processCount / metrics.estimatedCostPerHour 
            : 0;
        return metrics;
    }

    generateExperimentRun(profile, duration = 10) {
        console.log(`\n=== Simulating experiment for ${profile} profile ===`);
        
        const experiment = {
            profile,
            startTime: new Date(),
            metrics: [],
            summary: {}
        };

        // Simulate collecting metrics over time
        for (let i = 0; i < duration; i++) {
            const metrics = this.generateExperimentMetrics(profile);
            this.calculateEfficiencyScore(metrics);
            experiment.metrics.push(metrics);
            
            console.log(`[Minute ${i + 1}] ${profile}: ` +
                `Processes: ${metrics.processCount}, ` +
                `DPM: ${metrics.dataPointsPerMinute}, ` +
                `Cost/hr: $${metrics.estimatedCostPerHour.toFixed(2)}, ` +
                `Efficiency: ${metrics.efficiencyScore.toFixed(1)} processes/$`
            );
        }

        experiment.endTime = new Date();
        experiment.summary = this.calculateSummary(experiment.metrics);
        
        return experiment;
    }

    calculateSummary(metrics) {
        const fields = ['processCount', 'dataPointsPerMinute', 'estimatedCostPerHour', 'efficiencyScore'];
        const summary = {};

        fields.forEach(field => {
            const values = metrics.map(m => m[field]);
            summary[field] = {
                avg: values.reduce((a, b) => a + b, 0) / values.length,
                min: Math.min(...values),
                max: Math.max(...values),
                last: values[values.length - 1]
            };
        });

        return summary;
    }

    generateFullReport() {
        const experiments = [];
        
        // Run experiments for each profile
        this.config.profiles.forEach(profile => {
            const experiment = this.generateExperimentRun(profile);
            experiments.push(experiment);
        });

        // Generate report
        const report = {
            runDate: new Date().toISOString(),
            duration: 10, // minutes
            profiles: this.config.profiles,
            experiments: experiments.map(exp => ({
                profile: exp.profile,
                duration: (exp.endTime - exp.startTime) / 1000,
                summary: exp.summary,
                metrics: exp.metrics
            })),
            recommendations: this.generateRecommendations(experiments),
            expectedNRDBQueries: this.generateExpectedQueries()
        };

        return report;
    }

    generateRecommendations(experiments) {
        const bestEfficiency = experiments.reduce((best, exp) => 
            exp.summary.efficiencyScore.avg > best.summary.efficiencyScore.avg ? exp : best
        );
        
        const lowestCost = experiments.reduce((best, exp) => 
            exp.summary.estimatedCostPerHour.avg < best.summary.estimatedCostPerHour.avg ? exp : best
        );
        
        const bestCoverage = experiments.reduce((best, exp) => 
            exp.summary.processCount.avg > best.summary.processCount.avg ? exp : best
        );

        return {
            bestEfficiency: bestEfficiency.profile,
            lowestCost: lowestCost.profile,
            bestCoverage: bestCoverage.profile,
            recommendation: 'balanced' // Simple default
        };
    }

    generateExpectedQueries() {
        return {
            processCount: "SELECT uniqueCount(dimensions.process.executable.name) as processCount FROM Metric WHERE metricName = 'process.cpu.utilization' SINCE 5 minutes ago",
            dataPointsRate: "SELECT rate(sum(otelcol_receiver_accepted_data_points), 1 minute) as dataPointsPerMinute FROM Metric SINCE 5 minutes ago",
            avgCpu: "SELECT average(system.cpu.utilization) as avgCpu FROM Metric SINCE 5 minutes ago",
            nrdotMetrics: "SELECT average(nrdot.optimization.score) as score, average(nrdot.cost.reduction) as costReduction, average(nrdot.process.coverage) as coverage FROM Metric WHERE metricName LIKE 'nrdot.%' SINCE 5 minutes ago",
            collectorHealth: "SELECT latest(otelcol_process_uptime) as uptime, latest(otelcol_process_memory_rss) as memoryRss FROM Metric SINCE 1 minute ago"
        };
    }

    displayReport() {
        const report = this.generateFullReport();
        
        console.log('\n=== Experiment Results Summary ===\n');
        console.log('Profile Comparison:');
        console.log('==================');
        
        report.experiments.forEach(exp => {
            console.log(`\n${exp.profile.toUpperCase()}:`);
            console.log(`  Avg Processes: ${exp.summary.processCount.avg.toFixed(0)}`);
            console.log(`  Avg DPM: ${exp.summary.dataPointsPerMinute.avg.toFixed(0)}`);
            console.log(`  Avg Cost/hr: $${exp.summary.estimatedCostPerHour.avg.toFixed(2)}`);
            console.log(`  Avg Efficiency: ${exp.summary.efficiencyScore.avg.toFixed(1)} processes/$`);
        });
        
        console.log('\n=== Recommendations ===');
        console.log(`Best Efficiency: ${report.recommendations.bestEfficiency}`);
        console.log(`Lowest Cost: ${report.recommendations.lowestCost}`);
        console.log(`Best Coverage: ${report.recommendations.bestCoverage}`);
        console.log(`Recommended Profile: ${report.recommendations.recommendation}`);
        
        console.log('\n=== Expected NRDB Queries ===');
        Object.entries(report.expectedNRDBQueries).forEach(([name, query]) => {
            console.log(`\n${name}:`);
            console.log(`  ${query}`);
        });
        
        console.log('\n=== Expected Data in NRDB ===');
        console.log('The following metrics should be available in NRDB:');
        console.log('- system.cpu.utilization');
        console.log('- system.memory.utilization');
        console.log('- process.cpu.utilization (with process.executable.name dimension)');
        console.log('- process.memory.usage (with process.executable.name dimension)');
        console.log('- nrdot.optimization.score');
        console.log('- nrdot.cost.reduction');
        console.log('- nrdot.process.coverage');
        console.log('- otelcol_receiver_accepted_data_points');
        console.log('- otelcol_exporter_sent_data_points');
        console.log('- otelcol_process_uptime');
        console.log('- otelcol_process_memory_rss');
    }

    run() {
        console.log('NRDOT Experiment Data Format Test\n');
        this.displayReport();
    }
}

const tester = new TestExperimentData();
tester.run();