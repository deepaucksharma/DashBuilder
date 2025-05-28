/**
 * NRQL Query Validator
 * Validates NRQL syntax and provides helpful error messages
 */

export class NRQLValidator {
  constructor() {
    // Valid NRQL clauses in order
    this.validClauses = [
      'SELECT',
      'FROM',
      'WHERE',
      'FACET',
      'SINCE',
      'UNTIL',
      'LIMIT',
      'TIMESERIES',
      'COMPARE WITH',
      'AS',
      'WITH'
    ];

    // Valid functions
    this.validFunctions = [
      'average', 'avg', 'sum', 'min', 'max', 'count', 
      'uniqueCount', 'percentile', 'rate', 'derivative',
      'latest', 'stddev', 'histogram', 'filter', 'funnel'
    ];

    // Valid time expressions
    this.validTimeExpressions = [
      /^\d+\s*(second|minute|hour|day|week|month)s?\s*ago$/i,
      /^\d+\s*(second|minute|hour|day|week|month)s?$/i,
      /^now$/i,
      /^today$/i,
      /^yesterday$/i,
      /^this\s+(week|month|quarter|year)$/i,
      /^last\s+(week|month|quarter|year)$/i
    ];
  }

  /**
   * Validate a NRQL query
   * @param {string} query - The NRQL query to validate
   * @returns {Object} - { valid: boolean, errors: string[], warnings: string[] }
   */
  validate(query) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!query || typeof query !== 'string') {
      result.valid = false;
      result.errors.push('Query must be a non-empty string');
      return result;
    }

    // Trim and normalize whitespace
    const normalizedQuery = query.trim().replace(/\s+/g, ' ');

    // Check for required clauses
    if (!this.hasRequiredClauses(normalizedQuery, result)) {
      result.valid = false;
    }

    // Validate clause order
    this.validateClauseOrder(normalizedQuery, result);

    // Validate SELECT clause
    this.validateSelectClause(normalizedQuery, result);

    // Validate FROM clause
    this.validateFromClause(normalizedQuery, result);

    // Validate time expressions
    this.validateTimeExpressions(normalizedQuery, result);

    // Check for common mistakes
    this.checkCommonMistakes(normalizedQuery, result);

    return result;
  }

  hasRequiredClauses(query, result) {
    const upperQuery = query.toUpperCase();
    
    if (!upperQuery.includes('SELECT')) {
      result.errors.push('Query must contain a SELECT clause');
      return false;
    }

    if (!upperQuery.includes('FROM')) {
      result.errors.push('Query must contain a FROM clause');
      return false;
    }

    return true;
  }

  validateClauseOrder(query, result) {
    const upperQuery = query.toUpperCase();
    const foundClauses = [];

    // Find positions of each clause
    this.validClauses.forEach(clause => {
      const index = upperQuery.indexOf(clause);
      if (index !== -1) {
        foundClauses.push({ clause, index });
      }
    });

    // Sort by position
    foundClauses.sort((a, b) => a.index - b.index);

    // Check if SELECT comes first
    if (foundClauses.length > 0 && foundClauses[0].clause !== 'SELECT') {
      result.errors.push('SELECT must be the first clause');
      result.valid = false;
    }

    // Check if FROM comes after SELECT
    const selectIndex = foundClauses.findIndex(f => f.clause === 'SELECT');
    const fromIndex = foundClauses.findIndex(f => f.clause === 'FROM');
    
    if (selectIndex !== -1 && fromIndex !== -1 && fromIndex < selectIndex) {
      result.errors.push('FROM must come after SELECT');
      result.valid = false;
    }
  }

  validateSelectClause(query, result) {
    const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
    if (!selectMatch) return;

    const selectContent = selectMatch[1].trim();
    
    // Check for empty SELECT
    if (!selectContent) {
      result.errors.push('SELECT clause cannot be empty');
      result.valid = false;
      return;
    }

    // Check for valid function usage
    const functionPattern = /(\w+)\s*\(/g;
    let match;
    while ((match = functionPattern.exec(selectContent)) !== null) {
      const funcName = match[1].toLowerCase();
      if (!this.validFunctions.includes(funcName)) {
        result.warnings.push(`Unknown function: ${funcName}`);
      }
    }
  }

  validateFromClause(query, result) {
    const fromMatch = query.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return;

    const source = fromMatch[1];
    
    // Check for common source names
    const commonSources = ['Metric', 'SystemSample', 'ProcessSample', 'Log', 'Event'];
    if (!commonSources.some(s => s.toLowerCase() === source.toLowerCase())) {
      result.warnings.push(`Uncommon data source: ${source}. Common sources are: ${commonSources.join(', ')}`);
    }
  }

  validateTimeExpressions(query, result) {
    // Check SINCE clause
    const sinceMatch = query.match(/SINCE\s+(.+?)(?:\s+UNTIL|\s+LIMIT|\s+FACET|\s+TIMESERIES|\s+WITH|$)/i);
    if (sinceMatch) {
      const timeExpr = sinceMatch[1].trim();
      if (!this.isValidTimeExpression(timeExpr)) {
        result.errors.push(`Invalid time expression in SINCE clause: ${timeExpr}`);
        result.valid = false;
      }
    }

    // Check UNTIL clause
    const untilMatch = query.match(/UNTIL\s+(.+?)(?:\s+LIMIT|\s+FACET|\s+TIMESERIES|\s+WITH|$)/i);
    if (untilMatch) {
      const timeExpr = untilMatch[1].trim();
      if (!this.isValidTimeExpression(timeExpr)) {
        result.errors.push(`Invalid time expression in UNTIL clause: ${timeExpr}`);
        result.valid = false;
      }
    }
  }

  isValidTimeExpression(expr) {
    return this.validTimeExpressions.some(pattern => pattern.test(expr));
  }

  checkCommonMistakes(query, result) {
    // Check for missing quotes in WHERE clause
    const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+FACET|\s+SINCE|\s+UNTIL|\s+LIMIT|\s+TIMESERIES|$)/i);
    if (whereMatch) {
      const whereContent = whereMatch[1];
      // Simple check for string comparisons without quotes
      // Look for patterns like "= word" where word is not in quotes
      if (/=\s*([a-zA-Z]\w*)/.test(whereContent)) {
        const match = whereContent.match(/=\s*([a-zA-Z]\w*)/);
        if (match && !whereContent.includes(`'${match[1]}'`) && !whereContent.includes(`"${match[1]}"`)) {
          result.warnings.push('String values in WHERE clause should be quoted');
        }
      }
    }

    // Check for LIMIT without number
    if (/LIMIT\s*$/i.test(query)) {
      result.errors.push('LIMIT clause requires a number');
      result.valid = false;
    }

    // Check for common typos
    const typos = {
      'FORM': 'FROM',
      'WEHRE': 'WHERE',
      'LIMT': 'LIMIT',
      'FCAET': 'FACET'
    };

    Object.entries(typos).forEach(([typo, correct]) => {
      if (query.toUpperCase().includes(typo)) {
        result.warnings.push(`Possible typo: "${typo}" should be "${correct}"`);
      }
    });
  }
}

// Export a singleton instance as well
export const nrqlValidator = new NRQLValidator();