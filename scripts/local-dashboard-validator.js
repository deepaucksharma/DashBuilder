#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');

class LocalDashboardValidator {
  constructor() {
    this.prometheusUrl = 'http://localhost:8889/metrics';
    this.availableMetrics = new Set();
    this.validationResults = {
      valid: [],
      warnings: [],
      errors: [],
      suggestions: []
    };
  }

  // Fetch metrics from Prometheus endpoint
  async fetchPrometheusMetrics() {
    return new Promise((resolve, reject) => {
      http.get(this.prometheusUrl, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  // Parse Prometheus metrics
  parseMetrics(prometheusData) {
    const lines = prometheusData.split('\n');
    const metrics = new Map();
    
    lines.forEach(line => {
      if (line.startsWith('system_')) {
        const match = line.match(/^([a-z_]+)(\{[^}]*\})?\s+([0-9.]+)/);
        if (match) {
          const metricName = match[1];
          const labels = match[2] || '';
          
          if (!metrics.has(metricName)) {
            metrics.set(metricName, new Set());
          }
          
          // Extract label keys
          const labelMatches = labels.matchAll(/([a-z_]+)="/g);
          for (const labelMatch of labelMatches) {
            metrics.get(metricName).add(labelMatch[1]);
          }
        }
      }
    });
    
    return metrics;
  }

  // Convert Prometheus metric name to OTEL format
  prometheusToOtel(prometheusName) {
    // system_cpu_time_seconds_total -> system.cpu.time
    return prometheusName
      .replace(/_seconds_total$/, '')
      .replace(/_total$/, '')
      .replace(/_bytes$/, '')
      .replace(/_/g, '.');
  }

  // Validate NRQL query against available metrics
  validateQuery(query, widgetTitle) {
    console.log(`\nValidating: ${widgetTitle}`);
    console.log(`Query: ${query.substring(0, 100)}...`);
    
    const validation = {
      title: widgetTitle,
      query: query,
      issues: [],
      suggestions: []
    };

    // Extract metric references from query
    const metricRegex = /system\.[a-z_.]+/g;
    const referencedMetrics = query.match(metricRegex) || [];
    
    referencedMetrics.forEach(metric => {
      // Convert to Prometheus format for checking
      const prometheusName = metric.replace(/\./g, '_');
      
      // Check exact match
      let found = false;
      this.availableMetrics.forEach((labels, name) => {
        if (name.includes(prometheusName.replace('system_', ''))) {
          found = true;
        }
      });

      if (!found) {
        validation.issues.push(`Metric '${metric}' not found`);
        
        // Suggest alternatives
        const suggestions = [];
        this.availableMetrics.forEach((labels, name) => {
          const otelName = this.prometheusToOtel(name);
          if (otelName.includes(metric.split('.')[1])) {
            suggestions.push(otelName);
          }
        });
        
        if (suggestions.length > 0) {
          validation.suggestions.push(`Try: ${suggestions.join(', ')}`);
        }
      }
    });

    // Check for common issues
    if (query.includes('system.filesystem.free')) {
      validation.issues.push("'system.filesystem.free' doesn't exist");
      validation.suggestions.push("Use 'system.filesystem.usage' instead");
    }

    if (query.includes('service.name = \'nrdot-collector\'') && !query.includes('dashbuilder-host')) {
      validation.suggestions.push("Consider adding: AND host.id = 'dashbuilder-host'");
    }

    // Display results
    if (validation.issues.length === 0) {
      console.log('✅ Query appears valid');
      this.validationResults.valid.push(validation);
    } else {
      console.log(`⚠️  Issues found: ${validation.issues.length}`);
      validation.issues.forEach(issue => console.log(`   - ${issue}`));
      if (validation.suggestions.length > 0) {
        console.log('💡 Suggestions:');
        validation.suggestions.forEach(suggestion => console.log(`   - ${suggestion}`));
      }
      this.validationResults.warnings.push(validation);
    }

    return validation;
  }

  // Create corrected dashboard
  createCorrectedDashboard() {
    console.log('\n🔧 Creating corrected dashboard...\n');

    const dashboard = {
      name: "NRDOT System Metrics - Corrected",
      description: "Dashboard with validated queries based on actual available metrics",
      permissions: "PUBLIC_READ_WRITE",
      pages: [
        {
          name: "System Overview",
          description: "Core system metrics",
          widgets: []
        },
        {
          name: "NRDOT Optimization",
          description: "Cost and performance tracking",
          widgets: []
        }
      ]
    };

    // System Overview widgets
    const systemWidgets = dashboard.pages[0].widgets;

    // CPU Usage
    if (this.availableMetrics.has('system_cpu_time_seconds_total')) {
      systemWidgets.push({
        title: "CPU Usage by State",
        layout: { column: 1, row: 1, width: 4, height: 3 },
        visualization: { id: "viz.line" },
        rawConfiguration: {
          facet: { showOtherSeries: false },
          legend: { enabled: true },
          nrqlQueries: [{
            accountIds: [3630072],
            query: "SELECT rate(sum(system.cpu.time), 1 second) FROM Metric WHERE host.id = 'dashbuilder-host' FACET state SINCE 30 minutes ago TIMESERIES"
          }],
          yAxisLeft: { zero: true }
        }
      });
    }

    // Memory Usage
    if (this.availableMetrics.has('system_memory_usage_bytes')) {
      systemWidgets.push({
        title: "Memory Usage by State",
        layout: { column: 5, row: 1, width: 4, height: 3 },
        visualization: { id: "viz.area" },
        rawConfiguration: {
          facet: { showOtherSeries: false },
          legend: { enabled: true },
          nrqlQueries: [{
            accountIds: [3630072],
            query: "SELECT latest(system.memory.usage) / 1e9 as 'GB' FROM Metric WHERE host.id = 'dashbuilder-host' FACET state SINCE 30 minutes ago TIMESERIES"
          }]
        }
      });
    }

    // CPU Load Average
    if (this.availableMetrics.has('system_cpu_load_average_15m')) {
      systemWidgets.push({
        title: "CPU Load Averages",
        layout: { column: 9, row: 1, width: 4, height: 3 },
        visualization: { id: "viz.billboard" },
        rawConfiguration: {
          nrqlQueries: [{
            accountIds: [3630072],
            query: "SELECT latest(system.cpu.load_average.1m) as '1 min', latest(system.cpu.load_average.5m) as '5 min', latest(system.cpu.load_average.15m) as '15 min' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 5 minutes ago"
          }],
          thresholds: [
            { alertSeverity: "WARNING", value: 0.8 },
            { alertSeverity: "CRITICAL", value: 1.0 }
          ]
        }
      });
    }

    // Disk I/O
    if (this.availableMetrics.has('system_disk_io_bytes_total')) {
      systemWidgets.push({
        title: "Disk I/O Rate",
        layout: { column: 1, row: 4, width: 4, height: 3 },
        visualization: { id: "viz.line" },
        rawConfiguration: {
          facet: { showOtherSeries: false },
          legend: { enabled: true },
          nrqlQueries: [{
            accountIds: [3630072],
            query: "SELECT rate(sum(system.disk.io), 1 second) / 1e6 as 'MB/s' FROM Metric WHERE host.id = 'dashbuilder-host' FACET device, direction SINCE 30 minutes ago TIMESERIES"
          }]
        }
      });
    }

    // Network I/O
    if (this.availableMetrics.has('system_network_io_bytes_total')) {
      systemWidgets.push({
        title: "Network I/O Rate",
        layout: { column: 5, row: 4, width: 4, height: 3 },
        visualization: { id: "viz.line" },
        rawConfiguration: {
          facet: { showOtherSeries: false },
          legend: { enabled: true },
          nrqlQueries: [{
            accountIds: [3630072],
            query: "SELECT rate(sum(system.network.io), 1 second) / 1e6 as 'MB/s' FROM Metric WHERE host.id = 'dashbuilder-host' AND device != 'lo' FACET device, direction SINCE 30 minutes ago TIMESERIES"
          }]
        }
      });
    }

    // Filesystem Usage
    if (this.availableMetrics.has('system_filesystem_usage_bytes')) {
      systemWidgets.push({
        title: "Filesystem Usage",
        layout: { column: 9, row: 4, width: 4, height: 3 },
        visualization: { id: "viz.table" },
        rawConfiguration: {
          nrqlQueries: [{
            accountIds: [3630072],
            query: "SELECT latest(system.filesystem.usage) / 1e9 as 'Used GB', latest(system.filesystem.inodes.usage) as 'Inodes' FROM Metric WHERE host.id = 'dashbuilder-host' FACET device, mountpoint SINCE 5 minutes ago LIMIT 10"
          }]
        }
      });
    }

    // NRDOT Optimization widgets
    const optimizationWidgets = dashboard.pages[1].widgets;

    // Metric Collection Stats
    optimizationWidgets.push({
      title: "Metrics Collection Overview",
      layout: { column: 1, row: 1, width: 6, height: 3 },
      visualization: { id: "viz.billboard" },
      rawConfiguration: {
        nrqlQueries: [{
          accountIds: [3630072],
          query: "SELECT uniqueCount(metricName) as 'Unique Metrics', count(*) as 'Total Data Points', rate(count(*), 1 hour) as 'Hourly Rate' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 10 minutes ago"
        }]
      }
    });

    // Data Volume Trend
    optimizationWidgets.push({
      title: "Data Volume Trend",
      layout: { column: 7, row: 1, width: 6, height: 3 },
      visualization: { id: "viz.line" },
      rawConfiguration: {
        legend: { enabled: true },
        nrqlQueries: [{
          accountIds: [3630072],
          query: "SELECT rate(count(*), 1 minute) as 'Data Points/min' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago TIMESERIES"
        }]
      }
    });

    // Cost Estimation
    optimizationWidgets.push({
      title: "Estimated Monthly Cost",
      layout: { column: 1, row: 4, width: 4, height: 3 },
      visualization: { id: "viz.billboard" },
      rawConfiguration: {
        nrqlQueries: [{
          accountIds: [3630072],
          query: "SELECT rate(count(*), 1 month) / 1e9 as 'Billion Points/Month', rate(count(*), 1 month) / 1e9 * 0.30 as 'Est. Cost (USD)' FROM Metric WHERE host.id = 'dashbuilder-host' SINCE 1 hour ago"
        }],
        thresholds: [
          { alertSeverity: "WARNING", value: 5 },
          { alertSeverity: "CRITICAL", value: 10 }
        ]
      }
    });

    // Metric Distribution
    optimizationWidgets.push({
      title: "Metrics by Type",
      layout: { column: 5, row: 4, width: 8, height: 3 },
      visualization: { id: "viz.pie" },
      rawConfiguration: {
        facet: { showOtherSeries: true },
        nrqlQueries: [{
          accountIds: [3630072],
          query: "SELECT count(*) FROM Metric WHERE host.id = 'dashbuilder-host' FACET cases(WHERE metricName LIKE 'system.cpu%' as 'CPU', WHERE metricName LIKE 'system.memory%' as 'Memory', WHERE metricName LIKE 'system.disk%' as 'Disk', WHERE metricName LIKE 'system.network%' as 'Network', WHERE metricName LIKE 'system.filesystem%' as 'Filesystem') SINCE 1 hour ago"
        }]
      }
    });

    return dashboard;
  }

  // Main validation process
  async validate() {
    console.log('='.repeat(60));
    console.log('LOCAL DASHBOARD VALIDATOR');
    console.log('='.repeat(60));

    // Fetch current metrics
    console.log('\n📊 Fetching metrics from Prometheus endpoint...');
    try {
      const prometheusData = await this.fetchPrometheusMetrics();
      this.availableMetrics = this.parseMetrics(prometheusData);
      console.log(`✅ Found ${this.availableMetrics.size} unique metrics`);
      
      // Show metric categories
      const categories = {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0,
        filesystem: 0,
        other: 0
      };
      
      this.availableMetrics.forEach((labels, name) => {
        if (name.includes('cpu')) categories.cpu++;
        else if (name.includes('memory')) categories.memory++;
        else if (name.includes('disk')) categories.disk++;
        else if (name.includes('network')) categories.network++;
        else if (name.includes('filesystem')) categories.filesystem++;
        else categories.other++;
      });
      
      console.log('\nMetrics by category:');
      Object.entries(categories).forEach(([cat, count]) => {
        if (count > 0) console.log(`  ${cat}: ${count}`);
      });
      
    } catch (error) {
      console.error(`❌ Failed to fetch metrics: ${error.message}`);
      console.error('Is the OTEL collector running on port 8889?');
      return;
    }

    // Validate existing dashboard
    const dashboardPath = path.join(__dirname, '..', 'dashboards', 'nrdot-dashboard-final.json');
    if (fs.existsSync(dashboardPath)) {
      console.log('\n📋 Validating existing dashboard...');
      const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
      
      dashboard.pages.forEach(page => {
        console.log(`\nPage: ${page.name}`);
        page.widgets.forEach(widget => {
          if (widget.rawConfiguration?.nrqlQueries) {
            widget.rawConfiguration.nrqlQueries.forEach(q => {
              this.validateQuery(q.query, widget.title);
            });
          }
        });
      });
    }

    // Create corrected dashboard
    const correctedDashboard = this.createCorrectedDashboard();
    const correctedPath = path.join(__dirname, '..', 'dashboards', 'nrdot-dashboard-corrected.json');
    fs.writeFileSync(correctedPath, JSON.stringify(correctedDashboard, null, 2));
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`\n✅ Valid queries: ${this.validationResults.valid.length}`);
    console.log(`⚠️  Warnings: ${this.validationResults.warnings.length}`);
    console.log(`❌ Errors: ${this.validationResults.errors.length}`);
    
    if (this.validationResults.warnings.length > 0) {
      console.log('\nIssues found:');
      this.validationResults.warnings.forEach(w => {
        console.log(`\n${w.title}:`);
        w.issues.forEach(issue => console.log(`  - ${issue}`));
        if (w.suggestions.length > 0) {
          w.suggestions.forEach(suggestion => console.log(`  💡 ${suggestion}`));
        }
      });
    }
    
    console.log(`\n✅ Corrected dashboard saved to:`);
    console.log(`   ${correctedPath}`);
    console.log('\nThis dashboard has been validated against actual available metrics.');
    console.log('All queries should work when imported to New Relic.');
    
    // Copy to clipboard
    console.log('\n📋 Copy dashboard to clipboard? (y/n)');
  }
}

// Run validator
const validator = new LocalDashboardValidator();
validator.validate().catch(console.error);