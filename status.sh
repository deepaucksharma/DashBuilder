#!/bin/bash
# Quick status check for DashBuilder + NRDOT

echo "=== DashBuilder + NRDOT Status ==="
echo
docker-compose ps
echo
echo "=== NRDOT Metrics ==="
curl -s http://localhost:8888/metrics 2>/dev/null | grep -E "^nrdot_" | head -10 || echo "Metrics endpoint not available"
echo
echo "=== Service Health ==="
echo -n "Dashboard API: "
curl -s http://localhost:8080/health 2>/dev/null && echo " ✓" || echo " ✗"
echo -n "OTEL Collector: "
curl -s http://localhost:13133/health 2>/dev/null && echo " ✓" || echo " ✗"
echo
echo "=== Recent Logs (last 20 lines) ==="
docker-compose logs --tail=20 2>/dev/null | grep -E "(ERROR|WARN|Started)" || echo "No recent logs"