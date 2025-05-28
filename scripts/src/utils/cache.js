const NodeCache = require('node-cache');
const crypto = require('crypto');
const { logger } = require('./logger.js');

class Cache {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.ttl = options.ttl || 3600; // 1 hour default
    
    if (this.enabled) {
      this.cache = new NodeCache({
        stdTTL: this.ttl,
        checkperiod: 120, // Check for expired keys every 2 minutes
        useClones: false // For better performance
      });

      // Log cache statistics periodically in debug mode
      this.cache.on('expired', (key, value) => {
        logger.debug(`Cache key expired: ${key}`);
      });

      this.cache.on('del', (key, value) => {
        logger.debug(`Cache key deleted: ${key}`);
      });
    }
  }

  generateKey(prefix, ...args) {
    const data = JSON.stringify(args);
    const hash = crypto.createHash('md5').update(data).digest('hex');
    return `${prefix}:${hash}`;
  }

  async get(key, fetchFunction, ttl = null) {
    if (!this.enabled) {
      return await fetchFunction();
    }

    let value = this.cache.get(key);
    
    if (value === undefined) {
      logger.debug(`Cache miss for key: ${key}`);
      value = await fetchFunction();
      
      if (value !== null && value !== undefined) {
        this.cache.set(key, value, ttl || this.ttl);
        logger.debug(`Cached value for key: ${key}`);
      }
    } else {
      logger.debug(`Cache hit for key: ${key}`);
    }

    return value;
  }

  set(key, value, ttl = null) {
    if (!this.enabled) return;
    
    this.cache.set(key, value, ttl || this.ttl);
    logger.debug(`Set cache key: ${key}`);
  }

  del(key) {
    if (!this.enabled) return;
    
    this.cache.del(key);
    logger.debug(`Deleted cache key: ${key}`);
  }

  flush() {
    if (!this.enabled) return;
    
    this.cache.flushAll();
    logger.debug('Flushed all cache entries');
  }

  getStats() {
    if (!this.enabled) {
      return { enabled: false };
    }

    const stats = this.cache.getStats();
    return {
      enabled: true,
      keys: this.cache.keys().length,
      hits: stats.hits,
      misses: stats.misses,
      ksize: stats.ksize,
      vsize: stats.vsize
    };
  }

  // Cache decorator for methods
  static memoize(prefix, ttl = null) {
    return function(target, propertyKey, descriptor) {
      const originalMethod = descriptor.value;

      descriptor.value = async function(...args) {
        const cache = this.cache;
        if (!cache || !cache.enabled) {
          return await originalMethod.apply(this, args);
        }

        const key = cache.generateKey(`${prefix}:${propertyKey}`, ...args);
        return await cache.get(key, () => originalMethod.apply(this, args), ttl);
      };

      return descriptor;
    };
  }
}

module.exports = { Cache };