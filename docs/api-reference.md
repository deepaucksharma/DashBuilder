# DashBuilder API Reference

**Version**: 1.0.0  
**Base URL**: `http://localhost:3000/api/v1`  
**Authentication**: API Key in header

## Table of Contents

1. [Authentication](#authentication)
2. [Dashboard APIs](#dashboard-apis)
3. [Experiment APIs](#experiment-apis)
4. [Optimization APIs](#optimization-apis)
5. [Metrics APIs](#metrics-apis)
6. [CLI Commands](#cli-commands)
7. [WebSocket Events](#websocket-events)
8. [Error Codes](#error-codes)
9. [Rate Limits](#rate-limits)
10. [Code Examples](#code-examples)

## Authentication

All API requests require authentication using an API key in the header:

```bash
Authorization: Bearer YOUR_API_KEY
```

### Obtaining API Keys

```bash
# Generate new API key
npm run cli auth generate-key --name "My App"

# List API keys
npm run cli auth list-keys

# Revoke API key
npm run cli auth revoke-key KEY_ID
```

## Dashboard APIs

### Create Dashboard

**POST** `/api/v1/dashboards`

Creates a new dashboard in New Relic.

**Request Body**:
```json
{
  "name": "NRDOT Performance Dashboard",
  "description": "Real-time telemetry optimization metrics",
  "template": "nrdot-monitoring",
  "variables": {
    "accountId": 3630072,
    "profile": "balanced"
  },
  "widgets": [
    {
      "title": "Process Coverage",
      "type": "billboard",
      "query": "SELECT percentage(uniqueCount(processDisplayName), WHERE cpuPercent > 0.1) FROM ProcessSample",
      "row": 1,
      "column": 1,
      "width": 4,
      "height": 3
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "guid": "MzYzMDA3MnxWSVp8REFTSEJPQVJEfGRhOjI0NTY3ODk",
    "permalink": "https://one.newrelic.com/dashboards/abc123",
    "name": "NRDOT Performance Dashboard",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/v1/dashboards \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Dashboard",
    "template": "nrdot-monitoring"
  }'
```

### List Dashboards

**GET** `/api/v1/dashboards`

Lists all dashboards for the account.

**Query Parameters**:
- `limit` (number): Maximum results to return (default: 100)
- `cursor` (string): Pagination cursor
- `filter` (string): Filter by name

**Response**:
```json
{
  "success": true,
  "data": {
    "dashboards": [
      {
        "guid": "abc123",
        "name": "NRDOT Monitoring",
        "createdAt": "2025-01-15T10:00:00Z",
        "updatedAt": "2025-01-15T14:30:00Z",
        "owner": "user@example.com"
      }
    ],
    "nextCursor": "eyJvZmZzZXQiOiAxMDB9"
  }
}
```

### Get Dashboard

**GET** `/api/v1/dashboards/:guid`

Retrieves a specific dashboard.

**Response**:
```json
{
  "success": true,
  "data": {
    "guid": "abc123",
    "name": "NRDOT Monitoring",
    "description": "Process optimization dashboard",
    "pages": [
      {
        "name": "Overview",
        "widgets": [...]
      }
    ]
  }
}
```

### Update Dashboard

**PUT** `/api/v1/dashboards/:guid`

Updates an existing dashboard.

**Request Body**:
```json
{
  "name": "Updated Dashboard Name",
  "description": "Updated description",
  "widgets": [...]
}
```

### Delete Dashboard

**DELETE** `/api/v1/dashboards/:guid`

Deletes a dashboard.

**Response**:
```json
{
  "success": true,
  "message": "Dashboard deleted successfully"
}
```

### Validate Dashboard

**POST** `/api/v1/dashboards/validate`

Validates dashboard JSON before creation.

**Request Body**:
```json
{
  "dashboard": {
    "name": "Test Dashboard",
    "widgets": [...]
  }
}
```

**Response**:
```json
{
  "success": true,
  "valid": true,
  "errors": []
}
```

## Experiment APIs

### Start Experiment

**POST** `/api/v1/experiments/start`

Starts a new optimization experiment.

**Request Body**:
```json
{
  "name": "Cost Optimization Test",
  "duration": 300,
  "profiles": ["baseline", "balanced", "aggressive"],
  "metrics": ["cost", "coverage", "performance"]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "experimentId": "exp-20250115-100000",
    "status": "running",
    "startTime": "2025-01-15T10:00:00Z",
    "estimatedEndTime": "2025-01-15T10:05:00Z"
  }
}
```

### Get Experiment Status

**GET** `/api/v1/experiments/:id`

Gets the status and results of an experiment.

**Response**:
```json
{
  "success": true,
  "data": {
    "experimentId": "exp-20250115-100000",
    "status": "completed",
    "results": {
      "baseline": {
        "cost": 100,
        "coverage": 100,
        "avgCpu": 15.2
      },
      "balanced": {
        "cost": 40,
        "coverage": 92,
        "avgCpu": 8.1
      }
    },
    "recommendations": {
      "optimalProfile": "balanced",
      "estimatedSavings": "$43,200/year"
    }
  }
}
```

### Stop Experiment

**POST** `/api/v1/experiments/:id/stop`

Stops a running experiment.

### List Experiments

**GET** `/api/v1/experiments`

Lists all experiments.

**Query Parameters**:
- `status`: Filter by status (running, completed, failed)
- `from`: Start date (ISO 8601)
- `to`: End date (ISO 8601)

## Optimization APIs

### Get Current Profile

**GET** `/api/v1/profiles/current`

Gets the currently active optimization profile.

**Response**:
```json
{
  "success": true,
  "data": {
    "profile": "balanced",
    "activeSince": "2025-01-15T08:00:00Z",
    "metrics": {
      "currentCost": 42.50,
      "coverage": 91.2,
      "processCount": 127
    }
  }
}
```

### Switch Profile

**POST** `/api/v1/profiles/switch`

Manually switches the optimization profile.

**Request Body**:
```json
{
  "profile": "aggressive",
  "reason": "High cost alert triggered"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "previousProfile": "balanced",
    "newProfile": "aggressive",
    "switchTime": "2025-01-15T10:30:00Z"
  }
}
```

### Get Profile Metrics

**GET** `/api/v1/profiles/metrics`

Gets metrics for all profiles.

**Response**:
```json
{
  "success": true,
  "data": {
    "profiles": {
      "baseline": {
        "coverage": 100,
        "estimatedCost": 100,
        "processLimit": null
      },
      "conservative": {
        "coverage": 95,
        "estimatedCost": 70,
        "processLimit": 100
      },
      "balanced": {
        "coverage": 90,
        "estimatedCost": 40,
        "processLimit": 50
      },
      "aggressive": {
        "coverage": 80,
        "estimatedCost": 15,
        "processLimit": 30
      }
    }
  }
}
```

### Get Optimization Status

**GET** `/api/v1/optimization/status`

Gets the current optimization status.

**Response**:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "mode": "automatic",
    "lastDecision": {
      "timestamp": "2025-01-15T10:00:00Z",
      "action": "maintain",
      "reason": "Metrics within target range"
    },
    "thresholds": {
      "costTarget": 50,
      "coverageMinimum": 85
    }
  }
}
```

### Override Optimization

**POST** `/api/v1/optimization/override`

Temporarily overrides automatic optimization.

**Request Body**:
```json
{
  "enabled": false,
  "duration": 3600,
  "reason": "Debugging production issue"
}
```

### Get Decision History

**GET** `/api/v1/optimization/history`

Gets the optimization decision history.

**Query Parameters**:
- `limit`: Number of decisions to return
- `from`: Start timestamp

**Response**:
```json
{
  "success": true,
  "data": {
    "decisions": [
      {
        "timestamp": "2025-01-15T10:00:00Z",
        "previousProfile": "balanced",
        "newProfile": "aggressive",
        "reason": "Cost exceeded threshold",
        "metrics": {
          "cost": 75.20,
          "coverage": 91.5
        }
      }
    ]
  }
}
```

## Metrics APIs

### Query Metrics

**POST** `/api/v1/metrics/query`

Executes an NRQL query.

**Request Body**:
```json
{
  "query": "SELECT average(cpuPercent) FROM SystemSample SINCE 1 hour ago",
  "accountId": 3630072
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "average.cpuPercent": 23.5
      }
    ],
    "metadata": {
      "timeWindow": {
        "begin": "2025-01-15T09:00:00Z",
        "end": "2025-01-15T10:00:00Z"
      }
    }
  }
}
```

### Validate NRQL

**POST** `/api/v1/metrics/validate`

Validates an NRQL query.

**Request Body**:
```json
{
  "query": "SELECT count(*) FROM ProcessSample"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "suggestions": [
      "Consider adding a SINCE clause for better performance"
    ]
  }
}
```

### Get Available Metrics

**GET** `/api/v1/metrics/available`

Lists available metrics in NRDB.

**Query Parameters**:
- `eventType`: Filter by event type
- `search`: Search term

**Response**:
```json
{
  "success": true,
  "data": {
    "eventTypes": [
      {
        "name": "ProcessSample",
        "attributes": [
          "processDisplayName",
          "cpuPercent",
          "memoryResidentSizeBytes"
        ]
      }
    ]
  }
}
```

## CLI Commands

### Dashboard Management

```bash
# Create dashboard
npm run cli dashboard create <template> [options]
  --name "Dashboard Name"
  --accountId 3630072
  --variables.profile balanced

# List dashboards
npm run cli dashboard list [options]
  --limit 50
  --filter "NRDOT"

# Update dashboard
npm run cli dashboard update <guid> [options]
  --name "New Name"

# Delete dashboard
npm run cli dashboard delete <guid>

# Export dashboard
npm run cli dashboard export <guid> > dashboard.json

# Import dashboard
npm run cli dashboard import < dashboard.json
```

### Experiment Management

```bash
# Run experiment
npm run cli experiment run <profile> [options]
  --duration 300
  --profiles baseline,balanced,aggressive

# View results
npm run cli experiment results <id>
  --format json|table|chart

# Compare experiments
npm run cli experiment compare <id1> <id2>

# List experiments
npm run cli experiment list
  --status completed
  --limit 10
```

### Optimization Control

```bash
# Get current profile
npm run cli profile current

# Switch profile
npm run cli profile switch <profile>
  --reason "Manual override"

# Enable/disable optimization
npm run cli optimization enable
npm run cli optimization disable --duration 3600

# View optimization status
npm run cli optimization status
```

### Metric Queries

```bash
# Execute NRQL query
npm run cli nrql query "SELECT count(*) FROM ProcessSample"

# Validate query
npm run cli nrql validate "SELECT * FROM SystemSample"

# Find metrics
npm run cli metrics find --pattern "cpu"

# Describe event type
npm run cli metrics describe ProcessSample
```

## WebSocket Events

Connect to WebSocket for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Event:', event);
});
```

### Event Types

#### profile.switched
```json
{
  "type": "profile.switched",
  "data": {
    "previousProfile": "balanced",
    "newProfile": "aggressive",
    "reason": "Cost threshold exceeded",
    "timestamp": "2025-01-15T10:00:00Z"
  }
}
```

#### metrics.updated
```json
{
  "type": "metrics.updated",
  "data": {
    "cost": 42.50,
    "coverage": 91.2,
    "processCount": 127,
    "timestamp": "2025-01-15T10:00:00Z"
  }
}
```

#### experiment.completed
```json
{
  "type": "experiment.completed",
  "data": {
    "experimentId": "exp-20250115-100000",
    "results": {...}
  }
}
```

#### alert.triggered
```json
{
  "type": "alert.triggered",
  "data": {
    "alertId": "coverage-drop",
    "severity": "warning",
    "message": "Process coverage dropped below 90%",
    "value": 88.5
  }
}
```

## Error Codes

### HTTP Status Codes

| Code | Description | Example |
|------|-------------|---------|
| 200 | Success | Request completed successfully |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid API key |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource already exists |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily down |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_QUERY",
    "message": "Invalid NRQL syntax",
    "details": {
      "line": 1,
      "column": 15,
      "suggestion": "Did you mean 'SELECT'?"
    }
  }
}
```

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `INVALID_API_KEY` | API key is invalid or expired | Generate new API key |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait and retry with backoff |
| `INVALID_QUERY` | NRQL query syntax error | Check query syntax |
| `PROFILE_NOT_FOUND` | Profile doesn't exist | Use valid profile name |
| `EXPERIMENT_RUNNING` | Another experiment is active | Wait or stop current |
| `INSUFFICIENT_PERMISSIONS` | API key lacks permissions | Use admin API key |
| `VALIDATION_ERROR` | Request validation failed | Check request format |
| `NERDGRAPH_ERROR` | New Relic API error | Check NR status |

## Rate Limits

### Default Limits

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| Dashboard Create | 10 requests | 1 minute |
| Dashboard List | 100 requests | 1 minute |
| NRQL Query | 50 requests | 1 minute |
| Profile Switch | 5 requests | 5 minutes |
| Experiment Start | 1 request | 10 minutes |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705315200
```

### Handling Rate Limits

```javascript
async function apiCallWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const resetTime = response.headers.get('X-RateLimit-Reset');
      const waitTime = resetTime ? (resetTime * 1000 - Date.now()) : 60000;
      
      console.log(`Rate limited. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    
    return response;
  }
  throw new Error('Max retries exceeded');
}
```

## Code Examples

### Node.js

```javascript
const axios = require('axios');

class DashBuilderAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'http://localhost:3000/api/v1';
  }

  async createDashboard(name, template) {
    try {
      const response = await axios.post(
        `${this.baseURL}/dashboards`,
        { name, template },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating dashboard:', error.response?.data);
      throw error;
    }
  }

  async getCurrentProfile() {
    const response = await axios.get(
      `${this.baseURL}/profiles/current`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      }
    );
    return response.data;
  }
}

// Usage
const api = new DashBuilderAPI('your-api-key');
const dashboard = await api.createDashboard('My Dashboard', 'nrdot-monitoring');
console.log('Created dashboard:', dashboard.data.permalink);
```

### Python

```python
import requests
import json

class DashBuilderAPI:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = 'http://localhost:3000/api/v1'
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
    
    def create_dashboard(self, name, template):
        """Create a new dashboard"""
        response = requests.post(
            f'{self.base_url}/dashboards',
            headers=self.headers,
            json={'name': name, 'template': template}
        )
        response.raise_for_status()
        return response.json()
    
    def get_current_profile(self):
        """Get current optimization profile"""
        response = requests.get(
            f'{self.base_url}/profiles/current',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def run_experiment(self, duration=300, profiles=None):
        """Run optimization experiment"""
        if profiles is None:
            profiles = ['baseline', 'balanced', 'aggressive']
        
        response = requests.post(
            f'{self.base_url}/experiments/start',
            headers=self.headers,
            json={
                'duration': duration,
                'profiles': profiles,
                'metrics': ['cost', 'coverage', 'performance']
            }
        )
        response.raise_for_status()
        return response.json()

# Usage
api = DashBuilderAPI('your-api-key')
dashboard = api.create_dashboard('Python Dashboard', 'nrdot-monitoring')
print(f"Dashboard URL: {dashboard['data']['permalink']}")
```

### cURL

```bash
#!/bin/bash

API_KEY="your-api-key"
BASE_URL="http://localhost:3000/api/v1"

# Function to make API calls
api_call() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  curl -X "$method" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    ${data:+-d "$data"} \
    "$BASE_URL$endpoint"
}

# Create dashboard
create_dashboard() {
  local name=$1
  local template=$2
  
  api_call POST /dashboards '{
    "name": "'"$name"'",
    "template": "'"$template"'"
  }'
}

# Get current profile
get_profile() {
  api_call GET /profiles/current
}

# Switch profile
switch_profile() {
  local profile=$1
  
  api_call POST /profiles/switch '{
    "profile": "'"$profile"'",
    "reason": "Manual switch via script"
  }'
}

# Usage
create_dashboard "Bash Dashboard" "nrdot-monitoring"
get_profile
switch_profile "aggressive"
```

### Go

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

type DashBuilderClient struct {
    APIKey  string
    BaseURL string
}

type Dashboard struct {
    Name     string `json:"name"`
    Template string `json:"template"`
}

type APIResponse struct {
    Success bool        `json:"success"`
    Data    interface{} `json:"data"`
    Error   interface{} `json:"error,omitempty"`
}

func NewClient(apiKey string) *DashBuilderClient {
    return &DashBuilderClient{
        APIKey:  apiKey,
        BaseURL: "http://localhost:3000/api/v1",
    }
}

func (c *DashBuilderClient) CreateDashboard(name, template string) (*APIResponse, error) {
    dashboard := Dashboard{
        Name:     name,
        Template: template,
    }
    
    jsonData, err := json.Marshal(dashboard)
    if err != nil {
        return nil, err
    }
    
    req, err := http.NewRequest("POST", c.BaseURL+"/dashboards", bytes.NewBuffer(jsonData))
    if err != nil {
        return nil, err
    }
    
    req.Header.Set("Authorization", "Bearer "+c.APIKey)
    req.Header.Set("Content-Type", "application/json")
    
    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var apiResp APIResponse
    if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
        return nil, err
    }
    
    return &apiResp, nil
}

func main() {
    client := NewClient("your-api-key")
    
    resp, err := client.CreateDashboard("Go Dashboard", "nrdot-monitoring")
    if err != nil {
        panic(err)
    }
    
    fmt.Printf("Dashboard created: %+v\n", resp.Data)
}
```

## Best Practices

### 1. Error Handling

Always implement proper error handling:

```javascript
try {
  const result = await api.createDashboard(name, template);
  // Handle success
} catch (error) {
  if (error.response?.status === 429) {
    // Handle rate limiting
  } else if (error.response?.status === 401) {
    // Handle authentication error
  } else {
    // Handle other errors
  }
}
```

### 2. Pagination

Use pagination for large result sets:

```javascript
async function getAllDashboards(api) {
  const dashboards = [];
  let cursor = null;
  
  do {
    const response = await api.get('/dashboards', {
      params: { cursor, limit: 100 }
    });
    
    dashboards.push(...response.data.dashboards);
    cursor = response.data.nextCursor;
  } while (cursor);
  
  return dashboards;
}
```

### 3. Caching

Implement caching for frequently accessed data:

```javascript
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute

async function getCachedProfile(api) {
  const cached = cache.get('current-profile');
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const response = await api.get('/profiles/current');
  cache.set('current-profile', {
    data: response.data,
    timestamp: Date.now()
  });
  
  return response.data;
}
```

### 4. Webhook Integration

Set up webhooks for real-time notifications:

```javascript
// Register webhook
await api.post('/webhooks', {
  url: 'https://your-app.com/webhook',
  events: ['profile.switched', 'experiment.completed'],
  secret: 'your-webhook-secret'
});

// Handle webhook
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const verified = verifySignature(req.body, signature, secret);
  
  if (!verified) {
    return res.status(401).send('Invalid signature');
  }
  
  const event = req.body;
  console.log('Webhook event:', event);
  
  res.status(200).send('OK');
});
```

## Support

- **Documentation**: [https://dashbuilder.io/docs](https://dashbuilder.io/docs)
- **GitHub Issues**: [https://github.com/your-org/dashbuilder/issues](https://github.com/your-org/dashbuilder/issues)
- **Community Forum**: [https://community.dashbuilder.io](https://community.dashbuilder.io)
- **Email Support**: [support@dashbuilder.io](mailto:support@dashbuilder.io)

---

*API Version: 1.0.0 | Last Updated: January 2025*