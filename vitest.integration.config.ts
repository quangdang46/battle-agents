import { defineConfig } from 'vitest/config';

import { jsxSourceTransform, workspaceSourceAliases } from './vitest.shared.js';

/**
 * Stage: integration. Requires a live Postgres (the compose `postgres` service).
 * These tests are EXCLUDED from the unit stage on purpose: section 40 says any
 * red step blocks merge, which is only enforceable if the stages cannot leak into
 * one another. A single repository-wide glob let a Postgres-dependent test run in
 * the unit stage, and a pure unit test run in the integration stage, which makes
 * "the pipeline is green" meaningless.
 */
export default defineConfig({
  resolve: { alias: workspaceSourceAliases() },
  ...jsxSourceTransform(),
  test: {
    name: 'integration',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
