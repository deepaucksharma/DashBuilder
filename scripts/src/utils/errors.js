class NRGuardianError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'NRGuardianError';
    this.code = code;
  }
}

class ValidationError extends NRGuardianError {
  constructor(message, details = null) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details;
  }
}

class APIError extends NRGuardianError {
  constructor(message, statusCode, details = null) {
    super(message, 'API_ERROR');
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

class ConfigError extends NRGuardianError {
  constructor(message) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

class SchemaError extends NRGuardianError {
  constructor(message, details = null) {
    super(message, 'SCHEMA_ERROR');
    this.name = 'SchemaError';
    this.details = details;
  }
}

class NRQLError extends NRGuardianError {
  constructor(message, query, suggestions = []) {
    super(message, 'NRQL_ERROR');
    this.name = 'NRQLError';
    this.query = query;
    this.suggestions = suggestions;
  }
}

module.exports = {
  NRGuardianError,
  ValidationError,
  APIError,
  ConfigError,
  SchemaError,
  NRQLError
};