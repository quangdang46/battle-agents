import { defineConfig } from 'vitest/config';

import { jsxSourceTransform, workspaceSourceAliases } from './vitest.shared.js';

/**
 * Stage: m2. Requires a live Postgres (the compose `postgres-test` service).
 *
 * Its own config, and NOT part of the unit or integration stages, because plan
 * section 27 M2 is a milestone of its own: these assertions are the M2
 * definition of done, and section 40's 2026-09-24 amendment moved them OUT of
 * the M0 smoke precisely because a gate that asserts a milestone that does not
 * exist yet cannot be green. A separate directory and a separate config is what
 * makes that move reversible: a file added here is a file that is in the M2 gate
 * by decision, and one added under tests/integration is in the M0 gate.
 *
 * The M0 smoke must not run these, and `tests/unit/no-orphan-tests.test.ts` is
 * what holds every test file to a stage, so a suite written here and never
 * added to `scripts/stages-m2.manifest` is an orphan rather than a silent pass.
 */
export default defineConfig({
  resolve: { alias: workspaceSourceAliases() },
  ...jsxSourceTransform(),
  test: {
    name: 'm2',
    include: ['tests/m2/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
