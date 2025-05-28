#!/bin/bash

# Create dashboard using New Relic GraphQL API
# API_KEY removed for security. Set via environment variable or .env file.
API_KEY="${NEW_RELIC_API_KEY:-REPLACE_WITH_YOUR_API_KEY}"
ACCOUNT_ID="4430445"

echo "Creating NRDOT Dashboard in New Relic..."

# Create dashboard via GraphQL
RESPONSE=$(curl -s -X POST https://api.newrelic.com/graphql \
  -H "Content-Type: application/json" \
  -H "API-Key: $API_KEY" \
  -d '{
    "query": "mutation CreateDashboard($accountId: Int!, $dashboard: DashboardCreateInput!) { dashboardCreate(accountId: $accountId, dashboard: $dashboard) { entityResult { guid name } errors { description } } }",
    "variables": {
      "accountId": '$ACCOUNT_ID',
      "dashboard": {
        "name": "NRDOT v2 KPI Dashboard",
        "description": "Real-time KPI monitoring for optimization experiments",
        "permissions": "PUBLIC_READ_WRITE",
        "pages": [
          {
            "name": "KPI Overview",
            "description": "Main KPIs",
            "widgets": [
              {
                "title": "Coverage by Profile",
                "configuration": {
                  "billboard": {
                    "queries": [
                      {
                        "accountId": '$ACCOUNT_ID',
                        "query": "SELECT average(coverage) FROM NRDOTMetrics FACET profile SINCE 30 minutes ago"
                      }
                    ]
                  }
                },
                "layout": {
                  "column": 1,
                  "row": 1,
                  "width": 4,
                  "height": 3
                }
              },
              {
                "title": "Cost Reduction by Profile", 
                "configuration": {
                  "billboard": {
                    "queries": [
                      {
                        "accountId": '$ACCOUNT_ID',
                        "query": "SELECT average(costReduction) FROM NRDOTMetrics FACET profile SINCE 30 minutes ago"
                      }
                    ]
                  }
                },
                "layout": {
                  "column": 5,
                  "row": 1,
                  "width": 4,
                  "height": 3
                }
              },
              {
                "title": "Data Points Collected",
                "configuration": {
                  "billboard": {
                    "queries": [
                      {
                        "accountId": '$ACCOUNT_ID',
                        "query": "SELECT count(*) as '\''Total Data Points'\'' FROM NRDOTMetrics SINCE 1 hour ago"
                      }
                    ]
                  }
                },
                "layout": {
                  "column": 9,
                  "row": 1,
                  "width": 4,
                  "height": 3
                }
              },
              {
                "title": "Coverage Over Time",
                "configuration": {
                  "line": {
                    "queries": [
                      {
                        "accountId": '$ACCOUNT_ID',
                        "query": "SELECT average(coverage) FROM NRDOTMetrics FACET profile TIMESERIES SINCE 1 hour ago"
                      }
                    ]
                  }
                },
                "layout": {
                  "column": 1,
                  "row": 4,
                  "width": 6,
                  "height": 3
                }
              },
              {
                "title": "Cost Reduction Over Time",
                "configuration": {
                  "line": {
                    "queries": [
                      {
                        "accountId": '$ACCOUNT_ID',
                        "query": "SELECT average(costReduction) FROM NRDOTMetrics FACET profile TIMESERIES SINCE 1 hour ago"
                      }
                    ]
                  }
                },
                "layout": {
                  "column": 7,
                  "row": 4,
                  "width": 6,
                  "height": 3
                }
              },
              {
                "title": "Experiment Summary Table",
                "configuration": {
                  "table": {
                    "queries": [
                      {
                        "accountId": '$ACCOUNT_ID',
                        "query": "SELECT average(coverage) as '\''Coverage %'\'', average(costReduction) as '\''Cost Reduction %'\'', average(cpuUsage) as '\''CPU %'\'', average(memoryUsage) as '\''Memory %'\'' FROM NRDOTMetrics FACET profile SINCE 1 hour ago"
                      }
                    ]
                  }
                },
                "layout": {
                  "column": 1,
                  "row": 7,
                  "width": 12,
                  "height": 3
                }
              }
            ]
          }
        ]
      }
    }
  }')

# Extract dashboard GUID
GUID=$(echo $RESPONSE | grep -o '"guid":"[^"]*' | cut -d'"' -f4)

if [ -n "$GUID" ]; then
    echo "✓ Dashboard created successfully!"
    echo "  GUID: $GUID"
    echo ""
    echo "View your dashboard at:"
    echo "  https://one.newrelic.com/redirect/entity/$GUID"
else
    echo "✗ Failed to create dashboard"
    echo "Response: $RESPONSE"
fi

echo ""
echo "You can also run these queries in Query Your Data:"
echo "1. SELECT * FROM NRDOTMetrics SINCE 30 minutes ago"
echo "2. SELECT * FROM NRDOTExperiment SINCE 1 hour ago"
echo "3. SELECT average(coverage), average(costReduction) FROM NRDOTMetrics FACET profile"