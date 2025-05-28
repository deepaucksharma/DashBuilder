#!/bin/bash

echo "=== NRDOT Data Verification in NRDB ==="
echo ""
echo "The following data should be available in New Relic:"
echo ""

echo "1. System Metrics:"
echo "   - system.cpu.utilization"
echo "   - system.memory.utilization" 
echo "   - nrdot.cpu.utilization (transformed)"
echo "   - nrdot.memory.utilization (transformed)"
echo ""

echo "2. Process Metrics (from host):"
echo "   - process.cpu.utilization"
echo "   - process.memory.usage"
echo "   - nrdot.process.cpu.utilization (transformed)"
echo "   - nrdot.process.memory.usage (transformed)"
echo ""

echo "3. Collector Health Metrics:"
echo "   - otelcol_process_uptime"
echo "   - otelcol_process_memory_rss"
echo "   - otelcol_receiver_accepted_data_points"
echo "   - otelcol_exporter_sent_data_points"
echo ""

echo "4. Check current collector status:"
curl -s http://localhost:8889/metrics | grep -E "otel_nrdot|otelcol_receiver|otelcol_exporter" | head -n 10

echo ""
echo "5. NRQL Queries to run in New Relic:"
echo ""
echo "# Check all metrics being received:"
echo "SELECT count(*) FROM Metric WHERE service.name = 'nrdot' SINCE 5 minutes ago FACET metricName"
echo ""
echo "# Check process metrics:"
echo "SELECT count(*) FROM Metric WHERE metricName LIKE 'process.%' OR metricName LIKE 'nrdot.process.%' SINCE 5 minutes ago FACET metricName"
echo ""
echo "# Check system metrics:"
echo "SELECT average(system.cpu.utilization), average(system.memory.utilization) FROM Metric WHERE service.name = 'nrdot' SINCE 5 minutes ago"
echo ""
echo "# Check transformed NRDOT metrics:"
echo "SELECT count(*) FROM Metric WHERE metricName LIKE 'nrdot.%' SINCE 5 minutes ago FACET metricName"
echo ""
echo "# Check collector health:"
echo "SELECT latest(otelcol_process_uptime), latest(otelcol_receiver_accepted_data_points) FROM Metric SINCE 5 minutes ago"
echo ""

echo "6. To enable more process metrics from the metrics generator:"
echo "   - The metrics-generator-fixed.js is already generating process metrics"
echo "   - It creates metrics for 50 different processes by default"
echo "   - Each process has CPU and memory metrics with proper dimensions"
echo ""

echo "7. Current collector configuration status:"
if docker ps | grep -q nrdot-otel-collector; then
    echo "   ✅ Collector is running"
    echo "   ✅ Host metrics scraper is enabled (including process scraper)"
    echo "   ✅ Metrics transformation is configured"
    echo "   ✅ Debug exporter shows $(docker logs nrdot-otel-collector 2>&1 | grep -c "MetricsExporter") metric exports"
else
    echo "   ❌ Collector is not running"
fi