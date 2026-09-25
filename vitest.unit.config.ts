import { defineConfig } from 'vitest/config';

import { workspaceSourceAliases } from './vitest.shared.js';

/**
 * Stage: unit. Pure, no network, no database. Must stay under ~100ms per test (T9).
 *
 * The nested workspaces need their own globs. A single-level `packages` pattern
 * reaches packages/core but not packages/features/quest, which sits one level
 * deeper, and a pattern that quietly misses them is the same failure the
 * no-orphan test exists to catch. Spelling them out means a feature test
 * written outside these globs is reported as orphaned rather than skipped.
 *
 * `apps/` is here for the same reason. The web app's route handlers are pure
 * functions over the application API, so they test without a server — and
 * before apps/ was listed, such a test was not run at all: vitest reported
 * "No test files found" and exited non-zero, which a contributor would reasonably
 * read as a broken filter rather than a missing glob.
 *
 * (These globs are written out rather than described in prose for the reason
 * recorded in tests/unit/no-orphan-tests.test.ts: a comment containing a
 * glob that ends in two stars closes the block comment early, and the rest of
 * the sentence is then parsed as code.)
 */
export default defineConfig({
  resolve: { alias: workspaceSourceAliases() },
  test: {
    name: 'unit',
    include: [
      'tests/unit/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'packages/features/*/src/**/*.test.ts',
      'packages/adapters/*/src/**/*.test.ts',
      'packages/infrastructure/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
    ],
  },
});
