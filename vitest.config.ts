import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/__tests__/**',
        'src/assets/**',
        'src/types/**',
        'src/shared/types/**',  // type-only declarations
        'src/content/index.ts',    // wiring entry point — tested via integration
        'src/content/player-observer.ts', // YouTube DOM observer — requires full browser env
        'src/background/**',    // service worker — requires browser APIs
        'src/popup/**',         // popup UI — requires chrome.storage stubs beyond unit scope
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
