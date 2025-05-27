# NR-Guardian Integration Guide

## Overview

NR-Guardian is designed as a comprehensive validation and self-correction engine for New Relic operations. This guide explains how to integrate and leverage its capabilities for both human operators and LLM agents.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        NR-Guardian CLI                           │
├─────────────────────────────────────────────────────────────────┤
│  Commands Layer                                                  │
│  ┌─────────┬──────────┬───────────┬───────┬────────┬────────┐ │
│  │ Schema  │  NRQL    │ Dashboard │ Alert │ Entity │ Ingest │ │
│  └─────────┴──────────┴───────────┴───────┴────────┴────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Services Layer                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         Core Services + LLM Enhancement Service          │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Core Layer                                                      │
│  ┌──────────────┬─────────────┬──────────────┬─────────────┐  │
│  │ API Client   │   Config    │    Cache     │  Validators │  │
│  └──────────────┴─────────────┴──────────────┴─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Capabilities

### 1. Schema Intelligence
- **Purpose**: Understand data structure and available attributes
- **Key Features**:
  - Event type discovery
  - Attribute validation
  - Cardinality analysis
  - Cross-account comparison

### 2. NRQL Intelligence
- **Purpose**: Validate, optimize, and fix queries
- **Key Features**:
  - Syntax validation
  - Auto-correction
  - Performance optimization
  - Cost estimation

### 3. Dashboard Intelligence
- **Purpose**: Manage and optimize dashboards
- **Key Features**:
  - JSON validation
  - Widget validation
  - Performance analysis
  - Cross-account replication

### 4. LLM Enhancement
- **Purpose**: Enable AI-driven operations
- **Key Features**:
  - Context generation
  - Natural language to dashboard
  - Query enhancement
  - Improvement suggestions

## Integration Patterns

### Pattern 1: Direct CLI Usage

```bash
# Simple validation
nr-guardian nrql validate "SELECT count(*) FROM Transaction"

# With JSON output for parsing
nr-guardian --json schema describe-event-type Transaction

# Batch operations
nr-guardian nrql validate-file queries.txt --parallel
```

### Pattern 2: Programmatic Usage

```javascript
import { 
  SchemaService, 
  NRQLService, 
  DashboardService,
  Config 
} from 'nr-guardian';

const config = new Config({
  apiKey: process.env.NEW_RELIC_API_KEY,
  accountId: process.env.NEW_RELIC_ACCOUNT_ID
});

const schemaService = new SchemaService(config);
const nrqlService = new NRQLService(config);

// Discover schemas
const eventTypes = await schemaService.discoverEventTypes();

// Validate query
const validation = await nrqlService.validateQuery(query);
```

### Pattern 3: LLM Integration

```python
import subprocess
import json

def validate_nrql_query(query):
    """Validate a NRQL query using NR-Guardian"""
    result = subprocess.run(
        ['nr-guardian', '--json', 'nrql', 'validate', query],
        capture_output=True,
        text=True
    )
    
    return json.loads(result.stdout)

def generate_dashboard(description):
    """Generate dashboard from natural language"""
    result = subprocess.run(
        ['nr-guardian', '--json', 'llm', 'generate-dashboard', description],
        capture_output=True,
        text=True
    )
    
    return json.loads(result.stdout)

# LLM workflow
context = subprocess.run(
    ['nr-guardian', '--json', 'llm', 'context'],
    capture_output=True,
    text=True
)
context_data = json.loads(context.stdout)

# Use context to inform LLM prompts
available_attributes = context_data['commonAttributes']['Transaction']['attributes']
```

## Best Practices

### 1. Always Validate Before Execution

```bash
# Bad: Direct execution without validation
curl -X POST $NR_API_ENDPOINT -d "$QUERY"

# Good: Validate first
if nr-guardian nrql validate "$QUERY"; then
    curl -X POST $NR_API_ENDPOINT -d "$QUERY"
fi
```

### 2. Use Context for Accurate Generation

```bash
# Generate fresh context
nr-guardian llm context -o context.json

# Use context in LLM prompts
PROMPT="Using the context in context.json, generate a query for error rate"
```

### 3. Leverage Auto-Fix Capabilities

```bash
# Instead of manual correction
QUERY="SEELCT count(*) FORM Transaction"

# Use auto-fix
FIXED=$(nr-guardian --json nrql autofix "$QUERY" | jq -r '.fixedQuery')
```

### 4. Monitor Performance Impact

```bash
# Check query cost before deployment
nr-guardian ingest estimate-query-cost "$QUERY"

# Analyze dashboard performance
nr-guardian dashboard analyze-performance dashboard.json
```

## Common Workflows

### Workflow 1: Dashboard Migration

```bash
# 1. Export from source
nr-guardian dashboard export $SOURCE_GUID -o dashboard.json

# 2. Validate structure
nr-guardian dashboard validate-json dashboard.json

# 3. Check attribute compatibility in target
nr-guardian dashboard check-attribute-usage dashboard.json \
  --event-type Transaction --account-id $TARGET_ACCOUNT

# 4. Import to target
nr-guardian dashboard import dashboard.json \
  --account-id $TARGET_ACCOUNT
```

### Workflow 2: Query Optimization Pipeline

```bash
# 1. Validate syntax
nr-guardian nrql validate "$QUERY"

# 2. Check for optimizations
nr-guardian nrql optimize "$QUERY"

# 3. Estimate cost
nr-guardian ingest estimate-query-cost "$QUERY"

# 4. Apply fixes if needed
nr-guardian nrql autofix "$QUERY" --apply
```

### Workflow 3: LLM Dashboard Generation

```bash
# 1. Generate context
nr-guardian llm context -o context.json

# 2. Create dashboard from description
nr-guardian llm generate-dashboard \
  "Performance dashboard for checkout service" \
  -o dashboard.json

# 3. Suggest improvements
nr-guardian llm suggest-improvements dashboard.json

# 4. Import final version
nr-guardian dashboard import dashboard.json
```

## Error Handling

### Structured Error Responses

All commands return structured errors in JSON mode:

```json
{
  "valid": false,
  "error": "Attribute 'responseTime' not found",
  "suggestions": [
    "Did you mean 'duration'?",
    "Available attributes: duration, name, host"
  ],
  "code": "ATTRIBUTE_NOT_FOUND"
}
```

### Exit Codes

- `0`: Success
- `1`: Validation or execution error
- `2`: Configuration error
- `3`: Network/API error

## Performance Considerations

### Caching

NR-Guardian implements intelligent caching:
- Schema information: 1 hour TTL
- Query validation: 5 minutes TTL
- Entity data: 1 hour TTL

Disable caching for real-time operations:
```bash
nr-guardian --no-cache schema describe-event-type Transaction
```

### Rate Limiting

Built-in rate limiting prevents API throttling:
- Default: 25 requests/minute
- Configurable via `NR_GUARDIAN_RATE_LIMIT_MAX`

### Parallel Operations

Use parallel processing for batch operations:
```bash
nr-guardian nrql validate-file queries.txt --parallel
```

## Security

### API Key Management

- Never commit API keys
- Use environment variables
- Rotate keys regularly

```bash
# Good: Environment variable
export NEW_RELIC_API_KEY="xxx"
nr-guardian dashboard list

# Also good: CLI flag (for CI/CD)
nr-guardian --api-key "$SECRET_KEY" dashboard list
```

### Permissions

Required New Relic permissions:
- NRQL queries: `NRDB Query`
- Dashboard operations: `Dashboard Modify`
- Alert operations: `Alert Conditions`
- Entity operations: `Entity Relationships`

## Troubleshooting

### Debug Mode

Enable verbose logging:
```bash
export NR_GUARDIAN_LOG_LEVEL=debug
nr-guardian --verbose nrql validate "$QUERY"
```

### Common Issues

1. **"Account ID not found"**
   ```bash
   export NEW_RELIC_ACCOUNT_ID=12345
   # or
   nr-guardian --account-id 12345 ...
   ```

2. **"Query timeout"**
   - Reduce time range
   - Add LIMIT clause
   - Check query complexity

3. **"High cardinality warning"**
   - Use attribute bucketing
   - Consider sampling
   - Review data model

## Advanced Usage

### Custom Validators

Extend validation capabilities:

```javascript
import { validators } from 'nr-guardian';

// Add custom validation rule
validators.addRule('customRule', (query) => {
  if (query.includes('SELECT *') && !query.includes('LIMIT')) {
    return {
      valid: false,
      error: 'SELECT * requires LIMIT clause'
    };
  }
  return { valid: true };
});
```

### Plugin System

Create custom commands:

```javascript
// my-plugin.js
export class MyCommand {
  getCommand() {
    const cmd = new Command('my-command');
    cmd.action(async () => {
      // Custom logic
    });
    return cmd;
  }
}
```

## Conclusion

NR-Guardian provides a robust foundation for New Relic automation, whether used directly by humans or integrated with LLM agents. Its validation and self-correction capabilities ensure reliable operations while its modular architecture allows for easy extension and customization.

For more examples, see the `/examples` directory or run `nr-guardian --help` for any command.