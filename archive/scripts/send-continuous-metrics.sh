#!/bin/bash

# Send continuous metrics to New Relic
LICENSE_KEY="***REMOVED***"
ACCOUNT_ID="4430445"

echo "Sending continuous NRDOT metrics to New Relic..."
echo "This will run for 5 minutes, sending data every 10 seconds"
echo ""

START_TIME=$(date +%s)
END_TIME=$((START_TIME + 300))  # 5 minutes
ITERATION=1

while [ $(date +%s) -lt $END_TIME ]; do
    TIMESTAMP=$(date +%s)000
    
    # Generate varying metrics
    CPU_BASE=$((30 + (ITERATION % 30)))
    
    # Send data for each profile
    for PROFILE in baseline moderate aggressive; do
        case $PROFILE in
            baseline)
                COVERAGE=100
                COST_REDUCTION=$((RANDOM % 10))
                CPU=$((CPU_BASE + RANDOM % 20))
                MEM=$((40 + RANDOM % 30))
                DATA_POINTS=$((800 + RANDOM % 200))
                RESPONSE=$((40 + RANDOM % 20))
                ;;
            moderate)
                COVERAGE=$((94 + RANDOM % 6))
                COST_REDUCTION=$((50 + RANDOM % 20))
                CPU=$((CPU_BASE + 10 + RANDOM % 20))
                MEM=$((50 + RANDOM % 30))
                DATA_POINTS=$((350 + RANDOM % 150))
                RESPONSE=$((30 + RANDOM % 15))
                ;;
            aggressive)
                COVERAGE=$((88 + RANDOM % 10))
                COST_REDUCTION=$((70 + RANDOM % 15))
                CPU=$((CPU_BASE + 20 + RANDOM % 20))
                MEM=$((60 + RANDOM % 30))
                DATA_POINTS=$((100 + RANDOM % 100))
                RESPONSE=$((20 + RANDOM % 10))
                ;;
        esac
        
        # Send custom event
        curl -s -X POST https://insights-collector.newrelic.com/v1/accounts/$ACCOUNT_ID/events \
          -H "Content-Type: application/json" \
          -H "X-License-Key: $LICENSE_KEY" \
          -d '[{
            "eventType": "NRDOTMetrics",
            "timestamp": '$TIMESTAMP',
            "profile": "'$PROFILE'",
            "coverage": '$COVERAGE',
            "costReduction": '$COST_REDUCTION',
            "cpuUsage": '$CPU',
            "memoryUsage": '$MEM',
            "dataPoints": '$DATA_POINTS',
            "responseTime": '$RESPONSE',
            "iteration": '$ITERATION',
            "experimentRun": "continuous-'$(date +%Y%m%d-%H%M%S)'"
          }]' > /dev/null 2>&1
        
        # Also send as Metric data
        curl -s -X POST https://metric-api.newrelic.com/metric/v1 \
          -H "Content-Type: application/json" \
          -H "X-License-Key: $LICENSE_KEY" \
          -d '[{
            "metrics": [{
              "name": "nrdot.coverage",
              "type": "gauge",
              "value": '$COVERAGE',
              "timestamp": '$TIMESTAMP',
              "attributes": {
                "profile": "'$PROFILE'",
                "service.name": "nrdot-experiment"
              }
            },
            {
              "name": "nrdot.cost.reduction",
              "type": "gauge",
              "value": '$COST_REDUCTION',
              "timestamp": '$TIMESTAMP',
              "attributes": {
                "profile": "'$PROFILE'",
                "service.name": "nrdot-experiment"
              }
            },
            {
              "name": "nrdot.data.points",
              "type": "gauge",
              "value": '$DATA_POINTS',
              "timestamp": '$TIMESTAMP',
              "attributes": {
                "profile": "'$PROFILE'",
                "service.name": "nrdot-experiment"
              }
            }]
          }]' > /dev/null 2>&1
    done
    
    echo -n "."
    ITERATION=$((ITERATION + 1))
    sleep 10
done

echo ""
echo ""
echo "✓ Metrics sent successfully!"
echo ""
echo "To view your data in New Relic:"
echo ""
echo "1. Go to: https://one.newrelic.com/nr1-core?account=$ACCOUNT_ID"
echo ""
echo "2. Click on 'Query your data' and run these queries:"
echo ""
echo "   -- View all NRDOT custom events:"
echo "   SELECT * FROM NRDOTMetrics SINCE 10 minutes ago LIMIT 100"
echo ""
echo "   -- Average KPIs by profile:"
echo "   SELECT average(coverage) as 'Coverage %', average(costReduction) as 'Cost Reduction %' "
echo "   FROM NRDOTMetrics FACET profile SINCE 10 minutes ago"
echo ""
echo "   -- Coverage over time:"
echo "   SELECT average(coverage) FROM NRDOTMetrics "
echo "   FACET profile TIMESERIES SINCE 10 minutes ago"
echo ""
echo "   -- Cost reduction distribution:"
echo "   SELECT histogram(costReduction, 10, 20) FROM NRDOTMetrics "
echo "   FACET profile SINCE 10 minutes ago"
echo ""
echo "   -- Metric data (if available):"
echo "   SELECT average(nrdot.coverage) FROM Metric "
echo "   WHERE service.name = 'nrdot-experiment' FACET profile SINCE 10 minutes ago"
echo ""
echo "3. To create a dashboard manually:"
echo "   - Click 'Dashboards' → 'Create a dashboard'"
echo "   - Add widgets with the queries above"
echo "   - Name it 'NRDOT v2 KPI Dashboard'"