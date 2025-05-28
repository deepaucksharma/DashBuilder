#!/bin/bash

# Unified metrics testing script for NRDOT
# Combines functionality from multiple test scripts

source .env

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}NRDOT Metrics Test Suite${NC}"
echo "=============================="
echo "Account ID: $NEW_RELIC_ACCOUNT_ID"
echo "Region: ${NEW_RELIC_REGION:-US}"
echo ""

function test_metric_api() {
    echo -e "${YELLOW}Test 1: Metric API Direct Submission${NC}"
    
    # Create test metric payload
    cat > /tmp/test-metric.json << EOF
[{
  "metrics": [{
    "name": "nrdot.test.metric",
    "type": "gauge",
    "value": $(( RANDOM % 100 + 1 )),
    "timestamp": $(date +%s)000,
    "attributes": {
      "service.name": "nrdot-test",
      "environment": "test",
      "test.type": "direct-api"
    }
  }]
}]
EOF

    response=$(curl -s -w "\n%{http_code}" -X POST https://metric-api.newrelic.com/metric/v1 \
      -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
      -H "Content-Type: application/json" \
      -d @/tmp/test-metric.json)
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "202" ]; then
        echo -e "${GREEN}✓ Metric API submission successful${NC}"
        echo "  Response: $body"
    else
        echo -e "${RED}✗ Metric API submission failed${NC}"
        echo "  HTTP Code: $http_code"
        echo "  Response: $body"
        return 1
    fi
    echo ""
}

function test_otlp_endpoint() {
    echo -e "${YELLOW}Test 2: OTLP Endpoint${NC}"
    
    # Create OTLP metric payload
    cat > /tmp/otlp-metric.json << EOF
{
  "resourceMetrics": [{
    "resource": {
      "attributes": [{
        "key": "service.name",
        "value": { "stringValue": "nrdot-otlp-test" }
      }, {
        "key": "service.version",
        "value": { "stringValue": "1.0.0" }
      }]
    },
    "scopeMetrics": [{
      "metrics": [{
        "name": "nrdot.otlp.test.metric",
        "gauge": {
          "dataPoints": [{
            "asDouble": $(( RANDOM % 100 + 1 )),
            "timeUnixNano": $(date +%s)000000000
          }]
        }
      }]
    }]
  }]
}
EOF

    endpoint="otlp.nr-data.net"
    if [ "$NEW_RELIC_REGION" = "EU" ]; then
        endpoint="otlp.eu01.nr-data.net"
    fi

    response=$(curl -s -w "\n%{http_code}" -X POST https://$endpoint/v1/metrics \
      -H "Api-Key: $NEW_RELIC_LICENSE_KEY" \
      -H "Content-Type: application/json" \
      -d @/tmp/otlp-metric.json)
    
    http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "202" ]; then
        echo -e "${GREEN}✓ OTLP endpoint submission successful${NC}"
    else
        echo -e "${RED}✗ OTLP endpoint submission failed${NC}"
        echo "  HTTP Code: $http_code"
        return 1
    fi
    echo ""
}

function query_metrics() {
    echo -e "${YELLOW}Test 3: Query Recent Metrics${NC}"
    
    # Wait a moment for metrics to be indexed
    echo "Waiting 5 seconds for metrics to be indexed..."
    sleep 5
    
    # Query for test metrics
    nrql="SELECT count(*) FROM Metric WHERE metricName LIKE 'nrdot.%' SINCE 5 minutes ago"
    
    response=$(curl -s -X POST https://insights-api.newrelic.com/v1/accounts/$NEW_RELIC_ACCOUNT_ID/query \
      -H "Accept: application/json" \
      -H "X-Query-Key: $NEW_RELIC_QUERY_KEY" \
      -d "{ \"nrql\": \"$nrql\" }")
    
    count=$(echo "$response" | jq -r '.results[0].count // 0')
    
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $count test metric(s) in NRDB${NC}"
    else
        echo -e "${YELLOW}⚠ No test metrics found yet (they may still be processing)${NC}"
    fi
    
    # Query for collector metrics
    echo ""
    echo "Checking for OpenTelemetry Collector metrics..."
    nrql="SELECT count(*) FROM Metric WHERE metricName LIKE 'otelcol_%' SINCE 5 minutes ago"
    
    response=$(curl -s -X POST https://insights-api.newrelic.com/v1/accounts/$NEW_RELIC_ACCOUNT_ID/query \
      -H "Accept: application/json" \
      -H "X-Query-Key: $NEW_RELIC_QUERY_KEY" \
      -d "{ \"nrql\": \"$nrql\" }")
    
    count=$(echo "$response" | jq -r '.results[0].count // 0')
    
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}✓ Found $count collector metric(s)${NC}"
    else
        echo -e "${YELLOW}⚠ No collector metrics found${NC}"
    fi
    echo ""
}

function check_system_metrics() {
    echo -e "${YELLOW}Test 4: System Metrics Collection${NC}"
    
    # Check for various metric types
    metric_types=(
        "system.cpu.utilization:CPU metrics"
        "system.memory.usage:Memory metrics"
        "system.disk.io:Disk I/O metrics"
        "system.network.io:Network metrics"
        "process.cpu.utilization:Process CPU metrics"
    )
    
    for metric_info in "${metric_types[@]}"; do
        metric_name="${metric_info%%:*}"
        metric_desc="${metric_info##*:}"
        
        nrql="SELECT count(*) FROM Metric WHERE metricName = '$metric_name' SINCE 10 minutes ago"
        
        response=$(curl -s -X POST https://insights-api.newrelic.com/v1/accounts/$NEW_RELIC_ACCOUNT_ID/query \
          -H "Accept: application/json" \
          -H "X-Query-Key: $NEW_RELIC_QUERY_KEY" \
          -d "{ \"nrql\": \"$nrql\" }")
        
        count=$(echo "$response" | jq -r '.results[0].count // 0')
        
        if [ "$count" -gt 0 ]; then
            echo -e "  ${GREEN}✓${NC} $metric_desc: $count data points"
        else
            echo -e "  ${RED}✗${NC} $metric_desc: No data"
        fi
    done
    echo ""
}

function run_all_tests() {
    echo "Starting metric tests..."
    echo ""
    
    # Check required environment variables
    if [ -z "$NEW_RELIC_LICENSE_KEY" ] || [ -z "$NEW_RELIC_QUERY_KEY" ] || [ -z "$NEW_RELIC_ACCOUNT_ID" ]; then
        echo -e "${RED}Error: Required environment variables not set${NC}"
        echo "Please ensure the following are set:"
        echo "  - NEW_RELIC_LICENSE_KEY"
        echo "  - NEW_RELIC_QUERY_KEY"
        echo "  - NEW_RELIC_ACCOUNT_ID"
        exit 1
    fi
    
    # Run tests
    test_metric_api
    test_otlp_endpoint
    query_metrics
    check_system_metrics
    
    echo -e "${GREEN}Metric tests complete!${NC}"
    
    # Cleanup
    rm -f /tmp/test-metric.json /tmp/otlp-metric.json
}

# Parse command line arguments
case "${1:-all}" in
    api)
        test_metric_api
        ;;
    otlp)
        test_otlp_endpoint
        ;;
    query)
        query_metrics
        ;;
    system)
        check_system_metrics
        ;;
    all|*)
        run_all_tests
        ;;
esac
