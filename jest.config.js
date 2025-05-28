module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/jest'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  collectCoverageFrom: [
    'scripts/src/**/*.js',
    'orchestrator/**/*.js',
    'lib/**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest/setup.js'],
  testTimeout: 30000,
};