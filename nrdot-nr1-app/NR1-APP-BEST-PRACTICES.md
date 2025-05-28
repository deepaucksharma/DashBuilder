# New Relic One App Development Best Practices

## Based on Standard NR1 Requirements

### 1. Project Structure ✅
```
nrdot-nr1-app/
├── nr1.json                    ✅ (root configuration)
├── icon.png                    ❌ (needs to be created)
├── package.json                ✅ 
├── catalog/                    ✅
│   ├── config.json            ✅
│   ├── documentation.md       ✅
│   └── screenshots/           ⚠️ (recommended)
├── launchers/                  ✅
│   └── overview-launcher/     ✅
│       └── nr1.json          ✅
└── nerdlets/                   ✅
    ├── console/               ✅
    │   ├── index.js          ✅
    │   ├── nr1.json          ✅
    │   └── styles.scss       ✅
    └── overview/              ✅
        ├── index.js          ✅
        ├── nr1.json          ✅
        └── styles.scss       ✅
```

### 2. Icon Requirements
- **Format**: PNG (not SVG)
- **Size**: 512x512 pixels
- **Background**: Transparent recommended
- **Location**: Root directory as `icon.png`

### 3. CLI Installation
The New Relic One CLI is now part of the `newrelic` CLI:
```bash
# Latest installation method
curl -Ls https://download.newrelic.com/install/newrelic-cli/scripts/install.sh | bash

# Or via Homebrew (macOS)
brew install newrelic-cli

# Verify installation
newrelic --version
```

### 4. Configuration Requirements

#### nr1.json (Root)
```json
{
  "schemaType": "NERDPACK",
  "id": "unique-nerdpack-id",         // Must be globally unique
  "displayName": "Your App Name",      // User-visible name
  "description": "Short description",  // Max 1000 chars
  "version": "1.0.0",                 // Semantic versioning
  "icon": "icon.png"                  // Required
}
```

#### package.json Requirements
- Must include `nr1` section with UUID
- Dependencies should exclude `nr1` package (it's provided by platform)
- Use `peerDependencies` for React

### 5. Code Best Practices

#### Imports from NR1
```javascript
// Correct - import from 'nr1'
import { Card, CardBody, NrqlQuery } from 'nr1';

// Incorrect - don't install these packages
import Card from '@newrelic/nr1-card';
```

#### State Management
- Use React hooks (useState, useEffect, etc.)
- For complex state, use Context API
- Avoid external state management libraries if possible

#### API Calls
- Use `NerdGraphQuery` for GraphQL queries
- Use `NrqlQuery` for NRQL queries
- Handle loading and error states

#### Performance
- Lazy load heavy components
- Use React.memo for expensive renders
- Minimize bundle size (<5MB recommended)

### 6. Security Guidelines
- Never hardcode API keys or secrets
- Use `UserStorageQuery` for user-specific data
- Use `AccountStorageQuery` for account-specific data
- All external API calls must use HTTPS

### 7. Styling Guidelines
- Use SCSS modules for component styles
- Follow New Relic design system colors
- Ensure responsive design
- Support both light and dark themes

### 8. Testing Requirements
- Unit tests for business logic
- Integration tests for API calls
- Use React Testing Library
- Aim for >80% coverage

### 9. Catalog Requirements

#### config.json
```json
{
  "tagline": "Short tagline (max 30 chars)",
  "details": "Detailed description",
  "categoryTerms": ["category1", "category2"],
  "keywords": ["keyword1", "keyword2"],
  "repository": "https://github.com/...",
  "whatsNew": "Latest changes",
  "support": {
    "url": "https://...",
    "email": "support@..."
  }
}
```

#### Screenshots
- Add 1-5 screenshots in `catalog/screenshots/`
- PNG format, 1600x1200 pixels recommended
- Name them descriptively

### 10. Deployment Process

```bash
# 1. Login to New Relic
newrelic profile add --profile prod --api-key YOUR_USER_KEY --region US

# 2. Set default profile
newrelic profile default --profile prod

# 3. Generate UUID (first time only)
newrelic nerdpack:uuid --generate

# 4. Validate the nerdpack
newrelic nerdpack:validate

# 5. Build for production
newrelic nerdpack:build

# 6. Publish to New Relic
newrelic nerdpack:publish

# 7. Deploy to accounts
newrelic nerdpack:deploy

# 8. Subscribe accounts (optional)
newrelic nerdpack:subscribe --account-id YOUR_ACCOUNT_ID
```

### 11. Common Issues & Solutions

#### Issue: "nr1 command not found"
**Solution**: Use `newrelic` command instead of `nr1`

#### Issue: "Invalid UUID"
**Solution**: Generate new UUID with `newrelic nerdpack:uuid --generate`

#### Issue: "Icon not found"
**Solution**: Ensure `icon.png` exists in root directory

#### Issue: "Bundle too large"
**Solution**: 
- Use dynamic imports
- Exclude large dependencies
- Use tree shaking

### 12. Environment Variables
- Use `NerdGraphQuery` to fetch configuration
- Don't use process.env in production
- Store config in NerdStorage

### 13. Accessibility
- Use semantic HTML
- Include ARIA labels
- Ensure keyboard navigation
- Test with screen readers

### 14. Versioning
- Use semantic versioning (MAJOR.MINOR.PATCH)
- Update version for each publish
- Document changes in CHANGELOG.md

### 15. Monitoring Your App
- Use `console.error` for errors (not console.log)
- Implement error boundaries
- Track performance metrics
- Monitor bundle size