/**
 * Widget Communication System
 * Enables widgets to communicate, share data, and coordinate actions
 */

class WidgetCommunicationHub {
  constructor(config = {}) {
    this.config = {
      maxMessageSize: config.maxMessageSize || 1024 * 1024, // 1MB
      messageTimeout: config.messageTimeout || 30000, // 30s
      enableLogging: config.enableLogging || false,
      enableReplay: config.enableReplay || true,
      replayBufferSize: config.replayBufferSize || 100,
      ...config
    };
    
    // Communication channels
    this.channels = new Map();
    this.subscriptions = new Map();
    this.widgetRegistry = new Map();
    
    // Message handling
    this.messageQueue = [];
    this.messageHistory = [];
    this.pendingRequests = new Map();
    
    // Cross-widget state
    this.sharedState = new Map();
    this.stateSubscribers = new Map();
    
    // Event bus
    this.eventBus = new EventEmitter();
    
    // Performance monitoring
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      averageLatency: 0,
      errors: 0
    };
  }

  /**
   * Register a widget for communication
   */
  registerWidget(widget) {
    const widgetId = widget.id || this.generateWidgetId();
    
    // Create widget context
    const widgetContext = {
      id: widgetId,
      widget,
      channels: new Set(),
      subscriptions: new Map(),
      metadata: {
        registered: Date.now(),
        type: widget.type || 'unknown',
        title: widget.title || 'Untitled'
      }
    };
    
    // Register widget
    this.widgetRegistry.set(widgetId, widgetContext);
    
    // Create widget API
    const api = this.createWidgetAPI(widgetId);
    
    // Emit registration event
    this.eventBus.emit('widgetRegistered', {
      widgetId,
      metadata: widgetContext.metadata
    });
    
    return api;
  }

  /**
   * Create API for widget communication
   */
  createWidgetAPI(widgetId) {
    const hub = this;
    
    return {
      // Channel operations
      channel: {
        create: (name, options) => hub.createChannel(widgetId, name, options),
        join: (name) => hub.joinChannel(widgetId, name),
        leave: (name) => hub.leaveChannel(widgetId, name),
        list: () => hub.listChannels(widgetId)
      },
      
      // Messaging
      send: (target, message, options) => hub.sendMessage(widgetId, target, message, options),
      broadcast: (message, options) => hub.broadcastMessage(widgetId, message, options),
      request: (target, message, options) => hub.sendRequest(widgetId, target, message, options),
      respond: (requestId, response) => hub.sendResponse(widgetId, requestId, response),
      
      // Subscriptions
      subscribe: (pattern, handler) => hub.subscribe(widgetId, pattern, handler),
      unsubscribe: (subscriptionId) => hub.unsubscribe(widgetId, subscriptionId),
      
      // Shared state
      state: {
        get: (key) => hub.getSharedState(key),
        set: (key, value) => hub.setSharedState(widgetId, key, value),
        update: (key, updater) => hub.updateSharedState(widgetId, key, updater),
        subscribe: (key, handler) => hub.subscribeToState(widgetId, key, handler),
        unsubscribe: (subscriptionId) => hub.unsubscribeFromState(widgetId, subscriptionId)
      },
      
      // Events
      emit: (event, data) => hub.emitWidgetEvent(widgetId, event, data),
      on: (event, handler) => hub.onWidgetEvent(widgetId, event, handler),
      off: (event, handler) => hub.offWidgetEvent(widgetId, event, handler),
      
      // Utilities
      getMetrics: () => hub.getWidgetMetrics(widgetId),
      dispose: () => hub.unregisterWidget(widgetId)
    };
  }

  /**
   * Channel management
   */
  createChannel(widgetId, name, options = {}) {
    if (this.channels.has(name)) {
      throw new ChannelError(`Channel ${name} already exists`);
    }
    
    const channel = {
      name,
      creator: widgetId,
      members: new Set([widgetId]),
      options: {
        private: options.private || false,
        persistent: options.persistent || false,
        maxMembers: options.maxMembers || Infinity,
        ...options
      },
      created: Date.now(),
      messages: []
    };
    
    this.channels.set(name, channel);
    
    // Add to widget's channels
    const widget = this.widgetRegistry.get(widgetId);
    if (widget) {
      widget.channels.add(name);
    }
    
    // Emit event
    this.eventBus.emit('channelCreated', { channel, widgetId });
    
    return channel;
  }

  joinChannel(widgetId, name) {
    const channel = this.channels.get(name);
    if (!channel) {
      throw new ChannelError(`Channel ${name} does not exist`);
    }
    
    // Check permissions
    if (channel.options.private && !this.hasChannelAccess(widgetId, channel)) {
      throw new ChannelError(`Access denied to private channel ${name}`);
    }
    
    // Check member limit
    if (channel.members.size >= channel.options.maxMembers) {
      throw new ChannelError(`Channel ${name} is full`);
    }
    
    // Add member
    channel.members.add(widgetId);
    
    // Update widget
    const widget = this.widgetRegistry.get(widgetId);
    if (widget) {
      widget.channels.add(name);
    }
    
    // Send join notification
    this.broadcastToChannel(name, {
      type: 'memberJoined',
      widgetId,
      timestamp: Date.now()
    }, widgetId);
    
    // Send channel history if enabled
    if (this.config.enableReplay && channel.messages.length > 0) {
      this.sendChannelHistory(widgetId, channel);
    }
    
    return channel;
  }

  leaveChannel(widgetId, name) {
    const channel = this.channels.get(name);
    if (!channel) return;
    
    // Remove member
    channel.members.delete(widgetId);
    
    // Update widget
    const widget = this.widgetRegistry.get(widgetId);
    if (widget) {
      widget.channels.delete(name);
    }
    
    // Send leave notification
    this.broadcastToChannel(name, {
      type: 'memberLeft',
      widgetId,
      timestamp: Date.now()
    }, widgetId);
    
    // Delete channel if empty and not persistent
    if (channel.members.size === 0 && !channel.options.persistent) {
      this.channels.delete(name);
      this.eventBus.emit('channelDeleted', { channel });
    }
  }

  /**
   * Messaging
   */
  sendMessage(senderId, target, message, options = {}) {
    // Validate message
    this.validateMessage(message);
    
    // Create message envelope
    const envelope = {
      id: this.generateMessageId(),
      from: senderId,
      to: target,
      message,
      timestamp: Date.now(),
      options
    };
    
    // Track metrics
    const startTime = performance.now();
    
    try {
      // Route message
      if (target.startsWith('channel:')) {
        // Channel message
        const channelName = target.substring(8);
        this.sendToChannel(senderId, channelName, envelope);
      } else if (target === '*') {
        // Broadcast
        this.sendBroadcast(envelope);
      } else {
        // Direct message
        this.sendDirect(target, envelope);
      }
      
      // Update metrics
      this.updateMetrics('send', performance.now() - startTime);
      
      // Log if enabled
      if (this.config.enableLogging) {
        this.logMessage(envelope);
      }
      
      return envelope.id;
      
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  sendToChannel(senderId, channelName, envelope) {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new ChannelError(`Channel ${channelName} does not exist`);
    }
    
    // Check membership
    if (!channel.members.has(senderId)) {
      throw new ChannelError(`Not a member of channel ${channelName}`);
    }
    
    // Add to channel history
    if (this.config.enableReplay) {
      channel.messages.push(envelope);
      if (channel.messages.length > this.config.replayBufferSize) {
        channel.messages.shift();
      }
    }
    
    // Broadcast to channel members
    this.broadcastToChannel(channelName, envelope, senderId);
  }

  broadcastToChannel(channelName, message, excludeId) {
    const channel = this.channels.get(channelName);
    if (!channel) return;
    
    for (const memberId of channel.members) {
      if (memberId !== excludeId) {
        this.deliverMessage(memberId, message);
      }
    }
  }

  sendDirect(targetId, envelope) {
    const target = this.widgetRegistry.get(targetId);
    if (!target) {
      throw new MessageError(`Widget ${targetId} not found`);
    }
    
    this.deliverMessage(targetId, envelope);
  }

  sendBroadcast(envelope) {
    for (const [widgetId] of this.widgetRegistry) {
      if (widgetId !== envelope.from) {
        this.deliverMessage(widgetId, envelope);
      }
    }
  }

  deliverMessage(widgetId, message) {
    // Check subscriptions
    const widget = this.widgetRegistry.get(widgetId);
    if (!widget) return;
    
    // Update metrics
    this.metrics.messagesReceived++;
    
    // Check message patterns
    for (const [subId, subscription] of widget.subscriptions) {
      if (this.matchesPattern(message, subscription.pattern)) {
        try {
          subscription.handler(message);
        } catch (error) {
          console.error(`Error in message handler for widget ${widgetId}:`, error);
          this.metrics.errors++;
        }
      }
    }
  }

  /**
   * Request/Response pattern
   */
  async sendRequest(senderId, target, message, options = {}) {
    const requestId = this.generateRequestId();
    const timeout = options.timeout || this.config.messageTimeout;
    
    // Create promise for response
    const responsePromise = new Promise((resolve, reject) => {
      // Set timeout
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new TimeoutError(`Request ${requestId} timed out`));
      }, timeout);
      
      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
        senderId,
        target,
        timestamp: Date.now()
      });
    });
    
    // Send request message
    this.sendMessage(senderId, target, {
      type: 'request',
      requestId,
      payload: message
    }, { ...options, requireResponse: true });
    
    return responsePromise;
  }

  sendResponse(senderId, requestId, response) {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      throw new MessageError(`No pending request with ID ${requestId}`);
    }
    
    // Clear timeout
    clearTimeout(pending.timer);
    
    // Resolve promise
    pending.resolve(response);
    
    // Clean up
    this.pendingRequests.delete(requestId);
  }

  /**
   * Subscriptions
   */
  subscribe(widgetId, pattern, handler) {
    const widget = this.widgetRegistry.get(widgetId);
    if (!widget) {
      throw new WidgetError(`Widget ${widgetId} not registered`);
    }
    
    const subscriptionId = this.generateSubscriptionId();
    
    const subscription = {
      pattern,
      handler,
      created: Date.now()
    };
    
    widget.subscriptions.set(subscriptionId, subscription);
    
    return subscriptionId;
  }

  unsubscribe(widgetId, subscriptionId) {
    const widget = this.widgetRegistry.get(widgetId);
    if (!widget) return;
    
    widget.subscriptions.delete(subscriptionId);
  }

  matchesPattern(message, pattern) {
    if (typeof pattern === 'string') {
      // Simple string match
      return message.type === pattern || message.to === pattern;
    }
    
    if (pattern instanceof RegExp) {
      // Regex match
      return pattern.test(message.type) || pattern.test(message.to);
    }
    
    if (typeof pattern === 'function') {
      // Custom matcher
      return pattern(message);
    }
    
    if (typeof pattern === 'object') {
      // Object match
      return Object.entries(pattern).every(([key, value]) => {
        return message[key] === value;
      });
    }
    
    return false;
  }

  /**
   * Shared State Management
   */
  getSharedState(key) {
    return this.sharedState.get(key);
  }

  setSharedState(widgetId, key, value) {
    const oldValue = this.sharedState.get(key);
    this.sharedState.set(key, value);
    
    // Notify subscribers
    this.notifyStateSubscribers(key, {
      type: 'set',
      key,
      value,
      oldValue,
      widgetId,
      timestamp: Date.now()
    });
    
    return value;
  }

  updateSharedState(widgetId, key, updater) {
    const currentValue = this.sharedState.get(key);
    const newValue = updater(currentValue);
    
    return this.setSharedState(widgetId, key, newValue);
  }

  subscribeToState(widgetId, key, handler) {
    if (!this.stateSubscribers.has(key)) {
      this.stateSubscribers.set(key, new Map());
    }
    
    const subscriptionId = this.generateSubscriptionId();
    
    this.stateSubscribers.get(key).set(subscriptionId, {
      widgetId,
      handler,
      created: Date.now()
    });
    
    // Send current value
    const currentValue = this.sharedState.get(key);
    if (currentValue !== undefined) {
      handler({
        type: 'initial',
        key,
        value: currentValue,
        timestamp: Date.now()
      });
    }
    
    return subscriptionId;
  }

  unsubscribeFromState(widgetId, subscriptionId) {
    for (const [key, subscribers] of this.stateSubscribers) {
      const subscription = subscribers.get(subscriptionId);
      if (subscription && subscription.widgetId === widgetId) {
        subscribers.delete(subscriptionId);
        
        // Clean up empty subscriber maps
        if (subscribers.size === 0) {
          this.stateSubscribers.delete(key);
        }
        
        return true;
      }
    }
    
    return false;
  }

  notifyStateSubscribers(key, change) {
    const subscribers = this.stateSubscribers.get(key);
    if (!subscribers) return;
    
    for (const [subId, subscription] of subscribers) {
      try {
        subscription.handler(change);
      } catch (error) {
        console.error(`Error in state subscriber:`, error);
        this.metrics.errors++;
      }
    }
  }

  /**
   * Widget Events
   */
  emitWidgetEvent(widgetId, event, data) {
    const widget = this.widgetRegistry.get(widgetId);
    if (!widget) return;
    
    const eventData = {
      widgetId,
      event,
      data,
      timestamp: Date.now()
    };
    
    this.eventBus.emit(`widget:${event}`, eventData);
    this.eventBus.emit(`widget:${widgetId}:${event}`, eventData);
  }

  onWidgetEvent(widgetId, event, handler) {
    // Listen to specific widget events
    return this.eventBus.on(`widget:${widgetId}:${event}`, handler);
  }

  offWidgetEvent(widgetId, event, handler) {
    this.eventBus.off(`widget:${widgetId}:${event}`, handler);
  }

  /**
   * Coordination Patterns
   */
  
  /**
   * Master-slave coordination
   */
  async electMaster(group, candidateId) {
    const election = {
      group,
      candidates: new Map(),
      startTime: Date.now()
    };
    
    // Broadcast election start
    this.broadcastMessage(candidateId, {
      type: 'election:start',
      group,
      candidateId
    });
    
    // Wait for votes
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simple election: first candidate wins
        resolve(candidateId);
        
        // Broadcast result
        this.broadcastMessage(candidateId, {
          type: 'election:result',
          group,
          masterId: candidateId
        });
      }, 1000);
    });
  }

  /**
   * Data synchronization
   */
  createSyncGroup(groupId, options = {}) {
    const syncGroup = {
      id: groupId,
      members: new Set(),
      data: new Map(),
      version: 0,
      options: {
        conflictResolution: options.conflictResolution || 'last-write-wins',
        syncInterval: options.syncInterval || 1000,
        ...options
      }
    };
    
    this.syncGroups = this.syncGroups || new Map();
    this.syncGroups.set(groupId, syncGroup);
    
    return syncGroup;
  }

  joinSyncGroup(widgetId, groupId) {
    const group = this.syncGroups?.get(groupId);
    if (!group) {
      throw new SyncError(`Sync group ${groupId} does not exist`);
    }
    
    group.members.add(widgetId);
    
    // Send current state
    this.sendMessage(widgetId, widgetId, {
      type: 'sync:state',
      groupId,
      data: Array.from(group.data.entries()),
      version: group.version
    });
  }

  syncData(widgetId, groupId, key, value) {
    const group = this.syncGroups?.get(groupId);
    if (!group) {
      throw new SyncError(`Sync group ${groupId} does not exist`);
    }
    
    if (!group.members.has(widgetId)) {
      throw new SyncError(`Widget ${widgetId} is not a member of sync group ${groupId}`);
    }
    
    // Update data
    group.data.set(key, {
      value,
      updatedBy: widgetId,
      timestamp: Date.now()
    });
    
    group.version++;
    
    // Broadcast update
    for (const memberId of group.members) {
      if (memberId !== widgetId) {
        this.sendMessage(widgetId, memberId, {
          type: 'sync:update',
          groupId,
          key,
          value,
          version: group.version
        });
      }
    }
  }

  /**
   * Utility methods
   */
  validateMessage(message) {
    const messageSize = JSON.stringify(message).length;
    if (messageSize > this.config.maxMessageSize) {
      throw new MessageError(`Message size ${messageSize} exceeds limit ${this.config.maxMessageSize}`);
    }
  }

  hasChannelAccess(widgetId, channel) {
    // In real implementation, check ACL
    return channel.creator === widgetId || channel.options.allowList?.includes(widgetId);
  }

  sendChannelHistory(widgetId, channel) {
    const recentMessages = channel.messages.slice(-10); // Last 10 messages
    
    this.sendMessage('system', widgetId, {
      type: 'channel:history',
      channel: channel.name,
      messages: recentMessages
    });
  }

  logMessage(envelope) {
    this.messageHistory.push({
      ...envelope,
      logged: Date.now()
    });
    
    // Limit history size
    if (this.messageHistory.length > 1000) {
      this.messageHistory.shift();
    }
  }

  updateMetrics(operation, latency) {
    if (operation === 'send') {
      this.metrics.messagesSent++;
    }
    
    // Update average latency
    const totalMessages = this.metrics.messagesSent + this.metrics.messagesReceived;
    this.metrics.averageLatency = 
      (this.metrics.averageLatency * (totalMessages - 1) + latency) / totalMessages;
  }

  getWidgetMetrics(widgetId) {
    const widget = this.widgetRegistry.get(widgetId);
    if (!widget) return null;
    
    return {
      channels: widget.channels.size,
      subscriptions: widget.subscriptions.size,
      uptime: Date.now() - widget.metadata.registered,
      ...this.metrics
    };
  }

  /**
   * ID generators
   */
  generateWidgetId() {
    return `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  generateSubscriptionId() {
    return `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup
   */
  unregisterWidget(widgetId) {
    const widget = this.widgetRegistry.get(widgetId);
    if (!widget) return;
    
    // Leave all channels
    for (const channelName of widget.channels) {
      this.leaveChannel(widgetId, channelName);
    }
    
    // Remove all subscriptions
    widget.subscriptions.clear();
    
    // Remove from registry
    this.widgetRegistry.delete(widgetId);
    
    // Emit event
    this.eventBus.emit('widgetUnregistered', { widgetId });
  }

  dispose() {
    // Clear all widgets
    for (const [widgetId] of this.widgetRegistry) {
      this.unregisterWidget(widgetId);
    }
    
    // Clear all data
    this.channels.clear();
    this.subscriptions.clear();
    this.sharedState.clear();
    this.stateSubscribers.clear();
    this.pendingRequests.clear();
    this.messageHistory = [];
    
    // Remove all event listeners
    this.eventBus.removeAllListeners();
  }
}

/**
 * Event Emitter
 */
class EventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    
    this.events.get(event).push(handler);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const handlers = this.events.get(event);
    if (!handlers) return;
    
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    
    if (handlers.length === 0) {
      this.events.delete(event);
    }
  }

  emit(event, data) {
    const handlers = this.events.get(event);
    if (!handlers) return;
    
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }
  }

  removeAllListeners() {
    this.events.clear();
  }
}

/**
 * Error Types
 */
class CommunicationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommunicationError';
  }
}

class ChannelError extends CommunicationError {
  constructor(message) {
    super(message);
    this.name = 'ChannelError';
  }
}

class MessageError extends CommunicationError {
  constructor(message) {
    super(message);
    this.name = 'MessageError';
  }
}

class WidgetError extends CommunicationError {
  constructor(message) {
    super(message);
    this.name = 'WidgetError';
  }
}

class TimeoutError extends CommunicationError {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class SyncError extends CommunicationError {
  constructor(message) {
    super(message);
    this.name = 'SyncError';
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WidgetCommunicationHub,
    EventEmitter,
    // Error types
    CommunicationError,
    ChannelError,
    MessageError,
    WidgetError,
    TimeoutError,
    SyncError
  };
}