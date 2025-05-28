# New Relic One App Deployment Guide

## Overview

DashBuilder can be deployed directly to New Relic as a New Relic One application (Nerdlet). This allows the app to run within New Relic's platform with native integration.

## Architecture Comparison

### Current Architecture
- **Frontend**: Standalone React app
- **Backend**: Express.js API server
- **Hosting**: External (Kubernetes/Docker)
- **Data Access**: Via NerdGraph API

### New Relic One Architecture
- **Frontend**: React app using NR1 SDK
- **Backend**: Direct NerdGraph access (no separate backend needed)
- **Hosting**: New Relic's cloud infrastructure
- **Data Access**: Native platform integration

## Deployment Requirements

### Prerequisites
1. New Relic account with appropriate permissions
2. Node.js 16+ and npm installed
3. New Relic One CLI (`nr1`)
4. Valid User API Key

### Install NR1 CLI
```bash
npm install -g @newrelic/nr1
```

### Configure API Key
```bash
nr1 profiles:add --name default --api-key YOUR_USER_API_KEY --region us
```

## Deployment Steps

### 1. Navigate to NR1 App Directory
```bash
cd nrdot-nr1-app
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Validate App
```bash
nr1 nerdpack:validate
```

### 4. Test Locally
```bash
nr1 nerdpack:serve
```
This opens the app in your browser at: https://one.newrelic.com/?nerdpacks=local

### 5. Build for Production
```bash
nr1 nerdpack:build
```

### 6. Publish to New Relic
```bash
nr1 nerdpack:publish
```

### 7. Deploy to Account
```bash
nr1 nerdpack:deploy --channel=STABLE
```

### 8. Subscribe Accounts
```bash
nr1 subscription:set --nerdpack-id=nrdot-host-process-optimization --channel=STABLE --account-id=YOUR_ACCOUNT_ID
```

## Migration Considerations

### Features to Adapt

1. **Authentication**
   - Use New Relic's built-in authentication
   - Remove JWT/login system

2. **Data Access**
   - Direct NerdGraph queries from frontend
   - No proxy needed

3. **State Management**
   - Use NerdletStateContext and PlatformStateContext
   - Leverage platform features

4. **Styling**
   - Use New Relic One components
   - Follow platform design guidelines

### Code Changes Required

1. **Replace Backend Calls**
```javascript
// Before (external backend)
const response = await fetch('/api/nerdgraph/query', {
  method: 'POST',
  body: JSON.stringify({ query })
});

// After (NR1 SDK)
import { NerdGraphQuery } from 'nr1';
const { data } = await NerdGraphQuery.query({ query });
```

2. **Use Platform Components**
```javascript
// Import NR1 components
import { 
  Card, 
  CardBody, 
  HeadingText,
  LineChart,
  TableChart,
  NrqlQuery
} from 'nr1';
```

3. **Leverage Platform Features**
```javascript
// Access account and time range from platform
const { accountId, timeRange } = React.useContext(PlatformStateContext);
```

## Advantages of NR1 Hosting

1. **No Infrastructure Management**
   - No servers to maintain
   - Automatic scaling
   - Built-in security

2. **Native Integration**
   - Direct data access
   - Platform features (time picker, account selector)
   - Consistent UI/UX

3. **Simplified Architecture**
   - No backend needed
   - No CORS issues
   - No API keys in code

4. **Cost Efficiency**
   - No hosting costs
   - No separate infrastructure
   - Included with New Relic subscription

## Limitations

1. **Platform Constraints**
   - Must use React
   - Limited to NR1 SDK capabilities
   - No server-side processing

2. **Data Storage**
   - No custom database
   - Use NerdStorage for app data
   - Limited to 10KB per entity

3. **External Services**
   - No direct external API calls
   - Must proxy through New Relic

## Best Practices

1. **Performance**
   - Minimize bundle size
   - Use lazy loading
   - Cache NerdGraph queries

2. **Security**
   - Never hardcode credentials
   - Use platform permissions
   - Follow OWASP guidelines

3. **User Experience**
   - Follow NR1 design patterns
   - Use platform components
   - Maintain consistency

## Monitoring

Once deployed, monitor your app:

1. **Usage Analytics**
   - View in Apps > Manage Apps
   - Track adoption and usage

2. **Error Tracking**
   - Errors appear in browser console
   - Use try-catch blocks

3. **Performance**
   - Monitor load times
   - Track API call latency

## Rollback

If issues occur:

```bash
# Deploy previous version
nr1 nerdpack:deploy --channel=STABLE --from-version=1.0.0

# Or undeploy completely
nr1 nerdpack:undeploy --channel=STABLE
```

## Support

- Documentation: https://developer.newrelic.com
- Community: https://discuss.newrelic.com
- Support: https://support.newrelic.com