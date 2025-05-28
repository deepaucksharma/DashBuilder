import { NRQLValidator } from '../../src/utils/nrql-validator';

describe('NRQLValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new NRQLValidator();
  });

  describe('Basic validation', () => {
    test('validates a simple valid query', () => {
      const query = 'SELECT count(*) FROM SystemSample';
      const result = validator.validate(query);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects empty query', () => {
      const result = validator.validate('');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Query must be a non-empty string');
    });

    test('rejects null query', () => {
      const result = validator.validate(null);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Query must be a non-empty string');
    });

    test('requires SELECT clause', () => {
      const query = 'FROM SystemSample';
      const result = validator.validate(query);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Query must contain a SELECT clause');
    });

    test('requires FROM clause', () => {
      const query = 'SELECT count(*)';
      const result = validator.validate(query);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Query must contain a FROM clause');
    });
  });

  describe('Clause order validation', () => {
    test('validates correct clause order', () => {
      const query = 'SELECT count(*) FROM SystemSample WHERE hostname = "server1" SINCE 1 hour ago';
      const result = validator.validate(query);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects FROM before SELECT', () => {
      const query = 'FROM SystemSample SELECT count(*)';
      const result = validator.validate(query);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SELECT must be the first clause');
      expect(result.errors).toContain('FROM must come after SELECT');
    });
  });

  describe('Function validation', () => {
    test('validates known functions', () => {
      const query = 'SELECT average(cpuPercent), max(memoryUsedBytes) FROM SystemSample';
      const result = validator.validate(query);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    test('warns about unknown functions', () => {
      const query = 'SELECT unknownFunc(cpuPercent) FROM SystemSample';
      const result = validator.validate(query);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Unknown function: unknownfunc');
    });
  });

  describe('Time expression validation', () => {
    test('validates various time expressions', () => {
      const validExpressions = [
        '1 hour ago',
        '30 minutes ago',
        '7 days ago',
        'now',
        'today',
        'yesterday',
        'this week',
        'last month'
      ];

      validExpressions.forEach(expr => {
        const query = `SELECT count(*) FROM SystemSample SINCE ${expr}`;
        const result = validator.validate(query);
        
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    test('rejects invalid time expressions', () => {
      const query = 'SELECT count(*) FROM SystemSample SINCE invalid time';
      const result = validator.validate(query);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Invalid time expression/);
    });
  });

  describe('Common mistakes', () => {
    test('warns about unquoted strings in WHERE clause', () => {
      const query = 'SELECT count(*) FROM SystemSample WHERE hostname = server1';
      const result = validator.validate(query);
      
      expect(result.warnings).toContain('String values in WHERE clause should be quoted');
    });

    test('catches LIMIT without number', () => {
      const query = 'SELECT count(*) FROM SystemSample LIMIT';
      const result = validator.validate(query);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('LIMIT clause requires a number');
    });

    test('detects common typos', () => {
      const query = 'SELECT count(*) FORM SystemSample WEHRE hostname = "server1"';
      const result = validator.validate(query);
      
      expect(result.warnings).toContain('Possible typo: "FORM" should be "FROM"');
      expect(result.warnings).toContain('Possible typo: "WEHRE" should be "WHERE"');
    });
  });

  describe('Complex queries', () => {
    test('validates complex query with multiple clauses', () => {
      const query = `
        SELECT average(cpuPercent) as 'CPU', 
               max(memoryUsedBytes) as 'Memory'
        FROM SystemSample 
        WHERE hostname LIKE 'prod-%' 
        FACET hostname 
        SINCE 1 hour ago 
        UNTIL now 
        LIMIT 100 
        TIMESERIES
      `;
      const result = validator.validate(query);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});