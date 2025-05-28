# DashBuilder Shared Components

Shared UI components and utilities for the DashBuilder platform.

## Installation

```bash
cd shared-components
npm install
```

## Development

```bash
# Build the library
npm run build

# Watch mode for development
npm run build:watch

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Check test coverage
npm run test:coverage
```

## Usage

### In NR1 App

```javascript
import { NRQLValidator } from '@dashbuilder/shared-components';

const validator = new NRQLValidator();
const result = validator.validate('SELECT count(*) FROM SystemSample');

if (result.valid) {
  console.log('Query is valid!');
} else {
  console.error('Errors:', result.errors);
}
```

### In Node.js/CLI

```javascript
const { nrqlValidator } = require('@dashbuilder/shared-components');

const result = nrqlValidator.validate(query);
```

## Available Components

### Utils
- `NRQLValidator` - NRQL query syntax validator

### Coming Soon
- `VisualQueryBuilder` - Visual NRQL query construction
- `AdaptiveWidget` - Performance-optimized widgets
- `ProgressiveLoader` - Large dataset handling
- `SecurityLayer` - Input sanitization and security

## Architecture

This library is designed to be:
- Framework-agnostic (with React adapters)
- Tree-shakeable
- Fully tested
- Type-safe (TypeScript definitions coming)

## Testing

All components have comprehensive test coverage. Run tests with:

```bash
npm test
```

## Contributing

1. Add new components in appropriate category under `src/`
2. Export from `src/index.js`
3. Add tests in `tests/`
4. Update this README

## License

MIT