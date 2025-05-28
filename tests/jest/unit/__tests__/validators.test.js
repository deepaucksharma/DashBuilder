const validators = require('../../../../scripts/src/utils/validators');

describe('Validators', () => {
  describe('validateAccountId', () => {
    test('should validate numeric account IDs', () => {
      expect(validators.validateAccountId('1234567')).toBe(true);
      expect(validators.validateAccountId('0')).toBe(true);
    });

    test('should reject invalid account IDs', () => {
      expect(validators.validateAccountId('')).toBe(false);
      expect(validators.validateAccountId('abc')).toBe(false);
      expect(validators.validateAccountId(null)).toBe(false);
      expect(validators.validateAccountId(undefined)).toBe(false);
    });
  });

  describe('validateApiKey', () => {
    test('should validate properly formatted API keys', () => {
      expect(validators.validateApiKey('NRAK-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')).toBe(true);
      expect(validators.validateApiKey('eu01xx-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')).toBe(true);
    });

    test('should reject invalid API keys', () => {
      expect(validators.validateApiKey('')).toBe(false);
      expect(validators.validateApiKey('invalid-key')).toBe(false);
      expect(validators.validateApiKey('NRAK-SHORT')).toBe(false);
    });
  });

  describe('validateNRQL', () => {
    test('should validate basic NRQL queries', () => {
      expect(validators.validateNRQL('SELECT * FROM Transaction')).toBe(true);
      expect(validators.validateNRQL('SELECT count(*) FROM Transaction WHERE appName = "test"')).toBe(true);
      expect(validators.validateNRQL('FROM Transaction SELECT *')).toBe(true);
    });

    test('should reject invalid NRQL queries', () => {
      expect(validators.validateNRQL('')).toBe(false);
      expect(validators.validateNRQL('DROP TABLE Transaction')).toBe(false);
      expect(validators.validateNRQL('SELECT')).toBe(false);
    });
  });

  describe('validateDashboardConfig', () => {
    test('should validate complete dashboard configuration', () => {
      const validConfig = {
        name: 'Test Dashboard',
        permissions: 'PUBLIC_READ_ONLY',
        pages: [
          {
            name: 'Page 1',
            widgets: [
              {
                title: 'Widget 1',
                configuration: {
                  queries: [{ accountId: 123, query: 'SELECT * FROM Transaction' }]
                },
                layout: { column: 1, row: 1, width: 4, height: 3 }
              }
            ]
          }
        ]
      };
      
      expect(validators.validateDashboardConfig(validConfig)).toBe(true);
    });

    test('should reject invalid dashboard configuration', () => {
      expect(validators.validateDashboardConfig({})).toBe(false);
      expect(validators.validateDashboardConfig({ name: 'Test' })).toBe(false);
      expect(validators.validateDashboardConfig({ name: 'Test', pages: [] })).toBe(false);
    });
  });
});