// ============================================================
// jest.config.js — Jest Configuration
// ============================================================

module.exports = {
  // Test file pattern
  testMatch: ['**/tests/**/*.test.js'],

  // Use the Node.js test environment (not browser/jsdom)
  testEnvironment: 'node',

  // Timeout: 30 seconds per test (allows for DB operations)
  testTimeout: 30000,

  // Run tests sequentially (not in parallel) to avoid DB conflicts
  maxWorkers: 1,

  // Show verbose output (each test name)
  verbose: true,

};
