#!/bin/bash
# Open all dashboard URLs

echo "Opening dashboards..."

# Detect OS and open URLs accordingly
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open http://localhost:3000 &
    open http://localhost:9090 &
    open http://localhost:3001 &
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v xdg-open > /dev/null; then
        xdg-open http://localhost:3000 &
        xdg-open http://localhost:9090 &
        xdg-open http://localhost:3001 &
    fi
fi

echo "Dashboard URLs:"
echo "  • Dashboard UI: http://localhost:3000"
echo "  • Prometheus: http://localhost:9090"
echo "  • Grafana: http://localhost:3001 (admin/admin)"
echo "  • NRDOT Metrics: http://localhost:8888/metrics"