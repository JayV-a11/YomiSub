/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  reporters: ['html', 'clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  thresholds: { high: 80, low: 60, break: 60 },
  mutate: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/__tests__/**',
    '!src/assets/**',
    '!src/types/**',
    '!src/popup/**',
  ],
  ignorePatterns: ['dist', 'node_modules', 'public'],
  vitest: {
    configFile: 'vitest.config.ts',
  },
}
