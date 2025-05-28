/**
 * Real-time WebSocket Service
 * Handles live data updates, streaming metrics, and real-time collaboration
 */

class RealtimeService {
  constructor(config = {}) {
    this.config = {
      endpoint: config.endpoint || 'wss://realtime.newrelic.com',
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 30000,
      messageTimeout: config.messageTimeout || 10000,
      enableCompression: config.enableCompression !== false,
      enableBinary: config.enableBinary !== false,
      maxMessageSize: config.maxMessageSize || 1024 * 1024, // 1MB
      ...config
    };
    
    // Connection state
    this.ws = null;
    this.connectionState = 'disconnected';
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    
    // Message handling
    this.messageQueue = [];
    this.pendingMessages = new Map();
    this.messageHandlers = new Map();
    this.subscriptions = new Map();
    
    // Stream management
    this.streams = new Map();
    this.streamBuffers = new Map();
    
    // Metrics
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      reconnects: 0,
      errors: 0,
      latency: []
    };
    
    // Event emitter
    this.listeners = new Map();
    
    // Binary encoding/decoding
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  /**
   * Connect to WebSocket server
   */
  async connect(authToken) {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      return;
    }
    
    this.connectionState = 'connecting';
    this.authToken = authToken;
    
    try {
      // Create WebSocket connection
      this.ws = new WebSocket(this.config.endpoint);
      
      if (this.config.enableBinary) {
        this.ws.binaryType = 'arraybuffer';
      }
      
      // Set up event handlers
      this.setupWebSocketHandlers();
      
      // Wait for connection
      await this.waitForConnection();
      
      // Authenticate
      await this.authenticate();
      
      // Start heartbeat
      this.startHeartbeat();
      
      // Process queued messages
      this.processMessageQueue();
      
      // Emit connected event
      this.emit('connected');
      
    } catch (error) {
      this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Set up WebSocket event handlers
   */
  setupWebSocketHandlers() {
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
    };
    
    this.ws.onmessage = (event) => {
      this.handleMessage(event);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.metrics.errors++;
      this.emit('error', error);
    };
    
    this.ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      this.handleDisconnection(event);
    };
  }

  /**
   * Wait for connection to be established
   */
  waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.config.messageTimeout);
      
      const checkConnection = () => {
        if (this.ws.readyState === WebSocket.OPEN) {
          clearTimeout(timeout);
          resolve();
        } else if (this.ws.readyState === WebSocket.CLOSED || 
                   this.ws.readyState === WebSocket.CLOSING) {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      
      checkConnection();
    });
  }

  /**
   * Authenticate connection
   */
  async authenticate() {
    const authMessage = {
      type: 'auth',
      token: this.authToken,
      version: '1.0',
      capabilities: {
        compression: this.config.enableCompression,
        binary: this.config.enableBinary,
        streaming: true
      }
    };
    
    const response = await this.sendRequest(authMessage);
    
    if (response.status !== 'ok') {
      throw new Error(`Authentication failed: ${response.error}`);
    }
    
    // Store session info
    this.sessionId = response.sessionId;
    this.serverCapabilities = response.capabilities;
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(event) {
    try {
      let message;
      
      if (event.data instanceof ArrayBuffer) {
        // Binary message
        message = this.decodeBinaryMessage(event.data);
        this.metrics.bytesReceived += event.data.byteLength;
      } else {
        // Text message
        message = JSON.parse(event.data);
        this.metrics.bytesReceived += event.data.length;
      }
      
      this.metrics.messagesReceived++;
      
      // Record latency if message has timestamp
      if (message.timestamp) {
        const latency = Date.now() - message.timestamp;
        this.metrics.latency.push(latency);
        if (this.metrics.latency.length > 100) {
          this.metrics.latency.shift();
        }
      }
      
      // Route message
      await this.routeMessage(message);
      
    } catch (error) {
      console.error('Error handling message:', error);
      this.metrics.errors++;
    }
  }

  /**
   * Route message to appropriate handler
   */
  async routeMessage(message) {
    switch (message.type) {
      case 'response':
        this.handleResponse(message);
        break;
        
      case 'data':
        this.handleDataMessage(message);
        break;
        
      case 'stream':
        this.handleStreamMessage(message);
        break;
        
      case 'notification':
        this.handleNotification(message);
        break;
        
      case 'error':
        this.handleErrorMessage(message);
        break;
        
      case 'heartbeat':
        this.handleHeartbeat(message);
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Handle response messages
   */
  handleResponse(message) {
    const pending = this.pendingMessages.get(message.id);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(message.payload);
      this.pendingMessages.delete(message.id);
    }
  }

  /**
   * Handle data messages
   */
  handleDataMessage(message) {
    const subscription = this.subscriptions.get(message.subscriptionId);
    if (subscription) {
      subscription.handler(message.payload);
    }
  }

  /**
   * Handle stream messages
   */
  handleStreamMessage(message) {
    const stream = this.streams.get(message.streamId);
    if (!stream) return;
    
    switch (message.subtype) {
      case 'start':
        stream.onStart?.(message.metadata);
        break;
        
      case 'data':
        this.handleStreamData(stream, message);
        break;
        
      case 'end':
        stream.onEnd?.(message.metadata);
        this.streams.delete(message.streamId);
        break;
        
      case 'error':
        stream.onError?.(message.error);
        this.streams.delete(message.streamId);
        break;
    }
  }

  /**
   * Handle stream data with buffering
   */
  handleStreamData(stream, message) {
    // Get or create buffer
    let buffer = this.streamBuffers.get(stream.id);
    if (!buffer) {
      buffer = [];
      this.streamBuffers.set(stream.id, buffer);
    }
    
    // Add to buffer
    buffer.push(message.payload);
    
    // Check if we should flush
    if (buffer.length >= stream.bufferSize || 
        Date.now() - stream.lastFlush > stream.flushInterval) {
      this.flushStreamBuffer(stream);
    }
  }

  /**
   * Flush stream buffer
   */
  flushStreamBuffer(stream) {
    const buffer = this.streamBuffers.get(stream.id);
    if (!buffer || buffer.length === 0) return;
    
    // Send buffered data
    stream.onData?.(buffer);
    
    // Clear buffer
    this.streamBuffers.set(stream.id, []);
    stream.lastFlush = Date.now();
  }

  /**
   * Handle notifications
   */
  handleNotification(message) {
    this.emit('notification', message.payload);
    
    // Route to specific handlers
    const handlers = this.messageHandlers.get(message.channel);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message.payload);
        } catch (error) {
          console.error('Notification handler error:', error);
        }
      });
    }
  }

  /**
   * Handle error messages
   */
  handleErrorMessage(message) {
    console.error('Server error:', message.error);
    this.emit('serverError', message.error);
  }

  /**
   * Send message
   */
  async send(message) {
    if (this.connectionState !== 'connected') {
      // Queue message
      this.messageQueue.push(message);
      return;
    }
    
    try {
      let data;
      let bytes;
      
      if (this.config.enableBinary && message.binary) {
        // Send as binary
        data = this.encodeBinaryMessage(message);
        bytes = data.byteLength;
      } else {
        // Send as JSON
        data = JSON.stringify({
          ...message,
          timestamp: Date.now()
        });
        bytes = data.length;
      }
      
      // Check message size
      if (bytes > this.config.maxMessageSize) {
        throw new Error(`Message size ${bytes} exceeds limit ${this.config.maxMessageSize}`);
      }
      
      this.ws.send(data);
      
      this.metrics.messagesSent++;
      this.metrics.bytesSent += bytes;
      
    } catch (error) {
      console.error('Error sending message:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Send request and wait for response
   */
  sendRequest(message) {
    return new Promise((resolve, reject) => {
      const id = this.generateMessageId();
      
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(id);
        reject(new Error('Request timeout'));
      }, this.config.messageTimeout);
      
      // Store pending request
      this.pendingMessages.set(id, {
        resolve,
        reject,
        timeout
      });
      
      // Send message
      this.send({
        ...message,
        id
      }).catch(reject);
    });
  }

  /**
   * Subscribe to real-time data
   */
  async subscribe(channel, query, handler, options = {}) {
    const subscriptionId = this.generateSubscriptionId();
    
    try {
      // Send subscription request
      const response = await this.sendRequest({
        type: 'subscribe',
        channel,
        query,
        options: {
          interval: options.interval || 1000,
          aggregation: options.aggregation,
          filter: options.filter
        }
      });
      
      if (response.status !== 'ok') {
        throw new Error(`Subscription failed: ${response.error}`);
      }
      
      // Store subscription
      this.subscriptions.set(subscriptionId, {
        channel,
        query,
        handler,
        options,
        serverSubscriptionId: response.subscriptionId
      });
      
      // Return unsubscribe function
      return () => this.unsubscribe(subscriptionId);
      
    } catch (error) {
      console.error('Subscription error:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe
   */
  async unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;
    
    try {
      await this.sendRequest({
        type: 'unsubscribe',
        subscriptionId: subscription.serverSubscriptionId
      });
    } catch (error) {
      console.error('Unsubscribe error:', error);
    }
    
    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Create data stream
   */
  async createStream(query, handlers, options = {}) {
    const streamId = this.generateStreamId();
    
    try {
      // Send stream request
      const response = await this.sendRequest({
        type: 'createStream',
        query,
        options: {
          bufferSize: options.bufferSize || 100,
          compression: options.compression !== false,
          format: options.format || 'json'
        }
      });
      
      if (response.status !== 'ok') {
        throw new Error(`Stream creation failed: ${response.error}`);
      }
      
      // Store stream
      const stream = {
        id: streamId,
        serverStreamId: response.streamId,
        ...handlers,
        bufferSize: options.bufferSize || 100,
        flushInterval: options.flushInterval || 1000,
        lastFlush: Date.now()
      };
      
      this.streams.set(response.streamId, stream);
      
      // Return stream control
      return {
        pause: () => this.pauseStream(response.streamId),
        resume: () => this.resumeStream(response.streamId),
        close: () => this.closeStream(response.streamId)
      };
      
    } catch (error) {
      console.error('Stream creation error:', error);
      throw error;
    }
  }

  /**
   * Stream control methods
   */
  async pauseStream(streamId) {
    await this.send({
      type: 'streamControl',
      streamId,
      action: 'pause'
    });
  }

  async resumeStream(streamId) {
    await this.send({
      type: 'streamControl',
      streamId,
      action: 'resume'
    });
  }

  async closeStream(streamId) {
    await this.send({
      type: 'streamControl',
      streamId,
      action: 'close'
    });
    
    // Flush any remaining buffer
    const stream = this.streams.get(streamId);
    if (stream) {
      this.flushStreamBuffer(stream);
    }
    
    this.streams.delete(streamId);
    this.streamBuffers.delete(streamId);
  }

  /**
   * Register message handler
   */
  on(channel, handler) {
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, new Set());
    }
    
    this.messageHandlers.get(channel).add(handler);
    
    // Return unregister function
    return () => {
      const handlers = this.messageHandlers.get(channel);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  /**
   * Binary message encoding/decoding
   */
  encodeBinaryMessage(message) {
    // Create header
    const header = {
      type: message.type,
      id: message.id,
      timestamp: Date.now()
    };
    
    const headerJson = JSON.stringify(header);
    const headerBytes = this.encoder.encode(headerJson);
    
    // Get payload bytes
    let payloadBytes;
    if (message.payload instanceof ArrayBuffer) {
      payloadBytes = new Uint8Array(message.payload);
    } else if (typeof message.payload === 'string') {
      payloadBytes = this.encoder.encode(message.payload);
    } else {
      payloadBytes = this.encoder.encode(JSON.stringify(message.payload));
    }
    
    // Create combined buffer
    const totalLength = 4 + headerBytes.length + payloadBytes.length;
    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);
    
    // Write header length (4 bytes)
    view.setUint32(0, headerBytes.length, true);
    
    // Write header
    new Uint8Array(buffer, 4, headerBytes.length).set(headerBytes);
    
    // Write payload
    new Uint8Array(buffer, 4 + headerBytes.length).set(payloadBytes);
    
    return buffer;
  }

  decodeBinaryMessage(buffer) {
    const view = new DataView(buffer);
    
    // Read header length
    const headerLength = view.getUint32(0, true);
    
    // Read header
    const headerBytes = new Uint8Array(buffer, 4, headerLength);
    const headerJson = this.decoder.decode(headerBytes);
    const header = JSON.parse(headerJson);
    
    // Read payload
    const payloadBytes = new Uint8Array(buffer, 4 + headerLength);
    
    // Try to decode as JSON first
    try {
      const payloadJson = this.decoder.decode(payloadBytes);
      header.payload = JSON.parse(payloadJson);
    } catch {
      // Keep as binary
      header.payload = payloadBytes.buffer;
    }
    
    return header;
  }

  /**
   * Connection management
   */
  handleDisconnection(event) {
    this.connectionState = 'disconnected';
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Clear pending messages
    this.pendingMessages.forEach(pending => {
      pending.reject(new Error('Connection lost'));
    });
    this.pendingMessages.clear();
    
    // Emit disconnected event
    this.emit('disconnected', event);
    
    // Attempt reconnection
    if (event.code !== 1000 && // Normal closure
        event.code !== 1001 && // Going away
        this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnection();
    }
  }

  scheduleReconnection() {
    this.reconnectAttempts++;
    this.metrics.reconnects++;
    
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.authToken).catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  handleConnectionError(error) {
    this.connectionState = 'error';
    this.emit('connectionError', error);
  }

  /**
   * Heartbeat management
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'heartbeat',
        timestamp: Date.now()
      }).catch(error => {
        console.error('Heartbeat failed:', error);
      });
    }, this.config.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  handleHeartbeat(message) {
    // Update connection health
    this.lastHeartbeat = Date.now();
  }

  /**
   * Process queued messages
   */
  processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message).catch(error => {
        console.error('Failed to send queued message:', error);
      });
    }
  }

  /**
   * Event emitter
   */
  emit(event, data) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Utility methods
   */
  generateMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateSubscriptionId() {
    return `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateStreamId() {
    return `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection state
   */
  getState() {
    return {
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: this.subscriptions.size,
      streams: this.streams.size,
      queuedMessages: this.messageQueue.length,
      pendingRequests: this.pendingMessages.size
    };
  }

  /**
   * Get metrics
   */
  getMetrics() {
    const avgLatency = this.metrics.latency.length > 0
      ? this.metrics.latency.reduce((a, b) => a + b, 0) / this.metrics.latency.length
      : 0;
    
    return {
      ...this.metrics,
      avgLatency,
      uptime: this.connectionState === 'connected' ? Date.now() - this.connectedAt : 0
    };
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    // Clear all subscriptions and streams
    this.subscriptions.clear();
    this.streams.clear();
    this.streamBuffers.clear();
    
    // Clear pending messages
    this.pendingMessages.forEach(pending => {
      pending.reject(new Error('Client disconnected'));
    });
    this.pendingMessages.clear();
    
    // Clear message queue
    this.messageQueue = [];
    
    // Update state
    this.connectionState = 'disconnected';
    
    // Emit event
    this.emit('disconnected', { code: 1000, reason: 'Client disconnect' });
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RealtimeService;
}