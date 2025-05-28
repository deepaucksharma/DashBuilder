const express = require('express');
const axios = require('axios');
const Joi = require('joi');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

const router = express.Router();

// Validation schemas
const nerdGraphQuerySchema = Joi.object({
  query: Joi.string().required(),
  variables: Joi.object().optional(),
});

const nrqlQuerySchema = Joi.object({
  accountId: Joi.number().required(),
  query: Joi.string().required(),
});

// NerdGraph proxy endpoint
router.post('/query', async (req, res, next) => {
  try {
    const { error, value } = nerdGraphQuerySchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    const { query, variables } = value;
    const cache = req.app.locals.cache;
    
    // Check cache
    const cacheKey = `nerdgraph:${JSON.stringify({ query, variables })}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Execute query
    const response = await axios.post(
      config.newRelic.nerdGraphEndpoint,
      { query, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': config.newRelic.apiKey,
        },
        timeout: 30000,
      }
    );

    if (response.data.errors) {
      logger.error('NerdGraph errors:', response.data.errors);
      throw new AppError('NerdGraph query failed', 400, response.data.errors);
    }

    // Cache successful response
    await cache.set(cacheKey, response.data, 300); // 5 minutes

    res.json(response.data);
  } catch (error) {
    next(error);
  }
});

// NRQL query endpoint
router.post('/nrql', async (req, res, next) => {
  try {
    const { error, value } = nrqlQuerySchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    const { accountId, query } = value;
    const cache = req.app.locals.cache;
    
    // Check cache
    const cacheKey = `nrql:${accountId}:${query}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Build NerdGraph query for NRQL
    const nerdGraphQuery = `
      query NrqlQuery($accountId: Int!, $query: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $query) {
              results
              metadata {
                timeWindow {
                  begin
                  end
                }
                messages
                facets
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      config.newRelic.nerdGraphEndpoint,
      {
        query: nerdGraphQuery,
        variables: { accountId, query },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': config.newRelic.apiKey,
        },
        timeout: 30000,
      }
    );

    if (response.data.errors) {
      logger.error('NRQL query errors:', response.data.errors);
      throw new AppError('NRQL query failed', 400, response.data.errors);
    }

    const results = response.data.data?.actor?.account?.nrql;
    if (!results) {
      throw new AppError('No results returned from NRQL query', 404);
    }

    // Cache successful response
    await cache.set(cacheKey, results, 60); // 1 minute for NRQL

    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Batch NRQL queries
router.post('/nrql/batch', async (req, res, next) => {
  try {
    const { accountId, queries } = req.body;
    
    if (!Array.isArray(queries) || queries.length === 0) {
      throw new AppError('Queries must be a non-empty array', 400);
    }
    
    if (queries.length > 10) {
      throw new AppError('Maximum 10 queries allowed in batch', 400);
    }

    const promises = queries.map(async (query, index) => {
      try {
        const result = await executeNrqlQuery(accountId, query, req.app.locals.cache);
        return { index, success: true, data: result };
      } catch (error) {
        return { index, success: false, error: error.message };
      }
    });

    const results = await Promise.all(promises);
    res.json({ results });
  } catch (error) {
    next(error);
  }
});

// Helper function to execute NRQL query
async function executeNrqlQuery(accountId, query, cache) {
  const cacheKey = `nrql:${accountId}:${query}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const nerdGraphQuery = `
    query NrqlQuery($accountId: Int!, $query: Nrql!) {
      actor {
        account(id: $accountId) {
          nrql(query: $query) {
            results
          }
        }
      }
    }
  `;

  const response = await axios.post(
    config.newRelic.nerdGraphEndpoint,
    {
      query: nerdGraphQuery,
      variables: { accountId, query },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': config.newRelic.apiKey,
      },
      timeout: 30000,
    }
  );

  if (response.data.errors) {
    throw new Error(response.data.errors[0].message);
  }

  const results = response.data.data?.actor?.account?.nrql?.results;
  await cache.set(cacheKey, results, 60);
  
  return results;
}

module.exports = router;