import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `.tmp/` holds vendored research repos that are not part of this workspace,
    // so the default repository-wide glob must not reach them.
    include: ['tests/**/*.test.ts', 'packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
  },
});
