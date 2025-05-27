# NR-Guardian: New Relic Validation & Self-Correction Engine

NR-Guardian is a comprehensive CLI tool and library designed to validate, optimize, and self-correct New Relic configurations. It provides intelligent validation capabilities for NRQL queries, dashboards, alerts, and more, making it an essential tool for both human operators and LLM agents working with New Relic.

## 🎯 Mission

To provide a robust, scriptable interface for validating configurations, data integrity, schema adherence, query correctness, and dashboard functionality within New Relic, with capabilities for suggesting and (optionally) applying corrections.

## 🚀 Features

### Schema Intelligence Module
- **Discover Event Types**: List all event types with metadata
- **Describe Event Types**: Show attributes, data types, and cardinality
- **Compare Schemas**: Diff schemas between accounts
- **Validate Attributes**: Check if expected attributes exist
- **Find Attributes**: Search for attributes across event types
- **Get Attribute Types**: Determine data types of specific attributes

### NRQL Intelligence Module
- **Validate Queries**: Check syntax, execution, and results
- **Optimize Queries**: Suggest performance improvements
- **Explain Queries**: Break down query components
- **Auto-fix Queries**: Automatically correct common issues
- **Check Function Support**: Verify NRQL function validity
- **Batch Validation**: Validate multiple queries from files

### Dashboard Intelligence Module
- **List & Export**: Manage dashboards across accounts
- **Import & Validate**: Validate JSON structure before import
- **Validate Widgets**: Check all dashboard queries
- **Find Broken Widgets**: Identify widgets with errors
- **Analyze Performance**: Estimate dashboard load times
- **Check Attribute Usage**: Verify attributes exist
- **Replicate Dashboards**: Copy dashboards between accounts

### Alert Intelligence Module
- **List Policies**: Browse alert policies with filters
- **Validate Conditions**: Check alert query validity
- **Threshold Viability**: Analyze if thresholds are appropriate
- **Find Unstable Alerts**: Identify flapping alerts

### Entity Intelligence Module
- **Describe Entities**: Get entity details and relationships
- **Validate Tags**: Check required tags exist
- **Find Related**: Discover entity relationships
- **Check APM-Infra Links**: Verify application-host connections
- **Search Entities**: Find entities by query

### Data Ingest & Cost Intelligence Module
- **Data Volume Analysis**: Calculate ingestion volumes
- **Cardinality Checks**: Find high-cardinality attributes
- **Query Cost Estimation**: Estimate query complexity
- **OTLP Export Testing**: Validate OpenTelemetry exports

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd scripts

# Install dependencies
npm install

# Make CLI executable
npm link

# Or run directly
node src/cli.js
```

## 🔧 Configuration

Create a `.env` file based on `.env.example`:

```env
NEW_RELIC_API_KEY=your-api-key
NEW_RELIC_ACCOUNT_ID=your-account-id
NEW_RELIC_REGION=US  # or EU
```

## 📖 Usage Examples

### Schema Operations

```bash
# Discover all event types
nr-guardian schema discover-event-types --since "7 days ago"

# Describe an event type with cardinality info
nr-guardian schema describe-event-type Transaction --show-cardinality --show-data-types

# Compare schemas between accounts
nr-guardian schema compare-schemas --event-type Transaction --account-id-a 12345 --account-id-b 67890

# Validate expected attributes exist
nr-guardian schema validate-attributes --event-type Transaction --expected-attributes "duration,name,host"

# Find where an attribute is used
nr-guardian schema find-attribute responseTime
```

### NRQL Operations

```bash
# Validate a query
nr-guardian nrql validate "SELECT count(*) FROM Transaction WHERE appName = 'web-app'"

# Optimize a query
nr-guardian nrql optimize "SELECT * FROM Transaction"

# Auto-fix common issues
nr-guardian nrql autofix "SEELCT count(*) FORM Transaction" --apply

# Validate queries from file
nr-guardian nrql validate-file queries.txt --parallel

# Check function support
nr-guardian nrql check-function percentile --event-type Transaction
```

### Dashboard Operations

```bash
# List all dashboards
nr-guardian dashboard list

# Export a dashboard
nr-guardian dashboard export <dashboard-guid> -o my-dashboard.json

# Validate dashboard JSON
nr-guardian dashboard validate-json my-dashboard.json

# Import with validation
nr-guardian dashboard import my-dashboard.json --dry-run

# Find broken widgets
nr-guardian dashboard find-broken-widgets <dashboard-guid>

# Analyze performance
nr-guardian dashboard analyze-performance <dashboard-guid>

# Replicate to other accounts
nr-guardian dashboard replicate <dashboard-guid> --targets "12345,67890" --update-queries
```

### Alert Operations

```bash
# List alert policies
nr-guardian alert list-policies --name-pattern "production"

# Validate alert condition
nr-guardian alert validate-condition "My Policy" "Response Time Alert"

# Check threshold viability
nr-guardian alert check-threshold-viability "My Policy" "CPU Alert" --lookback "30 days ago"

# Find unstable alerts
nr-guardian alert find-unstable-alerts --flap-threshold 10
```

### Entity Operations

```bash
# Describe an entity
nr-guardian entity describe <entity-guid>

# Validate entity tags
nr-guardian entity validate-tags <entity-guid> --expected-tags "env:production,team:platform"

# Check APM-Infrastructure link
nr-guardian entity check-apm-infra-link --apm-app-name "web-app" --host-name "prod-web-01"

# Search for entities
nr-guardian entity search "name LIKE 'prod-%' AND type = 'APPLICATION'"
```

### Data Ingest Operations

```bash
# Get data volume analysis
nr-guardian ingest get-data-volume --since "7 days ago"

# Check attribute cardinality
nr-guardian ingest get-cardinality --event-type Transaction --attribute userId

# Estimate query cost
nr-guardian ingest estimate-query-cost "SELECT * FROM Transaction FACET userId, sessionId"

# Find high cardinality attributes
nr-guardian ingest list-high-cardinality-attributes --threshold 5000

# Test OTLP export
nr-guardian ingest check-otel-export --otel-endpoint "https://otlp.nr-data.net:4318/v1/metrics" --nr-license-key "xxx" --payload-file sample.json
```

## 🤖 LLM Agent Usage

NR-Guardian is designed to be used by LLM agents for reliable New Relic operations:

```bash
# Always output JSON for parsing
nr-guardian --json schema describe-event-type Transaction

# Chain operations for validation
nr-guardian --json nrql validate "$query" && nr-guardian --json dashboard import dashboard.json

# Use suggestions for self-correction
RESULT=$(nr-guardian --json nrql validate "$query")
if [ $? -ne 0 ]; then
  # Extract suggestions and retry
  SUGGESTIONS=$(echo $RESULT | jq -r '.suggestions[]')
  # Apply corrections based on suggestions
fi
```

### Example LLM Workflow

1. **Schema Discovery**
   ```bash
   nr-guardian --json schema find-attribute "response" --event-type-pattern "Transaction"
   ```

2. **Query Validation**
   ```bash
   nr-guardian --json nrql validate "SELECT average(responseTime) FROM Transaction"
   ```

3. **Auto-correction**
   ```bash
   nr-guardian --json nrql autofix "SELECT avg(responseTime) FROM Transaction"
   ```

4. **Dashboard Creation**
   ```bash
   nr-guardian --json dashboard validate-json dashboard.json
   nr-guardian --json dashboard import dashboard.json
   ```

## 🏗️ Architecture

### Core Components

- **API Client**: Robust NerdGraph client with retry logic and rate limiting
- **Services**: Modular services for each intelligence module
- **Cache**: Intelligent caching to reduce API calls
- **Validators**: Comprehensive validation with helpful suggestions
- **Output**: Flexible output formatting (human-readable or JSON)

### Key Features

- **Self-Correction**: Suggests fixes for common issues
- **Batch Operations**: Process multiple items efficiently
- **Cross-Module Integration**: Services work together for comprehensive validation
- **LLM-Friendly**: JSON output and clear error messages
- **Performance Optimized**: Caching, parallel execution, and rate limiting

## 🛡️ Error Handling

All commands provide:
- Clear error messages
- Actionable suggestions
- Proper exit codes
- JSON error output for programmatic use

## 🔐 Security

- API keys are never logged or exposed
- Secure credential handling via environment variables
- Rate limiting to prevent API abuse
- Validation to prevent malformed queries

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🚧 Roadmap

- [ ] GraphQL query builder for complex operations
- [ ] Automated dashboard optimization
- [ ] Baseline alert recommendations
- [ ] Cost optimization recommendations
- [ ] Integration with CI/CD pipelines
- [ ] Web UI for visual validation
- [ ] Terraform provider integration

## 📞 Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Check existing documentation
- Review code examples in `/examples`

---

Built with ❤️ for New Relic power users and automation enthusiasts