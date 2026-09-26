import { defineConfig } from 'vitest/config';

import { jsxSourceTransform, workspaceSourceAliases } from './vitest.shared.js';

/**
 * Stage: m4. Requires a live Postgres (the compose `postgres-test` service),
 * except for the load-threshold suite, which drives an in-memory harness.
 *
 * Its own config, and NOT part of the unit or integration stages, because plan
 * section 27 M4 is a milestone of its own: these assertions are the M4
 * definition of done, and section 40's 2026-09-24 amendment moved them OUT of
 * the M0 smoke precisely because a gate that asserts a milestone that does not
 * exist yet cannot be green. A separate directory and a separate config is what
 * makes that move reversible: a file added here is a file that is in the M4 gate
 * by decision, and one added under tests/integration is in the M0 gate.
 *
 * The pairing with `tests/unit/no-orphan-tests.test.ts` is the weaker half of
 * that promise, and worth being exact about: no-orphan holds every test FILE to
 * a stage CONFIG, not to a stage. `scripts/stages-m4.manifest` is what names
 * individual files, and `run_milestone_tests` is what runs exactly the one a
 * stage named. A file added here and to no stage is claimed by a config and run
 * by nothing, which is why `tests/m4/load-threshold.test.ts` asserts the pairing
 * is complete rather than trusting the arrangement.
 */
export default defineConfig({
  resolve: { alias: workspaceSourceAliases() },
  ...jsxSourceTransform(),
  test: {
    name: 'm4',
    include: ['tests/m4/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
