/**
 * Comprehensive Test Suite for DashBuilder
 * Tests all major components and integration scenarios
 */

// Import test utilities
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, fireEvent, waitFor, screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';

// Import components
import { DashBuilderApp } from '../dashbuilder-app.js';
import { VisualQueryBuilder } from '../visual-query-builder.js';
import { NRQLAutoComplete } from '../nrql-autocomplete.js';
import { AdaptiveWidget } from '../adaptive-widgets.js';
import { DataSourceManager } from '../data-source-manager.js';
import { DashboardStateManager } from '../dashboard-state-manager.js';
import { SecurityLayer } from '../security-layer.js';
import { ErrorBoundarySystem } from '../error-boundary.js';
import { NerdGraphClient } from '../nerdgraph-client.js';

// Mock dependencies
jest.mock('../nerdgraph-client.js');
jest.mock('../realtime-service.js');

describe('DashBuilder Application', () => {
  let app;
  let mockApiKey = 'test-api-key';
  
  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = '<div id="app"></div>';
    
    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    };
    global.localStorage = localStorageMock;
    
    // Mock fetch
    global.fetch = jest.fn();
    
    // Initialize app
    app = new DashBuilderApp({
      apiEndpoint: 'http://test.api',
      enableOffline: false
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
    if (app) {
      app.dispose?.();
    }
  });
  
  describe('Application Initialization', () => {
    it('should initialize all core services', async () => {
      await app.initialize();
      
      expect(app.services.data).toBeDefined();
      expect(app.services.state).toBeDefined();
      expect(app.services.communication).toBeDefined();
      expect(app.services.security).toBeDefined();
      expect(app.services.error).toBeDefined();
    });
    
    it('should handle initialization errors gracefully', async () => {
      // Mock security initialization failure
      jest.spyOn(app, 'initializeSecurity').mockRejectedValue(new Error('Security init failed'));
      
      await expect(app.initialize()).rejects.toThrow();
      expect(screen.getByText(/initialization error/i)).toBeInTheDocument();
    });
    
    it('should load user session on startup', async () => {
      const mockUser = { id: 'user-123', name: 'Test User' };
      jest.spyOn(app, 'getUserInfo').mockResolvedValue(mockUser);
      
      await app.initialize();
      
      expect(app.state.user).toEqual(mockUser);
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });
  });
  
  describe('Dashboard Operations', () => {
    beforeEach(async () => {
      await app.initialize();
    });
    
    it('should create a new dashboard', async () => {
      await app.createNewDashboard();
      
      expect(app.state.currentDashboard).toBeDefined();
      expect(app.state.currentDashboard.title).toBe('Untitled Dashboard');
      expect(app.services.state.currentDashboard).toBeDefined();
    });
    
    it('should save dashboard with changes', async () => {
      await app.createNewDashboard();
      
      // Make changes
      await app.services.state.addWidget({
        type: 'chart',
        title: 'Test Widget'
      });
      
      // Save
      await app.saveDashboard();
      
      expect(app.services.state.saveDashboard).toHaveBeenCalled();
      expect(screen.getByText(/dashboard saved/i)).toBeInTheDocument();
    });
    
    it('should handle save errors', async () => {
      await app.createNewDashboard();
      jest.spyOn(app.services.state, 'saveDashboard').mockRejectedValue(new Error('Save failed'));
      
      await app.saveDashboard();
      
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
    });
  });
  
  describe('Widget Management', () => {
    beforeEach(async () => {
      await app.initialize();
      await app.createNewDashboard();
    });
    
    it('should create and render widget', async () => {
      const widgetConfig = {
        id: 'widget-1',
        type: 'chart',
        title: 'CPU Usage',
        query: 'SELECT average(cpuPercent) FROM SystemSample',
        size: { width: 4, height: 3 }
      };
      
      await app.createWidget(widgetConfig);
      
      expect(app.components.widgets.has('widget-1')).toBe(true);
      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    });
    
    it('should handle widget interactions', async () => {
      await app.createWidget({
        id: 'widget-1',
        title: 'Test Widget'
      });
      
      // Test refresh
      const refreshBtn = screen.getByTitle('Refresh');
      fireEvent.click(refreshBtn);
      
      expect(app.refreshWidget).toHaveBeenCalledWith('widget-1');
    });
    
    it('should support widget communication', async () => {
      // Create two widgets
      await app.createWidget({ id: 'widget-1', title: 'Widget 1' });
      await app.createWidget({ id: 'widget-2', title: 'Widget 2' });
      
      const widget1 = app.components.widgets.get('widget-1');
      const widget2 = app.components.widgets.get('widget-2');
      
      // Set up message handler
      const messageHandler = jest.fn();
      widget2.api.subscribe('test-channel', messageHandler);
      
      // Send message
      await widget1.api.send('widget-2', { type: 'test', data: 'hello' });
      
      expect(messageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: { type: 'test', data: 'hello' }
        })
      );
    });
  });
});

describe('Visual Query Builder', () => {
  let queryBuilder;
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    queryBuilder = new VisualQueryBuilder({
      container,
      onQueryChange: jest.fn()
    });
  });
  
  afterEach(() => {
    document.body.removeChild(container);
  });
  
  it('should initialize with empty query', () => {
    expect(queryBuilder.query).toEqual({
      select: [],
      from: 'Metric',
      where: [],
      groupBy: [],
      orderBy: null,
      limit: null,
      timeRange: null
    });
  });
  
  it('should add metric to query', () => {
    queryBuilder.addMetric('cpuPercent', 'average');
    
    expect(queryBuilder.query.select).toContainEqual({
      metric: 'cpuPercent',
      aggregation: 'average'
    });
    
    const nrql = queryBuilder.buildNRQL();
    expect(nrql).toContain('SELECT average(cpuPercent)');
  });
  
  it('should add filter condition', () => {
    queryBuilder.addCondition('host', 'equals', 'server-1');
    
    expect(queryBuilder.query.where).toContainEqual({
      field: 'host',
      operator: 'equals',
      value: 'server-1'
    });
    
    const nrql = queryBuilder.buildNRQL();
    expect(nrql).toContain("WHERE host = 'server-1'");
  });
  
  it('should handle complex queries', () => {
    queryBuilder.addMetric('cpuPercent', 'average');
    queryBuilder.addMetric('memoryUsedPercent', 'average');
    queryBuilder.setFrom('SystemSample');
    queryBuilder.addCondition('host', 'like', 'prod-%');
    queryBuilder.addGroupBy('host');
    queryBuilder.setTimeRange('1 hour ago');
    
    const nrql = queryBuilder.buildNRQL();
    
    expect(nrql).toBe(
      "SELECT average(cpuPercent), average(memoryUsedPercent) FROM SystemSample WHERE host LIKE 'prod-%' FACET host SINCE 1 hour ago"
    );
  });
});

describe('NRQL Autocomplete', () => {
  let autocomplete;
  let mockDataSource;
  
  beforeEach(() => {
    mockDataSource = {
      query: jest.fn()
    };
    
    autocomplete = new NRQLAutoComplete({
      dataSource: mockDataSource
    });
  });
  
  it('should suggest functions after SELECT', async () => {
    const suggestions = await autocomplete.getSuggestions('SELECT ', 7);
    
    expect(suggestions).toContainEqual(
      expect.objectContaining({
        text: 'average',
        type: 'function'
      })
    );
    expect(suggestions).toContainEqual(
      expect.objectContaining({
        text: 'count',
        type: 'function'
      })
    );
  });
  
  it('should suggest event types after FROM', async () => {
    mockDataSource.query.mockResolvedValue({
      results: [
        { eventType: 'SystemSample' },
        { eventType: 'NetworkSample' }
      ]
    });
    
    const suggestions = await autocomplete.getSuggestions('SELECT * FROM ', 14);
    
    expect(suggestions).toContainEqual(
      expect.objectContaining({
        text: 'SystemSample',
        type: 'eventType'
      })
    );
  });
  
  it('should learn from usage patterns', async () => {
    // Simulate usage
    autocomplete.recordUsage('average', 'function');
    autocomplete.recordUsage('average', 'function');
    autocomplete.recordUsage('max', 'function');
    
    const suggestions = await autocomplete.getSuggestions('SELECT ', 7);
    
    // average should be ranked higher
    const avgIndex = suggestions.findIndex(s => s.text === 'average');
    const maxIndex = suggestions.findIndex(s => s.text === 'max');
    
    expect(avgIndex).toBeLessThan(maxIndex);
  });
});

describe('Adaptive Widgets', () => {
  let widget;
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '400px';
    container.style.height = '300px';
    document.body.appendChild(container);
    
    widget = new AdaptiveWidget({
      type: 'line',
      title: 'Test Chart'
    });
  });
  
  afterEach(() => {
    widget.unmount();
    document.body.removeChild(container);
  });
  
  it('should select appropriate rendering strategy', () => {
    const smallData = Array(50).fill().map((_, i) => ({ value: i }));
    const context = widget.analyzeContext(smallData, container);
    const strategy = widget.selectRenderStrategy(context);
    
    expect(strategy.type).toBe('svg'); // SVG for small datasets
  });
  
  it('should use canvas for large datasets', () => {
    const largeData = Array(5000).fill().map((_, i) => ({ value: i }));
    const context = widget.analyzeContext(largeData, container);
    const strategy = widget.selectRenderStrategy(context);
    
    expect(strategy.type).toBe('canvas');
  });
  
  it('should handle responsive resizing', async () => {
    widget.mount(container);
    
    const data = Array(100).fill().map((_, i) => ({ value: Math.sin(i / 10) * 50 + 50 }));
    widget.render(data, container);
    
    // Simulate resize
    container.style.width = '600px';
    
    // Wait for debounced resize
    await waitFor(() => {
      expect(widget.state.size.width).toBeCloseTo(600, -2);
    });
  });
  
  it('should cache renders for performance', () => {
    const data = Array(100).fill().map((_, i) => ({ value: i }));
    
    // First render
    widget.render(data, container);
    expect(widget.renderCache.size).toBe(1);
    
    // Second render with same data should use cache
    const spy = jest.spyOn(widget.renderer, 'render');
    widget.render(data, container);
    
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Data Source Manager', () => {
  let dataSource;
  
  beforeEach(() => {
    dataSource = new DataSourceManager({
      apiEndpoint: 'http://test.api',
      auth: { apiKey: 'test-key' }
    });
    
    global.fetch = jest.fn();
  });
  
  it('should execute NRQL queries', async () => {
    const mockResponse = {
      data: {
        actor: {
          account: {
            nrql: {
              results: [{ average: 75.5 }],
              metadata: { eventTypes: ['SystemSample'] }
            }
          }
        }
      }
    };
    
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });
    
    const result = await dataSource.query('SELECT average(cpuPercent) FROM SystemSample');
    
    expect(result.results).toEqual([{ average: 75.5 }]);
    expect(fetch).toHaveBeenCalledWith(
      'http://test.api',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Api-Key': 'test-key'
        })
      })
    );
  });
  
  it('should retry on failure', async () => {
    fetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { actor: { account: { nrql: { results: [] } } } } })
      });
    
    const result = await dataSource.query('SELECT * FROM SystemSample');
    
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.results).toEqual([]);
  });
  
  it('should batch queries efficiently', async () => {
    const queries = [
      { nrql: 'SELECT count(*) FROM SystemSample' },
      { nrql: 'SELECT average(cpuPercent) FROM SystemSample' }
    ];
    
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          query0: { nrql: { results: [{ count: 1000 }] } },
          query1: { nrql: { results: [{ average: 75.5 }] } }
        }
      })
    });
    
    const results = await dataSource.batchQuery(queries);
    
    expect(results).toHaveLength(2);
    expect(results[0].results).toEqual([{ count: 1000 }]);
    expect(results[1].results).toEqual([{ average: 75.5 }]);
    expect(fetch).toHaveBeenCalledTimes(1); // Single batched request
  });
  
  it('should handle rate limiting', async () => {
    // Exhaust rate limit
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(dataSource.query(`SELECT ${i} FROM Test`));
    }
    
    // Should queue requests
    expect(dataSource.rateLimiter.queue.length).toBeGreaterThan(0);
  });
});

describe('Dashboard State Management', () => {
  let stateManager;
  
  beforeEach(() => {
    stateManager = new DashboardStateManager({
      autoSaveInterval: 0 // Disable for tests
    });
  });
  
  it('should create dashboard with proper structure', async () => {
    const dashboard = await stateManager.createDashboard({
      title: 'Test Dashboard'
    });
    
    expect(dashboard).toMatchObject({
      id: expect.any(String),
      title: 'Test Dashboard',
      widgets: [],
      layout: expect.any(Object),
      metadata: expect.objectContaining({
        created: expect.any(String),
        author: expect.any(String)
      })
    });
  });
  
  it('should support undo/redo operations', async () => {
    const dashboard = await stateManager.createDashboard();
    
    // Add widget
    const widget = await stateManager.addWidget({ title: 'Widget 1' });
    expect(dashboard.widgets).toHaveLength(1);
    
    // Undo
    await stateManager.undo();
    expect(dashboard.widgets).toHaveLength(0);
    
    // Redo
    await stateManager.redo();
    expect(dashboard.widgets).toHaveLength(1);
  });
  
  it('should handle concurrent modifications', async () => {
    const dashboard = await stateManager.createDashboard();
    
    // Simulate concurrent widget additions
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(stateManager.addWidget({ title: `Widget ${i}` }));
    }
    
    await Promise.all(promises);
    
    expect(dashboard.widgets).toHaveLength(5);
    expect(new Set(dashboard.widgets.map(w => w.id)).size).toBe(5); // All unique IDs
  });
  
  it('should validate widget operations', async () => {
    await stateManager.createDashboard();
    
    // Try to add invalid widget
    await expect(
      stateManager.addWidget({ /* missing required fields */ })
    ).rejects.toThrow(/validation/i);
    
    // Try to update non-existent widget
    await expect(
      stateManager.updateWidget('non-existent', { title: 'New' })
    ).rejects.toThrow(/not found/i);
  });
});

describe('Security Layer', () => {
  let security;
  
  beforeEach(() => {
    security = new SecurityLayer({
      enableCSRF: true,
      enableXSSProtection: true
    });
  });
  
  it('should sanitize HTML input', () => {
    const dangerous = '<script>alert("XSS")</script><p>Safe content</p>';
    const sanitized = security.sanitizeHTML(dangerous);
    
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('<p>Safe content</p>');
  });
  
  it('should prevent SQL injection in NRQL', () => {
    const maliciousQuery = "SELECT * FROM SystemSample; DROP TABLE users--";
    
    expect(() => {
      security.sanitizeNRQL(maliciousQuery);
    }).toThrow(/SQL injection/i);
  });
  
  it('should validate input types', () => {
    expect(security.validateInput('test@example.com', 'email')).toBe('test@example.com');
    expect(() => security.validateInput('invalid-email', 'email')).toThrow(/invalid email/i);
    
    expect(security.validateInput('123.45', 'number')).toBe(123.45);
    expect(() => security.validateInput('not-a-number', 'number')).toThrow(/invalid number/i);
    
    expect(security.validateInput('https://example.com', 'url')).toBe('https://example.com');
    expect(() => security.validateInput('javascript:alert(1)', 'url')).toThrow(/invalid url/i);
  });
  
  it('should manage CSRF tokens', async () => {
    // Mock CSRF endpoint
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'csrf-token-123', expiresIn: 3600 })
    });
    
    await security.initializeCSRFProtection();
    
    const token = await security.getCSRFToken();
    expect(token).toBe('csrf-token-123');
  });
});

describe('Error Boundary System', () => {
  let errorBoundary;
  
  beforeEach(() => {
    errorBoundary = new ErrorBoundarySystem({
      enableAutoRecovery: true,
      maxErrorsPerMinute: 5
    });
  });
  
  it('should catch and handle global errors', async () => {
    const error = new Error('Test error');
    
    await errorBoundary.handleError(error, { source: 'test' });
    
    expect(errorBoundary.errorLog).toHaveLength(1);
    expect(errorBoundary.errorLog[0]).toMatchObject({
      error: expect.objectContaining({
        message: 'Test error'
      }),
      context: { source: 'test' }
    });
  });
  
  it('should categorize errors correctly', () => {
    expect(errorBoundary.categorizeError(new TypeError('Cannot read property'))).toBe('type');
    expect(errorBoundary.categorizeError(new Error('NetworkError'))).toBe('network');
    expect(errorBoundary.categorizeError(new Error('ChunkLoadError'))).toBe('chunk');
  });
  
  it('should detect error loops', async () => {
    // Trigger multiple errors quickly
    for (let i = 0; i < 6; i++) {
      await errorBoundary.handleError(new Error(`Error ${i}`));
    }
    
    expect(errorBoundary.isErrorLoop()).toBe(true);
  });
  
  it('should attempt recovery strategies', async () => {
    const networkError = new Error('Failed to fetch');
    networkError.name = 'NetworkError';
    
    const recoverySpy = jest.spyOn(errorBoundary.strategies.network, 'recover');
    
    await errorBoundary.handleError(networkError);
    
    expect(recoverySpy).toHaveBeenCalled();
  });
});

describe('NerdGraph Client', () => {
  let client;
  
  beforeEach(() => {
    client = new NerdGraphClient({
      endpoint: 'http://test.graphql',
      apiKey: 'test-key',
      accountId: 123456
    });
  });
  
  it('should execute GraphQL queries', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          actor: {
            account: {
              nrql: {
                results: [{ count: 100 }]
              }
            }
          }
        }
      })
    });
    
    const result = await client.nrql('SELECT count(*) FROM SystemSample');
    
    expect(result.results).toEqual([{ count: 100 }]);
  });
  
  it('should batch requests efficiently', async () => {
    // Enable batching
    client.config.enableBatching = true;
    
    // Queue multiple queries
    const promise1 = client.query('query { test1 }');
    const promise2 = client.query('query { test2 }');
    
    // Wait for batch execution
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(fetch).toHaveBeenCalledTimes(1); // Single batched request
  });
  
  it('should handle GraphQL errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [{
          message: 'Invalid query',
          extensions: { code: 'GRAPHQL_VALIDATION_FAILED' }
        }]
      })
    });
    
    await expect(client.query('invalid query')).rejects.toThrow(/GraphQL errors/);
  });
});

describe('Integration Tests', () => {
  let app;
  
  beforeEach(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    
    app = new DashBuilderApp({
      apiEndpoint: 'http://test.api',
      enableOffline: false
    });
    
    await app.initialize();
  });
  
  it('should create dashboard with widgets and save', async () => {
    // Create dashboard
    await app.createNewDashboard();
    
    // Add widgets
    await app.createWidget({
      title: 'CPU Monitor',
      query: 'SELECT average(cpuPercent) FROM SystemSample',
      type: 'line'
    });
    
    await app.createWidget({
      title: 'Memory Monitor',
      query: 'SELECT average(memoryUsedPercent) FROM SystemSample',
      type: 'gauge'
    });
    
    // Save dashboard
    await app.saveDashboard();
    
    expect(app.state.currentDashboard.widgets).toHaveLength(2);
    expect(app.hasUnsavedChanges()).toBe(false);
  });
  
  it('should handle offline mode gracefully', async () => {
    // Simulate offline
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false
    });
    
    window.dispatchEvent(new Event('offline'));
    
    expect(screen.getByText(/working offline/i)).toBeInTheDocument();
    
    // Try to save - should queue
    await app.saveDashboard();
    
    expect(app.services.data.offlineQueue.length).toBeGreaterThan(0);
  });
  
  it('should recover from critical errors', async () => {
    // Simulate critical error
    const criticalError = new Error('Out of memory');
    criticalError.name = 'RangeError';
    
    await app.services.error.handleError(criticalError);
    
    // Should save emergency state
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'emergency-save',
      expect.any(String)
    );
  });
});

// Performance tests
describe('Performance', () => {
  it('should handle large datasets efficiently', async () => {
    const widget = new AdaptiveWidget({ type: 'line' });
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '400px';
    
    // Generate large dataset
    const data = Array(10000).fill().map((_, i) => ({
      timestamp: Date.now() - i * 1000,
      value: Math.random() * 100
    }));
    
    const startTime = performance.now();
    widget.render(data, container);
    const renderTime = performance.now() - startTime;
    
    expect(renderTime).toBeLessThan(100); // Should render in under 100ms
  });
  
  it('should efficiently batch API requests', async () => {
    const dataSource = new DataSourceManager({
      apiEndpoint: 'http://test.api',
      batchSize: 10
    });
    
    // Queue many queries
    const queries = Array(50).fill().map((_, i) => ({
      nrql: `SELECT count(*) FROM Test WHERE id = ${i}`
    }));
    
    const startTime = performance.now();
    await dataSource.batchQuery(queries);
    const totalTime = performance.now() - startTime;
    
    // Should batch into 5 requests
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(totalTime).toBeLessThan(1000); // Should complete quickly
  });
});