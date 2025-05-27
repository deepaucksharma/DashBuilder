#!/bin/bash

# Example workflow for LLM agents using NR-Guardian
# This demonstrates how an LLM can use the tool for validation and self-correction

echo "=== NR-Guardian LLM Workflow Example ==="
echo

# Step 1: Discover available event types
echo "1. Discovering event types..."
EVENT_TYPES=$(nr-guardian --json schema discover-event-types --since "1 hour ago" | jq -r '.[] | .name')
echo "Found event types: $(echo $EVENT_TYPES | tr '\n' ', ')"
echo

# Step 2: Check schema for Transaction event
echo "2. Checking Transaction schema..."
SCHEMA=$(nr-guardian --json schema describe-event-type Transaction --show-data-types)
ATTR_COUNT=$(echo $SCHEMA | jq '.attributeCount')
echo "Transaction has $ATTR_COUNT attributes"
echo

# Step 3: Validate a query with a typo
echo "3. Validating query with typo..."
INVALID_QUERY="SEELCT count(*) FORM Transaction WHERE duration > 1"
VALIDATION=$(nr-guardian --json nrql validate "$INVALID_QUERY" 2>&1 || true)

if echo $VALIDATION | jq -e '.valid == false' > /dev/null 2>&1; then
    echo "Query is invalid. Attempting auto-fix..."
    
    # Step 4: Auto-fix the query
    FIXED=$(nr-guardian --json nrql autofix "$INVALID_QUERY")
    FIXED_QUERY=$(echo $FIXED | jq -r '.fixedQuery')
    echo "Fixed query: $FIXED_QUERY"
    
    # Step 5: Validate the fixed query
    VALIDATION2=$(nr-guardian --json nrql validate "$FIXED_QUERY")
    if echo $VALIDATION2 | jq -e '.valid == true' > /dev/null 2>&1; then
        echo "✓ Fixed query is valid!"
    fi
fi
echo

# Step 6: Create and validate a dashboard
echo "4. Creating a dashboard..."
cat > /tmp/test-dashboard.json << 'EOF'
{
  "name": "LLM Generated Dashboard",
  "permissions": "PUBLIC_READ_ONLY",
  "pages": [{
    "name": "Main",
    "widgets": [{
      "title": "Transaction Count",
      "visualization": {"id": "billboard"},
      "configuration": {
        "nrql": {"query": "SELECT count(*) FROM Transaction SINCE 1 hour ago"}
      },
      "layout": {"column": 1, "row": 1, "width": 4, "height": 3}
    }]
  }]
}
EOF

# Validate dashboard
DASH_VALIDATION=$(nr-guardian --json dashboard validate-json /tmp/test-dashboard.json)
if echo $DASH_VALIDATION | jq -e '.valid == true' > /dev/null 2>&1; then
    echo "✓ Dashboard is valid and ready for import"
fi
echo

# Step 7: Check for high cardinality attributes
echo "5. Checking for high cardinality attributes..."
HIGH_CARD=$(nr-guardian --json ingest list-high-cardinality-attributes --threshold 1000 --event-type Transaction 2>/dev/null || echo '[]')
HIGH_COUNT=$(echo $HIGH_CARD | jq '. | length')
echo "Found $HIGH_COUNT high cardinality attributes"

if [ "$HIGH_COUNT" -gt 0 ]; then
    echo "High cardinality attributes to avoid in FACETs:"
    echo $HIGH_CARD | jq -r '.[] | "  - \(.attribute): \(.cardinality) unique values"'
fi
echo

# Step 8: Estimate query cost
echo "6. Estimating query cost..."
COMPLEX_QUERY="SELECT count(*) FROM Transaction FACET appName, userId, requestUri SINCE 7 days ago"
COST=$(nr-guardian --json ingest estimate-query-cost "$COMPLEX_QUERY")
COMPLEXITY=$(echo $COST | jq -r '.complexity')
echo "Query complexity: $COMPLEXITY"

# Show optimization suggestions if any
SUGGESTIONS=$(echo $COST | jq -r '.optimizations[]?.suggestion' 2>/dev/null)
if [ ! -z "$SUGGESTIONS" ]; then
    echo "Optimization suggestions:"
    echo "$SUGGESTIONS" | while read -r suggestion; do
        echo "  - $suggestion"
    done
fi

echo
echo "=== Workflow Complete ==="
echo
echo "This example demonstrates how an LLM can:"
echo "1. Discover available schemas"
echo "2. Validate and auto-correct queries"
echo "3. Create valid dashboards"
echo "4. Avoid performance pitfalls"
echo "5. Optimize for cost and performance"