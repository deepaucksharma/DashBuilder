import Joi from 'joi';
import { ValidationError } from './errors.js';

// Enhanced validation schemas based on NRDOT v2 insights
export const schemas = {
  // NRQL Query validation with enhanced patterns
  nrqlQuery: Joi.string()
    .pattern(/^(SELECT|FROM|WHERE|FACET|SINCE|UNTIL|LIMIT|OFFSET|TIMESERIES|COMPARE WITH|SHOW|WITH)/i)
    .required()
    .messages({
      'string.pattern.base': 'Invalid NRQL query format. Must start with SELECT, SHOW, or WITH'
    }),

  // Event type validation with OpenTelemetry support
  eventType: Joi.string()
    .pattern(/^[A-Za-z][A-Za-z0-9_]*$/)
    .max(255)
    .required()
    .messages({
      'string.pattern.base': 'Event type must start with a letter and contain only alphanumeric characters and underscores'
    }),

  // Enhanced attribute name validation for nested attributes
  attributeName: Joi.string()
    .pattern(/^[A-Za-z][A-Za-z0-9_.[\]]*$/)
    .max(255)
    .required()
    .messages({
      'string.pattern.base': 'Attribute name must start with a letter and can contain alphanumeric characters, underscores, dots, and brackets for arrays'
    }),

  // Enhanced dashboard structure validation with NRDOT v2 patterns
  dashboard: Joi.object({
    name: Joi.string().required().max(255),
    description: Joi.string().allow('').max(1000),
    permissions: Joi.string().valid('PUBLIC_READ_ONLY', 'PUBLIC_READ_WRITE', 'PRIVATE'),
    variables: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        type: Joi.string().valid('NRQL', 'STRING', 'ENUM').required(),
        defaultValue: Joi.any(),
        nrqlQuery: Joi.string().when('type', { is: 'NRQL', then: Joi.required() }),
        enumOptions: Joi.array().when('type', { is: 'ENUM', then: Joi.required() })
      })
    ).optional(),
    pages: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        description: Joi.string().allow(''),
        widgets: Joi.array().items(
          Joi.object({
            title: Joi.string().required(),
            linkedEntityGuid: Joi.string().optional(),
            visualization: Joi.object({
              id: Joi.string().required()
            }),
            configuration: Joi.object(),
            layout: Joi.object({
              column: Joi.number().integer().min(1).max(12).required(),
              row: Joi.number().integer().min(1).required(),
              width: Joi.number().integer().min(1).max(12).required(),
              height: Joi.number().integer().min(1).required()
            }),
            rawConfiguration: Joi.object().optional() // For advanced widget configs
          })
        ).required()
      })
    ).min(1).required()
  }),

  // Enhanced alert condition validation
  alertCondition: Joi.object({
    name: Joi.string().required().max(255),
    enabled: Joi.boolean(),
    type: Joi.string().valid('STATIC', 'BASELINE', 'OUTLIER').default('STATIC'),
    nrql: Joi.object({
      query: Joi.string().required()
    }).required(),
    signal: Joi.object({
      aggregationMethod: Joi.string().valid('EVENT_FLOW', 'EVENT_TIMER', 'CADENCE').optional(),
      aggregationDelay: Joi.number().integer().min(0).optional(),
      aggregationTimer: Joi.number().integer().min(0).optional(),
      fillOption: Joi.string().valid('NONE', 'LAST_VALUE', 'STATIC').optional(),
      fillValue: Joi.number().when('fillOption', { is: 'STATIC', then: Joi.required() })
    }).optional(),
    terms: Joi.array().items(
      Joi.object({
        threshold: Joi.number().required(),
        thresholdDuration: Joi.number().integer().min(60).required(),
        thresholdOccurrences: Joi.string().valid('ALL', 'AT_LEAST_ONCE').required(),
        operator: Joi.string().valid('ABOVE', 'BELOW', 'EQUALS', 'NOT_EQUALS').required(),
        priority: Joi.string().valid('CRITICAL', 'WARNING').required()
      })
    ).min(1).required(),
    expiration: Joi.object({
      expirationDuration: Joi.number().integer().min(60).optional(),
      closeViolationsOnExpiration: Joi.boolean().optional()
    }).optional()
  }),

  // Enhanced time range validation with more formats
  timeRange: Joi.alternatives().try(
    // Relative time
    Joi.string().pattern(/^\d+\s+(second|minute|hour|day|week|month)s?\s+ago$/i),
    // Absolute time
    Joi.string().isoDate(),
    // Time window
    Joi.string().pattern(/^(TODAY|YESTERDAY|THIS_WEEK|THIS_MONTH|LAST_WEEK|LAST_MONTH)$/i)
  ).messages({
    'alternatives.match': 'Time range must be relative (e.g., "1 hour ago"), absolute ISO date, or predefined window'
  }),

  // Account ID validation
  accountId: Joi.alternatives().try(
    Joi.number().integer().positive(),
    Joi.string().pattern(/^\d+$/)
  ).required(),

  // Entity GUID validation with base64 check
  entityGuid: Joi.string()
    .pattern(/^[A-Za-z0-9+/]+=*$/)
    .custom((value, helpers) => {
      try {
        // Validate it's proper base64
        const decoded = Buffer.from(value, 'base64').toString();
        if (!decoded || decoded.length === 0) {
          return helpers.error('any.invalid');
        }
        return value;
      } catch (e) {
        return helpers.error('any.invalid');
      }
    })
    .required()
    .messages({
      'string.pattern.base': 'Invalid entity GUID format',
      'any.invalid': 'Entity GUID must be valid base64'
    }),

  // Process metrics validation (NRDOT v2 specific)
  processMetric: Joi.object({
    processName: Joi.string().required(),
    processPath: Joi.string().optional(),
    commandLine: Joi.string().optional(),
    cpuPercent: Joi.number().min(0).max(100),
    memoryRss: Joi.number().min(0),
    memoryVirtual: Joi.number().min(0),
    ioReadBytes: Joi.number().min(0).optional(),
    ioWriteBytes: Joi.number().min(0).optional(),
    threadCount: Joi.number().integer().min(0).optional(),
    openFileDescriptors: Joi.number().integer().min(0).optional()
  })
};

// Enhanced validation helper functions
export function validateNRQLQuery(query) {
  const { error, value } = schemas.nrqlQuery.validate(query);
  if (error) {
    throw new ValidationError(`Invalid NRQL query: ${error.message}`, error.details);
  }
  
  // Additional semantic validation
  const upperQuery = query.toUpperCase();
  
  // Check for required FROM clause in SELECT queries
  if (upperQuery.startsWith('SELECT') && !upperQuery.includes('FROM')) {
    throw new ValidationError('SELECT queries must include a FROM clause');
  }
  
  // Validate TIMESERIES usage
  if (upperQuery.includes('TIMESERIES') && !upperQuery.includes('SINCE')) {
    throw new ValidationError('TIMESERIES requires a SINCE clause');
  }
  
  // Check for conflicting clauses
  if (upperQuery.includes('COMPARE WITH') && upperQuery.includes('TIMESERIES')) {
    throw new ValidationError('COMPARE WITH and TIMESERIES cannot be used together');
  }
  
  return value;
}

export function validateEventType(eventType) {
  const { error, value } = schemas.eventType.validate(eventType);
  if (error) {
    throw new ValidationError(`Invalid event type: ${error.message}`, error.details);
  }
  
  // Check for reserved event types
  const reserved = ['SELECT', 'FROM', 'WHERE', 'LIMIT', 'OFFSET'];
  if (reserved.includes(eventType.toUpperCase())) {
    throw new ValidationError(`'${eventType}' is a reserved keyword and cannot be used as an event type`);
  }
  
  return value;
}

export function validateAttributeName(attributeName) {
  const { error, value } = schemas.attributeName.validate(attributeName);
  if (error) {
    throw new ValidationError(`Invalid attribute name: ${error.message}`, error.details);
  }
  
  // Check for deeply nested attributes (more than 5 levels)
  const dots = (attributeName.match(/\./g) || []).length;
  if (dots > 5) {
    throw new ValidationError('Attribute nesting depth exceeds maximum of 5 levels');
  }
  
  return value;
}

export function validateDashboard(dashboard) {
  const { error, value } = schemas.dashboard.validate(dashboard);
  if (error) {
    throw new ValidationError(`Invalid dashboard structure: ${error.message}`, error.details);
  }
  
  // Additional validation for widget layouts
  for (const page of value.pages) {
    const occupiedCells = new Set();
    
    for (const widget of page.widgets) {
      const { column, row, width, height } = widget.layout;
      
      // Check for overlapping widgets
      for (let c = column; c < column + width; c++) {
        for (let r = row; r < row + height; r++) {
          const cell = `${c},${r}`;
          if (occupiedCells.has(cell)) {
            throw new ValidationError(`Widget "${widget.title}" overlaps with another widget at position ${cell}`);
          }
          occupiedCells.add(cell);
        }
      }
    }
  }
  
  return value;
}

export function validateTimeRange(timeRange) {
  const { error, value } = schemas.timeRange.validate(timeRange);
  if (error) {
    throw new ValidationError(`Invalid time range: ${error.message}`, error.details);
  }
  
  // Validate relative time isn't too large
  const relativeMatch = value.match(/^(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago$/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    
    const maxValues = {
      second: 86400,   // 1 day
      minute: 10080,   // 1 week
      hour: 2160,      // 90 days
      day: 366,        // 1 year
      week: 52,        // 1 year
      month: 13        // 13 months
    };
    
    if (amount > maxValues[unit]) {
      throw new ValidationError(`Time range too large: ${amount} ${unit}s exceeds maximum`);
    }
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

// Enhanced NRQL specific validators
export function extractEventTypeFromQuery(query) {
  // Handle WITH clause for CTEs
  if (query.match(/^WITH\s+/i)) {
    const mainQuery = query.match(/\)\s+SELECT.+FROM\s+([A-Za-z][A-Za-z0-9_]*)/i);
    if (mainQuery) {
      return mainQuery[1];
    }
  }
  
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
  
  // Enhanced regex patterns for complex queries
  const patterns = {
    select: /SELECT\s+(.+?)\s+FROM/is,
    where: /WHERE\s+(.+?)(?:\s+FACET|\s+SINCE|\s+UNTIL|\s+LIMIT|\s+OFFSET|\s+TIMESERIES|\s+ORDER\s+BY|\s*$)/is,
    facet: /FACET\s+(.+?)(?:\s+SINCE|\s+UNTIL|\s+LIMIT|\s+OFFSET|\s+TIMESERIES|\s+ORDER\s+BY|\s*$)/is,
    orderBy: /ORDER\s+BY\s+(.+?)(?:\s+ASC|\s+DESC|\s+SINCE|\s+UNTIL|\s+LIMIT|\s*$)/is
  };
  
  // Extract from each clause
  Object.entries(patterns).forEach(([clause, pattern]) => {
    const match = query.match(pattern);
    if (match) {
      const clauseContent = match[1];
      
      // Handle functions and nested attributes
      const attrPattern = /([A-Za-z][A-Za-z0-9_.[\]]*(?:\.[A-Za-z][A-Za-z0-9_.[\]]*)*)/g;
      const attrMatches = clauseContent.match(attrPattern);
      
      if (attrMatches) {
        attrMatches.forEach(attr => {
          // Skip NRQL keywords
          if (!isNRQLKeyword(attr)) {
            attributes.add(attr);
          }
        });
      }
    }
  });
  
  // Extract from function arguments
  const functionPattern = /(\w+)\s*\(\s*([^)]+)\s*\)/g;
  let funcMatch;
  while ((funcMatch = functionPattern.exec(query)) !== null) {
    const args = funcMatch[2].split(',');
    args.forEach(arg => {
      const trimmedArg = arg.trim();
      if (trimmedArg.match(/^[A-Za-z][A-Za-z0-9_.[\]]*$/) && !isNRQLKeyword(trimmedArg)) {
        attributes.add(trimmedArg);
      }
    });
  }
  
  return Array.from(attributes);
}

// Enhanced NRQL function validation with new functions
const NRQL_FUNCTIONS = new Set([
  // Aggregation functions
  'count', 'sum', 'average', 'max', 'min', 'latest', 'earliest',
  'uniqueCount', 'percentile', 'histogram', 'rate', 'funnel',
  'stddev', 'variance', 'median', 'mode',
  // Math functions
  'abs', 'ceil', 'floor', 'round', 'sqrt', 'pow', 'exp', 'log',
  // String functions
  'concat', 'substring', 'lower', 'upper', 'trim', 'length',
  // Time functions
  'since', 'until', 'timeAgo', 'now', 'timestamp',
  // Conditional functions
  'if', 'cases', 'filter',
  // Window functions
  'derivative', 'predictLinear', 'sliding',
  // Special functions
  'keyset', 'uniques', 'percentage', 'apdex', 'bytecountestimate'
]);

export function isValidNRQLFunction(functionName) {
  return NRQL_FUNCTIONS.has(functionName.toLowerCase());
}

// Helper to check if a word is a NRQL keyword
function isNRQLKeyword(word) {
  const keywords = new Set([
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'IS', 'NULL',
    'FACET', 'LIMIT', 'SINCE', 'UNTIL', 'OFFSET', 'TIMESERIES', 'COMPARE', 'WITH',
    'AS', 'BY', 'ORDER', 'ASC', 'DESC', 'TRUE', 'FALSE', 'SHOW', 'EVENT', 'TYPES'
  ]);
  return keywords.has(word.toUpperCase());
}

// Enhanced widget visualization validation with new types
const VALID_VISUALIZATIONS = new Set([
  // Basic charts
  'area', 'bar', 'billboard', 'bullet', 'event-feed', 'funnel',
  'heatmap', 'histogram', 'json', 'line', 'list', 'log',
  'pie', 'scatter', 'sparkline', 'stacked-bar', 'table',
  // New visualization types
  'gauge', 'treemap', 'network', 'sankey', 'timeline',
  'geo-map', 'node-graph', 'markdown', 'threshold'
]);

export function isValidVisualization(vizId) {
  return VALID_VISUALIZATIONS.has(vizId.toLowerCase());
}

// Enhanced suggestion engine with context awareness
export function suggestCorrection(input, validOptions, maxSuggestions = 3, context = null) {
  if (!input || !validOptions || validOptions.length === 0) {
    return [];
  }
  
  const inputLower = input.toLowerCase();
  
  // Calculate distances with context awareness
  const distances = validOptions.map(option => {
    const optionLower = option.toLowerCase();
    let distance = levenshteinDistance(inputLower, optionLower);
    
    // Boost score for options that start with the same letters
    if (optionLower.startsWith(inputLower.substring(0, 2))) {
      distance -= 0.5;
    }
    
    // Boost score based on context
    if (context) {
      if (context.type === 'function' && isValidNRQLFunction(option)) {
        distance -= 0.3;
      } else if (context.type === 'eventType' && option.match(/^[A-Z]/)) {
        distance -= 0.3;
      }
    }
    
    return { option, distance };
  });

  distances.sort((a, b) => a.distance - b.distance);
  
  return distances
    .slice(0, maxSuggestions)
    .filter(d => d.distance <= 3) // Only suggest if reasonably close
    .map(d => d.option);
}

// Enhanced Levenshtein distance with transposition support
function levenshteinDistance(a, b) {
  const matrix = [];
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  for (let i = 0; i <= bLen; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= aLen; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      const cost = a.charAt(j - 1) === b.charAt(i - 1) ? 0 : 1;
      
      matrix[i][j] = Math.min(
        matrix[i - 1][j - 1] + cost,    // substitution
        matrix[i][j - 1] + 1,            // insertion
        matrix[i - 1][j] + 1             // deletion
      );
      
      // Transposition
      if (i > 1 && j > 1 &&
          a.charAt(j - 1) === b.charAt(i - 2) &&
          a.charAt(j - 2) === b.charAt(i - 1)) {
        matrix[i][j] = Math.min(
          matrix[i][j],
          matrix[i - 2][j - 2] + cost
        );
      }
    }
  }

  return matrix[bLen][aLen];
}

// Query complexity scoring based on NRDOT v2 insights
export function calculateQueryComplexity(query) {
  let complexity = 0;
  const upperQuery = query.toUpperCase();
  
  // Base complexity for query type
  if (upperQuery.includes('SELECT *')) complexity += 3;
  if (upperQuery.includes('FACET')) complexity += 2;
  if (upperQuery.includes('TIMESERIES')) complexity += 2;
  
  // Time range complexity
  const timeMatch = query.match(/SINCE\s+(\d+)\s+(day|week|month)s?\s+ago/i);
  if (timeMatch) {
    const amount = parseInt(timeMatch[1]);
    const unit = timeMatch[2];
    if (unit === 'month' || amount > 7) complexity += 2;
  }
  
  // Multiple facets
  const facetMatch = query.match(/FACET\s+(.+?)(?:\s+SINCE|\s+UNTIL|\s+LIMIT|\s*$)/i);
  if (facetMatch) {
    const facets = facetMatch[1].split(',').length;
    if (facets > 1) complexity += facets;
  }
  
  // Subqueries or WITH clauses
  if (upperQuery.includes('WITH')) complexity += 3;
  
  // Complex WHERE conditions
  const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+FACET|\s+SINCE|\s*$)/i);
  if (whereMatch) {
    const conditions = (whereMatch[1].match(/\s+(AND|OR)\s+/gi) || []).length;
    complexity += conditions;
  }
  
  return {
    score: complexity,
    level: complexity <= 3 ? 'Low' : complexity <= 7 ? 'Medium' : 'High',
    factors: {
      hasWildcard: upperQuery.includes('SELECT *'),
      hasFacet: upperQuery.includes('FACET'),
      hasTimeseries: upperQuery.includes('TIMESERIES'),
      hasSubquery: upperQuery.includes('WITH'),
      timeRangeSize: timeMatch ? `${timeMatch[1]} ${timeMatch[2]}s` : 'default'
    }
  };
}

// Validate process metrics for NRDOT v2
export function validateProcessMetric(metric) {
  const { error, value } = schemas.processMetric.validate(metric);
  if (error) {
    throw new ValidationError(`Invalid process metric: ${error.message}`, error.details);
  }
  
  // Additional validation for resource limits
  if (value.cpuPercent > 100) {
    throw new ValidationError('CPU percentage cannot exceed 100%');
  }
  
  if (value.memoryRss > value.memoryVirtual) {
    throw new ValidationError('RSS memory cannot exceed virtual memory');
  }
  
  return value;
}

// Export all validators
export default {
  schemas,
  validateNRQLQuery,
  validateEventType,
  validateAttributeName,
  validateDashboard,
  validateTimeRange,
  validateAccountId,
  validateEntityGuid,
  validateProcessMetric,
  extractEventTypeFromQuery,
  extractAttributesFromQuery,
  isValidNRQLFunction,
  isValidVisualization,
  suggestCorrection,
  calculateQueryComplexity,
  isNRQLKeyword
};