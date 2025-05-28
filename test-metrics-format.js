#!/usr/bin/env node

import axios from 'axios';
import os from 'os';

// Test metrics generator to verify format
class TestMetricsFormat {
    constructor() {
        this.hostname = os.hostname();
        this.processCount = 10;
        this.processes = this.generateProcessList();
    }

    generateProcessList() {
        const commonProcesses = [
            'nginx', 'node', 'java', 'python3', 'postgres', 'mysql', 'redis-server',
            'docker', 'kubelet', 'chrome'
        ];

        const processes = [];
        for (let i = 0; i < this.processCount; i++) {
            processes.push({
                name: commonProcesses[i],
                pid: 1000 + i,
                cpuBase: Math.random() * 10,
                memoryBase: Math.random() * 500 * 1024 * 1024, // Up to 500MB
                isCritical: i < 5
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
                    asDouble: 20 + Math.random() * 30,
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
                    asDouble: 40 + Math.random() * 20,
                    attributes: [
                        { key: "host.name", value: { stringValue: this.hostname } }
                    ]
                }]
            }
        });

        // Process metrics
        this.processes.forEach(proc => {
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

        // NRDOT KPI metrics
        metrics.push({
            name: "nrdot.optimization.score",
            unit: "1",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: 85.5,
                    attributes: [
                        { key: "optimization_mode", value: { stringValue: "balanced" } }
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
                    asDouble: 72.3,
                    attributes: [
                        { key: "profile", value: { stringValue: "balanced" } }
                    ]
                }]
            }
        });

        metrics.push({
            name: "nrdot.process.coverage",
            unit: "%",
            gauge: {
                dataPoints: [{
                    timeUnixNano: now,
                    asDouble: 96.7,
                    attributes: [
                        { key: "profile", value: { stringValue: "balanced" } }
                    ]
                }]
            }
        });

        return metrics;
    }

    generateOTLPPayload() {
        const payload = {
            resourceMetrics: [{
                resource: {
                    attributes: [
                        { key: "service.name", value: { stringValue: "nrdot" } },
                        { key: "service.version", value: { stringValue: "2.0" } },
                        { key: "host.name", value: { stringValue: this.hostname } },
                        { key: "telemetry.sdk.name", value: { stringValue: "opentelemetry" } },
                        { key: "telemetry.sdk.language", value: { stringValue: "javascript" } },
                        { key: "telemetry.sdk.version", value: { stringValue: "1.0.0" } }
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

        return payload;
    }

    displayMetrics() {
        const payload = this.generateOTLPPayload();
        
        console.log('=== OTLP Metrics Payload Format ===\n');
        console.log(JSON.stringify(payload, null, 2));
        
        console.log('\n=== Summary ===');
        console.log(`Total metrics: ${payload.resourceMetrics[0].scopeMetrics[0].metrics.length}`);
        
        const metricTypes = {};
        payload.resourceMetrics[0].scopeMetrics[0].metrics.forEach(metric => {
            const type = Object.keys(metric).find(k => k !== 'name' && k !== 'unit');
            metricTypes[type] = (metricTypes[type] || 0) + 1;
        });
        
        console.log('Metric types:', metricTypes);
        
        console.log('\n=== Metric Names ===');
        payload.resourceMetrics[0].scopeMetrics[0].metrics.forEach(metric => {
            console.log(`- ${metric.name} (${metric.unit})`);
        });
    }

    async testEndpoint() {
        const endpoint = process.env.OTEL_ENDPOINT || 'http://localhost:4318';
        console.log(`\n=== Testing endpoint: ${endpoint}/v1/metrics ===`);
        
        try {
            const response = await axios.post(
                `${endpoint}/v1/metrics`,
                this.generateOTLPPayload(),
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                }
            );
            
            console.log(`Response Status: ${response.status}`);
            console.log('Response Headers:', response.headers);
            if (response.data) {
                console.log('Response Data:', response.data);
            }
        } catch (error) {
            console.error('Error testing endpoint:', error.message);
            if (error.code === 'ECONNREFUSED') {
                console.log('Note: OTEL collector is not running at', endpoint);
            }
        }
    }

    run() {
        console.log('NRDOT Metrics Format Test\n');
        
        this.displayMetrics();
        
        // Test endpoint if requested
        if (process.argv.includes('--test-endpoint')) {
            this.testEndpoint();
        }
    }
}

const tester = new TestMetricsFormat();
tester.run();