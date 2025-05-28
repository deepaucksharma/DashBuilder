const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class WebSocketManager extends EventEmitter {
  constructor(server) {
    super();
    this.server = server;
    this.wss = null;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.rooms = new Map();
  }

  start() {
    this.wss = new WebSocket.Server({ 
      server: this.server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this),
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Heartbeat to detect disconnected clients
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    logger.info('WebSocket server started');
  }

  stop() {
    clearInterval(this.heartbeatInterval);
    
    // Close all connections
    this.wss.clients.forEach((ws) => {
      ws.close(1000, 'Server shutting down');
    });
    
    this.wss.close(() => {
      logger.info('WebSocket server stopped');
    });
  }

  verifyClient(info, cb) {
    const token = this.extractToken(info.req);
    
    if (!token) {
      cb(false, 401, 'Unauthorized');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret);
      info.req.user = decoded;
      cb(true);
    } catch (error) {
      cb(false, 401, 'Invalid token');
    }
  }

  extractToken(req) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      return auth.substring(7);
    }
    
    // Check query params as fallback
    const url = new URL(req.url, `http://${req.headers.host}`);
    return url.searchParams.get('token');
  }

  handleConnection(ws, req) {
    const clientId = uuidv4();
    const userId = req.user.id;
    
    // Setup client
    ws.id = clientId;
    ws.userId = userId;
    ws.isAlive = true;
    ws.subscriptions = new Set();
    
    this.clients.set(clientId, {
      ws,
      userId,
      subscriptions: ws.subscriptions,
    });

    // Setup event handlers
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });

    // Send welcome message
    this.send(ws, {
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString(),
    });

    logger.info(`WebSocket client connected: ${clientId}`);
  }

  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(ws, message);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscribe(ws, message);
          break;
          
        case 'join':
          this.handleJoinRoom(ws, message);
          break;
          
        case 'leave':
          this.handleLeaveRoom(ws, message);
          break;
          
        case 'broadcast':
          this.handleBroadcast(ws, message);
          break;
          
        case 'ping':
          this.send(ws, { type: 'pong', timestamp: Date.now() });
          break;
          
        default:
          this.emit('message', { ws, message });
      }
    } catch (error) {
      logger.error('Error handling message:', error);
      this.send(ws, {
        type: 'error',
        message: 'Invalid message format',
      });
    }
  }

  handleSubscribe(ws, message) {
    const { channel, params } = message;
    
    if (!channel) {
      this.send(ws, {
        type: 'error',
        message: 'Channel required for subscription',
      });
      return;
    }

    // Add subscription
    ws.subscriptions.add(channel);
    
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel).add(ws.id);

    this.send(ws, {
      type: 'subscribed',
      channel,
      params,
    });

    // Emit event for external handlers
    this.emit('subscribe', { clientId: ws.id, channel, params });
  }

  handleUnsubscribe(ws, message) {
    const { channel } = message;
    
    if (!channel || !ws.subscriptions.has(channel)) {
      return;
    }

    ws.subscriptions.delete(channel);
    
    const subscribers = this.subscriptions.get(channel);
    if (subscribers) {
      subscribers.delete(ws.id);
      if (subscribers.size === 0) {
        this.subscriptions.delete(channel);
      }
    }

    this.send(ws, {
      type: 'unsubscribed',
      channel,
    });

    this.emit('unsubscribe', { clientId: ws.id, channel });
  }

  handleJoinRoom(ws, message) {
    const { room } = message;
    
    if (!room) {
      this.send(ws, {
        type: 'error',
        message: 'Room name required',
      });
      return;
    }

    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    
    this.rooms.get(room).add(ws.id);
    ws.rooms = ws.rooms || new Set();
    ws.rooms.add(room);

    this.send(ws, {
      type: 'joined',
      room,
      members: this.rooms.get(room).size,
    });

    // Notify other room members
    this.broadcastToRoom(room, {
      type: 'member_joined',
      room,
      userId: ws.userId,
      members: this.rooms.get(room).size,
    }, ws.id);
  }

  handleLeaveRoom(ws, message) {
    const { room } = message;
    
    if (!room || !ws.rooms || !ws.rooms.has(room)) {
      return;
    }

    ws.rooms.delete(room);
    const roomMembers = this.rooms.get(room);
    if (roomMembers) {
      roomMembers.delete(ws.id);
      if (roomMembers.size === 0) {
        this.rooms.delete(room);
      } else {
        // Notify remaining members
        this.broadcastToRoom(room, {
          type: 'member_left',
          room,
          userId: ws.userId,
          members: roomMembers.size,
        });
      }
    }

    this.send(ws, {
      type: 'left',
      room,
    });
  }

  handleBroadcast(ws, message) {
    const { room, data } = message;
    
    if (!room || !ws.rooms || !ws.rooms.has(room)) {
      this.send(ws, {
        type: 'error',
        message: 'Not a member of the room',
      });
      return;
    }

    this.broadcastToRoom(room, {
      type: 'room_message',
      room,
      userId: ws.userId,
      data,
      timestamp: new Date().toISOString(),
    }, ws.id);
  }

  handleDisconnect(ws) {
    const clientId = ws.id;
    
    // Clean up subscriptions
    ws.subscriptions.forEach((channel) => {
      const subscribers = this.subscriptions.get(channel);
      if (subscribers) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          this.subscriptions.delete(channel);
        }
      }
    });

    // Clean up rooms
    if (ws.rooms) {
      ws.rooms.forEach((room) => {
        const roomMembers = this.rooms.get(room);
        if (roomMembers) {
          roomMembers.delete(clientId);
          if (roomMembers.size === 0) {
            this.rooms.delete(room);
          } else {
            // Notify remaining members
            this.broadcastToRoom(room, {
              type: 'member_disconnected',
              room,
              userId: ws.userId,
              members: roomMembers.size,
            });
          }
        }
      });
    }

    this.clients.delete(clientId);
    logger.info(`WebSocket client disconnected: ${clientId}`);
  }

  // Public methods for external use

  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (client) {
      this.send(client.ws, data);
    }
  }

  broadcast(data) {
    this.wss.clients.forEach((ws) => {
      this.send(ws, data);
    });
  }

  broadcastToChannel(channel, data) {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers) return;

    subscribers.forEach((clientId) => {
      const client = this.clients.get(clientId);
      if (client) {
        this.send(client.ws, {
          type: 'channel_message',
          channel,
          data,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  broadcastToRoom(room, data, excludeClientId = null) {
    const roomMembers = this.rooms.get(room);
    if (!roomMembers) return;

    roomMembers.forEach((clientId) => {
      if (clientId !== excludeClientId) {
        const client = this.clients.get(clientId);
        if (client) {
          this.send(client.ws, data);
        }
      }
    });
  }

  getChannelSubscribers(channel) {
    return this.subscriptions.get(channel) || new Set();
  }

  getRoomMembers(room) {
    return this.rooms.get(room) || new Set();
  }

  getClientInfo(clientId) {
    return this.clients.get(clientId);
  }
}

module.exports = WebSocketManager;