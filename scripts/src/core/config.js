const { ValidationError } = require('../utils/errors.js');

class Config {
  constructor(options = {}) {
    // API Configuration
    this.apiKey = options.apiKey || process.env.NEW_RELIC_API_KEY;
    this.accountId = options.accountId || process.env.NEW_RELIC_ACCOUNT_ID;
    this.region = options.region || process.env.NEW_RELIC_REGION || 'US';

    // Guardian Configuration
    this.cacheTTL = parseInt(process.env.NR_GUARDIAN_CACHE_TTL || '3600');
    this.rateLimitMax = parseInt(process.env.NR_GUARDIAN_RATE_LIMIT_MAX || '25');
    this.logLevel = process.env.NR_GUARDIAN_LOG_LEVEL || 'info';
    this.enableCache = process.env.NR_GUARDIAN_ENABLE_CACHE !== 'false';

    // Output Configuration
    this.outputFormat = options.json ? 'json' : 'human';
    this.verbose = options.verbose || false;
    this.quiet = options.quiet || false;

    // Cache override
    if (options.cache === false) {
      this.enableCache = false;
    }

    this.validate();
  }

  validate() {
    if (!this.apiKey) {
      throw new ValidationError(
        'New Relic API key not found. Set NEW_RELIC_API_KEY environment variable or use --api-key flag'
      );
    }

    if (this.region && !['US', 'EU'].includes(this.region.toUpperCase())) {
      throw new ValidationError('Region must be either US or EU');
    }

    this.region = this.region.toUpperCase();
  }

  requireAccountId() {
    if (!this.accountId) {
      throw new ValidationError(
        'New Relic account ID not found. Set NEW_RELIC_ACCOUNT_ID environment variable or use --account-id flag'
      );
    }
    return this.accountId;
  }

  toJSON() {
    return {
      apiKey: this.apiKey ? '***' + this.apiKey.slice(-4) : undefined,
      accountId: this.accountId,
      region: this.region,
      cacheTTL: this.cacheTTL,
      rateLimitMax: this.rateLimitMax,
      logLevel: this.logLevel,
      enableCache: this.enableCache,
      outputFormat: this.outputFormat,
      verbose: this.verbose,
      quiet: this.quiet
    };
  }
}

module.exports = { Config };
