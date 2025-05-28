const express = require('express');
const axios = require('axios');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const createDashboardSchema = Joi.object({
  name: Joi.string().required().min(1).max(255),
  description: Joi.string().optional().max(1000),
  widgets: Joi.array().items(Joi.object({
    id: Joi.string().optional(),
    type: Joi.string().required(),
    title: Joi.string().required(),
    query: Joi.string().required(),
    config: Joi.object().optional(),
    layout: Joi.object({
      x: Joi.number().required(),
      y: Joi.number().required(),
      w: Joi.number().required(),
      h: Joi.number().required(),
    }).required(),
  })).required(),
  settings: Joi.object().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
});

const updateDashboardSchema = Joi.object({
  name: Joi.string().optional().min(1).max(255),
  description: Joi.string().optional().max(1000),
  widgets: Joi.array().items(Joi.object({
    id: Joi.string().optional(),
    type: Joi.string().required(),
    title: Joi.string().required(),
    query: Joi.string().required(),
    config: Joi.object().optional(),
    layout: Joi.object({
      x: Joi.number().required(),
      y: Joi.number().required(),
      w: Joi.number().required(),
      h: Joi.number().required(),
    }).required(),
  })).optional(),
  settings: Joi.object().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
});

// Create dashboard
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createDashboardSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    const { name, description, widgets, settings, tags } = value;
    const accountId = req.user.accountId;

    // Generate widget IDs if not provided
    const widgetsWithIds = widgets.map(widget => ({
      ...widget,
      id: widget.id || uuidv4(),
    }));

    // Create dashboard using NerdGraph
    const mutation = `
      mutation CreateDashboard($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
            accountId
            createdAt
            updatedAt
            permalink
            permissions
            pages {
              guid
              name
              widgets {
                id
                title
                layout {
                  row
                  column
                  width
                  height
                }
                configuration {
                  area {
                    nrqlQueries {
                      query
                    }
                  }
                  bar {
                    nrqlQueries {
                      query
                    }
                  }
                  line {
                    nrqlQueries {
                      query
                    }
                  }
                  pie {
                    nrqlQueries {
                      query
                    }
                  }
                  table {
                    nrqlQueries {
                      query
                    }
                  }
                }
              }
            }
          }
          errors {
            type
            description
          }
        }
      }
    `;

    // Convert our format to NerdGraph format
    const dashboardInput = {
      name,
      description,
      permissions: 'PUBLIC_READ_WRITE',
      pages: [{
        name: 'Page 1',
        widgets: widgetsWithIds.map(widget => ({
          title: widget.title,
          layout: {
            row: widget.layout.y,
            column: widget.layout.x,
            width: widget.layout.w,
            height: widget.layout.h,
          },
          configuration: {
            [widget.type]: {
              nrqlQueries: [{
                query: widget.query,
              }],
            },
          },
        })),
      }],
    };

    const response = await axios.post(
      config.newRelic.nerdGraphEndpoint,
      {
        query: mutation,
        variables: { accountId, dashboard: dashboardInput },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': config.newRelic.apiKey,
        },
      }
    );

    if (response.data.errors || response.data.data?.dashboardCreate?.errors?.length > 0) {
      const errors = response.data.errors || response.data.data.dashboardCreate.errors;
      logger.error('Dashboard creation failed:', errors);
      throw new AppError('Failed to create dashboard', 400, errors);
    }

    const createdDashboard = response.data.data.dashboardCreate.entityResult;

    // Store additional metadata in cache
    const cache = req.app.locals.cache;
    const dashboardMeta = {
      guid: createdDashboard.guid,
      userId: req.user.id,
      tags,
      settings,
      createdAt: new Date().toISOString(),
    };
    await cache.set(`dashboard:meta:${createdDashboard.guid}`, dashboardMeta);

    // Notify via WebSocket
    const wsManager = req.app.locals.wsManager;
    wsManager.broadcastToChannel(`user:${req.user.id}`, {
      type: 'dashboard_created',
      dashboard: {
        ...createdDashboard,
        tags,
        settings,
      },
    });

    res.status(201).json({
      success: true,
      dashboard: {
        ...createdDashboard,
        tags,
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get dashboards
router.get('/', async (req, res, next) => {
  try {
    const accountId = req.user.accountId;
    const { limit = 20, cursor } = req.query;

    const query = `
      query GetDashboards($accountId: Int!, $limit: Int!, $cursor: String) {
        actor {
          account(id: $accountId) {
            dashboards(limit: $limit, cursor: $cursor) {
              results {
                guid
                name
                description
                accountId
                createdAt
                updatedAt
                permalink
                permissions
              }
              nextCursor
            }
          }
        }
      }
    `;

    const response = await axios.post(
      config.newRelic.nerdGraphEndpoint,
      {
        query,
        variables: { accountId, limit: parseInt(limit), cursor },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': config.newRelic.apiKey,
        },
      }
    );

    if (response.data.errors) {
      logger.error('Failed to fetch dashboards:', response.data.errors);
      throw new AppError('Failed to fetch dashboards', 400, response.data.errors);
    }

    const dashboardsData = response.data.data?.actor?.account?.dashboards;
    const cache = req.app.locals.cache;

    // Enrich with metadata
    const enrichedDashboards = await Promise.all(
      dashboardsData.results.map(async (dashboard) => {
        const meta = await cache.get(`dashboard:meta:${dashboard.guid}`);
        return {
          ...dashboard,
          tags: meta?.tags || [],
          settings: meta?.settings || {},
        };
      })
    );

    res.json({
      success: true,
      dashboards: enrichedDashboards,
      nextCursor: dashboardsData.nextCursor,
    });
  } catch (error) {
    next(error);
  }
});

// Get dashboard by ID
router.get('/:guid', async (req, res, next) => {
  try {
    const { guid } = req.params;

    const query = `
      query GetDashboard($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            ... on DashboardEntity {
              guid
              name
              description
              accountId
              createdAt
              updatedAt
              permalink
              permissions
              pages {
                guid
                name
                widgets {
                  id
                  title
                  layout {
                    row
                    column
                    width
                    height
                  }
                  configuration {
                    area {
                      nrqlQueries {
                        query
                      }
                    }
                    bar {
                      nrqlQueries {
                        query
                      }
                    }
                    line {
                      nrqlQueries {
                        query
                      }
                    }
                    pie {
                      nrqlQueries {
                        query
                      }
                    }
                    table {
                      nrqlQueries {
                        query
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      config.newRelic.nerdGraphEndpoint,
      {
        query,
        variables: { guid },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': config.newRelic.apiKey,
        },
      }
    );

    if (response.data.errors) {
      logger.error('Failed to fetch dashboard:', response.data.errors);
      throw new AppError('Failed to fetch dashboard', 400, response.data.errors);
    }

    const dashboard = response.data.data?.actor?.entity;
    
    if (!dashboard) {
      throw new AppError('Dashboard not found', 404);
    }

    // Check permissions
    if (dashboard.accountId !== req.user.accountId) {
      throw new AppError('Access denied', 403);
    }

    // Get metadata
    const cache = req.app.locals.cache;
    const meta = await cache.get(`dashboard:meta:${guid}`);

    res.json({
      success: true,
      dashboard: {
        ...dashboard,
        tags: meta?.tags || [],
        settings: meta?.settings || {},
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update dashboard
router.put('/:guid', async (req, res, next) => {
  try {
    const { guid } = req.params;
    const { error, value } = updateDashboardSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }

    // First get the current dashboard
    const currentDashboard = await getDashboardByGuid(guid, req.user.accountId);
    
    if (!currentDashboard) {
      throw new AppError('Dashboard not found', 404);
    }

    // Merge updates
    const updatedDashboard = {
      name: value.name || currentDashboard.name,
      description: value.description || currentDashboard.description,
      permissions: currentDashboard.permissions,
      pages: value.widgets ? [{
        name: 'Page 1',
        widgets: value.widgets.map(widget => ({
          title: widget.title,
          layout: {
            row: widget.layout.y,
            column: widget.layout.x,
            width: widget.layout.w,
            height: widget.layout.h,
          },
          configuration: {
            [widget.type]: {
              nrqlQueries: [{
                query: widget.query,
              }],
            },
          },
        })),
      }] : currentDashboard.pages,
    };

    // Update using NerdGraph
    const mutation = `
      mutation UpdateDashboard($guid: EntityGuid!, $dashboard: DashboardInput!) {
        dashboardUpdate(guid: $guid, dashboard: $dashboard) {
          entityResult {
            guid
            name
            accountId
            updatedAt
          }
          errors {
            type
            description
          }
        }
      }
    `;

    const response = await axios.post(
      config.newRelic.nerdGraphEndpoint,
      {
        query: mutation,
        variables: { guid, dashboard: updatedDashboard },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': config.newRelic.apiKey,
        },
      }
    );

    if (response.data.errors || response.data.data?.dashboardUpdate?.errors?.length > 0) {
      const errors = response.data.errors || response.data.data.dashboardUpdate.errors;
      logger.error('Dashboard update failed:', errors);
      throw new AppError('Failed to update dashboard', 400, errors);
    }

    // Update metadata
    if (value.tags !== undefined || value.settings !== undefined) {
      const cache = req.app.locals.cache;
      const currentMeta = await cache.get(`dashboard:meta:${guid}`) || {};
      const updatedMeta = {
        ...currentMeta,
        guid,
        userId: req.user.id,
        tags: value.tags !== undefined ? value.tags : currentMeta.tags,
        settings: value.settings !== undefined ? value.settings : currentMeta.settings,
        updatedAt: new Date().toISOString(),
      };
      await cache.set(`dashboard:meta:${guid}`, updatedMeta);
    }

    // Notify via WebSocket
    const wsManager = req.app.locals.wsManager;
    wsManager.broadcastToRoom(`dashboard:${guid}`, {
      type: 'dashboard_updated',
      dashboardId: guid,
      updates: value,
      updatedBy: req.user.id,
    });

    res.json({
      success: true,
      message: 'Dashboard updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Delete dashboard
router.delete('/:guid', requireRole(['admin', 'owner']), async (req, res, next) => {
  try {
    const { guid } = req.params;

    const mutation = `
      mutation DeleteDashboard($guid: EntityGuid!) {
        dashboardDelete(guid: $guid) {
          status
          errors {
            type
            description
          }
        }
      }
    `;

    const response = await axios.post(
      config.newRelic.nerdGraphEndpoint,
      {
        query: mutation,
        variables: { guid },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': config.newRelic.apiKey,
        },
      }
    );

    if (response.data.errors || response.data.data?.dashboardDelete?.errors?.length > 0) {
      const errors = response.data.errors || response.data.data.dashboardDelete.errors;
      logger.error('Dashboard deletion failed:', errors);
      throw new AppError('Failed to delete dashboard', 400, errors);
    }

    // Delete metadata
    const cache = req.app.locals.cache;
    await cache.del(`dashboard:meta:${guid}`);

    // Notify via WebSocket
    const wsManager = req.app.locals.wsManager;
    wsManager.broadcastToChannel(`user:${req.user.id}`, {
      type: 'dashboard_deleted',
      dashboardId: guid,
    });

    res.json({
      success: true,
      message: 'Dashboard deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to get dashboard by GUID
async function getDashboardByGuid(guid, accountId) {
  const query = `
    query GetDashboard($guid: EntityGuid!) {
      actor {
        entity(guid: $guid) {
          ... on DashboardEntity {
            guid
            name
            description
            accountId
            permissions
            pages {
              name
              widgets {
                title
                configuration
                layout {
                  row
                  column
                  width
                  height
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await axios.post(
    config.newRelic.nerdGraphEndpoint,
    {
      query,
      variables: { guid },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': config.newRelic.apiKey,
      },
    }
  );

  const dashboard = response.data.data?.actor?.entity;
  
  if (!dashboard || dashboard.accountId !== accountId) {
    return null;
  }

  return dashboard;
}

module.exports = router;