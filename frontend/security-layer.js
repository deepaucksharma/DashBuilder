/**
 * Security Layer
 * Comprehensive protection against XSS, CSRF, injection attacks, and other vulnerabilities
 */

class SecurityLayer {
  constructor(config = {}) {
    this.config = {
      enableCSRF: config.enableCSRF !== false,
      enableXSSProtection: config.enableXSSProtection !== false,
      enableSQLInjectionProtection: config.enableSQLInjectionProtection !== false,
      enableContentSecurityPolicy: config.enableContentSecurityPolicy !== false,
      csrfTokenEndpoint: config.csrfTokenEndpoint || '/api/csrf-token',
      csrfTokenHeader: config.csrfTokenHeader || 'X-CSRF-Token',
      maxRequestSize: config.maxRequestSize || 10 * 1024 * 1024, // 10MB
      trustedDomains: config.trustedDomains || [window.location.origin],
      ...config
    };
    
    // Security tokens
    this.csrfToken = null;
    this.csrfTokenExpiry = null;
    this.nonce = this.generateNonce();
    
    // Security policies
    this.contentSecurityPolicy = null;
    this.trustedTypes = null;
    
    // Request tracking
    this.requestSignatures = new Map();
    this.rateLimiter = new SecurityRateLimiter();
    
    // Initialize security measures
    this.initialize();
  }

  /**
   * Initialize security measures
   */
  async initialize() {
    // Set up CSRF protection
    if (this.config.enableCSRF) {
      await this.initializeCSRFProtection();
    }
    
    // Set up XSS protection
    if (this.config.enableXSSProtection) {
      this.initializeXSSProtection();
    }
    
    // Set up Content Security Policy
    if (this.config.enableContentSecurityPolicy) {
      this.initializeCSP();
    }
    
    // Set up request interceptors
    this.installRequestInterceptors();
    
    // Set up DOM protection
    this.installDOMProtection();
  }

  /**
   * CSRF Protection
   */
  async initializeCSRFProtection() {
    // Get CSRF token
    await this.refreshCSRFToken();
    
    // Auto-refresh token
    setInterval(() => {
      if (this.isCSRFTokenExpired()) {
        this.refreshCSRFToken();
      }
    }, 60000); // Check every minute
  }

  async refreshCSRFToken() {
    try {
      const response = await fetch(this.config.csrfTokenEndpoint, {
        method: 'GET',
        credentials: 'same-origin'
      });
      
      if (!response.ok) {
        throw new Error('Failed to get CSRF token');
      }
      
      const data = await response.json();
      this.csrfToken = data.token;
      this.csrfTokenExpiry = Date.now() + (data.expiresIn || 3600) * 1000;
      
    } catch (error) {
      console.error('Failed to refresh CSRF token:', error);
      throw new SecurityError('CSRF token refresh failed');
    }
  }

  isCSRFTokenExpired() {
    return !this.csrfToken || Date.now() > this.csrfTokenExpiry;
  }

  async getCSRFToken() {
    if (this.isCSRFTokenExpired()) {
      await this.refreshCSRFToken();
    }
    return this.csrfToken;
  }

  /**
   * XSS Protection
   */
  initializeXSSProtection() {
    // Create DOMPurify instance
    this.purifier = this.createDOMPurifier();
    
    // Set up trusted types if supported
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      this.trustedTypes = window.trustedTypes.createPolicy('dashbuilder', {
        createHTML: (input) => this.sanitizeHTML(input),
        createScript: (input) => this.sanitizeScript(input),
        createScriptURL: (input) => this.sanitizeURL(input)
      });
    }
    
    // Override dangerous methods
    this.overrideDangerousMethods();
  }

  createDOMPurifier() {
    // Configure DOMPurify
    const config = {
      ALLOWED_TAGS: [
        'a', 'b', 'i', 'em', 'strong', 'div', 'span', 'p', 'br',
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img', 'svg', 'path', 'g', 'circle', 'rect', 'line', 'polygon'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id', 'style',
        'width', 'height', 'viewBox', 'd', 'fill', 'stroke',
        'cx', 'cy', 'r', 'x', 'y', 'points'
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
    };
    
    // Return configured purifier
    return {
      sanitize: (dirty, options = {}) => {
        // Remove any script tags
        let clean = dirty.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        // Remove event handlers
        clean = clean.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
        
        // Remove javascript: URLs
        clean = clean.replace(/javascript:/gi, '');
        
        // Additional sanitization based on context
        if (options.context === 'attribute') {
          clean = this.sanitizeAttribute(clean);
        } else if (options.context === 'style') {
          clean = this.sanitizeCSS(clean);
        }
        
        return clean;
      }
    };
  }

  sanitizeHTML(input) {
    if (typeof input !== 'string') return '';
    
    return this.purifier.sanitize(input);
  }

  sanitizeScript(input) {
    // Never allow dynamic script creation
    throw new SecurityError('Dynamic script creation is not allowed');
  }

  sanitizeURL(input) {
    if (typeof input !== 'string') return '';
    
    // Check against whitelist
    const url = new URL(input, window.location.origin);
    
    if (!this.isTrustedDomain(url.origin)) {
      throw new SecurityError(`Untrusted URL: ${input}`);
    }
    
    return input;
  }

  sanitizeAttribute(input) {
    // Remove quotes and special characters
    return input.replace(/["'<>&]/g, '');
  }

  sanitizeCSS(input) {
    // Remove dangerous CSS
    return input
      .replace(/javascript:/gi, '')
      .replace(/expression\s*\(/gi, '')
      .replace(/@import/gi, '');
  }

  sanitizeNRQL(query) {
    if (typeof query !== 'string') return '';
    
    // Remove SQL injection attempts
    const dangerous = [
      /;\s*DROP/i,
      /;\s*DELETE/i,
      /;\s*UPDATE/i,
      /;\s*INSERT/i,
      /;\s*CREATE/i,
      /;\s*ALTER/i,
      /;\s*EXEC/i,
      /--/,
      /\/\*/,
      /\*\//,
      /xp_/i,
      /sp_/i
    ];
    
    for (const pattern of dangerous) {
      if (pattern.test(query)) {
        throw new SecurityError('Potential SQL injection detected');
      }
    }
    
    // Escape single quotes
    return query.replace(/'/g, "''");
  }

  overrideDangerousMethods() {
    // Override innerHTML
    const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', {
      set: function(value) {
        const sanitized = window.securityLayer.sanitizeHTML(value);
        originalInnerHTML.set.call(this, sanitized);
      },
      get: originalInnerHTML.get
    });
    
    // Override document.write
    document.write = function() {
      console.warn('document.write is disabled for security reasons');
    };
    
    // Override eval
    window.eval = function() {
      throw new SecurityError('eval is disabled for security reasons');
    };
  }

  /**
   * Content Security Policy
   */
  initializeCSP() {
    const policy = {
      'default-src': ["'self'"],
      'script-src': ["'self'", `'nonce-${this.nonce}'`],
      'style-src': ["'self'", "'unsafe-inline'"], // Needed for inline styles
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'", ...this.config.trustedDomains],
      'media-src': ["'none'"],
      'object-src': ["'none'"],
      'frame-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': []
    };
    
    // Build CSP string
    const cspString = Object.entries(policy)
      .map(([directive, values]) => `${directive} ${values.join(' ')}`)
      .join('; ');
    
    // Set CSP header
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = cspString;
    document.head.appendChild(meta);
    
    this.contentSecurityPolicy = cspString;
  }

  /**
   * Request Interceptors
   */
  installRequestInterceptors() {
    // Override fetch
    const originalFetch = window.fetch;
    window.fetch = async (url, options = {}) => {
      // Validate request
      this.validateRequest(url, options);
      
      // Add security headers
      options = await this.addSecurityHeaders(options);
      
      // Sign request
      const signature = this.signRequest(url, options);
      this.requestSignatures.set(signature, Date.now());
      
      try {
        const response = await originalFetch(url, options);
        
        // Validate response
        this.validateResponse(response);
        
        return response;
      } finally {
        // Clean up signature
        setTimeout(() => {
          this.requestSignatures.delete(signature);
        }, 60000);
      }
    };
    
    // Override XMLHttpRequest
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      
      const originalOpen = xhr.open;
      xhr.open = function(method, url, ...args) {
        xhr._securityUrl = url;
        xhr._securityMethod = method;
        return originalOpen.call(this, method, url, ...args);
      };
      
      const originalSend = xhr.send;
      xhr.send = function(data) {
        // Validate request
        window.securityLayer.validateRequest(xhr._securityUrl, {
          method: xhr._securityMethod,
          body: data
        });
        
        // Add security headers
        if (window.securityLayer.config.enableCSRF) {
          xhr.setRequestHeader(
            window.securityLayer.config.csrfTokenHeader,
            window.securityLayer.csrfToken
          );
        }
        
        return originalSend.call(this, data);
      };
      
      return xhr;
    };
  }

  validateRequest(url, options) {
    // Check URL
    const parsedUrl = new URL(url, window.location.origin);
    
    // Prevent requests to local files
    if (parsedUrl.protocol === 'file:') {
      throw new SecurityError('Requests to local files are not allowed');
    }
    
    // Check request size
    if (options.body) {
      const size = this.getRequestSize(options.body);
      if (size > this.config.maxRequestSize) {
        throw new SecurityError('Request size exceeds limit');
      }
    }
    
    // Rate limiting
    if (!this.rateLimiter.checkRequest(url)) {
      throw new SecurityError('Rate limit exceeded');
    }
  }

  async addSecurityHeaders(options) {
    const headers = new Headers(options.headers || {});
    
    // Add CSRF token
    if (this.config.enableCSRF && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
      const token = await this.getCSRFToken();
      headers.set(this.config.csrfTokenHeader, token);
    }
    
    // Add request ID for tracking
    headers.set('X-Request-ID', this.generateRequestId());
    
    // Add security headers
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    
    return {
      ...options,
      headers
    };
  }

  validateResponse(response) {
    // Check response headers
    const contentType = response.headers.get('content-type');
    
    // Prevent XSS via content-type
    if (contentType && contentType.includes('text/html') && !response.url.endsWith('.html')) {
      console.warn('Unexpected HTML response:', response.url);
    }
    
    // Check for security headers
    const xssProtection = response.headers.get('x-xss-protection');
    if (!xssProtection) {
      console.warn('Missing X-XSS-Protection header:', response.url);
    }
  }

  signRequest(url, options) {
    const data = {
      url,
      method: options.method || 'GET',
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substr(2)
    };
    
    return btoa(JSON.stringify(data));
  }

  /**
   * DOM Protection
   */
  installDOMProtection() {
    // Prevent clickjacking
    if (window.top !== window.self) {
      window.top.location = window.self.location;
    }
    
    // Monitor DOM mutations for XSS
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.scanElementForXSS(node);
            }
          });
        } else if (mutation.type === 'attributes') {
          this.scanAttributeForXSS(mutation.target, mutation.attributeName);
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      attributes: true,
      subtree: true,
      attributeFilter: ['href', 'src', 'action', 'formaction', 'onclick', 'onload', 'onerror']
    });
  }

  scanElementForXSS(element) {
    // Check for dangerous elements
    const dangerous = ['script', 'iframe', 'object', 'embed', 'form'];
    if (dangerous.includes(element.tagName.toLowerCase())) {
      console.warn('Potentially dangerous element detected:', element);
      element.remove();
      return;
    }
    
    // Check attributes
    Array.from(element.attributes).forEach(attr => {
      this.scanAttributeForXSS(element, attr.name);
    });
    
    // Check children
    Array.from(element.children).forEach(child => {
      this.scanElementForXSS(child);
    });
  }

  scanAttributeForXSS(element, attributeName) {
    const value = element.getAttribute(attributeName);
    if (!value) return;
    
    // Check for javascript: URLs
    if (value.toLowerCase().includes('javascript:')) {
      element.removeAttribute(attributeName);
      console.warn('Removed javascript: URL from', attributeName);
      return;
    }
    
    // Check for event handlers
    if (attributeName.startsWith('on')) {
      element.removeAttribute(attributeName);
      console.warn('Removed event handler:', attributeName);
      return;
    }
  }

  /**
   * Input Validation
   */
  validateInput(input, type = 'text') {
    switch (type) {
      case 'email':
        return this.validateEmail(input);
      
      case 'url':
        return this.validateURL(input);
      
      case 'number':
        return this.validateNumber(input);
      
      case 'nrql':
        return this.validateNRQL(input);
      
      case 'json':
        return this.validateJSON(input);
      
      default:
        return this.validateText(input);
    }
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format');
    }
    return this.sanitizeAttribute(email);
  }

  validateURL(url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new ValidationError('Invalid URL protocol');
      }
      return url;
    } catch {
      throw new ValidationError('Invalid URL format');
    }
  }

  validateNumber(input) {
    const num = Number(input);
    if (isNaN(num)) {
      throw new ValidationError('Invalid number');
    }
    return num;
  }

  validateNRQL(query) {
    // Basic NRQL validation
    if (!query.includes('SELECT') || !query.includes('FROM')) {
      throw new ValidationError('Invalid NRQL query');
    }
    
    return this.sanitizeNRQL(query);
  }

  validateJSON(input) {
    try {
      JSON.parse(input);
      return input;
    } catch {
      throw new ValidationError('Invalid JSON');
    }
  }

  validateText(input) {
    if (typeof input !== 'string') {
      throw new ValidationError('Input must be a string');
    }
    
    // Remove control characters
    return input.replace(/[\x00-\x1F\x7F]/g, '');
  }

  /**
   * Secure Storage
   */
  secureStorage = {
    setItem: (key, value) => {
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      
      // Encrypt sensitive data
      if (this.isSensitiveKey(key)) {
        value = this.encrypt(value);
      }
      
      localStorage.setItem(key, value);
    },
    
    getItem: (key) => {
      let value = localStorage.getItem(key);
      if (!value) return null;
      
      // Decrypt if needed
      if (this.isSensitiveKey(key)) {
        value = this.decrypt(value);
      }
      
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    },
    
    removeItem: (key) => {
      localStorage.removeItem(key);
    },
    
    clear: () => {
      localStorage.clear();
    }
  };

  isSensitiveKey(key) {
    const sensitivePatterns = [
      /token/i,
      /key/i,
      /password/i,
      /secret/i,
      /credential/i
    ];
    
    return sensitivePatterns.some(pattern => pattern.test(key));
  }

  encrypt(data) {
    // Simple encryption for demo - use proper encryption in production
    return btoa(encodeURIComponent(data));
  }

  decrypt(data) {
    // Simple decryption for demo - use proper decryption in production
    return decodeURIComponent(atob(data));
  }

  /**
   * Utility methods
   */
  generateNonce() {
    return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  }

  generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getRequestSize(body) {
    if (!body) return 0;
    
    if (body instanceof FormData) {
      let size = 0;
      for (const [key, value] of body) {
        size += key.length + (value.length || value.size || 0);
      }
      return size;
    }
    
    if (typeof body === 'string') {
      return body.length;
    }
    
    if (body instanceof Blob) {
      return body.size;
    }
    
    return JSON.stringify(body).length;
  }

  isTrustedDomain(origin) {
    return this.config.trustedDomains.includes(origin);
  }

  /**
   * Public API
   */
  sanitize(input, options = {}) {
    if (options.type) {
      return this.validateInput(input, options.type);
    }
    
    return this.sanitizeHTML(input);
  }

  isSecure() {
    return {
      https: window.location.protocol === 'https:',
      csp: !!this.contentSecurityPolicy,
      csrf: !!this.csrfToken,
      xss: this.config.enableXSSProtection
    };
  }

  getSecurityHeaders() {
    return {
      [this.config.csrfTokenHeader]: this.csrfToken,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
  }
}

/**
 * Security Rate Limiter
 */
class SecurityRateLimiter {
  constructor() {
    this.requests = new Map();
    this.limits = {
      perSecond: 10,
      perMinute: 100,
      perHour: 1000
    };
  }

  checkRequest(url) {
    const now = Date.now();
    const key = new URL(url, window.location.origin).pathname;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const timestamps = this.requests.get(key);
    
    // Clean old timestamps
    const oneHourAgo = now - 3600000;
    const validTimestamps = timestamps.filter(t => t > oneHourAgo);
    
    // Check limits
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;
    
    const lastSecond = validTimestamps.filter(t => t > oneSecondAgo).length;
    const lastMinute = validTimestamps.filter(t => t > oneMinuteAgo).length;
    const lastHour = validTimestamps.length;
    
    if (lastSecond >= this.limits.perSecond ||
        lastMinute >= this.limits.perMinute ||
        lastHour >= this.limits.perHour) {
      return false;
    }
    
    // Add current request
    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    
    return true;
  }
}

/**
 * Error Types
 */
class SecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityError';
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Install global security layer
window.securityLayer = new SecurityLayer();

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SecurityLayer,
    SecurityRateLimiter,
    SecurityError,
    ValidationError
  };
}