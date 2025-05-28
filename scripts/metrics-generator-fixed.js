#!/usr/bin/env node

import axios from 'axios';
import os from 'os';

// Metrics generator for testing NRDOT
class MetricsGenerator {
    constructor() {
        this.endpoint = process.env.OTEL_ENDPOINT || 'http://localhost:4318';
        this.interval = parseInt(process.env.METRIC_INTERVAL) || 10000; // 10 seconds
        this.processCount = parseInt(process.env.PROCESS_COUNT) || 50;
        this.hostname = os.hostname();
        
        this.processes = this.generateProcessList();
    }

    generateProcessList() {
        const commonProcesses = [
            'nginx', 'node', 'java', 'python3', 'postgres', 'mysql', 'redis-server',
            'docker', 'kubelet', 'chrome', 'firefox', 'code', 'slack', 'zoom',
            'systemd', 'sshd', 'cron', 'apache2', 'php-fpm', 'mongodb', 'elasticsearch'
        ];

        const processes = [];
        for (let i = 0; i < this.processCount; i++) {
            const name = i < commonProcesses.length 
                ? commonProcesses[i] 
                : `app-${i}`;
            
            processes.push({
                name,
                pid: 1000 + i,
                cpuBase: Math.random() * 10,
                memoryBase: Math.random() * 500 * 1024 * 1024, // Up to 500MB
                isCritical: i < 10 // First 10 are critical
            });
        }
        
        return processes;
    }

    generateMetrics() {
        const now = Date.now() * 1000000; // nanoseconds
        const metrics = [];

        // System metrics
        metrics.push({
            name: "system.cpu.utilization",
            unit: "1",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: 20 + Math.random() * 30, // 20-50%
                    attributes: [
                        { key: "host.name", value: { stringValue: this.hostname } },
                        { key: "cpu", value: { stringValue: "all" } }
                    ]
                }]
            }
        });

        metrics.push({
            name: "system.memory.utilization",
            unit: "1",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: 40 + Math.random() * 20, // 40-60%
                    attributes: [
                        { key: "host.name", value: { stringValue: this.hostname } }
                    ]
                }]
            }
        });

        // Process metrics
        this.processes.forEach(proc => {
            // CPU utilization with some variance
            const cpuUtil = Math.max(0, proc.cpuBase + (Math.random() - 0.5) * 5);
            metrics.push({
                name: "process.cpu.utilization",
                unit: "1",
                gauge: {
                    dataPoints: [{
                        timeUnixNano: now,
                        asDouble: cpuUtil,
                        attributes: [
                            { key: "host.name", value: { stringValue: this.hostname } },
                            { key: "process.executable.name", value: { stringValue: proc.name } },
                            { key: "process.pid", value: { intValue: proc.pid } }
                        ]
                    }]
                }
            });

            // Memory usage with some variance
            const memUsage = Math.max(0, proc.memoryBase + (Math.random() - 0.5) * 50 * 1024 * 1024);
            metrics.push({
                name: "process.memory.usage",
                unit: "By",
                gauge: {
                    dataPoints: [{
                        timeUnixNano: now,
                        asDouble: memUsage,
                        attributes: [
                            { key: "host.name", value: { stringValue: this.hostname } },
                            { key: "process.executable.name", value: { stringValue: proc.name } },
                            { key: "process.pid", value: { intValue: proc.pid } }
                        ]
                    }]
                }
            });
        });

        // NRDOT KPI Metrics for experiments
        const profile = process.env.NRDOT_PROFILE || 'balanced';
        const profileMultipliers = {
            conservative: { cost: 0.3, coverage: 0.7, score: 65 },
            balanced: { cost: 0.5, coverage: 0.85, score: 80 },
            aggressive: { cost: 0.7, coverage: 0.95, score: 90 },
            emergency: { cost: 0.9, coverage: 0.99, score: 95 }
        };
        const mult = profileMultipliers[profile] || profileMultipliers.balanced;

        // Cost metrics
        metrics.push({
            name: "nrdot.cost.per_hour",
            unit: "USD",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: 2.5 * mult.cost + (Math.random() - 0.5) * 0.2,
                    attributes: [
                        { key: "profile", value: { stringValue: profile } }
                    ]
                }]
            }
        });

        metrics.push({
            name: "nrdot.cost.reduction",
            unit: "%",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: (1 - mult.cost) * 100 + (Math.random() - 0.5) * 5,
                    attributes: [
                        { key: "profile", value: { stringValue: profile } }
                    ]
                }]
            }
        });

        // Coverage metrics
        metrics.push({
            name: "nrdot.process.coverage",
            unit: "%",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: mult.coverage * 100 + (Math.random() - 0.5) * 3,
                    attributes: [
                        { key: "profile", value: { stringValue: profile } }
                    ]
                }]
            }
        });

        metrics.push({
            name: "nrdot.process.count.total",
            unit: "1",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: this.processCount,
                    attributes: [
                        { key: "profile", value: { stringValue: profile } }
                    ]
                }]
            }
        });

        metrics.push({
            name: "nrdot.process.count.monitored",
            unit: "1",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: Math.floor(this.processCount * mult.coverage),
                    attributes: [
                        { key: "profile", value: { stringValue: profile } }
                    ]
                }]
            }
        });

        // Performance metrics
        metrics.push({
            name: "nrdot.optimization.score",
            unit: "1",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: mult.score + (Math.random() - 0.5) * 5,
                    attributes: [
                        { key: "profile", value: { stringValue: profile } }
                    ]
                }]
            }
        });

        metrics.push({
            name: "nrdot.datapoints.per_minute",
            unit: "1/min",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: 6000 * mult.coverage + (Math.random() - 0.5) * 500,
                    attributes: [
                        { key: "profile", value: { stringValue: profile } }
                    ]
                }]
            }
        });

        // OTEL collector metrics
        metrics.push({
            name: "otelcol_receiver_accepted_data_points",
            unit: "1",
            sum: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: metrics.length * 2,
                    attributes: [
                        { key: "receiver", value: { stringValue: "otlp" } },
                        { key: "transport", value: { stringValue: "http" } }
                    ]
                }],
                aggregationTemporality: 2,
                isMonotonic: true
            }
        });

        metrics.push({
            name: "otelcol_exporter_sent_data_points",
            unit: "1",
            sum: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: metrics.length * 1.8 * mult.coverage,
                    attributes: [
                        { key: "exporter", value: { stringValue: "otlp" } }
                    ]
                }],
                aggregationTemporality: 2,
                isMonotonic: true
            }
        });

        return metrics;
    }

    async sendMetrics() {
        const payload = {
            resourceMetrics: [{
                resource: {
                    attributes: [
                        { key: "service.name", value: { stringValue: "nrdot" } },
                        { key: "service.version", value: { stringValue: "2.0" } },
                        { key: "host.name", value: { stringValue: this.hostname } }
                    ]
                },
                scopeMetrics: [{
                    scope: {
                        name: "nrdot.metrics.generator",
                        version: "1.0.0"
                    },
                    metrics: this.generateMetrics()
                }]
            }]
        };

        try {
            const response = await axios.post(
                `${this.endpoint}/v1/metrics`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log(`Sent ${payload.resourceMetrics[0].scopeMetrics[0].metrics.length} metrics - Status: ${response.status}`);
        } catch (error) {
            console.error('Error sending metrics:', error.message);
            if (error.response) {
                console.error('Response:', error.response.data);
            }
        }
    }

    async run() {
        console.log('Starting metrics generator...');
        console.log(`Endpoint: ${this.endpoint}`);
        console.log(`Generating metrics for ${this.processCount} processes`);
        console.log(`Interval: ${this.interval}ms`);

        // Send metrics immediately
        await this.sendMetrics();

        // Then on interval
        setInterval(() => {
            this.sendMetrics();
        }, this.interval);
    }
}

// Run if called directly
const generator = new MetricsGenerator();
generator.run().catch(console.error);

export default MetricsGenerator;