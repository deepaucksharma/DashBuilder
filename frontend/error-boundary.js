/**
 * Comprehensive Error Boundary System
 * Handles all errors gracefully with recovery, logging, and user feedback
 */

class ErrorBoundarySystem {
  constructor(config = {}) {
    this.config = {
      maxErrorsPerMinute: config.maxErrorsPerMinute || 10,
      enableAutoRecovery: config.enableAutoRecovery !== false,
      enableErrorReporting: config.enableErrorReporting !== false,
      enableOfflineQueue: config.enableOfflineQueue !== false,
      recoveryStrategies: config.recoveryStrategies || ['reload', 'reset', 'fallback'],
      errorEndpoint: config.errorEndpoint || '/api/errors',
      ...config
    };
    
    // Error tracking
    this.errorLog = [];
    this.errorCounts = new Map();
    this.recoveryAttempts = new Map();
    this.criticalErrors = new Set();
    
    // Recovery state
    this.recoveryInProgress = false;
    this.lastRecoveryTime = 0;
    
    // Offline queue
    this.offlineQueue = [];
    
    // Install global handlers
    this.installGlobalHandlers();
    
    // Component error boundaries
    this.componentBoundaries = new Map();
    
    // Error patterns for smart recovery
    this.errorPatterns = new Map([
      [/NetworkError|Failed to fetch/i, 'network'],
      [/ChunkLoadError|Loading chunk/i, 'chunk'],
      [/SyntaxError|Unexpected token/i, 'syntax'],
      [/TypeError.*null|undefined/i, 'null-reference'],
      [/QuotaExceededError/i, 'storage'],
      [/SecurityError/i, 'security']
    ]);
    
    // Recovery strategies
    this.strategies = {
      network: new NetworkRecoveryStrategy(),
      chunk: new ChunkRecoveryStrategy(),
      syntax: new SyntaxRecoveryStrategy(),
      'null-reference': new NullReferenceRecoveryStrategy(),
      storage: new StorageRecoveryStrategy(),
      security: new SecurityRecoveryStrategy()
    };
  }

  /**
   * Install global error handlers
   */
  installGlobalHandlers() {
    // Window error handler
    window.addEventListener('error', (event) => {
      this.handleError(event.error || new Error(event.message), {
        source: 'window',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
      
      // Prevent default error handling
      event.preventDefault();
    });
    
    // Unhandled promise rejection
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(new Error(event.reason), {
        source: 'promise',
        promise: event.promise
      });
      
      // Prevent default rejection handling
      event.preventDefault();
    });
    
    // Resource loading errors
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        this.handleResourceError(event);
      }
    }, true);
  }

  /**
   * Main error handler
   */
  async handleError(error, context = {}) {
    try {
      // Create error entry
      const errorEntry = {
        id: this.generateErrorId(),
        error: this.serializeError(error),
        context,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        sessionId: this.getSessionId()
      };
      
      // Log error
      this.logError(errorEntry);
      
      // Check if we're in an error loop
      if (this.isErrorLoop()) {
        console.error('Error loop detected, entering safe mode');
        return this.enterSafeMode();
      }
      
      // Categorize error
      const errorType = this.categorizeError(error);
      errorEntry.type = errorType;
      
      // Check if critical
      if (this.isCriticalError(error, errorType)) {
        this.criticalErrors.add(errorEntry.id);
        return this.handleCriticalError(errorEntry);
      }
      
      // Attempt recovery
      if (this.config.enableAutoRecovery && !this.recoveryInProgress) {
        const recovered = await this.attemptRecovery(errorEntry);
        if (recovered) {
          return;
        }
      }
      
      // Show user feedback
      this.showErrorFeedback(errorEntry);
      
      // Report error
      if (this.config.enableErrorReporting) {
        await this.reportError(errorEntry);
      }
      
    } catch (handlerError) {
      // Error in error handler - last resort
      console.error('Fatal error in error handler:', handlerError);
      this.lastResortRecovery();
    }
  }

  /**
   * Handle resource loading errors
   */
  handleResourceError(event) {
    const resource = event.target;
    const errorEntry = {
      id: this.generateErrorId(),
      type: 'resource',
      resource: {
        type: resource.tagName,
        src: resource.src || resource.href,
        id: resource.id,
        className: resource.className
      },
      timestamp: Date.now()
    };
    
    this.logError(errorEntry);
    
    // Attempt to reload resource
    if (this.shouldRetryResource(resource)) {
      this.retryResourceLoad(resource);
    }
  }

  /**
   * Categorize error type
   */
  categorizeError(error) {
    const errorString = error.toString() + ' ' + error.stack;
    
    for (const [pattern, type] of this.errorPatterns) {
      if (pattern.test(errorString)) {
        return type;
      }
    }
    
    // Check error constructor
    if (error.name) {
      const typeMap = {
        'TypeError': 'type',
        'ReferenceError': 'reference',
        'SyntaxError': 'syntax',
        'RangeError': 'range',
        'NetworkError': 'network',
        'SecurityError': 'security'
      };
      
      if (typeMap[error.name]) {
        return typeMap[error.name];
      }
    }
    
    return 'unknown';
  }

  /**
   * Check if error is critical
   */
  isCriticalError(error, type) {
    // Critical error patterns
    const criticalPatterns = [
      /Cannot read prop.* of undefined/i,
      /Maximum call stack/i,
      /out of memory/i,
      /SecurityError/i
    ];
    
    const errorString = error.toString() + ' ' + error.stack;
    
    return criticalPatterns.some(pattern => pattern.test(errorString)) ||
           this.errorCounts.get(type) > 5;
  }

  /**
   * Attempt error recovery
   */
  async attemptRecovery(errorEntry) {
    this.recoveryInProgress = true;
    
    try {
      // Get recovery strategy
      const strategy = this.strategies[errorEntry.type];
      if (!strategy) {
        return false;
      }
      
      // Track recovery attempt
      const attempts = this.recoveryAttempts.get(errorEntry.type) || 0;
      this.recoveryAttempts.set(errorEntry.type, attempts + 1);
      
      // Try recovery
      const recovered = await strategy.recover(errorEntry, {
        attempt: attempts + 1,
        maxAttempts: 3
      });
      
      if (recovered) {
        this.lastRecoveryTime = Date.now();
        this.showRecoverySuccess(errorEntry);
      }
      
      return recovered;
      
    } finally {
      this.recoveryInProgress = false;
    }
  }

  /**
   * Handle critical errors
   */
  async handleCriticalError(errorEntry) {
    // Show critical error UI
    this.showCriticalErrorUI(errorEntry);
    
    // Save state for recovery
    await this.saveRecoveryState();
    
    // Offer recovery options
    const recovery = await this.promptRecoveryOptions(errorEntry);
    
    switch (recovery) {
      case 'reload':
        window.location.reload();
        break;
        
      case 'reset':
        await this.resetApplication();
        break;
        
      case 'safe-mode':
        await this.enterSafeMode();
        break;
        
      default:
        // Stay on error page
        break;
    }
  }

  /**
   * Error loop detection
   */
  isErrorLoop() {
    const recentErrors = this.errorLog.filter(
      e => Date.now() - e.timestamp < 60000 // Last minute
    );
    
    return recentErrors.length > this.config.maxErrorsPerMinute;
  }

  /**
   * Enter safe mode
   */
  async enterSafeMode() {
    try {
      // Disable all non-essential features
      this.disableFeatures([
        'animations',
        'realtime-updates',
        'auto-refresh',
        'background-sync'
      ]);
      
      // Clear problematic state
      this.clearProblematicState();
      
      // Load minimal UI
      await this.loadSafeModeUI();
      
      // Show safe mode message
      this.showSafeModeMessage();
      
    } catch (error) {
      // Even safe mode failed
      this.lastResortRecovery();
    }
  }

  /**
   * Component Error Boundary
   */
  createComponentBoundary(componentId, options = {}) {
    const boundary = new ComponentErrorBoundary({
      componentId,
      onError: (error, errorInfo) => {
        this.handleComponentError(componentId, error, errorInfo);
      },
      fallbackComponent: options.fallback,
      enableReset: options.enableReset !== false,
      maxRetries: options.maxRetries || 3
    });
    
    this.componentBoundaries.set(componentId, boundary);
    
    return boundary;
  }

  handleComponentError(componentId, error, errorInfo) {
    const errorEntry = {
      id: this.generateErrorId(),
      type: 'component',
      componentId,
      error: this.serializeError(error),
      errorInfo,
      timestamp: Date.now()
    };
    
    this.logError(errorEntry);
    
    // Try component-specific recovery
    const boundary = this.componentBoundaries.get(componentId);
    if (boundary && boundary.canRecover()) {
      boundary.reset();
    }
  }

  /**
   * Error reporting
   */
  async reportError(errorEntry) {
    try {
      // Check if online
      if (!navigator.onLine) {
        if (this.config.enableOfflineQueue) {
          this.queueErrorForLater(errorEntry);
        }
        return;
      }
      
      // Send error report
      const response = await fetch(this.config.errorEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...errorEntry,
          environment: this.getEnvironment(),
          release: this.getAppVersion()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to report error: ${response.statusText}`);
      }
      
      // Process offline queue
      if (this.offlineQueue.length > 0) {
        await this.processOfflineQueue();
      }
      
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
      
      if (this.config.enableOfflineQueue) {
        this.queueErrorForLater(errorEntry);
      }
    }
  }

  queueErrorForLater(errorEntry) {
    this.offlineQueue.push(errorEntry);
    
    // Limit queue size
    if (this.offlineQueue.length > 100) {
      this.offlineQueue.shift();
    }
    
    // Save to localStorage
    try {
      localStorage.setItem('error-queue', JSON.stringify(this.offlineQueue));
    } catch (e) {
      // Storage full or unavailable
    }
  }

  async processOfflineQueue() {
    const errors = [...this.offlineQueue];
    this.offlineQueue = [];
    
    for (const error of errors) {
      try {
        await this.reportError(error);
      } catch (e) {
        // Re-queue failed errors
        this.offlineQueue.push(error);
      }
    }
  }

  /**
   * User feedback
   */
  showErrorFeedback(errorEntry) {
    const feedback = this.createErrorFeedback(errorEntry);
    document.body.appendChild(feedback);
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      feedback.remove();
    }, 10000);
  }

  createErrorFeedback(errorEntry) {
    const container = document.createElement('div');
    container.className = 'error-feedback';
    container.innerHTML = `
      <div class="error-feedback-content">
        <div class="error-icon">⚠️</div>
        <div class="error-message">
          <h4>Oops! Something went wrong</h4>
          <p>${this.getUserFriendlyMessage(errorEntry)}</p>
        </div>
        <div class="error-actions">
          <button onclick="window.errorBoundary.dismissError('${errorEntry.id}')">
            Dismiss
          </button>
          <button onclick="window.errorBoundary.reportIssue('${errorEntry.id}')">
            Report Issue
          </button>
        </div>
      </div>
    `;
    
    return container;
  }

  getUserFriendlyMessage(errorEntry) {
    const messages = {
      network: 'Network connection issue. Please check your internet connection.',
      chunk: 'Failed to load application resources. Please refresh the page.',
      syntax: 'Application code error. Our team has been notified.',
      'null-reference': 'Unexpected error occurred. Please try again.',
      storage: 'Storage quota exceeded. Please clear some space.',
      security: 'Security error. Please check your permissions.',
      unknown: 'An unexpected error occurred. Please try again later.'
    };
    
    return messages[errorEntry.type] || messages.unknown;
  }

  showCriticalErrorUI(errorEntry) {
    const errorUI = document.createElement('div');
    errorUI.className = 'critical-error-ui';
    errorUI.innerHTML = `
      <div class="critical-error-content">
        <h1>Critical Error</h1>
        <p>The application encountered a critical error and cannot continue.</p>
        <div class="error-details">
          <code>${errorEntry.error.message}</code>
        </div>
        <div class="recovery-options">
          <button onclick="window.location.reload()">Reload Page</button>
          <button onclick="window.errorBoundary.resetApplication()">Reset Application</button>
          <button onclick="window.errorBoundary.enterSafeMode()">Safe Mode</button>
        </div>
        <div class="error-id">Error ID: ${errorEntry.id}</div>
      </div>
    `;
    
    document.body.innerHTML = '';
    document.body.appendChild(errorUI);
  }

  /**
   * Recovery strategies
   */
  async saveRecoveryState() {
    try {
      const state = {
        dashboards: this.getDashboardState(),
        preferences: this.getUserPreferences(),
        session: this.getSessionData(),
        timestamp: Date.now()
      };
      
      localStorage.setItem('recovery-state', JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save recovery state:', e);
    }
  }

  async resetApplication() {
    try {
      // Clear all state
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      // Reload
      window.location.href = '/';
    } catch (e) {
      console.error('Failed to reset application:', e);
      window.location.href = '/';
    }
  }

  /**
   * Resource retry logic
   */
  shouldRetryResource(resource) {
    const retryableTypes = ['SCRIPT', 'LINK', 'IMG'];
    return retryableTypes.includes(resource.tagName) && 
           !resource.dataset.retryCount || 
           parseInt(resource.dataset.retryCount) < 3;
  }

  retryResourceLoad(resource) {
    const retryCount = parseInt(resource.dataset.retryCount || '0') + 1;
    resource.dataset.retryCount = retryCount;
    
    setTimeout(() => {
      if (resource.tagName === 'SCRIPT') {
        const newScript = document.createElement('script');
        newScript.src = resource.src + '?retry=' + retryCount;
        newScript.async = resource.async;
        resource.parentNode.replaceChild(newScript, resource);
      } else if (resource.tagName === 'LINK') {
        resource.href = resource.href.split('?')[0] + '?retry=' + retryCount;
      } else if (resource.tagName === 'IMG') {
        resource.src = resource.src.split('?')[0] + '?retry=' + retryCount;
      }
    }, 1000 * retryCount); // Exponential backoff
  }

  /**
   * Utility methods
   */
  serializeError(error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...error // Include any custom properties
    };
  }

  generateErrorId() {
    return `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getSessionId() {
    let sessionId = sessionStorage.getItem('session-id');
    if (!sessionId) {
      sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('session-id', sessionId);
    }
    return sessionId;
  }

  getEnvironment() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      colorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  getAppVersion() {
    return window.APP_VERSION || 'unknown';
  }

  logError(errorEntry) {
    this.errorLog.push(errorEntry);
    
    // Update error counts
    const count = this.errorCounts.get(errorEntry.type) || 0;
    this.errorCounts.set(errorEntry.type, count + 1);
    
    // Limit log size
    if (this.errorLog.length > 1000) {
      this.errorLog.shift();
    }
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error captured:', errorEntry);
    }
  }

  /**
   * Public API
   */
  dismissError(errorId) {
    const feedback = document.querySelector(`[data-error-id="${errorId}"]`);
    if (feedback) {
      feedback.remove();
    }
  }

  reportIssue(errorId) {
    const error = this.errorLog.find(e => e.id === errorId);
    if (error) {
      // Open issue reporter with pre-filled data
      window.open(`/report-issue?errorId=${errorId}`, '_blank');
    }
  }

  getErrorStats() {
    return {
      total: this.errorLog.length,
      byType: Object.fromEntries(this.errorCounts),
      critical: this.criticalErrors.size,
      recoveryAttempts: Object.fromEntries(this.recoveryAttempts),
      lastRecovery: this.lastRecoveryTime
    };
  }

  clearErrors() {
    this.errorLog = [];
    this.errorCounts.clear();
    this.recoveryAttempts.clear();
    this.criticalErrors.clear();
  }

  /**
   * Last resort recovery
   */
  lastResortRecovery() {
    // Show static error page
    document.body.innerHTML = `
      <div style="text-align: center; padding: 50px; font-family: sans-serif;">
        <h1>Application Error</h1>
        <p>We're sorry, but the application has encountered a fatal error.</p>
        <p>Please refresh the page to try again.</p>
        <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px;">
          Refresh Page
        </button>
      </div>
    `;
  }
}

/**
 * Component Error Boundary
 */
class ComponentErrorBoundary {
  constructor(config) {
    this.config = config;
    this.hasError = false;
    this.error = null;
    this.errorInfo = null;
    this.retryCount = 0;
  }

  catch(error, errorInfo) {
    this.hasError = true;
    this.error = error;
    this.errorInfo = errorInfo;
    
    if (this.config.onError) {
      this.config.onError(error, errorInfo);
    }
  }

  canRecover() {
    return this.config.enableReset && 
           this.retryCount < this.config.maxRetries;
  }

  reset() {
    this.hasError = false;
    this.error = null;
    this.errorInfo = null;
    this.retryCount++;
    
    // Re-render component
    if (this.config.onReset) {
      this.config.onReset();
    }
  }

  render() {
    if (this.hasError) {
      return this.config.fallbackComponent || this.getDefaultFallback();
    }
    
    return null;
  }

  getDefaultFallback() {
    return {
      template: `
        <div class="error-boundary-fallback">
          <h3>Component Error</h3>
          <p>This component encountered an error and cannot be displayed.</p>
          ${this.canRecover() ? '<button onclick="this.reset()">Try Again</button>' : ''}
        </div>
      `
    };
  }
}

/**
 * Recovery Strategies
 */
class NetworkRecoveryStrategy {
  async recover(errorEntry, options) {
    // Wait for network to be available
    if (!navigator.onLine) {
      return new Promise(resolve => {
        const handleOnline = () => {
          window.removeEventListener('online', handleOnline);
          resolve(true);
        };
        window.addEventListener('online', handleOnline);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          window.removeEventListener('online', handleOnline);
          resolve(false);
        }, 30000);
      });
    }
    
    return true;
  }
}

class ChunkRecoveryStrategy {
  async recover(errorEntry, options) {
    // Clear module cache
    if ('webpackChunkName' in window) {
      delete window.webpackChunkName;
    }
    
    // Reload failed chunk
    if (errorEntry.context.chunkName) {
      try {
        await import(/* webpackIgnore: true */ errorEntry.context.chunkName);
        return true;
      } catch (e) {
        return false;
      }
    }
    
    return false;
  }
}

class SyntaxRecoveryStrategy {
  async recover(errorEntry, options) {
    // Can't recover from syntax errors
    return false;
  }
}

class NullReferenceRecoveryStrategy {
  async recover(errorEntry, options) {
    // Try to identify and fix null reference
    if (errorEntry.context.componentId) {
      // Reset component state
      const boundary = window.errorBoundary.componentBoundaries.get(errorEntry.context.componentId);
      if (boundary && boundary.canRecover()) {
        boundary.reset();
        return true;
      }
    }
    
    return false;
  }
}

class StorageRecoveryStrategy {
  async recover(errorEntry, options) {
    try {
      // Clear old data
      const now = Date.now();
      const keys = Object.keys(localStorage);
      
      for (const key of keys) {
        try {
          const data = localStorage.getItem(key);
          const parsed = JSON.parse(data);
          
          // Remove old data (older than 7 days)
          if (parsed.timestamp && now - parsed.timestamp > 7 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem(key);
          }
        } catch (e) {
          // Remove non-JSON data
          localStorage.removeItem(key);
        }
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }
}

class SecurityRecoveryStrategy {
  async recover(errorEntry, options) {
    // Redirect to secure context
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
      window.location.protocol = 'https:';
      return true;
    }
    
    return false;
  }
}

// Install global error boundary
window.errorBoundary = new ErrorBoundarySystem();

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ErrorBoundarySystem,
    ComponentErrorBoundary,
    NetworkRecoveryStrategy,
    ChunkRecoveryStrategy,
    SyntaxRecoveryStrategy,
    NullReferenceRecoveryStrategy,
    StorageRecoveryStrategy,
    SecurityRecoveryStrategy
  };
}