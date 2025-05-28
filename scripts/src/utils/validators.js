const Joi = require('joi');
const { ValidationError } = require('./errors.js');

// Enhanced validation schemas based on NRDOT v2 insights
const schemas = {
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

  // Attribute name validation with nested attributes support
  attributeName: Joi.string()
    .pattern(/^[A-Za-z][A-Za-z0-9_.[\]]*$/)
    .max(255)
    .required()
    .messages({
      'string.pattern.base': 'Attribute name must start with a letter and can contain alphanumeric characters, underscores, dots, and brackets'
    }),

  // Dashboard configuration validation
  dashboard: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    accountId: Joi.number().positive().required(),
    description: Joi.string().max(1000).allow('').optional(),
    permissions: Joi.string().valid('PUBLIC_READ_ONLY', 'PUBLIC_READ_WRITE', 'PRIVATE').default('PRIVATE'),
    pages: Joi.array().items(
      Joi.object({
        name: Joi.string().min(1).max(255).required(),
        widgets: Joi.array().items(
          Joi.object({
            title: Joi.string().max(255).required(),
            visualization: Joi.object({
              id: Joi.string().required()
            }).required(),
            configuration: Joi.object().required(),
            rawConfiguration: Joi.object({
              nrqlQueries: Joi.array().items(
                Joi.object({
                  accountId: Joi.number().positive().required(),
                  query: Joi.string().required()
                })
              ).min(1).required()
            }).required()
          })
        ).min(1).required()
      })
    ).min(1).required()
  }),

  // Time range validation with NRDOT v2 time windows
  timeRange: Joi.object({
    duration: Joi.alternatives().try(
      Joi.number().positive(),
      Joi.string().pattern(/^\d+\s*(second|minute|hour|day|week|month)s?$/i)
    ).optional(),
    begin: Joi.date().iso().optional(),
    end: Joi.date().iso().optional()
  }).or('duration', 'begin').messages({
    'object.missing': 'Either duration or begin/end time must be specified'
  }),

  // Optimization profile validation for NRDOT v2
  optimizationProfile: Joi.string()
    .valid('conservative', 'balanced', 'aggressive', 'custom')
    .required()
    .messages({
      'any.only': 'Optimization profile must be one of: conservative, balanced, aggressive, custom'
    }),

  // Metric name validation for OpenTelemetry metrics
  metricName: Joi.string()
    .pattern(/^[A-Za-z][A-Za-z0-9._/-]*$/)
    .max(255)
    .required()
    .messages({
      'string.pattern.base': 'Metric name must follow OpenTelemetry naming conventions'
    }),

  // Process name validation
  processName: Joi.string()
    .min(1)
    .max(255)
    .required()
    .messages({
      'string.empty': 'Process name cannot be empty',
      'string.max': 'Process name cannot exceed 255 characters'
    }),

  // Account ID validation
  accountId: Joi.number()
    .positive()
    .integer()
    .required()
    .messages({
      'number.positive': 'Account ID must be a positive number',
      'number.integer': 'Account ID must be an integer'
    }),

  // Entity GUID validation
  entityGuid: Joi.string()
    .pattern(/^[A-Za-z0-9+/]+=*$/)
    .required()
    .messages({
      'string.pattern.base': 'Entity GUID must be a valid base64 string'
    }),

  // API Key validation
  apiKey: Joi.string()
    .pattern(/^NRAK-[A-Z0-9]{27}$/)
    .required()
    .messages({
      'string.pattern.base': 'API key must be in format NRAK-XXXXXXXXXXXXXXXXXXXXXXXXXXXX'
    }),

  // Process metric validation for NRDOT v2
  processMetric: Joi.object({
    processName: Joi.string().required(),
    cpuPercent: Joi.number().min(0).max(100).required(),
    memoryRss: Joi.number().integer().min(0).required(),
    memoryVirtual: Joi.number().integer().min(0).required(),
    ioReadBytes: Joi.number().integer().min(0).optional(),
    ioWriteBytes: Joi.number().integer().min(0).optional(),
    threadCount: Joi.number().integer().min(0).optional(),
    openFileDescriptors: Joi.number().integer().min(0).optional()
  })
};

// Enhanced validation helper functions
function validateNRQLQuery(query) {
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

function validateEventType(eventType) {
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

function validateAttributeName(attributeName) {
  const { error, value } = schemas.attributeName.validate(attributeName);
  if (error) {
    throw new ValidationError(`Invalid attribute name: ${error.message}`, error.details);
  }
  
  // Check for excessive nesting
  const nestingLevel = (attributeName.match(/\./g) || []).length;
  if (nestingLevel > 5) {
    throw new ValidationError('Attribute nesting cannot exceed 5 levels');
  }
  
  return value;
}

function validateDashboard(dashboard) {
  const { error, value } = schemas.dashboard.validate(dashboard);
  if (error) {
    throw new ValidationError(`Invalid dashboard configuration: ${error.message}`, error.details);
  }
  
  // Validate total widget count
  const totalWidgets = value.pages.reduce((sum, page) => sum + page.widgets.length, 0);
  if (totalWidgets > 300) {
    throw new ValidationError('Dashboard cannot contain more than 300 widgets');
  }
  
  // Validate queries
  value.pages.forEach((page, pageIndex) => {
    page.widgets.forEach((widget, widgetIndex) => {
      widget.rawConfiguration.nrqlQueries.forEach((nrqlQuery, queryIndex) => {
        try {
          validateNRQLQuery(nrqlQuery.query);
        } catch (e) {
          throw new ValidationError(
            `Invalid NRQL in page ${pageIndex + 1}, widget ${widgetIndex + 1}, query ${queryIndex + 1}: ${e.message}`
          );
        }
      });
    });
  });
  
  return value;
}

function validateTimeRange(timeRange) {
  const { error, value } = schemas.timeRange.validate(timeRange);
  if (error) {
    throw new ValidationError(`Invalid time range: ${error.message}`, error.details);
  }
  
  // Validate begin/end relationship
  if (value.begin && value.end) {
    const begin = new Date(value.begin);
    const end = new Date(value.end);
    if (begin >= end) {
      throw new ValidationError('Begin time must be before end time');
    }
    
    // Check for excessive time range
    const rangeMs = end - begin;
    const maxRangeMs = 90 * 24 * 60 * 60 * 1000; // 90 days
    if (rangeMs > maxRangeMs) {
      throw new ValidationError('Time range cannot exceed 90 days');
    }
  }
  
  return value;
}

function validateAccountId(accountId) {
  const { error, value } = schemas.accountId.validate(accountId);
  if (error) {
    throw new ValidationError(`Invalid account ID: ${error.message}`, error.details);
  }
  return value;
}

function validateEntityGuid(guid) {
  const { error, value } = schemas.entityGuid.validate(guid);
  if (error) {
    throw new ValidationError(`Invalid entity GUID: ${error.message}`, error.details);
  }
  return value;
}

// Enhanced NRQL specific validators
function extractEventTypeFromQuery(query) {
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

function extractAttributesFromQuery(query) {
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

function isValidNRQLFunction(functionName) {
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

function isValidVisualization(vizId) {
  return VALID_VISUALIZATIONS.has(vizId.toLowerCase());
}

// Enhanced suggestion engine with context awareness
function suggestCorrection(input, validOptions, maxSuggestions = 3, context = null) {
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
function calculateQueryComplexity(query) {
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
function validateProcessMetric(metric) {
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
module.exports = {
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