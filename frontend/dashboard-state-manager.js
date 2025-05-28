/**
 * Dashboard State Manager
 * Comprehensive state management for dashboards with persistence,
 * versioning, collaboration, and error recovery
 */

class DashboardStateManager {
  constructor(config = {}) {
    this.config = {
      autoSaveInterval: config.autoSaveInterval || 30000, // 30 seconds
      maxUndoStates: config.maxUndoStates || 50,
      maxVersions: config.maxVersions || 100,
      syncInterval: config.syncInterval || 5000, // 5 seconds
      conflictResolution: config.conflictResolution || 'last-write-wins',
      ...config
    };
    
    // Core services
    this.storage = new DashboardStorage(config.storage);
    this.versionControl = new DashboardVersionControl(config.versions);
    this.collaboration = new CollaborationManager(config.collaboration);
    this.permissions = new PermissionManager(config.permissions);
    
    // State
    this.currentDashboard = null;
    this.undoStack = [];
    this.redoStack = [];
    this.localChanges = new Map();
    this.remoteChanges = new Map();
    
    // Timers
    this.autoSaveTimer = null;
    this.syncTimer = null;
    
    // Event emitter
    this.listeners = new Map();
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize state manager
   */
  async initialize() {
    // Set up auto-save
    if (this.config.autoSaveInterval > 0) {
      this.startAutoSave();
    }
    
    // Set up sync
    if (this.config.syncInterval > 0) {
      this.startSync();
    }
    
    // Set up collaboration
    if (this.config.collaboration?.enabled) {
      await this.collaboration.connect();
      this.setupCollaborationHandlers();
    }
  }

  /**
   * Create new dashboard
   */
  async createDashboard(config = {}) {
    try {
      // Generate dashboard structure
      const dashboard = {
        id: this.generateId(),
        version: 1,
        title: config.title || 'Untitled Dashboard',
        description: config.description || '',
        widgets: [],
        layout: {
          type: config.layoutType || 'grid',
          columns: config.columns || 12,
          rowHeight: config.rowHeight || 100,
          margin: config.margin || [10, 10]
        },
        theme: config.theme || 'light',
        filters: [],
        variables: {},
        metadata: {
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          author: await this.getCurrentUser(),
          tags: config.tags || [],
          favorite: false
        },
        permissions: {
          owner: await this.getCurrentUser(),
          viewers: [],
          editors: [],
          public: false
        },
        settings: {
          refreshInterval: config.refreshInterval || 60000,
          timeRange: config.timeRange || { duration: '1 hour' },
          timezone: config.timezone || 'browser'
        }
      };
      
      // Validate structure
      this.validateDashboard(dashboard);
      
      // Save to storage
      await this.storage.save(dashboard);
      
      // Create initial version
      await this.versionControl.createVersion(dashboard, 'Initial version');
      
      // Set as current
      this.currentDashboard = dashboard;
      this.clearUndoRedo();
      
      // Emit event
      this.emit('dashboardCreated', dashboard);
      
      return dashboard;
      
    } catch (error) {
      this.emit('error', { action: 'createDashboard', error });
      throw error;
    }
  }

  /**
   * Load dashboard
   */
  async loadDashboard(dashboardId, options = {}) {
    try {
      // Check permissions
      const hasAccess = await this.permissions.checkAccess(dashboardId, 'read');
      if (!hasAccess) {
        throw new PermissionError('Access denied to dashboard');
      }
      
      // Load from storage
      let dashboard = await this.storage.load(dashboardId);
      
      // Load specific version if requested
      if (options.version) {
        dashboard = await this.versionControl.getVersion(dashboardId, options.version);
      }
      
      // Validate
      this.validateDashboard(dashboard);
      
      // Set as current
      this.currentDashboard = dashboard;
      this.clearUndoRedo();
      
      // Join collaboration session
      if (this.config.collaboration?.enabled && !options.readonly) {
        await this.collaboration.joinSession(dashboardId);
      }
      
      // Start monitoring changes
      this.startChangeTracking();
      
      // Emit event
      this.emit('dashboardLoaded', dashboard);
      
      return dashboard;
      
    } catch (error) {
      this.emit('error', { action: 'loadDashboard', error });
      throw error;
    }
  }

  /**
   * Save dashboard
   */
  async saveDashboard(options = {}) {
    if (!this.currentDashboard) {
      throw new StateError('No dashboard loaded');
    }
    
    try {
      // Check permissions
      const hasAccess = await this.permissions.checkAccess(
        this.currentDashboard.id, 
        'write'
      );
      if (!hasAccess) {
        throw new PermissionError('Cannot save dashboard - insufficient permissions');
      }
      
      // Update metadata
      this.currentDashboard.metadata.modified = new Date().toISOString();
      this.currentDashboard.version++;
      
      // Handle conflicts
      if (options.force !== true) {
        const conflicts = await this.checkConflicts();
        if (conflicts.length > 0) {
          const resolved = await this.resolveConflicts(conflicts);
          if (!resolved) {
            throw new ConflictError('Save cancelled due to conflicts');
          }
        }
      }
      
      // Validate before saving
      this.validateDashboard(this.currentDashboard);
      
      // Save to storage
      await this.storage.save(this.currentDashboard);
      
      // Create version
      if (options.createVersion !== false) {
        await this.versionControl.createVersion(
          this.currentDashboard,
          options.versionMessage || 'Dashboard saved'
        );
      }
      
      // Clear local changes
      this.localChanges.clear();
      
      // Broadcast save
      if (this.collaboration.isConnected()) {
        this.collaboration.broadcast({
          type: 'dashboardSaved',
          dashboardId: this.currentDashboard.id,
          version: this.currentDashboard.version
        });
      }
      
      // Emit event
      this.emit('dashboardSaved', this.currentDashboard);
      
      return this.currentDashboard;
      
    } catch (error) {
      this.emit('error', { action: 'saveDashboard', error });
      throw error;
    }
  }

  /**
   * Add widget to dashboard
   */
  async addWidget(widgetConfig, position = null) {
    if (!this.currentDashboard) {
      throw new StateError('No dashboard loaded');
    }
    
    try {
      // Create widget
      const widget = {
        id: this.generateId(),
        type: widgetConfig.type || 'chart',
        title: widgetConfig.title || 'New Widget',
        query: widgetConfig.query || '',
        visualization: widgetConfig.visualization || 'line',
        configuration: widgetConfig.configuration || {},
        position: position || this.findAvailablePosition(),
        size: widgetConfig.size || { width: 4, height: 3 },
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      };
      
      // Validate widget
      this.validateWidget(widget);
      
      // Record for undo
      this.recordState('addWidget');
      
      // Add to dashboard
      this.currentDashboard.widgets.push(widget);
      
      // Track change
      this.trackChange('addWidget', { widgetId: widget.id });
      
      // Broadcast if collaborative
      if (this.collaboration.isConnected()) {
        this.collaboration.broadcast({
          type: 'widgetAdded',
          widget,
          userId: await this.getCurrentUser()
        });
      }
      
      // Emit event
      this.emit('widgetAdded', widget);
      
      return widget;
      
    } catch (error) {
      this.emit('error', { action: 'addWidget', error });
      throw error;
    }
  }

  /**
   * Update widget
   */
  async updateWidget(widgetId, updates) {
    if (!this.currentDashboard) {
      throw new StateError('No dashboard loaded');
    }
    
    try {
      // Find widget
      const widgetIndex = this.currentDashboard.widgets.findIndex(
        w => w.id === widgetId
      );
      
      if (widgetIndex === -1) {
        throw new NotFoundError(`Widget ${widgetId} not found`);
      }
      
      // Record for undo
      this.recordState('updateWidget');
      
      // Apply updates
      const widget = this.currentDashboard.widgets[widgetIndex];
      const updatedWidget = {
        ...widget,
        ...updates,
        id: widget.id, // Prevent ID change
        modified: new Date().toISOString()
      };
      
      // Validate
      this.validateWidget(updatedWidget);
      
      // Update
      this.currentDashboard.widgets[widgetIndex] = updatedWidget;
      
      // Track change
      this.trackChange('updateWidget', { widgetId, updates });
      
      // Broadcast if collaborative
      if (this.collaboration.isConnected()) {
        this.collaboration.broadcast({
          type: 'widgetUpdated',
          widgetId,
          updates,
          userId: await this.getCurrentUser()
        });
      }
      
      // Emit event
      this.emit('widgetUpdated', updatedWidget);
      
      return updatedWidget;
      
    } catch (error) {
      this.emit('error', { action: 'updateWidget', error });
      throw error;
    }
  }

  /**
   * Remove widget
   */
  async removeWidget(widgetId) {
    if (!this.currentDashboard) {
      throw new StateError('No dashboard loaded');
    }
    
    try {
      // Find widget
      const widgetIndex = this.currentDashboard.widgets.findIndex(
        w => w.id === widgetId
      );
      
      if (widgetIndex === -1) {
        throw new NotFoundError(`Widget ${widgetId} not found`);
      }
      
      // Record for undo
      this.recordState('removeWidget');
      
      // Remove widget
      const [removedWidget] = this.currentDashboard.widgets.splice(widgetIndex, 1);
      
      // Track change
      this.trackChange('removeWidget', { widgetId });
      
      // Broadcast if collaborative
      if (this.collaboration.isConnected()) {
        this.collaboration.broadcast({
          type: 'widgetRemoved',
          widgetId,
          userId: await this.getCurrentUser()
        });
      }
      
      // Emit event
      this.emit('widgetRemoved', removedWidget);
      
      return removedWidget;
      
    } catch (error) {
      this.emit('error', { action: 'removeWidget', error });
      throw error;
    }
  }

  /**
   * Move widget
   */
  async moveWidget(widgetId, newPosition) {
    if (!this.currentDashboard) {
      throw new StateError('No dashboard loaded');
    }
    
    try {
      // Find widget
      const widget = this.currentDashboard.widgets.find(w => w.id === widgetId);
      if (!widget) {
        throw new NotFoundError(`Widget ${widgetId} not found`);
      }
      
      // Validate position
      if (!this.isValidPosition(newPosition, widget.size)) {
        throw new ValidationError('Invalid widget position');
      }
      
      // Check for collisions
      const collisions = this.checkCollisions(widgetId, newPosition, widget.size);
      if (collisions.length > 0) {
        // Try to resolve collisions
        await this.resolveCollisions(collisions, widgetId, newPosition);
      }
      
      // Record for undo
      this.recordState('moveWidget');
      
      // Update position
      widget.position = newPosition;
      widget.modified = new Date().toISOString();
      
      // Track change
      this.trackChange('moveWidget', { widgetId, newPosition });
      
      // Broadcast if collaborative
      if (this.collaboration.isConnected()) {
        this.collaboration.broadcast({
          type: 'widgetMoved',
          widgetId,
          newPosition,
          userId: await this.getCurrentUser()
        });
      }
      
      // Emit event
      this.emit('widgetMoved', { widget, oldPosition: widget.position, newPosition });
      
      return widget;
      
    } catch (error) {
      this.emit('error', { action: 'moveWidget', error });
      throw error;
    }
  }

  /**
   * Resize widget
   */
  async resizeWidget(widgetId, newSize) {
    if (!this.currentDashboard) {
      throw new StateError('No dashboard loaded');
    }
    
    try {
      // Find widget
      const widget = this.currentDashboard.widgets.find(w => w.id === widgetId);
      if (!widget) {
        throw new NotFoundError(`Widget ${widgetId} not found`);
      }
      
      // Validate size
      if (!this.isValidSize(newSize)) {
        throw new ValidationError('Invalid widget size');
      }
      
      // Check for collisions
      const collisions = this.checkCollisions(widgetId, widget.position, newSize);
      if (collisions.length > 0) {
        throw new ValidationError('Resize would cause collisions');
      }
      
      // Record for undo
      this.recordState('resizeWidget');
      
      // Update size
      const oldSize = widget.size;
      widget.size = newSize;
      widget.modified = new Date().toISOString();
      
      // Track change
      this.trackChange('resizeWidget', { widgetId, newSize });
      
      // Broadcast if collaborative
      if (this.collaboration.isConnected()) {
        this.collaboration.broadcast({
          type: 'widgetResized',
          widgetId,
          newSize,
          userId: await this.getCurrentUser()
        });
      }
      
      // Emit event
      this.emit('widgetResized', { widget, oldSize, newSize });
      
      return widget;
      
    } catch (error) {
      this.emit('error', { action: 'resizeWidget', error });
      throw error;
    }
  }

  /**
   * Undo last action
   */
  async undo() {
    if (this.undoStack.length === 0) {
      return null;
    }
    
    try {
      // Get last state
      const previousState = this.undoStack.pop();
      
      // Save current state to redo stack
      this.redoStack.push(this.serializeState());
      
      // Restore previous state
      this.restoreState(previousState);
      
      // Track change
      this.trackChange('undo', { action: previousState.action });
      
      // Emit event
      this.emit('undo', previousState.action);
      
      return previousState.action;
      
    } catch (error) {
      this.emit('error', { action: 'undo', error });
      throw error;
    }
  }

  /**
   * Redo last undone action
   */
  async redo() {
    if (this.redoStack.length === 0) {
      return null;
    }
    
    try {
      // Get next state
      const nextState = this.redoStack.pop();
      
      // Save current state to undo stack
      this.undoStack.push(this.serializeState());
      
      // Restore next state
      this.restoreState(nextState);
      
      // Track change
      this.trackChange('redo', { action: nextState.action });
      
      // Emit event
      this.emit('redo', nextState.action);
      
      return nextState.action;
      
    } catch (error) {
      this.emit('error', { action: 'redo', error });
      throw error;
    }
  }

  /**
   * Share dashboard
   */
  async shareDashboard(shareConfig) {
    if (!this.currentDashboard) {
      throw new StateError('No dashboard loaded');
    }
    
    try {
      // Check permissions
      const hasAccess = await this.permissions.checkAccess(
        this.currentDashboard.id,
        'admin'
      );
      if (!hasAccess) {
        throw new PermissionError('Cannot share dashboard - insufficient permissions');
      }
      
      // Generate share link
      const shareLink = await this.generateShareLink(shareConfig);
      
      // Update permissions
      if (shareConfig.users) {
        for (const user of shareConfig.users) {
          await this.permissions.grantAccess(
            this.currentDashboard.id,
            user.id,
            user.role
          );
        }
      }
      
      // Update dashboard permissions
      if (shareConfig.public !== undefined) {
        this.currentDashboard.permissions.public = shareConfig.public;
      }
      
      // Save changes
      await this.saveDashboard({ createVersion: false });
      
      // Send notifications
      if (shareConfig.notify && shareConfig.users) {
        await this.sendShareNotifications(shareConfig.users, shareLink);
      }
      
      // Emit event
      this.emit('dashboardShared', { dashboard: this.currentDashboard, shareConfig });
      
      return shareLink;
      
    } catch (error) {
      this.emit('error', { action: 'shareDashboard', error });
      throw error;
    }
  }

  /**
   * Export dashboard
   */
  async exportDashboard(format = 'json') {
    if (!this.currentDashboard) {
      throw new StateError('No dashboard loaded');
    }
    
    try {
      let exportData;
      
      switch (format) {
        case 'json':
          exportData = JSON.stringify(this.currentDashboard, null, 2);
          break;
          
        case 'yaml':
          exportData = this.convertToYAML(this.currentDashboard);
          break;
          
        case 'template':
          exportData = this.createTemplate(this.currentDashboard);
          break;
          
        default:
          throw new ValidationError(`Unsupported export format: ${format}`);
      }
      
      // Emit event
      this.emit('dashboardExported', { format, size: exportData.length });
      
      return exportData;
      
    } catch (error) {
      this.emit('error', { action: 'exportDashboard', error });
      throw error;
    }
  }

  /**
   * Import dashboard
   */
  async importDashboard(data, format = 'json') {
    try {
      let dashboard;
      
      switch (format) {
        case 'json':
          dashboard = JSON.parse(data);
          break;
          
        case 'yaml':
          dashboard = this.parseYAML(data);
          break;
          
        case 'template':
          dashboard = this.instantiateTemplate(data);
          break;
          
        default:
          throw new ValidationError(`Unsupported import format: ${format}`);
      }
      
      // Generate new ID to avoid conflicts
      dashboard.id = this.generateId();
      dashboard.metadata.imported = new Date().toISOString();
      dashboard.metadata.importedFrom = dashboard.id;
      
      // Validate
      this.validateDashboard(dashboard);
      
      // Create as new dashboard
      this.currentDashboard = dashboard;
      await this.saveDashboard({ versionMessage: 'Imported dashboard' });
      
      // Emit event
      this.emit('dashboardImported', dashboard);
      
      return dashboard;
      
    } catch (error) {
      this.emit('error', { action: 'importDashboard', error });
      throw error;
    }
  }

  /**
   * Validation methods
   */
  validateDashboard(dashboard) {
    if (!dashboard.id || !dashboard.title) {
      throw new ValidationError('Dashboard must have ID and title');
    }
    
    if (!Array.isArray(dashboard.widgets)) {
      throw new ValidationError('Dashboard must have widgets array');
    }
    
    // Validate each widget
    dashboard.widgets.forEach(widget => this.validateWidget(widget));
    
    // Validate layout
    if (!dashboard.layout || !dashboard.layout.type) {
      throw new ValidationError('Dashboard must have valid layout');
    }
  }

  validateWidget(widget) {
    if (!widget.id || !widget.type) {
      throw new ValidationError('Widget must have ID and type');
    }
    
    if (!widget.position || typeof widget.position.x !== 'number' || 
        typeof widget.position.y !== 'number') {
      throw new ValidationError('Widget must have valid position');
    }
    
    if (!widget.size || typeof widget.size.width !== 'number' || 
        typeof widget.size.height !== 'number') {
      throw new ValidationError('Widget must have valid size');
    }
  }

  /**
   * Layout management
   */
  findAvailablePosition() {
    if (!this.currentDashboard) return { x: 0, y: 0 };
    
    const layout = this.currentDashboard.layout;
    const widgets = this.currentDashboard.widgets;
    
    // Find first available position
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < layout.columns; x++) {
        const position = { x, y };
        const size = { width: 4, height: 3 }; // Default size
        
        if (!this.hasCollisions(position, size, widgets)) {
          return position;
        }
      }
    }
    
    // Fallback to bottom
    return { x: 0, y: 100 };
  }

  isValidPosition(position, size) {
    const layout = this.currentDashboard.layout;
    
    return position.x >= 0 && 
           position.y >= 0 && 
           position.x + size.width <= layout.columns;
  }

  isValidSize(size) {
    return size.width > 0 && 
           size.width <= 12 && 
           size.height > 0 && 
           size.height <= 20;
  }

  checkCollisions(excludeWidgetId, position, size) {
    const collisions = [];
    
    for (const widget of this.currentDashboard.widgets) {
      if (widget.id === excludeWidgetId) continue;
      
      if (this.rectanglesOverlap(
        position, size,
        widget.position, widget.size
      )) {
        collisions.push(widget);
      }
    }
    
    return collisions;
  }

  hasCollisions(position, size, widgets) {
    return widgets.some(widget => 
      this.rectanglesOverlap(position, size, widget.position, widget.size)
    );
  }

  rectanglesOverlap(pos1, size1, pos2, size2) {
    return pos1.x < pos2.x + size2.width &&
           pos1.x + size1.width > pos2.x &&
           pos1.y < pos2.y + size2.height &&
           pos1.y + size1.height > pos2.y;
  }

  async resolveCollisions(collisions, movingWidgetId, newPosition) {
    // Simple resolution: move colliding widgets down
    for (const widget of collisions) {
      widget.position.y += 3; // Move down by 3 rows
    }
  }

  /**
   * State management
   */
  recordState(action) {
    // Limit undo stack size
    if (this.undoStack.length >= this.config.maxUndoStates) {
      this.undoStack.shift();
    }
    
    // Save current state
    this.undoStack.push({
      action,
      state: this.serializeState(),
      timestamp: Date.now()
    });
    
    // Clear redo stack
    this.redoStack = [];
  }

  serializeState() {
    return {
      dashboard: JSON.parse(JSON.stringify(this.currentDashboard)),
      timestamp: Date.now()
    };
  }

  restoreState(savedState) {
    this.currentDashboard = JSON.parse(JSON.stringify(savedState.state.dashboard));
  }

  clearUndoRedo() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Change tracking
   */
  startChangeTracking() {
    // Track all changes for auto-save and sync
    this.changeTracker = {
      startTime: Date.now(),
      changes: []
    };
  }

  trackChange(type, data) {
    if (!this.changeTracker) return;
    
    const change = {
      type,
      data,
      timestamp: Date.now(),
      userId: this.getCurrentUser()
    };
    
    this.changeTracker.changes.push(change);
    this.localChanges.set(change.timestamp, change);
    
    // Trigger auto-save if configured
    if (this.config.autoSaveInterval > 0) {
      this.scheduleAutoSave();
    }
  }

  /**
   * Auto-save functionality
   */
  startAutoSave() {
    this.autoSaveTimer = setInterval(() => {
      if (this.localChanges.size > 0) {
        this.saveDashboard({ createVersion: false })
          .catch(error => {
            console.error('Auto-save failed:', error);
            this.emit('autoSaveError', error);
          });
      }
    }, this.config.autoSaveInterval);
  }

  scheduleAutoSave() {
    // Debounce auto-save
    clearTimeout(this.pendingAutoSave);
    this.pendingAutoSave = setTimeout(() => {
      this.saveDashboard({ createVersion: false })
        .catch(error => {
          console.error('Auto-save failed:', error);
          this.emit('autoSaveError', error);
        });
    }, 5000); // 5 second delay
  }

  /**
   * Conflict resolution
   */
  async checkConflicts() {
    if (!this.currentDashboard) return [];
    
    // Get latest version from server
    const serverVersion = await this.storage.getVersion(this.currentDashboard.id);
    
    if (serverVersion.version <= this.currentDashboard.version) {
      return []; // No conflicts
    }
    
    // Find conflicting changes
    const conflicts = [];
    const serverChanges = serverVersion.changes || [];
    
    for (const localChange of this.localChanges.values()) {
      const conflictingChange = serverChanges.find(
        serverChange => this.changesConflict(localChange, serverChange)
      );
      
      if (conflictingChange) {
        conflicts.push({
          local: localChange,
          server: conflictingChange
        });
      }
    }
    
    return conflicts;
  }

  changesConflict(change1, change2) {
    // Same widget modified
    if (change1.data.widgetId && change1.data.widgetId === change2.data.widgetId) {
      return true;
    }
    
    // Dashboard settings modified
    if (change1.type === 'updateDashboard' && change2.type === 'updateDashboard') {
      return true;
    }
    
    return false;
  }

  async resolveConflicts(conflicts) {
    if (this.config.conflictResolution === 'last-write-wins') {
      return true; // Proceed with save
    }
    
    if (this.config.conflictResolution === 'merge') {
      // Attempt automatic merge
      return this.mergeConflicts(conflicts);
    }
    
    // Manual resolution
    const resolution = await this.promptConflictResolution(conflicts);
    return resolution === 'overwrite';
  }

  /**
   * Collaboration setup
   */
  setupCollaborationHandlers() {
    // Handle remote changes
    this.collaboration.on('change', (change) => {
      this.handleRemoteChange(change);
    });
    
    // Handle user presence
    this.collaboration.on('presence', (presence) => {
      this.emit('userPresence', presence);
    });
    
    // Handle disconnection
    this.collaboration.on('disconnect', () => {
      this.emit('collaborationDisconnected');
    });
  }

  handleRemoteChange(change) {
    // Apply remote change
    switch (change.type) {
      case 'widgetAdded':
        this.applyRemoteWidgetAdd(change);
        break;
        
      case 'widgetUpdated':
        this.applyRemoteWidgetUpdate(change);
        break;
        
      case 'widgetRemoved':
        this.applyRemoteWidgetRemove(change);
        break;
        
      case 'widgetMoved':
        this.applyRemoteWidgetMove(change);
        break;
    }
    
    // Track remote change
    this.remoteChanges.set(change.timestamp, change);
    
    // Emit event
    this.emit('remoteChange', change);
  }

  /**
   * Utility methods
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async getCurrentUser() {
    // In real implementation, get from auth service
    return this.config.currentUser || 'anonymous';
  }

  async generateShareLink(shareConfig) {
    const token = this.generateId();
    const baseUrl = this.config.baseUrl || window.location.origin;
    
    return `${baseUrl}/dashboard/${this.currentDashboard.id}?token=${token}`;
  }

  async sendShareNotifications(users, shareLink) {
    // In real implementation, send emails/notifications
    console.log('Sending share notifications to:', users);
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
   * Cleanup
   */
  dispose() {
    // Stop timers
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    if (this.pendingAutoSave) {
      clearTimeout(this.pendingAutoSave);
    }
    
    // Disconnect collaboration
    if (this.collaboration) {
      this.collaboration.disconnect();
    }
    
    // Clear state
    this.currentDashboard = null;
    this.undoStack = [];
    this.redoStack = [];
    this.localChanges.clear();
    this.remoteChanges.clear();
    this.listeners.clear();
  }
}

/**
 * Dashboard Storage
 */
class DashboardStorage {
  constructor(config = {}) {
    this.config = config;
    this.cache = new Map();
  }

  async save(dashboard) {
    // In real implementation, save to backend
    this.cache.set(dashboard.id, JSON.parse(JSON.stringify(dashboard)));
    
    // Also save to localStorage for offline support
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`dashboard-${dashboard.id}`, JSON.stringify(dashboard));
    }
    
    return dashboard;
  }

  async load(dashboardId) {
    // Check cache
    if (this.cache.has(dashboardId)) {
      return JSON.parse(JSON.stringify(this.cache.get(dashboardId)));
    }
    
    // Check localStorage
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(`dashboard-${dashboardId}`);
      if (stored) {
        const dashboard = JSON.parse(stored);
        this.cache.set(dashboardId, dashboard);
        return dashboard;
      }
    }
    
    // In real implementation, load from backend
    throw new NotFoundError(`Dashboard ${dashboardId} not found`);
  }

  async getVersion(dashboardId) {
    const dashboard = await this.load(dashboardId);
    return {
      version: dashboard.version,
      changes: []
    };
  }
}

/**
 * Version Control
 */
class DashboardVersionControl {
  constructor(config = {}) {
    this.config = config;
    this.versions = new Map();
  }

  async createVersion(dashboard, message) {
    const version = {
      id: this.generateVersionId(),
      dashboardId: dashboard.id,
      version: dashboard.version,
      snapshot: JSON.parse(JSON.stringify(dashboard)),
      message,
      author: dashboard.metadata.author,
      created: new Date().toISOString()
    };
    
    // Store version
    if (!this.versions.has(dashboard.id)) {
      this.versions.set(dashboard.id, []);
    }
    
    this.versions.get(dashboard.id).push(version);
    
    // Limit versions
    const versions = this.versions.get(dashboard.id);
    if (versions.length > this.config.maxVersions) {
      versions.shift();
    }
    
    return version;
  }

  async getVersion(dashboardId, versionId) {
    const versions = this.versions.get(dashboardId) || [];
    const version = versions.find(v => v.id === versionId);
    
    if (!version) {
      throw new NotFoundError(`Version ${versionId} not found`);
    }
    
    return version.snapshot;
  }

  generateVersionId() {
    return `v-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Collaboration Manager
 */
class CollaborationManager {
  constructor(config = {}) {
    this.config = config;
    this.connected = false;
    this.session = null;
    this.listeners = new Map();
  }

  async connect() {
    // In real implementation, connect to WebSocket server
    this.connected = true;
  }

  async joinSession(dashboardId) {
    this.session = { dashboardId };
  }

  isConnected() {
    return this.connected;
  }

  broadcast(message) {
    // In real implementation, send via WebSocket
    console.log('Broadcasting:', message);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  disconnect() {
    this.connected = false;
    this.session = null;
  }
}

/**
 * Permission Manager
 */
class PermissionManager {
  constructor(config = {}) {
    this.config = config;
    this.permissions = new Map();
  }

  async checkAccess(dashboardId, level) {
    // In real implementation, check with backend
    return true;
  }

  async grantAccess(dashboardId, userId, role) {
    const key = `${dashboardId}-${userId}`;
    this.permissions.set(key, role);
  }
}

/**
 * Error Types
 */
class StateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StateError';
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DashboardStateManager,
    DashboardStorage,
    DashboardVersionControl,
    CollaborationManager,
    PermissionManager,
    // Error types
    StateError,
    ValidationError,
    PermissionError,
    NotFoundError,
    ConflictError
  };
}