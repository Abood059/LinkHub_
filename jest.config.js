module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/main/domain/**/*.js',
    'src/main/runtime/**/*.js',
    'src/main/infrastructure/**/*.js',
    '!src/main/**/*.test.js',
    '!src/main/**/index.js',
    '!src/main/**/constants.js'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  verbose: true,
  testTimeout: 10000
};
