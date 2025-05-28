#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

/**
 * Visualize experiment results from JSON files
 */
class ExperimentVisualizer {
    constructor() {
        this.resultsDir = path.join(__dirname, '..', 'experiment-results');
    }

    async loadResults() {
        try {
            const files = await fs.readdir(this.resultsDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            const results = [];
            for (const file of jsonFiles) {
                const data = await fs.readFile(path.join(this.resultsDir, file), 'utf8');
                results.push(JSON.parse(data));
            }
            
            return results.sort((a, b) => new Date(b.runDate) - new Date(a.runDate));
        } catch (error) {
            console.error('Error loading results:', error.message);
            return [];
        }
    }

    formatNumber(num) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(num);
    }

    formatCurrency(num) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(num);
    }

    printProfileComparison(experiments) {
        console.log(chalk.blue.bold('\n📊 Profile Comparison Summary\n'));
        
        const headers = ['Profile', 'Avg Processes', 'Avg DPM', 'Cost/hr', 'Efficiency', 'Coverage'];
        const colWidths = [15, 15, 15, 12, 15, 12];
        
        // Print headers
        headers.forEach((header, i) => {
            process.stdout.write(chalk.gray(header.padEnd(colWidths[i])));
        });
        console.log();
        console.log(chalk.gray('─'.repeat(colWidths.reduce((a, b) => a + b, 0))));
        
        // Print data
        experiments.forEach(exp => {
            const profile = exp.profile.padEnd(colWidths[0]);
            const processes = this.formatNumber(exp.summary.processCount.avg).padEnd(colWidths[1]);
            const dpm = this.formatNumber(exp.summary.dataPointsPerMinute.avg).padEnd(colWidths[2]);
            const cost = this.formatCurrency(exp.summary.estimatedCostPerHour.avg).padEnd(colWidths[3]);
            const efficiency = this.formatNumber(exp.summary.efficiencyScore.avg).padEnd(colWidths[4]);
            const coverage = `${(exp.summary.processCoverage?.avg || 95).toFixed(1)}%`.padEnd(colWidths[5]);
            
            let color = chalk.white;
            if (exp.profile === 'conservative') color = chalk.green;
            else if (exp.profile === 'balanced') color = chalk.yellow;
            else if (exp.profile === 'aggressive') color = chalk.red;
            
            console.log(color(profile + processes + dpm + cost + efficiency + coverage));
        });
    }

    printRecommendations(result) {
        if (!result.recommendations) return;
        
        console.log(chalk.blue.bold('\n🎯 Recommendations\n'));
        
        const rec = result.recommendations;
        console.log(`${chalk.green('Best Efficiency:')} ${rec.bestEfficiency}`);
        console.log(`${chalk.yellow('Lowest Cost:')} ${rec.lowestCost}`);
        console.log(`${chalk.cyan('Best Coverage:')} ${rec.bestCoverage}`);
        console.log(`\n${chalk.bold('Recommended Profile:')} ${chalk.green.bold(rec.recommendation)}`);
    }

    async visualizeLatest() {
        const results = await this.loadResults();
        
        if (results.length === 0) {
            console.log(chalk.yellow('No experiment results found.'));
            console.log('Run experiments first with: npm run experiment:quick');
            return;
        }
        
        const latest = results[0];
        
        console.log(chalk.blue.bold('NRDOT Experiment Results Visualization'));
        console.log(chalk.gray('═'.repeat(50)));
        console.log(`Run Date: ${new Date(latest.runDate).toLocaleString()}`);
        console.log(`Duration: ${latest.duration}s per profile`);
        console.log(`Profiles Tested: ${latest.profiles.join(', ')}`);
        
        this.printProfileComparison(latest.experiments);
        this.printRecommendations(latest);
        
        // Show savings potential
        console.log(chalk.blue.bold('\n💰 Savings Potential\n'));
        
        const baseline = latest.experiments.find(e => e.profile === 'conservative');
        const recommended = latest.experiments.find(e => e.profile === latest.recommendations.recommendation);
        
        if (baseline && recommended) {
            const baselineCost = baseline.summary.estimatedCostPerHour.avg;
            const recommendedCost = recommended.summary.estimatedCostPerHour.avg;
            const savings = ((baselineCost - recommendedCost) / baselineCost) * 100;
            const monthlySavings = (baselineCost - recommendedCost) * 24 * 30;
            
            console.log(`Current Cost (Conservative): ${chalk.red(this.formatCurrency(baselineCost) + '/hr')}`);
            console.log(`Optimized Cost (${recommended.profile}): ${chalk.green(this.formatCurrency(recommendedCost) + '/hr')}`);
            console.log(`Savings: ${chalk.green.bold(savings.toFixed(1) + '%')}`);
            console.log(`Monthly Savings: ${chalk.green.bold(this.formatCurrency(monthlySavings))}`);
        }
        
        // Show historical trend if multiple results
        if (results.length > 1) {
            console.log(chalk.blue.bold('\n📈 Historical Trend\n'));
            console.log(`Total experiment runs: ${results.length}`);
            
            const dates = results.slice(0, 5).map(r => 
                new Date(r.runDate).toLocaleDateString()
            );
            console.log(`Recent runs: ${dates.join(', ')}`);
        }
    }

    async compareRuns(count = 3) {
        const results = await this.loadResults();
        const recentRuns = results.slice(0, count);
        
        if (recentRuns.length < 2) {
            console.log(chalk.yellow('Not enough runs to compare. Run more experiments!'));
            return;
        }
        
        console.log(chalk.blue.bold(`\n📊 Comparing Last ${recentRuns.length} Runs\n`));
        
        recentRuns.forEach((run, index) => {
            console.log(chalk.gray(`\nRun ${index + 1}: ${new Date(run.runDate).toLocaleString()}`));
            console.log(`Recommended: ${chalk.green(run.recommendations.recommendation)}`);
            
            const profile = run.experiments.find(e => e.profile === run.recommendations.recommendation);
            if (profile) {
                console.log(`  Cost: ${this.formatCurrency(profile.summary.estimatedCostPerHour.avg)}/hr`);
                console.log(`  Efficiency: ${this.formatNumber(profile.summary.efficiencyScore.avg)} processes/$`);
            }
        });
    }
}

// CLI
async function main() {
    const visualizer = new ExperimentVisualizer();
    const command = process.argv[2] || 'latest';
    
    switch (command) {
        case 'latest':
            await visualizer.visualizeLatest();
            break;
        case 'compare':
            const count = parseInt(process.argv[3]) || 3;
            await visualizer.compareRuns(count);
            break;
        default:
            console.log('Usage: node visualize-experiments.js [latest|compare [count]]');
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ExperimentVisualizer;