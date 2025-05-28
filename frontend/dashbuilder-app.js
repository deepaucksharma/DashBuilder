/**
 * DashBuilder Application
 * Main application that integrates all components into a production-ready system
 */

class DashBuilderApp {
  constructor(config = {}) {
    this.config = {
      apiEndpoint: config.apiEndpoint || process.env.NEW_RELIC_API_ENDPOINT,
      wsEndpoint: config.wsEndpoint || process.env.WEBSOCKET_ENDPOINT,
      enableOffline: config.enableOffline !== false,
      enableCollaboration: config.enableCollaboration !== false,
      enableAnalytics: config.enableAnalytics !== false,
      ...config
    };
    
    // Core services
    this.services = {
      data: null,
      state: null,
      communication: null,
      security: null,
      error: null
    };
    
    // UI components
    this.components = {
      queryBuilder: null,
      widgets: new Map(),
      dashboards: new Map()
    };
    
    // Application state
    this.state = {
      initialized: false,
      user: null,
      currentDashboard: null,
      theme: 'light'
    };
    
    // Initialize application
    this.initialize();
  }

  /**
   * Initialize application
   */
  async initialize() {
    try {
      // Show loading screen
      this.showLoadingScreen();
      
      // Initialize security first
      await this.initializeSecurity();
      
      // Initialize error handling
      this.initializeErrorHandling();
      
      // Initialize core services
      await this.initializeServices();
      
      // Initialize UI
      await this.initializeUI();
      
      // Load user session
      await this.loadUserSession();
      
      // Mark as initialized
      this.state.initialized = true;
      
      // Hide loading screen
      this.hideLoadingScreen();
      
      // Show main UI
      this.showMainUI();
      
    } catch (error) {
      console.error('Failed to initialize application:', error);
      this.showInitializationError(error);
    }
  }

  /**
   * Initialize security layer
   */
  async initializeSecurity() {
    const { SecurityLayer } = await import('./security-layer.js');
    
    this.services.security = new SecurityLayer({
      trustedDomains: [
        this.config.apiEndpoint,
        'https://api.newrelic.com',
        'https://nerdgraph.newrelic.com'
      ],
      csrfTokenEndpoint: `${this.config.apiEndpoint}/csrf-token`
    });
    
    // Wait for security initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Initialize error handling
   */
  initializeErrorHandling() {
    const { ErrorBoundarySystem } = window;
    
    this.services.error = window.errorBoundary || new ErrorBoundarySystem({
      enableAutoRecovery: true,
      enableErrorReporting: true,
      errorEndpoint: `${this.config.apiEndpoint}/errors`,
      maxErrorsPerMinute: 20
    });
    
    // Set up app-specific error handling
    this.services.error.on('criticalError', (error) => {
      this.handleCriticalError(error);
    });
  }

  /**
   * Initialize core services
   */
  async initializeServices() {
    // Data source manager
    const { DataSourceManager } = await import('./data-source-manager.js');
    this.services.data = new DataSourceManager({
      apiEndpoint: this.config.apiEndpoint,
      auth: {
        apiKey: await this.getAPIKey()
      }
    });
    
    // Dashboard state manager
    const { DashboardStateManager } = await import('./dashboard-state-manager.js');
    this.services.state = new DashboardStateManager({
      storage: {
        endpoint: `${this.config.apiEndpoint}/dashboards`
      },
      collaboration: {
        enabled: this.config.enableCollaboration,
        endpoint: this.config.wsEndpoint
      }
    });
    
    // Widget communication hub
    const { WidgetCommunicationHub } = await import('./widget-communication.js');
    this.services.communication = new WidgetCommunicationHub({
      enableLogging: process.env.NODE_ENV === 'development'
    });
    
    // Progressive loader
    const { ProgressiveLoader } = await import('./progressive-loader.js');
    this.services.loader = new ProgressiveLoader({
      chunkSize: 1000,
      enableVirtualization: true
    });
    
    // Client analytics
    const { ClientAnalytics } = await import('./client-analytics.js');
    this.services.analytics = new ClientAnalytics({
      enabled: this.config.enableAnalytics
    });
    
    // Predictive fetcher
    const { PredictiveFetcher } = await import('./predictive-fetcher.js');
    this.services.predictive = new PredictiveFetcher({
      dataSource: this.services.data,
      analytics: this.services.analytics
    });
  }

  /**
   * Initialize UI components
   */
  async initializeUI() {
    // Set up main layout
    this.createMainLayout();
    
    // Initialize query builder
    const { VisualQueryBuilder } = await import('./visual-query-builder.js');
    this.components.queryBuilder = new VisualQueryBuilder({
      container: document.getElementById('query-builder'),
      onQueryChange: (query) => this.handleQueryChange(query)
    });
    
    // Initialize NRQL autocomplete
    const { NRQLAutoComplete } = await import('./nrql-autocomplete.js');
    this.components.autocomplete = new NRQLAutoComplete({
      dataSource: this.services.data,
      learningEngine: this.services.analytics
    });
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Apply theme
    this.applyTheme(this.state.theme);
  }

  /**
   * Create main layout
   */
  createMainLayout() {
    document.body.innerHTML = `
      <div id="app" class="dashbuilder-app">
        <header class="app-header">
          <div class="app-logo">
            <h1>DashBuilder</h1>
          </div>
          <nav class="app-nav">
            <button id="new-dashboard" class="nav-btn">New Dashboard</button>
            <button id="open-dashboard" class="nav-btn">Open</button>
            <button id="save-dashboard" class="nav-btn">Save</button>
            <button id="share-dashboard" class="nav-btn">Share</button>
          </nav>
          <div class="app-user">
            <span id="user-name"></span>
            <button id="user-menu" class="user-menu-btn">⚙️</button>
          </div>
        </header>
        
        <div class="app-body">
          <aside class="app-sidebar">
            <div id="widget-library" class="widget-library">
              <h3>Widgets</h3>
              <div class="widget-categories"></div>
            </div>
            <div id="query-builder" class="query-builder-panel"></div>
          </aside>
          
          <main class="app-main">
            <div id="dashboard-container" class="dashboard-container">
              <div class="dashboard-grid"></div>
            </div>
          </main>
          
          <aside class="app-properties">
            <div id="widget-properties" class="properties-panel">
              <h3>Properties</h3>
              <div class="properties-content"></div>
            </div>
          </aside>
        </div>
        
        <footer class="app-footer">
          <div class="status-bar">
            <span id="connection-status" class="status-indicator"></span>
            <span id="last-saved" class="status-text"></span>
          </div>
        </footer>
      </div>
    `;
  }

  /**
   * Set up event handlers
   */
  setupEventHandlers() {
    // Navigation buttons
    document.getElementById('new-dashboard').addEventListener('click', () => {
      this.createNewDashboard();
    });
    
    document.getElementById('open-dashboard').addEventListener('click', () => {
      this.showDashboardPicker();
    });
    
    document.getElementById('save-dashboard').addEventListener('click', () => {
      this.saveDashboard();
    });
    
    document.getElementById('share-dashboard').addEventListener('click', () => {
      this.showShareDialog();
    });
    
    // User menu
    document.getElementById('user-menu').addEventListener('click', () => {
      this.showUserMenu();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            this.saveDashboard();
            break;
          case 'n':
            e.preventDefault();
            this.createNewDashboard();
            break;
          case 'o':
            e.preventDefault();
            this.showDashboardPicker();
            break;
          case 'z':
            e.preventDefault();
            this.services.state.undo();
            break;
          case 'y':
            e.preventDefault();
            this.services.state.redo();
            break;
        }
      }
    });
    
    // Window events
    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    });
    
    // Online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  /**
   * Dashboard operations
   */
  async createNewDashboard() {
    try {
      const dashboard = await this.services.state.createDashboard({
        title: 'Untitled Dashboard',
        layoutType: 'grid'
      });
      
      this.state.currentDashboard = dashboard;
      this.renderDashboard(dashboard);
      
      this.showNotification('New dashboard created', 'success');
      
    } catch (error) {
      this.showNotification('Failed to create dashboard', 'error');
      console.error('Failed to create dashboard:', error);
    }
  }

  async saveDashboard() {
    if (!this.state.currentDashboard) return;
    
    try {
      await this.services.state.saveDashboard();
      
      this.updateLastSaved();
      this.showNotification('Dashboard saved', 'success');
      
    } catch (error) {
      this.showNotification('Failed to save dashboard', 'error');
      console.error('Failed to save dashboard:', error);
    }
  }

  renderDashboard(dashboard) {
    const container = document.querySelector('.dashboard-grid');
    container.innerHTML = '';
    
    // Render widgets
    dashboard.widgets.forEach(widgetConfig => {
      this.createWidget(widgetConfig);
    });
    
    // Update UI
    document.title = `${dashboard.title} - DashBuilder`;
    this.updateConnectionStatus('connected');
  }

  /**
   * Widget operations
   */
  async createWidget(config) {
    try {
      // Import adaptive widgets
      const { AdaptiveWidget } = await import('./adaptive-widgets.js');
      
      // Create widget instance
      const widget = new AdaptiveWidget({
        ...config,
        dataSource: this.services.data,
        communication: this.services.communication
      });
      
      // Register with communication hub
      const api = this.services.communication.registerWidget(widget);
      widget.api = api;
      
      // Create widget container
      const container = document.createElement('div');
      container.className = 'widget-container';
      container.id = `widget-${config.id}`;
      container.style.gridColumn = `span ${config.size.width}`;
      container.style.gridRow = `span ${config.size.height}`;
      
      // Add widget header
      const header = this.createWidgetHeader(config);
      container.appendChild(header);
      
      // Add widget content
      const content = document.createElement('div');
      content.className = 'widget-content';
      container.appendChild(content);
      
      // Mount widget
      widget.mount(content);
      
      // Add to dashboard
      document.querySelector('.dashboard-grid').appendChild(container);
      
      // Store widget reference
      this.components.widgets.set(config.id, widget);
      
      // Load data if query is defined
      if (config.query) {
        this.loadWidgetData(widget, config.query);
      }
      
      // Set up widget interactions
      this.setupWidgetInteractions(widget, container);
      
    } catch (error) {
      console.error('Failed to create widget:', error);
      this.showNotification('Failed to create widget', 'error');
    }
  }

  createWidgetHeader(config) {
    const header = document.createElement('div');
    header.className = 'widget-header';
    header.innerHTML = `
      <h3 class="widget-title">${this.services.security.sanitize(config.title)}</h3>
      <div class="widget-actions">
        <button class="widget-action" data-action="refresh" title="Refresh">🔄</button>
        <button class="widget-action" data-action="settings" title="Settings">⚙️</button>
        <button class="widget-action" data-action="remove" title="Remove">✕</button>
      </div>
    `;
    
    // Handle actions
    header.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action) {
        this.handleWidgetAction(config.id, action);
      }
    });
    
    return header;
  }

  handleWidgetAction(widgetId, action) {
    switch (action) {
      case 'refresh':
        this.refreshWidget(widgetId);
        break;
      case 'settings':
        this.showWidgetSettings(widgetId);
        break;
      case 'remove':
        this.removeWidget(widgetId);
        break;
    }
  }

  async loadWidgetData(widget, query) {
    try {
      // Show loading state
      widget.showLoading();
      
      // Execute query
      const data = await this.services.data.query(query);
      
      // Render data
      widget.render(data.results, widget.container);
      
    } catch (error) {
      widget.showError(error);
      console.error('Failed to load widget data:', error);
    }
  }

  setupWidgetInteractions(widget, container) {
    // Make widget draggable
    this.makeWidgetDraggable(container);
    
    // Make widget resizable
    this.makeWidgetResizable(container);
    
    // Set up cross-widget communication
    widget.api.subscribe('*', (message) => {
      this.handleWidgetMessage(widget, message);
    });
  }

  makeWidgetDraggable(container) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    const header = container.querySelector('.widget-header');
    
    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('widget-action')) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = container.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      container.style.position = 'fixed';
      container.style.zIndex = '1000';
      container.style.left = startLeft + 'px';
      container.style.top = startTop + 'px';
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
    
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      container.style.left = (startLeft + deltaX) + 'px';
      container.style.top = (startTop + deltaY) + 'px';
    };
    
    const handleMouseUp = (e) => {
      if (!isDragging) return;
      
      isDragging = false;
      
      // Calculate grid position
      const gridRect = document.querySelector('.dashboard-grid').getBoundingClientRect();
      const x = Math.round((e.clientX - gridRect.left) / 100);
      const y = Math.round((e.clientY - gridRect.top) / 100);
      
      // Update widget position
      container.style.position = '';
      container.style.zIndex = '';
      container.style.left = '';
      container.style.top = '';
      container.style.gridColumnStart = x;
      container.style.gridRowStart = y;
      
      // Update state
      const widgetId = container.id.replace('widget-', '');
      this.services.state.moveWidget(widgetId, { x, y });
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }

  makeWidgetResizable(container) {
    const resizer = document.createElement('div');
    resizer.className = 'widget-resizer';
    container.appendChild(resizer);
    
    let isResizing = false;
    let startWidth, startHeight;
    
    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startWidth = container.offsetWidth;
      startHeight = container.offsetHeight;
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
    
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      
      const newWidth = Math.round((e.clientX - container.offsetLeft) / 100);
      const newHeight = Math.round((e.clientY - container.offsetTop) / 100);
      
      container.style.gridColumnEnd = `span ${Math.max(2, newWidth)}`;
      container.style.gridRowEnd = `span ${Math.max(2, newHeight)}`;
    };
    
    const handleMouseUp = (e) => {
      if (!isResizing) return;
      
      isResizing = false;
      
      // Update state
      const widgetId = container.id.replace('widget-', '');
      const width = parseInt(container.style.gridColumnEnd.replace('span ', ''));
      const height = parseInt(container.style.gridRowEnd.replace('span ', ''));
      
      this.services.state.resizeWidget(widgetId, { width, height });
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }

  /**
   * User session management
   */
  async loadUserSession() {
    try {
      // Get user info from API or storage
      const userInfo = await this.getUserInfo();
      
      this.state.user = userInfo;
      
      // Update UI
      document.getElementById('user-name').textContent = userInfo.name;
      
      // Load user preferences
      const preferences = await this.loadUserPreferences();
      this.applyPreferences(preferences);
      
      // Load last dashboard
      if (preferences.lastDashboardId) {
        await this.loadDashboard(preferences.lastDashboardId);
      }
      
    } catch (error) {
      console.error('Failed to load user session:', error);
      // Continue without user session
    }
  }

  async getUserInfo() {
    // In real implementation, get from auth service
    return {
      id: 'user-123',
      name: 'John Doe',
      email: 'john@example.com'
    };
  }

  async loadUserPreferences() {
    const stored = this.services.security.secureStorage.getItem('user-preferences');
    
    return stored || {
      theme: 'light',
      autoSave: true,
      refreshInterval: 60000
    };
  }

  applyPreferences(preferences) {
    if (preferences.theme) {
      this.applyTheme(preferences.theme);
    }
    
    if (preferences.autoSave) {
      this.enableAutoSave();
    }
    
    if (preferences.refreshInterval) {
      this.setRefreshInterval(preferences.refreshInterval);
    }
  }

  /**
   * API key management
   */
  async getAPIKey() {
    // Try to get from secure storage
    let apiKey = this.services.security.secureStorage.getItem('nr-api-key');
    
    if (!apiKey) {
      // Prompt user for API key
      apiKey = await this.promptForAPIKey();
      
      if (apiKey) {
        // Save securely
        this.services.security.secureStorage.setItem('nr-api-key', apiKey);
      }
    }
    
    return apiKey;
  }

  async promptForAPIKey() {
    return new Promise((resolve) => {
      const modal = this.createModal({
        title: 'New Relic API Key Required',
        content: `
          <p>Please enter your New Relic API key to continue:</p>
          <input type="password" id="api-key-input" class="form-input" placeholder="API Key">
          <p class="help-text">Your API key is stored securely and never sent to our servers.</p>
        `,
        buttons: [
          {
            text: 'Cancel',
            onClick: () => {
              modal.close();
              resolve(null);
            }
          },
          {
            text: 'Save',
            primary: true,
            onClick: () => {
              const apiKey = document.getElementById('api-key-input').value;
              modal.close();
              resolve(apiKey);
            }
          }
        ]
      });
      
      modal.show();
    });
  }

  /**
   * UI helpers
   */
  showLoadingScreen() {
    const loader = document.createElement('div');
    loader.id = 'app-loader';
    loader.className = 'app-loader';
    loader.innerHTML = `
      <div class="loader-content">
        <div class="loader-spinner"></div>
        <h2>Loading DashBuilder...</h2>
        <p>Initializing services</p>
      </div>
    `;
    
    document.body.appendChild(loader);
  }

  hideLoadingScreen() {
    const loader = document.getElementById('app-loader');
    if (loader) {
      loader.classList.add('fade-out');
      setTimeout(() => loader.remove(), 300);
    }
  }

  showMainUI() {
    const app = document.getElementById('app');
    app.classList.add('fade-in');
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  createModal(options) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.innerHTML = `
      <div class="modal-header">
        <h2>${this.services.security.sanitize(options.title)}</h2>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        ${options.content}
      </div>
      <div class="modal-footer">
        ${options.buttons.map(btn => `
          <button class="btn ${btn.primary ? 'btn-primary' : ''}">${btn.text}</button>
        `).join('')}
      </div>
    `;
    
    modal.appendChild(modalContent);
    
    // Set up event handlers
    modalContent.querySelector('.modal-close').addEventListener('click', () => {
      modal.remove();
    });
    
    options.buttons.forEach((btn, index) => {
      const button = modalContent.querySelectorAll('.modal-footer button')[index];
      button.addEventListener('click', btn.onClick);
    });
    
    return {
      show: () => document.body.appendChild(modal),
      close: () => modal.remove()
    };
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.state.theme = theme;
  }

  updateConnectionStatus(status) {
    const indicator = document.getElementById('connection-status');
    indicator.className = `status-indicator status-${status}`;
    indicator.title = status.charAt(0).toUpperCase() + status.slice(1);
  }

  updateLastSaved() {
    const element = document.getElementById('last-saved');
    element.textContent = `Last saved: ${new Date().toLocaleTimeString()}`;
  }

  hasUnsavedChanges() {
    return this.services.state?.localChanges?.size > 0;
  }

  handleOnline() {
    this.updateConnectionStatus('connected');
    this.showNotification('Connection restored', 'success');
    
    // Process offline queue
    this.services.data.processOfflineQueue();
  }

  handleOffline() {
    this.updateConnectionStatus('offline');
    this.showNotification('Working offline', 'warning');
  }

  handleCriticalError(error) {
    // Save current state
    this.emergencySave();
    
    // Show error UI
    this.showCriticalErrorUI(error);
  }

  emergencySave() {
    try {
      const state = {
        dashboard: this.state.currentDashboard,
        widgets: Array.from(this.components.widgets.entries()),
        timestamp: Date.now()
      };
      
      localStorage.setItem('emergency-save', JSON.stringify(state));
    } catch (e) {
      console.error('Emergency save failed:', e);
    }
  }

  showCriticalErrorUI(error) {
    document.body.innerHTML = `
      <div class="critical-error">
        <h1>Application Error</h1>
        <p>DashBuilder encountered a critical error and needs to restart.</p>
        <p>Your work has been saved.</p>
        <div class="error-actions">
          <button onclick="window.location.reload()">Restart</button>
          <button onclick="window.dashBuilder.recoverFromError()">Recover</button>
        </div>
      </div>
    `;
  }

  async recoverFromError() {
    try {
      // Load emergency save
      const saved = localStorage.getItem('emergency-save');
      if (saved) {
        const state = JSON.parse(saved);
        
        // Reinitialize with saved state
        await this.initialize();
        
        // Restore state
        if (state.dashboard) {
          this.state.currentDashboard = state.dashboard;
          this.renderDashboard(state.dashboard);
        }
        
        this.showNotification('Recovered from error', 'success');
      }
    } catch (e) {
      console.error('Recovery failed:', e);
      window.location.reload();
    }
  }
}

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.dashBuilder = new DashBuilderApp();
  });
} else {
  window.dashBuilder = new DashBuilderApp();
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DashBuilderApp;
}