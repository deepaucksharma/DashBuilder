# Dashboard Generator API

REST API for the Dashboard Generation Platform.

## Getting Started

### Prerequisites
- Node.js 14+
- New Relic API key and Account ID

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file with:

```env
NEW_RELIC_API_KEY=your_api_key
NEW_RELIC_ACCOUNT_ID=your_account_id
DASHBOARD_API_PORT=3001
```

### Running the Server

```bash
# Development
npm run api:dev

# Production
npm run api:start
```

## API Endpoints

### Health Check
```
GET /health
```

### Templates

#### List Available Templates
```
GET /api/templates
```

Response:
```json
{
  "templates": ["system-health", "application-performance", "cost-optimization", "minimal"],
  "count": 4
}
```

### Metrics

#### Discover Metrics
```
GET /api/metrics/discover?namespace=system&pattern=cpu.*&limit=100
```

Parameters:
- `namespace` (optional): Metric namespace filter
- `pattern` (optional): Metric name pattern (supports wildcards)
- `limit` (optional): Maximum results (default: 100)

#### Search Metrics
```
GET /api/metrics/search/cpu?limit=50
```

Parameters:
- `limit` (optional): Maximum results (default: 50)

#### Get Metric Metadata
```
GET /api/metrics/system.cpu.time/metadata
```

### Dashboards

#### Generate Dashboard
```
POST /api/dashboards/generate
Content-Type: application/json

{
  "name": "System Health Dashboard",
  "description": "Monitor system health metrics",
  "template": "system-health",
  "metrics": {
    "include": ["system.*", "cpu.*"],
    "exclude": ["*.debug.*"]
  },
  "layoutPreference": "balanced",
  "timeRange": "1 hour",
  "autoRefresh": true
}
```

Response:
```json
{
  "success": true,
  "dashboard": { /* dashboard configuration */ },
  "metadata": {
    "metricsUsed": 24,
    "widgetsCreated": 24,
    "template": "system-health",
    "generatedAt": "2024-01-01T00:00:00Z"
  }
}
```

#### Preview Dashboard
```
POST /api/dashboards/preview
Content-Type: application/json

{
  "name": "Preview Dashboard",
  "template": "application-performance",
  "metrics": {
    "include": ["app.*"]
  }
}
```

Response includes HTML preview.

#### Deploy Dashboard
```
POST /api/dashboards/deploy
Content-Type: application/json

{
  "dashboard": { /* dashboard configuration from generate */ }
}
```

Response:
```json
{
  "success": true,
  "deployment": {
    "guid": "dashboard-guid",
    "name": "Dashboard Name",
    "permalink": "https://one.newrelic.com/dashboards/..."
  }
}
```

#### Generate and Deploy
```
POST /api/dashboards/generate-deploy
Content-Type: application/json

{
  "name": "Production Monitoring",
  "template": "system-health",
  "metrics": {
    "include": ["prod.*"]
  }
}
```

Combines generation and deployment in one step.

#### Validate Dashboard
```
POST /api/dashboards/validate
Content-Type: application/json

{
  "dashboard": { /* dashboard configuration */ }
}
```

Response:
```json
{
  "success": true,
  "valid": true,
  "errors": []
}
```

## Error Handling

All endpoints return errors in the format:

```json
{
  "success": false,
  "error": "Error message",
  "stack": "..." // Only in development mode
}
```

## Examples

### Generate System Health Dashboard

```bash
curl -X POST http://localhost:3001/api/dashboards/generate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "System Health",
    "template": "system-health",
    "metrics": {
      "include": ["system.*", "host.*"]
    }
  }'
```

### Search for CPU Metrics

```bash
curl http://localhost:3001/api/metrics/search/cpu?limit=10
```

### Deploy Generated Dashboard

```bash
# First generate
DASHBOARD=$(curl -X POST http://localhost:3001/api/dashboards/generate \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Dashboard",
    "template": "auto"
  }' | jq -r '.dashboard')

# Then deploy
curl -X POST http://localhost:3001/api/dashboards/deploy \
  -H "Content-Type: application/json" \
  -d "{\"dashboard\": $DASHBOARD}"
```

## Development

### Running Tests

```bash
npm test
```

### Adding New Endpoints

1. Add route in `server.js`
2. Use `asyncHandler` for async routes
3. Validate input parameters
4. Return consistent response format

## Production Considerations

1. **Rate Limiting**: Add rate limiting for API endpoints
2. **Authentication**: Implement API key authentication
3. **Caching**: Cache metric discovery results
4. **Monitoring**: Add APM monitoring
5. **Logging**: Implement structured logging