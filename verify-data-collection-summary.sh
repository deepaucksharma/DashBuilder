#!/bin/bash

echo "=== NRDOT Data Collection Summary ==="
echo ""
echo "System Status:"
echo "--------------"

# Check if containers are running
if docker ps | grep -q nrdot-otel-collector; then
    echo "✅ OTEL Collector: Running"
else
    echo "❌ OTEL Collector: Not running"
fi

if docker ps | grep -q nrdot-metrics-generator; then
    echo "✅ Metrics Generator: Running"
else
    echo "❌ Metrics Generator: Not running"
fi

echo ""
echo "Data Being Collected:"
echo "--------------------"
echo "1. Host Metrics (from OTEL Collector):"
echo "   - CPU utilization (system and per-core)"
echo "   - Memory utilization and usage"
echo "   - Disk I/O metrics"
echo "   - Network metrics"
echo "   - Process metrics (CPU, memory for all processes)"
echo ""
echo "2. Simulated Process Metrics (from Metrics Generator):"
echo "   - 50 processes with realistic names (nginx, node, java, etc.)"
echo "   - Process CPU utilization with variance"
echo "   - Process memory usage with variance"
echo ""
echo "3. NRDOT KPI Metrics:"
echo "   - nrdot.optimization.score"
echo "   - nrdot.cost.reduction"
echo "   - nrdot.process.coverage"
echo ""
echo "4. Transformed Metrics (via metricstransform processor):"
echo "   - system.cpu.utilization → nrdot.cpu.utilization"
echo "   - system.memory.utilization → nrdot.memory.utilization"
echo "   - process.cpu.utilization → nrdot.process.cpu.utilization"
echo "   - process.memory.usage → nrdot.process.memory.usage"
echo ""

# Check recent metrics
echo "Recent Activity:"
echo "---------------"
RECENT_LOGS=$(docker logs nrdot-metrics-generator 2>&1 | tail -n 5 | grep "Sent")
if [ -n "$RECENT_LOGS" ]; then
    echo "$RECENT_LOGS"
else
    echo "No recent metrics sent"
fi

echo ""
echo "Data Format:"
echo "-----------"
echo "All metrics follow OTLP JSON format with:"
echo "- Resource attributes: service.name=nrdot, service.version=2.0"
echo "- Proper timestamps in nanoseconds"
echo "- Dimensions for process identification"
echo "- Correct metric types (gauge for instantaneous values)"
echo ""
echo "To Query in New Relic:"
echo "---------------------"
echo "1. Check all NRDOT metrics:"
echo "   SELECT count(*) FROM Metric WHERE service.name = 'nrdot' SINCE 5 minutes ago FACET metricName"
echo ""
echo "2. Check process metrics with names:"
echo "   SELECT latest(process.cpu.utilization) FROM Metric WHERE process.executable.name IS NOT NULL SINCE 5 minutes ago FACET process.executable.name LIMIT 20"
echo ""
echo "3. Check NRDOT KPIs:"
echo "   SELECT latest(nrdot.optimization.score), latest(nrdot.cost.reduction), latest(nrdot.process.coverage) FROM Metric SINCE 5 minutes ago"
echo ""
echo "4. Check data volume:"
echo "   SELECT rate(count(*), 1 minute) as 'Metrics per minute' FROM Metric WHERE service.name = 'nrdot' SINCE 10 minutes ago TIMESERIES"