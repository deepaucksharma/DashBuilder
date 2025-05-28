#!/bin/bash

# Send metrics directly to New Relic
# API_KEY removed for security. Set via environment variable or .env file.
API_KEY="${NEW_RELIC_API_KEY:-REPLACE_WITH_YOUR_API_KEY}"
ACCOUNT_ID="4430445"

echo "Sending metrics to New Relic account $ACCOUNT_ID..."

# Send custom events with experiment data
TIMESTAMP=$(date +%s)

# Send NRDOT experiment events
curl -X POST https://insights-collector.newrelic.com/v1/accounts/$ACCOUNT_ID/events \
  -H "Content-Type: application/json" \
  -H "X-Insert-Key: $API_KEY" \
  -d '[
    {
      "eventType": "NRDOTExperiment",
      "timestamp": '$TIMESTAMP',
      "profile": "baseline",
      "coverage": 100,
      "costReduction": 0,
      "cpuUsage": 45,
      "memoryUsage": 60,
      "dataPoints": 1000,
      "responseTimeMs": 50
    },
    {
      "eventType": "NRDOTExperiment",
      "timestamp": '$TIMESTAMP',
      "profile": "moderate",
      "coverage": 96.8,
      "costReduction": 60.7,
      "cpuUsage": 55,
      "memoryUsage": 75,
      "dataPoints": 441,
      "responseTimeMs": 40
    },
    {
      "eventType": "NRDOTExperiment",
      "timestamp": '$TIMESTAMP',
      "profile": "aggressive",
      "coverage": 92.7,
      "costReduction": 81.0,
      "cpuUsage": 70,
      "memoryUsage": 80,
      "dataPoints": 173,
      "responseTimeMs": 30
    }
  ]'

echo ""
echo "Sending continuous metrics..."

# Send metrics every 10 seconds for 2 minutes
for i in {1..12}; do
    TIMESTAMP=$(date +%s)
    
    # Vary metrics slightly
    CPU_BASE=$((40 + i * 2))
    MEM_BASE=$((50 + i * 2))
    
    # Send metrics for each profile
    for PROFILE in baseline moderate aggressive; do
        case $PROFILE in
            baseline)
                COVERAGE=100
                COST_REDUCTION=0
                CPU=$((CPU_BASE + RANDOM % 10))
                MEM=$((MEM_BASE + RANDOM % 10))
                DATA_POINTS=$((900 + RANDOM % 100))
                ;;
            moderate)
                COVERAGE=$((95 + RANDOM % 5))
                COST_REDUCTION=$((55 + RANDOM % 10))
                CPU=$((CPU_BASE + 10 + RANDOM % 10))
                MEM=$((MEM_BASE + 10 + RANDOM % 10))
                DATA_POINTS=$((400 + RANDOM % 100))
                ;;
            aggressive)
                COVERAGE=$((90 + RANDOM % 8))
                COST_REDUCTION=$((75 + RANDOM % 10))
                CPU=$((CPU_BASE + 20 + RANDOM % 10))
                MEM=$((MEM_BASE + 20 + RANDOM % 10))
                DATA_POINTS=$((150 + RANDOM % 50))
                ;;
        esac
        
        curl -X POST https://insights-collector.newrelic.com/v1/accounts/$ACCOUNT_ID/events \
          -H "Content-Type: application/json" \
          -H "X-Insert-Key: $API_KEY" \
          -d '[{
            "eventType": "NRDOTMetrics",
            "timestamp": '$TIMESTAMP',
            "profile": "'$PROFILE'",
            "coverage": '$COVERAGE',
            "costReduction": '$COST_REDUCTION',
            "cpuUsage": '$CPU',
            "memoryUsage": '$MEM',
            "dataPoints": '$DATA_POINTS',
            "iteration": '$i'
          }]' 2>/dev/null
        
        echo -n "."
    done
    
    sleep 10
done

echo ""
echo "Metrics sent!"
echo ""
echo "Check your New Relic account:"
echo "1. Go to Query Your Data"
echo "2. Run: SELECT * FROM NRDOTExperiment, NRDOTMetrics SINCE 10 minutes ago"
echo ""