import Joi from 'joi';
import { ValidationError } from './errors.js';

// Common validation schemas
export const schemas = {
  // NRQL Query validation
  nrqlQuery: Joi.string()
    .pattern(/^(SELECT|FROM|WHERE|FACET|SINCE|UNTIL|LIMIT|OFFSET|TIMESERIES|COMPARE WITH|SHOW)/i)
    .required()
    .messages({
      'string.pattern.base': 'Invalid NRQL query format'
    }),

  // Event type validation
  eventType: Joi.string()
    .pattern(/^[A-Za-z][A-Za-z0-9_]*$/)
    .max(255)
    .required()
    .messages({
      'string.pattern.base': 'Event type must start with a letter and contain only alphanumeric characters and underscores'
    }),

  // Attribute name validation
  attributeName: Joi.string()
    .pattern(/^[A-Za-z][A-Za-z0-9_.]*$/)
    .max(255)
    .required()
    .messages({
      'string.pattern.base': 'Attribute name must start with a letter and contain only alphanumeric characters, underscores, and dots'
    }),

  // Dashboard structure validation
  dashboard: Joi.object({
    name: Joi.string().required().max(255),
    description: Joi.string().allow('').max(1000),
    permissions: Joi.string().valid('PUBLIC_READ_ONLY', 'PUBLIC_READ_WRITE', 'PRIVATE'),
    pages: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        description: Joi.string().allow(''),
        widgets: Joi.array().items(
          Joi.object({
            title: Joi.string().required(),
            visualization: Joi.object({
              id: Joi.string().required()
            }),
            configuration: Joi.object(),
            layout: Joi.object({
              column: Joi.number().integer().min(1).max(12).required(),
              row: Joi.number().integer().min(1).required(),
              width: Joi.number().integer().min(1).max(12).required(),
              height: Joi.number().integer().min(1).required()
            })
          })
        ).required()
      })
    ).min(1).required()
  }),

  // Alert condition validation
  alertCondition: Joi.object({
    name: Joi.string().required().max(255),
    enabled: Joi.boolean(),
    nrql: Joi.object({
      query: Joi.string().required()
    }).required(),
    terms: Joi.array().items(
      Joi.object({
        threshold: Joi.number().required(),
        thresholdDuration: Joi.number().integer().min(60).required(),
        thresholdOccurrences: Joi.string().valid('ALL', 'AT_LEAST_ONCE').required(),
        operator: Joi.string().valid('ABOVE', 'BELOW', 'EQUALS').required(),
        priority: Joi.string().valid('CRITICAL', 'WARNING').required()
      })
    ).min(1).required()
  }),

  // Time range validation
  timeRange: Joi.string()
    .pattern(/^\d+\s+(second|minute|hour|day|week|month)s?\s+ago$/i)
    .messages({
      'string.pattern.base': 'Time range must be in format "N units ago" (e.g., "1 hour ago", "7 days ago")'
    }),

  // Account ID validation
  accountId: Joi.alternatives().try(
    Joi.number().integer().positive(),
    Joi.string().pattern(/^\d+$/)
  ).required(),

  // Entity GUID validation
  entityGuid: Joi.string()
    .pattern(/^[A-Za-z0-9+/]+=*$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid entity GUID format'
    })
};

// Validation helper functions
export function validateNRQLQuery(query) {
  const { error, value } = schemas.nrqlQuery.validate(query);
  if (error) {
    throw new ValidationError(`Invalid NRQL query: ${error.message}`, error.details);
  }
  return value;
}

export function validateEventType(eventType) {
  const { error, value } = schemas.eventType.validate(eventType);
  if (error) {
    throw new ValidationError(`Invalid event type: ${error.message}`, error.details);
  }
  return value;
}

export function validateAttributeName(attributeName) {
  const { error, value } = schemas.attributeName.validate(attributeName);
  if (error) {
    throw new ValidationError(`Invalid attribute name: ${error.message}`, error.details);
  }
  return value;
}

export function validateDashboard(dashboard) {
  const { error, value } = schemas.dashboard.validate(dashboard);
  if (error) {
    throw new ValidationError(`Invalid dashboard structure: ${error.message}`, error.details);
  }
  return value;
}

export function validateTimeRange(timeRange) {
  const { error, value } = schemas.timeRange.validate(timeRange);
  if (error) {
    throw new ValidationError(`Invalid time range: ${error.message}`, error.details);
  }
  return value;
}

export function validateAccountId(accountId) {
  const { error, value } = schemas.accountId.validate(accountId);
  if (error) {
    throw new ValidationError(`Invalid account ID: ${error.message}`, error.details);
  }
  return typeof value === 'string' ? parseInt(value) : value;
}

export function validateEntityGuid(guid) {
  const { error, value } = schemas.entityGuid.validate(guid);
  if (error) {
    throw new ValidationError(`Invalid entity GUID: ${error.message}`, error.details);
  }
  return value;
}

// NRQL specific validators
export function extractEventTypeFromQuery(query) {
  const fromMatch = query.match(/FROM\s+([A-Za-z][A-Za-z0-9_]*)/i);
  if (fromMatch) {
    return fromMatch[1];
  }
  
  const showMatch = query.match(/SHOW\s+EVENT\s+TYPES/i);
  if (showMatch) {
    return null; // SHOW EVENT TYPES doesn't have a specific event type
  }

  throw new ValidationError('Could not extract event type from NRQL query');
}

export function extractAttributesFromQuery(query) {
  const attributes = new Set();
  
  // Extract from SELECT clause
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  if (selectMatch) {
    const selectClause = selectMatch[1];
    const attrMatches = selectClause.match(/[A-Za-z][A-Za-z0-9_.]*(?=\s*[,)]|\s*$)/g);
    if (attrMatches) {
      attrMatches.forEach(attr => attributes.add(attr));
    }
  }

  // Extract from WHERE clause
  const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+FACET|\s+SINCE|\s+UNTIL|\s+LIMIT|\s+OFFSET|\s+TIMESERIES|\s*$)/i);
  if (whereMatch) {
    const whereClause = whereMatch[1];
    const attrMatches = whereClause.match(/[A-Za-z][A-Za-z0-9_.]*(?=\s*[=<>!])/g);
    if (attrMatches) {
      attrMatches.forEach(attr => attributes.add(attr));
    }
  }

  // Extract from FACET clause
  const facetMatch = query.match(/FACET\s+(.+?)(?:\s+SINCE|\s+UNTIL|\s+LIMIT|\s+OFFSET|\s+TIMESERIES|\s*$)/i);
  if (facetMatch) {
    const facetClause = facetMatch[1];
    const attrMatches = facetClause.match(/[A-Za-z][A-Za-z0-9_.]*(?=\s*[,)]|\s*$)/g);
    if (attrMatches) {
      attrMatches.forEach(attr => attributes.add(attr));
    }
  }

  return Array.from(attributes);
}

// NRQL function validation
const NRQL_FUNCTIONS = new Set([
  'count', 'sum', 'average', 'max', 'min', 'latest', 'earliest',
  'uniqueCount', 'percentile', 'histogram', 'rate', 'funnel',
  'filter', 'keyset', 'uniques', 'stddev', 'percentage'
]);

export function isValidNRQLFunction(functionName) {
  return NRQL_FUNCTIONS.has(functionName.toLowerCase());
}

// Widget visualization validation
const VALID_VISUALIZATIONS = new Set([
  'area', 'bar', 'billboard', 'bullet', 'event-feed', 'funnel',
  'heatmap', 'histogram', 'json', 'line', 'list', 'log',
  'pie', 'scatter', 'sparkline', 'stacked-bar', 'table'
]);

export function isValidVisualization(vizId) {
  return VALID_VISUALIZATIONS.has(vizId.toLowerCase());
}

// Helper to suggest corrections
export function suggestCorrection(input, validOptions, maxSuggestions = 3) {
  const distances = validOptions.map(option => ({
    option,
    distance: levenshteinDistance(input.toLowerCase(), option.toLowerCase())
  }));

  distances.sort((a, b) => a.distance - b.distance);
  
  return distances
    .slice(0, maxSuggestions)
    .filter(d => d.distance <= 3) // Only suggest if reasonably close
    .map(d => d.option);
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}