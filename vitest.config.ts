import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // UI and documentation tests bundle source files themselves rather than importing them.
    forceRerunTriggers: ['**/src/**', '**/docs/**', '**/index.html', '**/vitest.config.ts'],
    projects: [
      {
        test: {
          name: 'regression',
          environment: 'node',
          include: ['tests/**/*.{test,spec}.{js,ts}'],
          exclude: ['tests/build.test.js', 'tests/portable.test.js'],
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: 'built',
          environment: 'node',
          include: ['tests/build.test.js', 'tests/portable.test.js'],
          testTimeout: 15000,
        },
      },
    ],
  },
});
