const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { AppError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const saveQuerySchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  description: Joi.string().optional().max(1000),
  query: Joi.string().required(),
  type: Joi.string().valid('nrql', 'graphql').default('nrql'),
  tags: Joi.array().items(Joi.string()).optional(),
  isPublic: Joi.boolean().default(false),
});

const updateQuerySchema = Joi.object({
  name: Joi.string().optional().min(1).max(255),
  description: Joi.string().optional().max(1000),
  query: Joi.string().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  isPublic: Joi.boolean().optional(),
});

// Save query
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = saveQuerySchema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const cache = req.app.locals.cache;
    const queryId = uuidv4();
    const savedQuery = {
      id: queryId,
      userId: req.user.id,
      accountId: req.user.accountId,
      ...value,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionCount: 0,
      lastExecuted: null,
    };

    // Save to cache (in production, use database)
    await cache.hset(`queries:${req.user.id}`, queryId, savedQuery);
    
    // Add to user's query list
    await cache.sadd(`user:${req.user.id}:queries`, queryId);
    
    // If public, add to public queries
    if (value.isPublic) {
      await cache.sadd('queries:public', queryId);
    }

    // Index by tags
    if (value.tags && value.tags.length > 0) {
      for (const tag of value.tags) {
        await cache.sadd(`queries:tag:${tag}`, queryId);
      }
    }

    logger.logAudit('query_saved', req.user.id, { queryId, name: value.name });

    res.status(201).json({
      success: true,
      query: savedQuery,
    });
  } catch (error) {
    next(error);
  }
});

// Get user's queries
router.get('/', async (req, res, next) => {
  try {
    const { tag, search, limit = 20, offset = 0 } = req.query;
    const cache = req.app.locals.cache;
    
    // Get user's query IDs
    let queryIds = await cache.smembers(`user:${req.user.id}:queries`);
    
    // Filter by tag if provided
    if (tag) {
      const taggedIds = await cache.smembers(`queries:tag:${tag}`);
      queryIds = queryIds.filter(id => taggedIds.includes(id));
    }

    // Get query details
    const queries = [];
    for (const queryId of queryIds) {
      const query = await cache.hget(`queries:${req.user.id}`, queryId);
      if (query) {
        // Filter by search if provided
        if (search) {
          const searchLower = search.toLowerCase();
          if (
            query.name.toLowerCase().includes(searchLower) ||
            query.description?.toLowerCase().includes(searchLower) ||
            query.query.toLowerCase().includes(searchLower)
          ) {
            queries.push(query);
          }
        } else {
          queries.push(query);
        }
      }
    }

    // Sort by updated date
    queries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // Paginate
    const paginatedQueries = queries.slice(
      parseInt(offset),
      parseInt(offset) + parseInt(limit)
    );

    res.json({
      success: true,
      queries: paginatedQueries,
      total: queries.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
});

// Get public queries
router.get('/public', async (req, res, next) => {
  try {
    const { tag, search, limit = 20, offset = 0 } = req.query;
    const cache = req.app.locals.cache;
    
    // Get public query IDs
    let queryIds = await cache.smembers('queries:public');
    
    // Filter by tag if provided
    if (tag) {
      const taggedIds = await cache.smembers(`queries:tag:${tag}`);
      queryIds = queryIds.filter(id => taggedIds.includes(id));
    }

    // Get query details from all users
    const queries = [];
    for (const queryId of queryIds) {
      // Need to find which user owns this query
      const users = await cache.keys('queries:*');
      for (const userKey of users) {
        if (!userKey.includes(':tag:')) {
          const query = await cache.hget(userKey, queryId);
          if (query && query.isPublic) {
            // Filter by search if provided
            if (search) {
              const searchLower = search.toLowerCase();
              if (
                query.name.toLowerCase().includes(searchLower) ||
                query.description?.toLowerCase().includes(searchLower) ||
                query.query.toLowerCase().includes(searchLower)
              ) {
                queries.push(query);
              }
            } else {
              queries.push(query);
            }
            break;
          }
        }
      }
    }

    // Sort by execution count and updated date
    queries.sort((a, b) => {
      if (b.executionCount !== a.executionCount) {
        return b.executionCount - a.executionCount;
      }
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    // Paginate
    const paginatedQueries = queries.slice(
      parseInt(offset),
      parseInt(offset) + parseInt(limit)
    );

    res.json({
      success: true,
      queries: paginatedQueries,
      total: queries.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
});

// Get query by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const cache = req.app.locals.cache;
    
    // Try to get from user's queries first
    let query = await cache.hget(`queries:${req.user.id}`, id);
    
    // If not found, check if it's a public query
    if (!query) {
      const isPublic = await cache.sismember('queries:public', id);
      if (isPublic) {
        // Find in all users
        const users = await cache.keys('queries:*');
        for (const userKey of users) {
          if (!userKey.includes(':tag:')) {
            query = await cache.hget(userKey, id);
            if (query && query.isPublic) {
              break;
            }
          }
        }
      }
    }

    if (!query) {
      throw new AppError('Query not found', 404);
    }

    // Check access permissions
    if (!query.isPublic && query.userId !== req.user.id) {
      throw new AppError('Access denied', 403);
    }

    res.json({
      success: true,
      query,
    });
  } catch (error) {
    next(error);
  }
});

// Update query
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error, value } = updateQuerySchema.validate(req.body);
    if (error) {
      throw new ValidationError(error.details[0].message);
    }

    const cache = req.app.locals.cache;
    
    // Get existing query
    const query = await cache.hget(`queries:${req.user.id}`, id);
    if (!query) {
      throw new AppError('Query not found', 404);
    }

    // Check ownership
    if (query.userId !== req.user.id) {
      throw new AppError('Access denied', 403);
    }

    // Update query
    const updatedQuery = {
      ...query,
      ...value,
      updatedAt: new Date().toISOString(),
    };

    // Handle public/private change
    if (value.isPublic !== undefined && value.isPublic !== query.isPublic) {
      if (value.isPublic) {
        await cache.sadd('queries:public', id);
      } else {
        await cache.srem('queries:public', id);
      }
    }

    // Handle tag changes
    if (value.tags !== undefined) {
      // Remove from old tags
      if (query.tags) {
        for (const tag of query.tags) {
          await cache.srem(`queries:tag:${tag}`, id);
        }
      }
      // Add to new tags
      if (value.tags.length > 0) {
        for (const tag of value.tags) {
          await cache.sadd(`queries:tag:${tag}`, id);
        }
      }
    }

    // Save updated query
    await cache.hset(`queries:${req.user.id}`, id, updatedQuery);

    logger.logAudit('query_updated', req.user.id, { queryId: id });

    res.json({
      success: true,
      query: updatedQuery,
    });
  } catch (error) {
    next(error);
  }
});

// Delete query
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const cache = req.app.locals.cache;
    
    // Get query
    const query = await cache.hget(`queries:${req.user.id}`, id);
    if (!query) {
      throw new AppError('Query not found', 404);
    }

    // Check ownership
    if (query.userId !== req.user.id) {
      throw new AppError('Access denied', 403);
    }

    // Remove from various sets
    await cache.hdel(`queries:${req.user.id}`, id);
    await cache.srem(`user:${req.user.id}:queries`, id);
    await cache.srem('queries:public', id);
    
    // Remove from tags
    if (query.tags) {
      for (const tag of query.tags) {
        await cache.srem(`queries:tag:${tag}`, id);
      }
    }

    logger.logAudit('query_deleted', req.user.id, { queryId: id, name: query.name });

    res.json({
      success: true,
      message: 'Query deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Execute saved query
router.post('/:id/execute', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;
    const cache = req.app.locals.cache;
    
    // Get query
    let query = await cache.hget(`queries:${req.user.id}`, id);
    let isOwnQuery = true;
    
    if (!query) {
      // Check if it's a public query
      const isPublic = await cache.sismember('queries:public', id);
      if (isPublic) {
        // Find in all users
        const users = await cache.keys('queries:*');
        for (const userKey of users) {
          if (!userKey.includes(':tag:')) {
            query = await cache.hget(userKey, id);
            if (query && query.isPublic) {
              isOwnQuery = false;
              break;
            }
          }
        }
      }
    }

    if (!query) {
      throw new AppError('Query not found', 404);
    }

    // Update execution stats
    query.executionCount = (query.executionCount || 0) + 1;
    query.lastExecuted = new Date().toISOString();
    
    if (isOwnQuery) {
      await cache.hset(`queries:${req.user.id}`, id, query);
    }

    // Forward to appropriate endpoint based on type
    const forwardReq = {
      ...req,
      body: query.type === 'nrql' 
        ? { accountId: req.user.accountId, query: query.query }
        : { query: query.query, variables },
    };

    // Import the route handler
    const nerdgraphRoutes = require('./nerdgraph');
    const endpoint = query.type === 'nrql' ? '/nrql' : '/query';
    
    // Find and execute the handler
    const route = nerdgraphRoutes.stack.find(r => 
      r.route && r.route.path === endpoint && r.route.methods.post
    );

    if (route) {
      // Execute the handler
      route.route.stack[0].handle(forwardReq, res, next);
    } else {
      throw new AppError('Query execution failed', 500);
    }
  } catch (error) {
    next(error);
  }
});

// Get popular tags
router.get('/tags/popular', async (req, res, next) => {
  try {
    const cache = req.app.locals.cache;
    const { limit = 10 } = req.query;
    
    // Get all tag keys
    const tagKeys = await cache.keys('queries:tag:*');
    const tags = [];
    
    for (const key of tagKeys) {
      const tag = key.replace('queries:tag:', '');
      const count = await cache.scard(key);
      tags.push({ tag, count });
    }
    
    // Sort by count and limit
    tags.sort((a, b) => b.count - a.count);
    const popularTags = tags.slice(0, parseInt(limit));

    res.json({
      success: true,
      tags: popularTags,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;