const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

class CacheManager {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.connected = false;
    this.defaultTTL = config.redis.ttl;
  }

  async connect() {
    try {
      // Main client for get/set operations
      this.client = new Redis(config.redis.url, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      // Separate clients for pub/sub
      this.publisher = new Redis(config.redis.url);
      this.subscriber = new Redis(config.redis.url);

      // Event handlers
      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.connected = true;
      });

      this.client.on('error', (error) => {
        logger.error('Redis client error:', error);
      });

      this.client.on('close', () => {
        logger.warn('Redis client connection closed');
        this.connected = false;
      });

      // Wait for connection
      await this.client.ping();
      
      return true;
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
      }
      if (this.publisher) {
        await this.publisher.quit();
      }
      if (this.subscriber) {
        await this.subscriber.quit();
      }
      this.connected = false;
      logger.info('Redis clients disconnected');
    } catch (error) {
      logger.error('Error disconnecting Redis:', error);
    }
  }

  // Basic cache operations
  async get(key) {
    try {
      if (!this.connected) {
        logger.warn('Redis not connected, skipping cache get');
        return null;
      }

      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = null) {
    try {
      if (!this.connected) {
        logger.warn('Redis not connected, skipping cache set');
        return false;
      }

      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;

      if (expiry > 0) {
        await this.client.setex(key, expiry, serialized);
      } else {
        await this.client.set(key, serialized);
      }

      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      if (!this.connected) {
        return false;
      }

      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  async exists(key) {
    try {
      if (!this.connected) {
        return false;
      }

      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  async expire(key, seconds) {
    try {
      if (!this.connected) {
        return false;
      }

      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  }

  // Pattern operations
  async keys(pattern) {
    try {
      if (!this.connected) {
        return [];
      }

      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  }

  async deletePattern(pattern) {
    try {
      if (!this.connected) {
        return 0;
      }

      const keys = await this.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      return await this.client.del(...keys);
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  // Hash operations
  async hget(key, field) {
    try {
      if (!this.connected) {
        return null;
      }

      const value = await this.client.hget(key, field);
      if (!value) {
        return null;
      }

      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error('Cache hget error:', error);
      return null;
    }
  }

  async hset(key, field, value) {
    try {
      if (!this.connected) {
        return false;
      }

      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.client.hset(key, field, serialized);
      return true;
    } catch (error) {
      logger.error('Cache hset error:', error);
      return false;
    }
  }

  async hgetall(key) {
    try {
      if (!this.connected) {
        return {};
      }

      const hash = await this.client.hgetall(key);
      const result = {};

      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }

      return result;
    } catch (error) {
      logger.error('Cache hgetall error:', error);
      return {};
    }
  }

  // List operations
  async lpush(key, ...values) {
    try {
      if (!this.connected) {
        return 0;
      }

      const serialized = values.map(v => 
        typeof v === 'string' ? v : JSON.stringify(v)
      );
      return await this.client.lpush(key, ...serialized);
    } catch (error) {
      logger.error('Cache lpush error:', error);
      return 0;
    }
  }

  async lrange(key, start, stop) {
    try {
      if (!this.connected) {
        return [];
      }

      const values = await this.client.lrange(key, start, stop);
      return values.map(v => {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      });
    } catch (error) {
      logger.error('Cache lrange error:', error);
      return [];
    }
  }

  // Set operations
  async sadd(key, ...members) {
    try {
      if (!this.connected) {
        return 0;
      }

      const serialized = members.map(m => 
        typeof m === 'string' ? m : JSON.stringify(m)
      );
      return await this.client.sadd(key, ...serialized);
    } catch (error) {
      logger.error('Cache sadd error:', error);
      return 0;
    }
  }

  async smembers(key) {
    try {
      if (!this.connected) {
        return [];
      }

      const members = await this.client.smembers(key);
      return members.map(m => {
        try {
          return JSON.parse(m);
        } catch {
          return m;
        }
      });
    } catch (error) {
      logger.error('Cache smembers error:', error);
      return [];
    }
  }

  // Pub/Sub operations
  async publish(channel, message) {
    try {
      if (!this.connected) {
        return 0;
      }

      const serialized = typeof message === 'string' ? message : JSON.stringify(message);
      return await this.publisher.publish(channel, serialized);
    } catch (error) {
      logger.error('Cache publish error:', error);
      return 0;
    }
  }

  async subscribe(channel, callback) {
    try {
      if (!this.connected) {
        return false;
      }

      await this.subscriber.subscribe(channel);
      
      this.subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsed = JSON.parse(message);
            callback(parsed);
          } catch {
            callback(message);
          }
        }
      });

      return true;
    } catch (error) {
      logger.error('Cache subscribe error:', error);
      return false;
    }
  }

  async unsubscribe(channel) {
    try {
      if (!this.connected) {
        return false;
      }

      await this.subscriber.unsubscribe(channel);
      return true;
    } catch (error) {
      logger.error('Cache unsubscribe error:', error);
      return false;
    }
  }

  // Utility methods
  async flush() {
    try {
      if (!this.connected) {
        return false;
      }

      await this.client.flushdb();
      logger.warn('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  async ping() {
    try {
      if (!this.connected) {
        return false;
      }

      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  // Cache decorators
  async remember(key, ttl, callback) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await callback();
    await this.set(key, fresh, ttl);
    return fresh;
  }

  async invalidate(tags) {
    const tagArray = Array.isArray(tags) ? tags : [tags];
    const promises = tagArray.map(tag => this.deletePattern(`*:${tag}:*`));
    await Promise.all(promises);
  }
}

module.exports = CacheManager;