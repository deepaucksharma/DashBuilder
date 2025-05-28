# Code Failure Examples

## Real-World Scenarios That Break Current Implementation

### 1. NerdGraph Client Failures

#### Scenario: Actual API Call
```javascript
// What we have:
class FrontendNerdGraphClient {
  async query(nrql) {
    // This is completely fake - no actual API call
    const query = `
      query($accountId: Int!, $nrql: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrql) {
              results
            }
          }
        }
      }
    `;
    
    return this.fetchWithRetry(query, { 
      accountId: this.accountId,  // undefined!
      nrql 
    });
  }
  
  async fetchWithRetry(query, variables) {
    // This method doesn't exist!
    // No actual fetch implementation
  }
}

// What happens:
const client = new FrontendNerdGraphClient({ apiKey: 'test' });
await client.query('SELECT * FROM Transaction');
// TypeError: this.fetchWithRetry is not a function
```

### 2. Data Handling Failures

#### Scenario: Null/Undefined Data
```javascript
// Current visual-query-builder.js
calculateDataRange(data) {
  if (!data || data.length === 0) return { min: 0, max: 0 };
  
  const values = data.map(d => d.value || d);  // Assumes d.value exists
  return {
    min: Math.min(...values),  // Fails if values contains non-numbers
    max: Math.max(...values)
  };
}

// What breaks it:
const data = [
  { value: null },
  { value: undefined },
  { value: 'not a number' },
  { timestamp: 12345 }  // no value property
];

calculateDataRange(data);
// Result: { min: NaN, max: NaN }
// Charts crash trying to render with NaN scales
```

#### Scenario: Large Dataset
```javascript
// Current progressive-loader.js
async loadChunk(dataSource, range, loadId) {
  // No actual size limits
  const data = await dataSource.loadRange(range.start, range.end);
  
  // This will load entire dataset into memory
  this.dataCache.set(chunkKey, data);  // Memory explosion!
  
  return data;
}

// What breaks it:
const hugeDataSource = {
  loadRange: () => new Array(10_000_000).fill({ value: Math.random() })
};

loader.loadChunk(hugeDataSource, { start: 0, end: 10_000_000 });
// Browser tab crashes with "Aw, Snap!" error
```

### 3. Memory Leak Examples

#### Scenario: Event Listeners Not Cleaned
```javascript
// Current adaptive-widgets.js
class InteractionHandler {
  setup(element, widget) {
    // These listeners are never removed!
    element.addEventListener('click', this.handleClick.bind(this));
    element.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
    element.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    element.addEventListener('mousemove', this.handleMouseMove.bind(this));
    
    // No cleanup method exists
  }
}

// What happens after creating/destroying 100 widgets:
// - 400 orphaned event listeners
// - Memory usage grows continuously
// - Mouse movement becomes sluggish
```

#### Scenario: Animation Frame Leak
```javascript
// Current chart-renderers.js
class FPSCounter {
  monitor() {
    const now = performance.now();
    // ...
    
    // This runs forever, even after component unmount!
    requestAnimationFrame(() => this.monitor());
  }
}

// Creating multiple widgets starts multiple animation loops
// No way to stop them
// CPU usage climbs to 100%
```

### 4. Concurrent Access Failures

#### Scenario: Race Condition in Cache
```javascript
// Current predictive-fetcher.js
async executePrefetch(item) {
  const { query, context } = item;
  
  // Mark as active
  this.activeRequests.set(query, {
    startTime: Date.now(),
    context
  });
  
  try {
    // If two requests for same query happen simultaneously...
    const result = await this.client.query(query);
    
    // Both will write to cache, last one wins
    this.cache.set(query, result);
    
  } finally {
    this.activeRequests.delete(query);
  }
}

// What breaks:
// User scrolls quickly, triggering multiple prefetches
// Same query gets executed 3-4 times
// Cache gets corrupted with partial data
```

### 5. Security Vulnerabilities

#### Scenario: XSS via NRQL Injection
```javascript
// Current visual-query-builder.js
buildNRQL() {
  // Direct string concatenation - no sanitization!
  if (this.query.where.length > 0) {
    nrql += ' WHERE ';
    nrql += this.query.where
      .map(filter => {
        return `${filter.field} ${filter.operator} '${filter.value}'`;
        // User input directly inserted!
      })
      .join(' AND ');
  }
}

// Attack vector:
const maliciousInput = "'; DROP TABLE users; --";
// Results in: WHERE field = ''; DROP TABLE users; --'
```

#### Scenario: LocalStorage Data Exposure
```javascript
// Current nrql-autocomplete.js
savePatterns() {
  // Sensitive query patterns saved in plain text!
  const data = {
    transitions: Array.from(this.transitions.entries()),
    contextPatterns: Array.from(this.contextPatterns.entries()),
    sessions: this.usage.sessions  // Contains all user queries!
  };
  
  localStorage.setItem('user-patterns', JSON.stringify(data));
}

// Any JS on the page can read:
const stolenData = localStorage.getItem('user-patterns');
// Contains: API endpoints, table names, filter values, etc.
```

### 6. Performance Degradation

#### Scenario: Render Thrashing
```javascript
// Current adaptive-widgets.js
handleResize(rect) {
  // Clear cache on significant size change
  if (sizeChange > 50) {
    this.clearCache();  // Destroys all cached renders!
  }
  
  // Re-render with new size
  if (this.state.data) {
    this.renderDebouncer(this.state.data, this.container);
  }
}

// User resizes window:
// - 10 resize events fire
// - Cache cleared 10 times
// - 10 full re-renders queued
// - UI freezes for several seconds
```

### 7. Data Consistency Failures

#### Scenario: Stale Cache + Live Updates
```javascript
// Current client-analytics.js
analyze(data, type, options = {}) {
  const cacheKey = this.getCacheKey(data, type, options);
  const cached = this.cache.get(cacheKey);
  if (cached) return cached;  // Returns stale data!
  
  // No cache invalidation strategy
  // No way to know if data has changed
}

// Dashboard shows:
// - Widget A: Live data (just fetched)
// - Widget B: 5-minute old cached analysis
// - User sees inconsistent metrics
```

### 8. Mobile Device Failures

#### Scenario: Touch Event Handling
```javascript
// Current interaction-handler.js
handleTouchMove(event) {
  if (!this.touchStart) return;
  
  const deltaX = event.touches[0].clientX - this.touchStart.x;
  
  // Swipe detection is too sensitive on mobile
  if (Math.abs(deltaX) > 50) {  // 50px is nothing on mobile!
    this.widget.onSwipe?.(deltaX > 0 ? 'right' : 'left');
    this.touchStart = null;
  }
}

// Result: Can't scroll on mobile
// Every scroll attempt triggers swipe
// Dashboard becomes unusable
```

### 9. Error Propagation Failures

#### Scenario: Silent Failures
```javascript
// Throughout the codebase:
async loadAvailableMetrics() {
  // In real implementation, this would fetch from NerdGraph
  this.availableMetrics = [
    'system.cpu.usage',
    'system.memory.usage',
    // ... hardcoded list
  ];
}

// When this fails (network error, auth error, etc):
// - No error thrown
// - No user notification
// - Autocomplete silently stops working
// - User thinks there are no metrics available
```

### 10. Browser Compatibility

#### Scenario: Safari ResizeObserver
```javascript
// Current adaptive-widgets.js
observeResize() {
  this.resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
      this.handleResize(entry.contentRect);
    }
  });
  
  // ResizeObserver not available in older Safari
  // Entire widget system breaks
}

// On Safari 12:
// TypeError: ResizeObserver is not defined
// No widgets render at all
```

## Impact Summary

These failures demonstrate that the current implementation:
1. **Cannot connect to real APIs** - Core functionality is missing
2. **Crashes with real-world data** - No robust data handling
3. **Leaks memory continuously** - Will crash after minutes of use
4. **Has security vulnerabilities** - User data and systems at risk
5. **Degrades under normal usage** - Performance issues within minutes
6. **Fails on common devices** - Mobile and older browsers unsupported

The codebase needs fundamental architectural changes, not just bug fixes.