import { defineConfig } from 'vitest/config';

/** Stage: unit. Pure, no network, no database. Must stay under ~100ms per test (T9). */
export default defineConfig({
  test: {
    name: 'unit',
    include: ['tests/unit/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
  },
});
