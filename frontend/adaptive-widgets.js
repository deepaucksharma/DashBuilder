/**
 * Adaptive Dashboard Widgets
 * Responsive, intelligent widgets that adapt to context and data
 */

class AdaptiveWidget {
  constructor(config) {
    this.config = config;
    this.renderer = new SmartRenderer();
    this.animator = new WidgetAnimator();
    this.interactionHandler = new InteractionHandler();
    
    // Widget state
    this.state = {
      data: null,
      view: 'default',
      size: null,
      interactions: [],
      preferences: this.loadPreferences()
    };
    
    // Performance optimization
    this.renderCache = new Map();
    this.renderDebouncer = this.debounce(this.render.bind(this), 100);
  }

  /**
   * Main render method - adapts based on context
   */
  render(data, container) {
    // Analyze context
    const context = this.analyzeContext(data, container);
    
    // Check cache
    const cacheKey = this.getCacheKey(context);
    if (this.renderCache.has(cacheKey)) {
      return this.renderCache.get(cacheKey);
    }
    
    // Select optimal rendering strategy
    const strategy = this.selectRenderStrategy(context);
    
    // Render with selected strategy
    const rendered = this.renderer.render(data, strategy, context);
    
    // Apply animations
    this.animator.animate(rendered, context);
    
    // Setup interactions
    this.interactionHandler.setup(rendered, this);
    
    // Cache result
    this.renderCache.set(cacheKey, rendered);
    
    // Update state
    this.state.data = data;
    this.state.size = context.size;
    
    return rendered;
  }

  /**
   * Analyze rendering context
   */
  analyzeContext(data, container) {
    const bounds = container.getBoundingClientRect();
    
    return {
      // Container properties
      size: {
        width: bounds.width,
        height: bounds.height,
        aspect: bounds.width / bounds.height
      },
      
      // Data properties
      dataPoints: data.length,
      dataRange: this.calculateDataRange(data),
      dataType: this.detectDataType(data),
      dataVolume: this.categorizeDataVolume(data.length),
      
      // Device capabilities
      device: {
        type: this.detectDeviceType(),
        pixelRatio: window.devicePixelRatio || 1,
        gpu: this.detectGPUCapabilities(),
        memory: this.estimateAvailableMemory()
      },
      
      // User preferences
      preferences: this.state.preferences,
      
      // Performance metrics
      performance: {
        fps: this.measureFPS(),
        renderBudget: this.calculateRenderBudget()
      }
    };
  }

  /**
   * Select optimal rendering strategy
   */
  selectRenderStrategy(context) {
    const strategies = this.evaluateStrategies(context);
    
    // Sort by score
    strategies.sort((a, b) => b.score - a.score);
    
    return strategies[0];
  }

  /**
   * Evaluate available rendering strategies
   */
  evaluateStrategies(context) {
    const strategies = [];
    
    // Canvas rendering
    if (context.dataVolume === 'large' || context.dataVolume === 'huge') {
      strategies.push({
        type: 'canvas',
        score: this.scoreCanvasStrategy(context),
        config: this.getCanvasConfig(context)
      });
    }
    
    // SVG rendering
    if (context.dataVolume === 'small' || context.dataVolume === 'medium') {
      strategies.push({
        type: 'svg',
        score: this.scoreSVGStrategy(context),
        config: this.getSVGConfig(context)
      });
    }
    
    // WebGL rendering
    if (context.device.gpu.available && context.dataVolume === 'huge') {
      strategies.push({
        type: 'webgl',
        score: this.scoreWebGLStrategy(context),
        config: this.getWebGLConfig(context)
      });
    }
    
    // HTML rendering (tables, simple visualizations)
    if (context.dataType === 'tabular' || context.dataVolume === 'tiny') {
      strategies.push({
        type: 'html',
        score: this.scoreHTMLStrategy(context),
        config: this.getHTMLConfig(context)
      });
    }
    
    return strategies;
  }

  /**
   * Score rendering strategies
   */
  scoreCanvasStrategy(context) {
    let score = 70; // Base score
    
    if (context.dataVolume === 'large') score += 20;
    if (context.dataVolume === 'huge') score += 30;
    if (context.device.pixelRatio > 1) score -= 10; // Canvas can be blurry on retina
    if (context.preferences.quality === 'performance') score += 15;
    
    return score;
  }

  scoreSVGStrategy(context) {
    let score = 80; // Base score
    
    if (context.dataVolume === 'small') score += 20;
    if (context.dataVolume === 'medium') score += 10;
    if (context.dataVolume === 'large') score -= 30;
    if (context.preferences.quality === 'quality') score += 15;
    if (context.preferences.interactions === 'rich') score += 10;
    
    return score;
  }

  scoreWebGLStrategy(context) {
    let score = 60; // Base score
    
    if (!context.device.gpu.available) return 0;
    
    if (context.dataVolume === 'huge') score += 40;
    if (context.device.gpu.tier === 'high') score += 20;
    if (context.performance.fps < 30) score -= 20;
    
    return score;
  }

  scoreHTMLStrategy(context) {
    let score = 50; // Base score
    
    if (context.dataType === 'tabular') score += 40;
    if (context.dataVolume === 'tiny') score += 30;
    if (context.device.type === 'mobile') score += 10;
    
    return score;
  }

  /**
   * Get renderer configurations
   */
  getCanvasConfig(context) {
    return {
      resolution: context.device.pixelRatio,
      antialiasing: context.preferences.quality !== 'performance',
      offscreenCanvas: context.dataVolume === 'huge',
      progressive: true
    };
  }

  getSVGConfig(context) {
    return {
      preserveAspectRatio: true,
      animations: context.preferences.animations !== false,
      accessibility: true,
      responsive: true
    };
  }

  getWebGLConfig(context) {
    return {
      antialias: context.device.gpu.tier === 'high',
      powerPreference: context.preferences.quality === 'performance' ? 'low-power' : 'high-performance',
      instancing: context.dataVolume === 'huge'
    };
  }

  getHTMLConfig(context) {
    return {
      virtualization: context.dataVolume !== 'tiny',
      pagination: context.dataVolume === 'large',
      sorting: true,
      filtering: true
    };
  }

  /**
   * Data analysis methods
   */
  calculateDataRange(data) {
    if (!data || data.length === 0) return { min: 0, max: 0 };
    
    const values = data.map(d => d.value || d);
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  detectDataType(data) {
    if (!data || data.length === 0) return 'unknown';
    
    const sample = data[0];
    
    if (typeof sample === 'object' && sample.timestamp) {
      return 'timeseries';
    }
    
    if (typeof sample === 'object' && sample.category) {
      return 'categorical';
    }
    
    if (Array.isArray(sample)) {
      return 'tabular';
    }
    
    return 'numeric';
  }

  categorizeDataVolume(count) {
    if (count < 10) return 'tiny';
    if (count < 100) return 'small';
    if (count < 1000) return 'medium';
    if (count < 10000) return 'large';
    return 'huge';
  }

  /**
   * Device detection methods
   */
  detectDeviceType() {
    const width = window.innerWidth;
    
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  detectGPUCapabilities() {
    // Check WebGL support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
      return { available: false };
    }
    
    // Get GPU info
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
    
    // Estimate GPU tier
    const tier = this.estimateGPUTier(vendor, renderer);
    
    return {
      available: true,
      vendor,
      renderer,
      tier
    };
  }

  estimateGPUTier(vendor, renderer) {
    // Simplified GPU tier estimation
    if (renderer.includes('Apple M') || renderer.includes('NVIDIA RTX')) {
      return 'high';
    }
    
    if (renderer.includes('Intel') || renderer.includes('AMD')) {
      return 'medium';
    }
    
    return 'low';
  }

  estimateAvailableMemory() {
    // Use Performance Memory API if available
    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize;
      const total = performance.memory.jsHeapSizeLimit;
      return {
        available: total - used,
        percentage: (total - used) / total
      };
    }
    
    // Fallback estimation
    return {
      available: 1024 * 1024 * 512, // Assume 512MB
      percentage: 0.5
    };
  }

  /**
   * Performance measurement
   */
  measureFPS() {
    // Simple FPS measurement
    if (!this.fpsCounter) {
      this.fpsCounter = new FPSCounter();
    }
    
    return this.fpsCounter.getFPS();
  }

  calculateRenderBudget() {
    // Target 60fps = 16.67ms per frame
    // Leave some headroom for other operations
    return 12; // milliseconds
  }

  /**
   * User preferences
   */
  loadPreferences() {
    const defaults = {
      quality: 'balanced',
      animations: true,
      interactions: 'standard',
      accessibility: true
    };
    
    if (typeof localStorage === 'undefined') return defaults;
    
    try {
      const saved = localStorage.getItem('widget-preferences');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  }

  savePreferences(preferences) {
    this.state.preferences = { ...this.state.preferences, ...preferences };
    
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('widget-preferences', JSON.stringify(this.state.preferences));
    }
  }

  /**
   * Cache management
   */
  getCacheKey(context) {
    return `${context.size.width}x${context.size.height}-${context.dataVolume}-${context.dataType}`;
  }

  clearCache() {
    this.renderCache.clear();
  }

  /**
   * Utility methods
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Widget lifecycle methods
   */
  mount(container) {
    this.container = container;
    this.observeResize();
  }

  unmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.clearCache();
  }

  observeResize() {
    if (!this.container) return;
    
    this.resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        this.handleResize(entry.contentRect);
      }
    });
    
    this.resizeObserver.observe(this.container);
  }

  handleResize(rect) {
    // Clear cache on significant size change
    const sizeChange = Math.abs(rect.width - (this.state.size?.width || 0));
    if (sizeChange > 50) {
      this.clearCache();
    }
    
    // Re-render with new size
    if (this.state.data) {
      this.renderDebouncer(this.state.data, this.container);
    }
  }
}

/**
 * Smart Renderer - Handles different rendering strategies
 */
class SmartRenderer {
  constructor() {
    // Chart type renderers
    this.chartRenderers = {
      line: new LineChartRenderer(),
      bar: new BarChartRenderer(),
      pie: new PieChartRenderer(),
      heatmap: new HeatmapRenderer(),
      scatter: new ScatterPlotRenderer(),
      gauge: new GaugeRenderer(),
      table: new TableRenderer(),
      sparkline: new SparklineRenderer()
    };
  }

  render(data, strategy, context) {
    // Detect chart type from context
    const chartType = this.detectChartType(data, context);
    context.chartType = chartType;
    
    switch (strategy.type) {
      case 'canvas':
        return this.renderCanvas(data, strategy.config, context);
      
      case 'svg':
        return this.renderSVG(data, strategy.config, context);
      
      case 'webgl':
        return this.renderWebGL(data, strategy.config, context);
      
      case 'html':
        return this.renderHTML(data, strategy.config, context);
      
      default:
        return this.renderSVG(data, {}, context);
    }
  }

  detectChartType(data, context) {
    // Auto-detect best chart type based on data
    if (context.config?.chartType) {
      return context.config.chartType;
    }
    
    if (!data || data.length === 0) return 'line';
    
    const sample = data[0];
    
    // Table for tabular data
    if (context.dataType === 'tabular') return 'table';
    
    // Gauge for single values
    if (data.length === 1 && typeof sample === 'number') return 'gauge';
    
    // Sparkline for small datasets
    if (data.length < 20 && context.size.width < 200) return 'sparkline';
    
    // Pie chart for categorical data with values
    if (sample.category && sample.value && data.length < 10) return 'pie';
    
    // Scatter plot for x,y data
    if (sample.x !== undefined && sample.y !== undefined) return 'scatter';
    
    // Bar chart for categorical comparisons
    if (sample.category && data.length < 50) return 'bar';
    
    // Heatmap for matrix data
    if (Array.isArray(sample) && Array.isArray(sample[0])) return 'heatmap';
    
    // Default to line chart
    return 'line';
  }

  renderCanvas(data, config, context) {
    const canvas = document.createElement('canvas');
    canvas.width = context.size.width * config.resolution;
    canvas.height = context.size.height * config.resolution;
    canvas.style.width = `${context.size.width}px`;
    canvas.style.height = `${context.size.height}px`;
    
    const ctx = canvas.getContext('2d');
    
    // Enable high quality rendering
    if (config.antialiasing) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    
    // Scale for retina displays
    ctx.scale(config.resolution, config.resolution);
    
    // Render based on widget type
    this.drawVisualization(ctx, data, context);
    
    return canvas;
  }

  renderSVG(data, config, context) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', context.size.width);
    svg.setAttribute('height', context.size.height);
    svg.setAttribute('viewBox', `0 0 ${context.size.width} ${context.size.height}`);
    
    if (config.preserveAspectRatio) {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    
    // Add accessibility
    if (config.accessibility) {
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = this.generateAccessibleTitle(data, context);
      svg.appendChild(title);
    }
    
    // Render visualization
    this.drawSVGVisualization(svg, data, context);
    
    return svg;
  }

  renderWebGL(data, config, context) {
    // Simplified WebGL rendering
    const canvas = document.createElement('canvas');
    canvas.width = context.size.width;
    canvas.height = context.size.height;
    
    const gl = canvas.getContext('webgl', {
      antialias: config.antialias,
      powerPreference: config.powerPreference
    });
    
    if (!gl) {
      // Fallback to canvas
      return this.renderCanvas(data, { resolution: 1 }, context);
    }
    
    // WebGL rendering would go here
    // For now, fallback to canvas
    return this.renderCanvas(data, { resolution: 1 }, context);
  }

  renderHTML(data, config, context) {
    const container = document.createElement('div');
    container.className = 'adaptive-widget-html';
    container.style.width = '100%';
    container.style.height = '100%';
    
    if (context.dataType === 'tabular') {
      return this.renderTable(container, data, config, context);
    }
    
    // Default HTML rendering
    container.innerHTML = this.generateHTMLContent(data, context);
    
    return container;
  }

  drawVisualization(ctx, data, context) {
    const renderer = this.chartRenderers[context.chartType];
    if (renderer) {
      renderer.renderCanvas(ctx, data, context);
    } else {
      // Fallback to line chart
      this.chartRenderers.line.renderCanvas(ctx, data, context);
    }
  }

  drawSVGVisualization(svg, data, context) {
    const renderer = this.chartRenderers[context.chartType];
    if (renderer) {
      renderer.renderSVG(svg, data, context);
    } else {
      // Fallback to line chart
      this.chartRenderers.line.renderSVG(svg, data, context);
    }
  }

  renderTable(container, data, config, context) {
    const table = document.createElement('table');
    table.className = 'adaptive-table';
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    if (data.length > 0 && typeof data[0] === 'object') {
      Object.keys(data[0]).forEach(key => {
        const th = document.createElement('th');
        th.textContent = key;
        headerRow.appendChild(th);
      });
    }
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    
    data.forEach(row => {
      const tr = document.createElement('tr');
      
      if (typeof row === 'object') {
        Object.values(row).forEach(value => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        });
      } else {
        const td = document.createElement('td');
        td.textContent = row;
        tr.appendChild(td);
      }
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    container.appendChild(table);
    
    return container;
  }

  generateHTMLContent(data, context) {
    // Simple HTML representation
    return `
      <div class="widget-content">
        <div class="widget-summary">
          <span class="label">Data Points:</span>
          <span class="value">${data.length}</span>
        </div>
        <div class="widget-summary">
          <span class="label">Range:</span>
          <span class="value">${context.dataRange.min} - ${context.dataRange.max}</span>
        </div>
      </div>
    `;
  }

  generateAccessibleTitle(data, context) {
    return `Chart showing ${data.length} data points ranging from ${context.dataRange.min} to ${context.dataRange.max}`;
  }
}

/**
 * Widget Animator - Smooth animations and transitions
 */
class WidgetAnimator {
  animate(element, context) {
    if (!context.preferences.animations) return;
    
    // Add initial animation class
    element.classList.add('widget-animate-in');
    
    // Remove class after animation
    setTimeout(() => {
      element.classList.remove('widget-animate-in');
    }, 300);
  }

  transition(element, fromState, toState) {
    // Smooth state transitions
    element.style.transition = 'all 0.3s ease';
    
    // Apply state changes
    Object.assign(element.style, toState);
    
    // Clean up
    setTimeout(() => {
      element.style.transition = '';
    }, 300);
  }
}

/**
 * Interaction Handler - Mouse, touch, and gesture support
 */
class InteractionHandler {
  setup(element, widget) {
    this.element = element;
    this.widget = widget;
    
    // Mouse events
    element.addEventListener('click', this.handleClick.bind(this));
    element.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
    element.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    element.addEventListener('mousemove', this.handleMouseMove.bind(this));
    
    // Touch events
    element.addEventListener('touchstart', this.handleTouchStart.bind(this));
    element.addEventListener('touchmove', this.handleTouchMove.bind(this));
    element.addEventListener('touchend', this.handleTouchEnd.bind(this));
    
    // Keyboard events
    element.setAttribute('tabindex', '0');
    element.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  handleClick(event) {
    const point = this.getDataPoint(event);
    if (point) {
      this.widget.onDataPointClick?.(point);
    }
  }

  handleMouseEnter(event) {
    this.element.classList.add('widget-hover');
  }

  handleMouseLeave(event) {
    this.element.classList.remove('widget-hover');
    this.hideTooltip();
  }

  handleMouseMove(event) {
    const point = this.getDataPoint(event);
    if (point) {
      this.showTooltip(event, point);
    } else {
      this.hideTooltip();
    }
  }

  handleTouchStart(event) {
    this.touchStart = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      time: Date.now()
    };
  }

  handleTouchMove(event) {
    if (!this.touchStart) return;
    
    const deltaX = event.touches[0].clientX - this.touchStart.x;
    const deltaY = event.touches[0].clientY - this.touchStart.y;
    
    // Detect swipe
    if (Math.abs(deltaX) > 50) {
      this.widget.onSwipe?.(deltaX > 0 ? 'right' : 'left');
      this.touchStart = null;
    }
  }

  handleTouchEnd(event) {
    if (!this.touchStart) return;
    
    const duration = Date.now() - this.touchStart.time;
    
    // Detect tap
    if (duration < 300) {
      const point = this.getDataPoint(event.changedTouches[0]);
      if (point) {
        this.widget.onDataPointClick?.(point);
      }
    }
    
    this.touchStart = null;
  }

  handleKeyDown(event) {
    switch (event.key) {
      case 'ArrowLeft':
        this.widget.onNavigate?.('left');
        break;
      case 'ArrowRight':
        this.widget.onNavigate?.('right');
        break;
      case 'Enter':
      case ' ':
        this.widget.onActivate?.();
        break;
    }
  }

  getDataPoint(event) {
    // Convert event coordinates to data point
    // This is a simplified example
    const rect = this.element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find nearest data point
    // Implementation depends on widget type
    return null;
  }

  showTooltip(event, point) {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'widget-tooltip';
      document.body.appendChild(this.tooltip);
    }
    
    this.tooltip.innerHTML = `
      <div class="tooltip-content">
        <span class="tooltip-label">Value:</span>
        <span class="tooltip-value">${point.value}</span>
      </div>
    `;
    
    this.tooltip.style.left = `${event.clientX + 10}px`;
    this.tooltip.style.top = `${event.clientY - 30}px`;
    this.tooltip.style.display = 'block';
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }
}

/**
 * FPS Counter - Performance monitoring
 */
class FPSCounter {
  constructor() {
    this.frames = [];
    this.lastTime = performance.now();
    
    // Start monitoring
    this.monitor();
  }

  monitor() {
    const now = performance.now();
    const delta = now - this.lastTime;
    
    this.frames.push(1000 / delta);
    
    // Keep last 60 frames
    if (this.frames.length > 60) {
      this.frames.shift();
    }
    
    this.lastTime = now;
    
    requestAnimationFrame(() => this.monitor());
  }

  getFPS() {
    if (this.frames.length === 0) return 60;
    
    const sum = this.frames.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.frames.length);
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdaptiveWidget;
}