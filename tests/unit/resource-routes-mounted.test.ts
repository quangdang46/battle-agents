import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The bounty and battle resource routes are mounted, and each one is reached.
 *
 * The bead this belongs to is the one whose failure mode is named in its own
 * notes: a resource route is a TRANSLATOR, and a translator that is built,
 * tested and never mounted is invisible from inside the app and fatal to
 * everything outside it. That is not hypothetical here — the five primitives
 * were a pure dispatcher for a long time and a running server answered 404 to
 * all four, which is why packages/cli could not reach a running instance.
 *
 * Two things are asserted below and they are not the same thing:
 *
 *   - the FILES exist, and
 *   - each adapter actually CALLS its gateway.
 *
 * The second is the one a file-existence check waves through. An adapter that
 * imports `sharedBountyGateway` and builds the `HttpRequest` but never awaits
 * `handle` is a route that returns nothing, and it satisfies `existsSync` and
 * an import check equally well. `primitive-routes-mounted.test.ts` records the
 * same reasoning for `createRoutes(`, and this file is the copy of that lesson
 * for these adapters.
 *
 * What is NOT asserted here, because it cannot be asserted from a file listing:
 * that Next.js prefers these over the `/api/[...path]` catch-all. That was
 * checked against the framework by building the app and reading the route
 * table, once, when the catch-all was added — the same split between "the
 * assertion covers the FILES" and "the build covered the PRECEDENCE" that
 * `primitive-routes-mounted.test.ts` documents. Nothing here claims more than it
 * checks.
 *
 * Which is exactly the trap this list is exposed to, and the reason it is
 * written as data: a route added to `bounty-routes.ts` and given a test that
 * calls the pure handler would be green here with no entry at all, and the only
 * symptom in production is a 404 from the catch-all. `/api/bounties/{id}/fund`
 * is the second time that has been available in this repository, which is why
 * the entry is data rather than prose about the count.
 */

const repoRoot = resolve(import.meta.dirname, '../..');
const apiDir = join(repoRoot, 'apps/web/app/api');
const srcDir = join(repoRoot, 'apps/web/src');

/** Each route, the gateway it must reach through, and the method it answers. */
const ADAPTERS = [
  { path: 'bounties', gateway: 'sharedBountyGateway', methods: ['GET', 'POST'] },
  { path: 'bounties/[id]/claim', gateway: 'sharedBountyGateway', methods: ['POST'] },
  { path: 'bounties/[id]/submit', gateway: 'sharedBountyGateway', methods: ['POST'] },
  { path: 'bounties/[id]/fund', gateway: 'sharedBountyGateway', methods: ['POST'] },
  { path: 'battles', gateway: 'sharedBattleGateway', methods: ['GET', 'POST'] },
  { path: 'battles/[id]', gateway: 'sharedBattleGateway', methods: ['GET'] },
  { path: 'battles/[id]/join', gateway: 'sharedBattleGateway', methods: ['POST'] },
] as const;

describe('the bounty and battle resource routes are mounted', () => {
  it('has a Next.js route file for each of them', () => {
    for (const adapter of ADAPTERS) {
      const file = join(apiDir, adapter.path, 'route.ts');
      expect(existsSync(file), `${file} does not exist`).toBe(true);
    }
  });

  it('reaches its gateway rather than importing it and building a request', () => {
    for (const adapter of ADAPTERS) {
      const file = join(apiDir, adapter.path, 'route.ts');
      const source = readFileSync(file, 'utf8');
      expect(source, `${adapter.path} does not import its gateway`).toContain(
        `import { ${adapter.gateway} }`,
      );
      // `handle(` rather than the import name alone: the import proves the
      // module is in scope, `handle` proves the request is dispatched.
      expect(source, `${adapter.path} builds a request but never dispatches it`).toContain(
        `.handle(`,
      );
    }
  });

  it('exports a method for every verb its dispatcher answers', () => {
    for (const adapter of ADAPTERS) {
      const file = join(apiDir, adapter.path, 'route.ts');
      const source = readFileSync(file, 'utf8');
      for (const method of adapter.methods) {
        expect(
          source.includes(`export const ${method}`) || source.includes(`export const ${method} =`),
          `${adapter.path} does not export ${method}. Next.js answers 405 for a ` +
            `verb a route file does not export, so a dispatcher that answers ` +
            `${method} is unreachable if the export is missing.`,
        ).toBe(true);
      }
    }
  });
});

describe('the shared failure mapping is shared', () => {
  it('has exactly one definition across apps/web/src', () => {
    // This mapping was a private function in four dispatchers, and each copy
    // carried a comment saying that collapsing them was somebody else's job. The
    // copies had already drifted: only `routes.ts` knew an unknown action was a
    // 404. A fifth copy is the failure this assertion exists to make loud, and it
    // can fail — `describeHttpFailure` in `http-failure.ts` is the one it
    // permits.
    const offenders: string[] = [];
    for (const name of readdirSync(srcDir)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) {
        continue;
      }
      const source = readFileSync(join(srcDir, name), 'utf8');
      if (/^(?:export )?function describeFailure\b/m.test(source)) {
        offenders.push(name);
      }
    }
    expect(
      offenders,
      `a local describeFailure is back in ${offenders.join(', ')}. Use ` +
        `describeHttpFailure from http-failure.ts so there is one mapping to keep correct.`,
    ).toEqual([]);
  });

  it('is imported by every dispatcher rather than defined beside it', () => {
    const dispatchers = ['routes.ts', 'event-routes.ts', 'session-routes.ts', 'cron-routes.ts'];
    for (const name of dispatchers) {
      expect(
        readFileSync(join(srcDir, name), 'utf8'),
        `${name} does not use the shared mapping`,
      ).toContain("from './http-failure.js'");
    }
  });
});

describe('the removal test is still survivable', () => {
  it('names no feature outside the composition root', () => {
    // `scripts/removal-test.sh` strips a feature's import from `composition.ts`
    // along with its workspace dependency and path, then typechecks the tree. A
    // file under apps/web/src that imports a feature turns "remove a feature"
    // into "edit three files", so the gateways bind the SWEEP as a port rather
    // than importing the agent feature to get it. Asserted here because the
    // failure is a removal-test failure with a message about an unrelated
    // feature, which is a genuinely confusing way to learn it.
    const newFiles = [
      'bounty-gateway.ts',
      'bounty-routes.ts',
      'battle-gateway.ts',
      'battle-routes.ts',
      'http-failure.ts',
    ];
    for (const name of newFiles) {
      const source = readFileSync(join(srcDir, name), 'utf8');
      expect(source, `${name} imports a feature`).not.toMatch(
        /from '@battle-agents\/(agent|bounty|battle|quest|progression|reputation|social|achievements)'/,
      );
    }
  });
});
