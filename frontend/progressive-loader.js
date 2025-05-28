/**
 * Progressive Data Loading System
 * Efficiently loads and displays large datasets with virtualization and chunking
 */

class ProgressiveLoader {
  constructor(options = {}) {
    this.options = {
      chunkSize: options.chunkSize || 1000,
      initialLoadSize: options.initialLoadSize || 100,
      loadAheadFactor: options.loadAheadFactor || 2,
      maxMemoryUsage: options.maxMemoryUsage || 100 * 1024 * 1024, // 100MB
      enableVirtualization: options.enableVirtualization !== false,
      enableStreaming: options.enableStreaming !== false,
      ...options
    };
    
    // State management
    this.state = {
      totalItems: 0,
      loadedRanges: new Map(),
      activeRequests: new Map(),
      viewportRange: { start: 0, end: 0 },
      memoryUsage: 0
    };
    
    // Caching
    this.dataCache = new Map();
    this.metadataCache = new Map();
    
    // Performance monitoring
    this.performanceMonitor = new PerformanceMonitor();
    
    // Event emitter for progress updates
    this.listeners = new Map();
  }

  /**
   * Load data progressively
   */
  async load(dataSource, options = {}) {
    const loadId = this.generateLoadId();
    
    try {
      // Get metadata about the dataset
      const metadata = await this.getDataMetadata(dataSource);
      this.state.totalItems = metadata.totalCount;
      
      // Calculate initial load range
      const initialRange = {
        start: 0,
        end: Math.min(this.options.initialLoadSize, metadata.totalCount)
      };
      
      // Load initial chunk
      const initialData = await this.loadChunk(dataSource, initialRange, loadId);
      
      // Set up streaming if enabled
      if (this.options.enableStreaming && metadata.supportsStreaming) {
        this.setupStreaming(dataSource, loadId);
      }
      
      // Return progressive data handle
      return new ProgressiveDataHandle({
        loadId,
        loader: this,
        dataSource,
        metadata,
        initialData
      });
      
    } catch (error) {
      this.emit('error', { loadId, error });
      throw error;
    }
  }

  /**
   * Get metadata about the data source
   */
  async getDataMetadata(dataSource) {
    // Check cache first
    const cacheKey = this.getMetadataCacheKey(dataSource);
    if (this.metadataCache.has(cacheKey)) {
      return this.metadataCache.get(cacheKey);
    }
    
    // Fetch metadata
    const metadata = await dataSource.getMetadata();
    
    // Cache for future use
    this.metadataCache.set(cacheKey, metadata);
    
    return metadata;
  }

  /**
   * Load a specific chunk of data
   */
  async loadChunk(dataSource, range, loadId) {
    const chunkKey = this.getChunkKey(dataSource, range);
    
    // Check if already loading
    if (this.state.activeRequests.has(chunkKey)) {
      return this.state.activeRequests.get(chunkKey);
    }
    
    // Check cache
    if (this.dataCache.has(chunkKey)) {
      return this.dataCache.get(chunkKey);
    }
    
    // Create load promise
    const loadPromise = this.performLoad(dataSource, range, loadId);
    this.state.activeRequests.set(chunkKey, loadPromise);
    
    try {
      const data = await loadPromise;
      
      // Update state
      this.state.loadedRanges.set(chunkKey, range);
      this.state.memoryUsage += this.estimateMemoryUsage(data);
      
      // Cache data
      this.dataCache.set(chunkKey, data);
      
      // Check memory usage
      if (this.state.memoryUsage > this.options.maxMemoryUsage) {
        this.evictOldData();
      }
      
      // Emit progress
      this.emit('progress', {
        loadId,
        loaded: this.getLoadedItemCount(),
        total: this.state.totalItems
      });
      
      return data;
      
    } finally {
      this.state.activeRequests.delete(chunkKey);
    }
  }

  /**
   * Perform the actual data load
   */
  async performLoad(dataSource, range, loadId) {
    const startTime = performance.now();
    
    try {
      const data = await dataSource.loadRange(range.start, range.end);
      
      // Track performance
      this.performanceMonitor.recordLoad({
        range,
        duration: performance.now() - startTime,
        itemCount: range.end - range.start,
        byteSize: this.estimateMemoryUsage(data)
      });
      
      return data;
      
    } catch (error) {
      this.emit('loadError', { loadId, range, error });
      throw error;
    }
  }

  /**
   * Set up streaming for continuous data loading
   */
  setupStreaming(dataSource, loadId) {
    if (!dataSource.stream) return;
    
    const stream = dataSource.stream({
      onData: (data) => this.handleStreamData(data, loadId),
      onError: (error) => this.handleStreamError(error, loadId),
      onEnd: () => this.handleStreamEnd(loadId)
    });
    
    this.state.activeStreams = this.state.activeStreams || new Map();
    this.state.activeStreams.set(loadId, stream);
  }

  /**
   * Handle streamed data
   */
  handleStreamData(data, loadId) {
    // Process streamed data in batches
    if (!this.streamBuffer) {
      this.streamBuffer = new Map();
    }
    
    let buffer = this.streamBuffer.get(loadId) || [];
    buffer.push(...data);
    
    // Process when buffer reaches threshold
    if (buffer.length >= this.options.chunkSize) {
      this.processStreamBuffer(loadId, buffer);
      this.streamBuffer.set(loadId, []);
    } else {
      this.streamBuffer.set(loadId, buffer);
    }
  }

  /**
   * Process buffered stream data
   */
  processStreamBuffer(loadId, buffer) {
    // Update cache with new data
    const startIndex = this.getStreamIndex(loadId);
    const range = {
      start: startIndex,
      end: startIndex + buffer.length
    };
    
    const chunkKey = this.getChunkKey(loadId, range);
    this.dataCache.set(chunkKey, buffer);
    this.state.loadedRanges.set(chunkKey, range);
    
    // Emit update
    this.emit('streamUpdate', {
      loadId,
      range,
      data: buffer
    });
  }

  /**
   * Viewport-based loading
   */
  updateViewport(viewport, loadHandle) {
    this.state.viewportRange = viewport;
    
    // Calculate what needs to be loaded
    const requiredRange = {
      start: Math.max(0, viewport.start - this.options.chunkSize),
      end: Math.min(this.state.totalItems, viewport.end + this.options.chunkSize)
    };
    
    // Check what's missing
    const missingRanges = this.findMissingRanges(requiredRange, loadHandle.dataSource);
    
    // Load missing chunks
    const loadPromises = missingRanges.map(range => 
      this.loadChunk(loadHandle.dataSource, range, loadHandle.loadId)
    );
    
    // Prefetch ahead
    if (this.options.loadAheadFactor > 1) {
      this.prefetchAhead(viewport, loadHandle);
    }
    
    return Promise.all(loadPromises);
  }

  /**
   * Find ranges that need to be loaded
   */
  findMissingRanges(requiredRange, dataSource) {
    const missing = [];
    let currentStart = requiredRange.start;
    
    // Sort loaded ranges
    const sortedRanges = Array.from(this.state.loadedRanges.values())
      .filter(range => this.isRangeForSource(range, dataSource))
      .sort((a, b) => a.start - b.start);
    
    for (const range of sortedRanges) {
      if (range.start > currentStart && currentStart < requiredRange.end) {
        missing.push({
          start: currentStart,
          end: Math.min(range.start, requiredRange.end)
        });
      }
      currentStart = Math.max(currentStart, range.end);
    }
    
    // Check if there's a gap at the end
    if (currentStart < requiredRange.end) {
      missing.push({
        start: currentStart,
        end: requiredRange.end
      });
    }
    
    return missing;
  }

  /**
   * Prefetch data ahead of viewport
   */
  prefetchAhead(viewport, loadHandle) {
    const scrollDirection = this.detectScrollDirection(viewport);
    
    if (scrollDirection === 'down') {
      const prefetchRange = {
        start: viewport.end,
        end: Math.min(
          this.state.totalItems,
          viewport.end + this.options.chunkSize * this.options.loadAheadFactor
        )
      };
      
      this.loadChunk(loadHandle.dataSource, prefetchRange, loadHandle.loadId)
        .catch(error => console.warn('Prefetch failed:', error));
    } else if (scrollDirection === 'up') {
      const prefetchRange = {
        start: Math.max(0, viewport.start - this.options.chunkSize * this.options.loadAheadFactor),
        end: viewport.start
      };
      
      this.loadChunk(loadHandle.dataSource, prefetchRange, loadHandle.loadId)
        .catch(error => console.warn('Prefetch failed:', error));
    }
  }

  /**
   * Detect scroll direction
   */
  detectScrollDirection(viewport) {
    if (!this.lastViewport) {
      this.lastViewport = viewport;
      return 'none';
    }
    
    const direction = viewport.start > this.lastViewport.start ? 'down' : 
                     viewport.start < this.lastViewport.start ? 'up' : 'none';
    
    this.lastViewport = viewport;
    return direction;
  }

  /**
   * Memory management
   */
  evictOldData() {
    // Sort chunks by last access time
    const chunks = Array.from(this.dataCache.entries())
      .sort((a, b) => (a[1].lastAccess || 0) - (b[1].lastAccess || 0));
    
    // Remove oldest chunks until under memory limit
    while (this.state.memoryUsage > this.options.maxMemoryUsage * 0.8 && chunks.length > 0) {
      const [key, data] = chunks.shift();
      const size = this.estimateMemoryUsage(data);
      
      this.dataCache.delete(key);
      this.state.loadedRanges.delete(key);
      this.state.memoryUsage -= size;
      
      this.emit('evict', { key, size });
    }
  }

  /**
   * Estimate memory usage of data
   */
  estimateMemoryUsage(data) {
    if (typeof data === 'string') {
      return data.length * 2; // 2 bytes per character
    }
    
    if (Array.isArray(data)) {
      return data.reduce((sum, item) => sum + this.estimateMemoryUsage(item), 0);
    }
    
    if (typeof data === 'object' && data !== null) {
      return Object.values(data).reduce((sum, value) => sum + this.estimateMemoryUsage(value), 0);
    }
    
    return 8; // Default size for primitives
  }

  /**
   * Get loaded item count
   */
  getLoadedItemCount() {
    let count = 0;
    for (const range of this.state.loadedRanges.values()) {
      count += range.end - range.start;
    }
    return count;
  }

  /**
   * Event handling
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    
    for (const callback of this.listeners.get(event)) {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    }
  }

  /**
   * Utility methods
   */
  generateLoadId() {
    return `load-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getChunkKey(dataSource, range) {
    const sourceId = typeof dataSource === 'string' ? dataSource : dataSource.id || 'unknown';
    return `${sourceId}-${range.start}-${range.end}`;
  }

  getMetadataCacheKey(dataSource) {
    return typeof dataSource === 'string' ? dataSource : dataSource.id || 'unknown';
  }

  isRangeForSource(range, dataSource) {
    const sourceId = typeof dataSource === 'string' ? dataSource : dataSource.id || 'unknown';
    return range.sourceId === sourceId;
  }

  getStreamIndex(loadId) {
    return this.state.streamIndices?.get(loadId) || 0;
  }

  /**
   * Cleanup
   */
  dispose() {
    // Cancel active requests
    for (const [key, promise] of this.state.activeRequests) {
      if (promise.cancel) {
        promise.cancel();
      }
    }
    
    // Close active streams
    if (this.state.activeStreams) {
      for (const stream of this.state.activeStreams.values()) {
        if (stream.close) {
          stream.close();
        }
      }
    }
    
    // Clear caches
    this.dataCache.clear();
    this.metadataCache.clear();
    this.listeners.clear();
    
    // Reset state
    this.state = {
      totalItems: 0,
      loadedRanges: new Map(),
      activeRequests: new Map(),
      viewportRange: { start: 0, end: 0 },
      memoryUsage: 0
    };
  }
}

/**
 * Progressive Data Handle
 * Interface for working with progressively loaded data
 */
class ProgressiveDataHandle {
  constructor({ loadId, loader, dataSource, metadata, initialData }) {
    this.loadId = loadId;
    this.loader = loader;
    this.dataSource = dataSource;
    this.metadata = metadata;
    this.initialData = initialData;
    
    // Virtual scrolling state
    this.virtualScroll = null;
  }

  /**
   * Get data for a specific range
   */
  async getRange(start, end) {
    const range = { start, end };
    const chunks = await this.loader.loadChunk(this.dataSource, range, this.loadId);
    return chunks;
  }

  /**
   * Get all loaded data
   */
  getAllLoaded() {
    const allData = [];
    const sortedRanges = Array.from(this.loader.state.loadedRanges.entries())
      .filter(([key, range]) => key.startsWith(this.loadId))
      .sort((a, b) => a[1].start - b[1].start);
    
    for (const [key, range] of sortedRanges) {
      const data = this.loader.dataCache.get(key);
      if (data) {
        allData.push(...data);
      }
    }
    
    return allData;
  }

  /**
   * Set up virtual scrolling
   */
  setupVirtualScroll(container, options = {}) {
    this.virtualScroll = new VirtualScroller({
      container,
      totalItems: this.metadata.totalCount,
      itemHeight: options.itemHeight || 50,
      renderItem: options.renderItem,
      onViewportChange: (viewport) => {
        this.loader.updateViewport(viewport, this);
      }
    });
    
    // Render initial data
    this.virtualScroll.setData(this.initialData);
    
    // Listen for updates
    this.loader.on('streamUpdate', (event) => {
      if (event.loadId === this.loadId) {
        this.virtualScroll.updateData(event.range, event.data);
      }
    });
    
    return this.virtualScroll;
  }

  /**
   * Progress tracking
   */
  onProgress(callback) {
    this.loader.on('progress', (event) => {
      if (event.loadId === this.loadId) {
        callback(event);
      }
    });
  }

  /**
   * Error handling
   */
  onError(callback) {
    this.loader.on('error', (event) => {
      if (event.loadId === this.loadId) {
        callback(event.error);
      }
    });
  }

  /**
   * Get loading statistics
   */
  getStats() {
    return {
      totalItems: this.metadata.totalCount,
      loadedItems: this.loader.getLoadedItemCount(),
      loadProgress: this.loader.getLoadedItemCount() / this.metadata.totalCount,
      memoryUsage: this.loader.state.memoryUsage,
      activeRequests: this.loader.state.activeRequests.size
    };
  }

  /**
   * Cleanup
   */
  dispose() {
    if (this.virtualScroll) {
      this.virtualScroll.dispose();
    }
  }
}

/**
 * Virtual Scroller
 * Efficient rendering of large lists
 */
class VirtualScroller {
  constructor(options) {
    this.container = options.container;
    this.totalItems = options.totalItems;
    this.itemHeight = options.itemHeight;
    this.renderItem = options.renderItem;
    this.onViewportChange = options.onViewportChange;
    
    // State
    this.data = new Map();
    this.scrollTop = 0;
    this.viewport = { start: 0, end: 0 };
    
    // Create DOM structure
    this.createDOM();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Initial render
    this.render();
  }

  createDOM() {
    // Wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.style.position = 'relative';
    this.wrapper.style.height = '100%';
    this.wrapper.style.overflow = 'auto';
    
    // Spacer (for scrollbar)
    this.spacer = document.createElement('div');
    this.spacer.style.height = `${this.totalItems * this.itemHeight}px`;
    this.spacer.style.width = '1px';
    this.spacer.style.position = 'absolute';
    this.spacer.style.top = '0';
    this.spacer.style.left = '0';
    
    // Content container
    this.content = document.createElement('div');
    this.content.style.position = 'relative';
    
    // Assemble
    this.wrapper.appendChild(this.spacer);
    this.wrapper.appendChild(this.content);
    this.container.appendChild(this.wrapper);
  }

  setupEventListeners() {
    this.wrapper.addEventListener('scroll', this.handleScroll.bind(this));
    
    // Debounce scroll handling
    this.scrollDebounce = null;
  }

  handleScroll() {
    this.scrollTop = this.wrapper.scrollTop;
    
    // Debounce viewport updates
    clearTimeout(this.scrollDebounce);
    this.scrollDebounce = setTimeout(() => {
      this.updateViewport();
    }, 50);
    
    // Immediate render for smooth scrolling
    this.render();
  }

  updateViewport() {
    const containerHeight = this.wrapper.clientHeight;
    const start = Math.floor(this.scrollTop / this.itemHeight);
    const end = Math.ceil((this.scrollTop + containerHeight) / this.itemHeight);
    
    // Add buffer for smoother scrolling
    const buffer = 5;
    this.viewport = {
      start: Math.max(0, start - buffer),
      end: Math.min(this.totalItems, end + buffer)
    };
    
    // Notify about viewport change
    if (this.onViewportChange) {
      this.onViewportChange(this.viewport);
    }
  }

  setData(data, range = { start: 0 }) {
    // Store data with its range
    for (let i = 0; i < data.length; i++) {
      this.data.set(range.start + i, data[i]);
    }
    
    this.render();
  }

  updateData(range, data) {
    // Update specific range
    for (let i = 0; i < data.length; i++) {
      this.data.set(range.start + i, data[i]);
    }
    
    // Re-render if in viewport
    if (this.isRangeInViewport(range)) {
      this.render();
    }
  }

  isRangeInViewport(range) {
    return range.start < this.viewport.end && range.end > this.viewport.start;
  }

  render() {
    // Clear content
    this.content.innerHTML = '';
    
    // Calculate visible range
    const containerHeight = this.wrapper.clientHeight;
    const start = Math.floor(this.scrollTop / this.itemHeight);
    const visibleCount = Math.ceil(containerHeight / this.itemHeight);
    const end = Math.min(this.totalItems, start + visibleCount + 10); // Buffer
    
    // Render visible items
    for (let i = start; i < end; i++) {
      const item = this.data.get(i);
      if (item !== undefined) {
        const element = this.renderItem(item, i);
        element.style.position = 'absolute';
        element.style.top = `${i * this.itemHeight}px`;
        element.style.height = `${this.itemHeight}px`;
        element.style.width = '100%';
        this.content.appendChild(element);
      } else {
        // Render placeholder
        const placeholder = this.renderPlaceholder(i);
        placeholder.style.position = 'absolute';
        placeholder.style.top = `${i * this.itemHeight}px`;
        placeholder.style.height = `${this.itemHeight}px`;
        placeholder.style.width = '100%';
        this.content.appendChild(placeholder);
      }
    }
  }

  renderPlaceholder(index) {
    const placeholder = document.createElement('div');
    placeholder.className = 'virtual-scroll-placeholder';
    placeholder.style.background = '#f0f0f0';
    placeholder.style.display = 'flex';
    placeholder.style.alignItems = 'center';
    placeholder.style.justifyContent = 'center';
    placeholder.style.color = '#999';
    placeholder.innerHTML = `<span>Loading item ${index + 1}...</span>`;
    return placeholder;
  }

  dispose() {
    this.wrapper.removeEventListener('scroll', this.handleScroll);
    this.container.removeChild(this.wrapper);
  }
}

/**
 * Performance Monitor
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = [];
    this.maxMetrics = 100;
  }

  recordLoad(metric) {
    this.metrics.push({
      ...metric,
      timestamp: Date.now()
    });
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  getAverageLoadTime() {
    if (this.metrics.length === 0) return 0;
    
    const sum = this.metrics.reduce((acc, m) => acc + m.duration, 0);
    return sum / this.metrics.length;
  }

  getLoadThroughput() {
    if (this.metrics.length < 2) return 0;
    
    const duration = this.metrics[this.metrics.length - 1].timestamp - this.metrics[0].timestamp;
    const totalItems = this.metrics.reduce((acc, m) => acc + m.itemCount, 0);
    
    return totalItems / (duration / 1000); // items per second
  }

  getStats() {
    return {
      averageLoadTime: this.getAverageLoadTime(),
      loadThroughput: this.getLoadThroughput(),
      totalLoads: this.metrics.length,
      totalItemsLoaded: this.metrics.reduce((acc, m) => acc + m.itemCount, 0),
      totalBytesLoaded: this.metrics.reduce((acc, m) => acc + m.byteSize, 0)
    };
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ProgressiveLoader,
    ProgressiveDataHandle,
    VirtualScroller,
    PerformanceMonitor
  };
}