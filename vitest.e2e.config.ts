import { defineConfig } from 'vitest/config';

/**
 * Stage: e2e. Requires the full stack: web + Postgres + auth.
 * M0 asserts only what M0 can produce (login -> agents -> session survives).
 * Bounty claim lands in the M2 stage; replay rendering in M4.
 */
export default defineConfig({
  test: {
    name: 'e2e',
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
