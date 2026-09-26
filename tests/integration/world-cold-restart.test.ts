import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

/**
 * The only honest version of M5's "close all sessions, reopen next day".
 *
 * ## Why THIS file exists, when the other world test looks like it does the job
 *
 * It does not, and measuring that is why this file exists.
 *
 * `world-persistence.test.ts` builds a second runtime and hands it the same
 * repository, and it passes — including against an injected module-level cache
 * holding the whole world in memory. Both halves shared a MODULE, so anything
 * at module scope survived the "restart" and the assertion compared the cache
 * with itself. A test that says "the process is gone" while sharing the
 * process's module scope is a comment.
 *
 * The unit test was strengthened the same way and passed the mutation too,
 * until it reloaded the module. Reloading fixes module state within one
 * process; it cannot fix a module-scope variable that the reload happens to
 * preserve, and it is still not a process. So this one does the thing the
 * milestone actually says: it starts a SECOND PROCESS, which cannot share a
 * module with the first by construction, and asks it to read the base.
 *
 * ## What "NEXT DAY" IS TAKEN TO MEAN
 *
 * Not a 24-hour wait — a test that waits is a test nobody runs. The content of
 * the sentence is that the world is a function of durable rows and not of any
 * live process, and the strongest available proxy for a cold process is an
 * actual cold process. If the world lived in memory, in a module variable, or
 * behind a session handle, the child would read an empty base and this fails.
 */

const REPO_ROOT = resolve(import.meta.dirname, '../..');

/**
 * Reads a base in a process that has never run this feature's code before.
 *
 * Written to a file and run with tsx because a child process is the point: it
 * gets a fresh module registry, fresh globals and no reference to anything the
 * test holds.
 */
function readBaseInAColdProcess(agentId: string, connectionString: string): string {
  // INSIDE the repository, not in the OS temp directory. Node resolves `pg` by
  // walking up from the importing file, and a script in /tmp walks up to a
  // directory with no node_modules in it — so the first version of this failed
  // to find a package the parent process had loaded without trouble. Being in
  // the repo also means the child resolves the same dependency graph the
  // application does, rather than whatever happens to be nearest.
  const dir = join(REPO_ROOT, '.tmp', `world-cold-${process.pid}-${randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  try {
    // `.mts` and not `.ts`: the script uses top-level await, and a `.ts` file
    // with no `"type": "module"` above it is CommonJS to esbuild, which turns
    // the await into a syntax error before any of this runs.
    const script = join(dir, 'read-base.mts');
    writeFileSync(
      script,
      `import { levelForXp, meetsGate, progressionFeature } from '${REPO_ROOT}/packages/features/progression/src/index.js';
import { WORLD_READ, worldFeature } from '${REPO_ROOT}/packages/features/world/src/index.js';
import {
  DrizzleProgressionRepository,
  DrizzleStateStore,
  DrizzleWorldRepository,
  createDatabase,
} from '${REPO_ROOT}/packages/db/src/index.js';
import { createApplicationApi } from '${REPO_ROOT}/packages/api/src/index.js';
import { createInMemoryEventBus, createRuntime } from '${REPO_ROOT}/packages/core/src/index.js';
import { Pool } from 'pg';

// The clock is real here, not the fixture's, because this process has never
// seen the test's. Nothing here depends on it — a base read does not move a
// timestamp — and pinning it would be a lie about what this process is.
const database = createDatabase(new Pool({ connectionString: ${JSON.stringify(connectionString)}, max: 2 }));
const progression = new DrizzleProgressionRepository(database);
const api = createApplicationApi(
  createRuntime({
    extensions: [
      progressionFeature({ repository: progression }),
      worldFeature({
        repository: new DrizzleWorldRepository(database),
        levelOf: async (id: string) => (await progression.find(id))?.level ?? 1,
        gate: meetsGate,
      }),
    ],
    store: new DrizzleStateStore(database),
    bus: createInMemoryEventBus(),
  }),
);
const read = await api.act(WORLD_READ, { agentId: ${JSON.stringify(agentId)} });
process.stdout.write(JSON.stringify(read));
process.exit(0);
`,
      'utf8',
    );
    // The binary directly, not `pnpm exec tsx`. Going through pnpm resolves the
    // whole workspace toolchain before running anything, which cost about four
    // seconds per run — enough, in a suite that runs files in parallel, to push
    // other files past their timeouts. The child is the point of this test, not
    // how slowly it is spawned.
    return execFileSync(join(REPO_ROOT, 'node_modules/.bin/tsx'), [script], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the world outlives the process that built it', () => {
  it('reads back in a process that has never run this feature before', async () => {
    const connectionString = process.env['DATABASE_URL'];
    if (connectionString === undefined) {
      throw new Error('DATABASE_URL is not set. Run through scripts/test-m0.sh.');
    }

    // Written by THIS process, through the real feature and the real repository.
    const { createDatabase, DrizzleProgressionRepository, DrizzleStateStore, DrizzleWorldRepository } =
      await import('@battle-agents/db');
    const { levelForXp, meetsGate, progressionFeature } = await import('@battle-agents/progression');
    const { WORLD_READ, WORLD_UPGRADE, worldFeature } = await import('@battle-agents/world');
    const { createApplicationApi } = await import('@battle-agents/api');
    const { createInMemoryEventBus, createRuntime } = await import('@battle-agents/core');
    const { Pool } = await import('pg');
    const { agents, users } = await import('@battle-agents/db');

    const database = createDatabase(new Pool({ connectionString, max: 2 }));
    const progression = new DrizzleProgressionRepository(database);
    const api = createApplicationApi(
      createRuntime({
        extensions: [
          progressionFeature({ repository: progression }),
          worldFeature({
            repository: new DrizzleWorldRepository(database),
            levelOf: async (id: string) => (await progression.find(id))?.level ?? 1,
            gate: meetsGate,
          }),
        ],
        store: new DrizzleStateStore(database),
        bus: createInMemoryEventBus(),
        now: () => '2026-09-27T12:00:00.000Z',
      }),
    );

    const login = `cold-${randomUUID()}`;
    const [user] = await database
      .insert(users)
      .values({ githubId: login, login })
      .returning({ id: users.id });
    const [agent] = await database
      .insert(agents)
      .values({
        userId: user?.id ?? '',
        name: `cold-${randomUUID().slice(0, 8)}`,
        harness: 'claude-code',
        xp: 56_000,
        level: levelForXp(56_000),
      })
      .returning({ id: agents.id });
    const agentId = agent?.id ?? '';

    await api.act(WORLD_UPGRADE, { agentId, buildingId: 'workshop' });
    await api.act(WORLD_UPGRADE, { agentId, buildingId: 'workshop' });
    await api.act(WORLD_UPGRADE, { agentId, buildingId: 'lab' });
    const before = (await api.act(WORLD_READ, { agentId })) as unknown;

    // The process is gone. This one shares no memory, no module registry and no
    // globals with the code above — only the database.
    const after = JSON.parse(readBaseInAColdProcess(agentId, connectionString)) as unknown;

    expect(after).toEqual(before);
    const read = after as { buildings: readonly { id: string; level: number }[] };
    expect(read.buildings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'workshop', level: 2 }),
        expect.objectContaining({ id: 'lab', level: 1 }),
      ]),
    );
  }, 120_000);
});
