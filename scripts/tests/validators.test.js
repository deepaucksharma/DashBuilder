import { describe, it, expect } from '@jest/globals';
import {
  validateNRQLQuery,
  validateEventType,
  validateAttributeName,
  extractEventTypeFromQuery,
  extractAttributesFromQuery,
  isValidNRQLFunction,
  suggestCorrection,
  isValidVisualization
} from '../src/utils/validators.js';

describe('NRQL Validators', () => {
  describe('validateNRQLQuery', () => {
    it('should validate correct NRQL queries', () => {
      expect(() => validateNRQLQuery('SELECT count(*) FROM Transaction')).not.toThrow();
      expect(() => validateNRQLQuery('SELECT average(duration) FROM Transaction WHERE appName = "app"')).not.toThrow();
      expect(() => validateNRQLQuery('SHOW EVENT TYPES')).not.toThrow();
    });

    it('should reject invalid NRQL queries', () => {
      expect(() => validateNRQLQuery('INVALID QUERY')).toThrow();
      expect(() => validateNRQLQuery('count(*) FROM Transaction')).toThrow();
      expect(() => validateNRQLQuery('SELECT FROM Transaction')).toThrow();
    });
  });

  describe('validateEventType', () => {
    it('should validate correct event types', () => {
      expect(validateEventType('Transaction')).toBe('Transaction');
      expect(validateEventType('Custom_Event')).toBe('Custom_Event');
      expect(validateEventType('PageView')).toBe('PageView');
    });

    it('should reject invalid event types', () => {
      expect(() => validateEventType('123Invalid')).toThrow();
      expect(() => validateEventType('Invalid-Event')).toThrow();
      expect(() => validateEventType('Invalid Event')).toThrow();
    });
  });

  describe('validateAttributeName', () => {
    it('should validate correct attribute names', () => {
      expect(validateAttributeName('duration')).toBe('duration');
      expect(validateAttributeName('custom.attribute')).toBe('custom.attribute');
      expect(validateAttributeName('user_id')).toBe('user_id');
    });

    it('should reject invalid attribute names', () => {
      expect(() => validateAttributeName('123attribute')).toThrow();
      expect(() => validateAttributeName('attribute-name')).toThrow();
      expect(() => validateAttributeName('attribute name')).toThrow();
    });
  });

  describe('extractEventTypeFromQuery', () => {
    it('should extract event type from valid queries', () => {
      expect(extractEventTypeFromQuery('SELECT count(*) FROM Transaction')).toBe('Transaction');
      expect(extractEventTypeFromQuery('SELECT * FROM PageView WHERE url = "/"')).toBe('PageView');
      expect(extractEventTypeFromQuery('select avg(duration) from CustomEvent')).toBe('CustomEvent');
    });

    it('should return null for SHOW EVENT TYPES', () => {
      expect(extractEventTypeFromQuery('SHOW EVENT TYPES')).toBe(null);
    });

    it('should throw for queries without FROM clause', () => {
      expect(() => extractEventTypeFromQuery('SELECT count(*)')).toThrow();
    });
  });

  describe('extractAttributesFromQuery', () => {
    it('should extract attributes from SELECT clause', () => {
      const attrs = extractAttributesFromQuery('SELECT duration, appName FROM Transaction');
      expect(attrs).toContain('duration');
      expect(attrs).toContain('appName');
    });

    it('should extract attributes from WHERE clause', () => {
      const attrs = extractAttributesFromQuery('SELECT count(*) FROM Transaction WHERE duration > 1 AND appName = "web"');
      expect(attrs).toContain('duration');
      expect(attrs).toContain('appName');
    });

    it('should extract attributes from FACET clause', () => {
      const attrs = extractAttributesFromQuery('SELECT count(*) FROM Transaction FACET appName, host');
      expect(attrs).toContain('appName');
      expect(attrs).toContain('host');
    });

    it('should handle complex queries', () => {
      const query = 'SELECT average(duration), count(*) FROM Transaction WHERE appName = "web" AND duration > 1 FACET host, region';
      const attrs = extractAttributesFromQuery(query);
      expect(attrs).toContain('duration');
      expect(attrs).toContain('appName');
      expect(attrs).toContain('host');
      expect(attrs).toContain('region');
    });
  });

  describe('isValidNRQLFunction', () => {
    it('should validate known NRQL functions', () => {
      expect(isValidNRQLFunction('count')).toBe(true);
      expect(isValidNRQLFunction('average')).toBe(true);
      expect(isValidNRQLFunction('sum')).toBe(true);
      expect(isValidNRQLFunction('uniqueCount')).toBe(true);
      expect(isValidNRQLFunction('percentile')).toBe(true);
    });

    it('should reject unknown functions', () => {
      expect(isValidNRQLFunction('invalid')).toBe(false);
      expect(isValidNRQLFunction('avg')).toBe(false);
      expect(isValidNRQLFunction('cnt')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isValidNRQLFunction('COUNT')).toBe(true);
      expect(isValidNRQLFunction('Average')).toBe(true);
    });
  });

  describe('suggestCorrection', () => {
    it('should suggest close matches', () => {
      const suggestions = suggestCorrection('averge', ['average', 'sum', 'count']);
      expect(suggestions).toContain('average');
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should not suggest very different words', () => {
      const suggestions = suggestCorrection('xyz', ['average', 'sum', 'count']);
      expect(suggestions.length).toBe(0);
    });

    it('should handle case differences', () => {
      const suggestions = suggestCorrection('COUNT', ['count', 'sum', 'average']);
      expect(suggestions).toContain('count');
    });
  });

  describe('isValidVisualization', () => {
    it('should validate known visualization types', () => {
      expect(isValidVisualization('line')).toBe(true);
      expect(isValidVisualization('bar')).toBe(true);
      expect(isValidVisualization('billboard')).toBe(true);
      expect(isValidVisualization('table')).toBe(true);
      expect(isValidVisualization('pie')).toBe(true);
    });

    it('should reject unknown visualization types', () => {
      expect(isValidVisualization('invalid')).toBe(false);
      expect(isValidVisualization('custom-viz')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isValidVisualization('LINE')).toBe(true);
      expect(isValidVisualization('Billboard')).toBe(true);
    });
  });
});