import { createInMemoryEventBus, createRuntime } from '@battle-agents/core';
import { questFeature } from '@battle-agents/quest';
import {
  closeDatabasePool,
  createDatabase,
  DrizzleQuestRepository,
  DrizzleStateStore,
  eventLog,
  projects,
  users,
  type Database,
} from '@battle-agents/db';
import { count, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * A quest event has to reach the database, not just the bus.
 *
 * The quest feature used to call `context.bus.publish` directly. That is the
 * right call for "tell whoever is listening" and the wrong call for "this is
 * part of the record": `store.append` and the feature event handlers both live
 * inside `runtime.emit`, so a published-but-not-emitted event was delivered to
 * subscribers and persisted nowhere. The feature still declared its events in
 * `persistedEvents`, so the declaration was a claim nothing acted on, and every
 * unit test stayed green because they all used a fake bus.
 *
 * The unit tests cannot catch this. They are the reason it survived: a spy bus
 * cannot tell a publish from an emit, and it has no store to miss a write in.
 * This drives the real feature through a runtime whose store is the real
 * database.
 *
 * Nothing here deletes from event_log. The integration suites share one
 * database, and truncating it in a beforeEach tore down rows another suite had
 * written and failed it for reasons that had nothing to do with this file.
 * Counting before and after is both sufficient and non-destructive.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;

let pool: Pool;
let database: Database;

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose ` +
        'Postgres is up, or export it before running this suite.',
    );
  }
  pool = new Pool({ connectionString, max: POOL_MAX_CONNECTIONS });
  database = createDatabase(pool);
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

/** A runtime wired the way the composition root wires it, with a real store. */
function questRuntime() {
  return createRuntime({
    extensions: [questFeature({ repository: new DrizzleQuestRepository(database) })],
    store: new DrizzleStateStore(database),
    bus: createInMemoryEventBus(),
  });
}

async function questEventRows(): Promise<number> {
  const [row] = await database
    .select({ value: count() })
    .from(eventLog)
    .where(like(eventLog.type, 'quest.%'));
  return row?.value ?? 0;
}

describe('quest events reach the database', () => {
  it('records quest.created after a create', async () => {
    const runtime = questRuntime();

    // projects.user_id is NOT NULL and references users, so the owner is not
    // optional. A quest that belongs to nobody is not something the schema
    // allows, which is the right answer and worth honouring in the fixture.
    const githubId = `${randomUUID()}-quest-owner`;
    const [owner] = await database
      .insert(users)
      .values({ githubId, login: githubId })
      .returning({ id: users.id });
    const ownerId = owner?.id ?? '';
    expect(ownerId).not.toBe('');

    const projectName = randomUUID();
    const [project] = await database
      .insert(projects)
      .values({ userId: ownerId, name: projectName, repoUrl: null })
      .returning({ id: projects.id });
    const projectId = project?.id ?? '';
    expect(projectId).not.toBe('');

    const before = await questEventRows();
    await runtime.runAction('quest.create', {
      projectId,
      title: 'Persist me',
      difficulty: 1,
      xpReward: 100,
    });
    const after = await questEventRows();

    expect(after).toBe(before + 1);
  });

  it('records quest.rejected for a refused create', async () => {
    const runtime = questRuntime();

    // The feature declares quest.rejected in persistedEvents, and that is the
    // right call rather than an accident: a refused create is somebody's agent
    // reaching for something malformed, which is exactly what an activity trail
    // and the anti-abuse review in the plan exist to surface. An earlier
    // version of this test asserted the opposite, on the assumption that only
    // successful work is worth a row. The feature's own manifest is the
    // authority here, and it disagrees with the assumption.
    const before = await questEventRows();
    await expect(
      runtime.runAction('quest.create', {
        projectId: null,
        title: '',
        difficulty: 1,
        xpReward: 100,
      }),
    ).rejects.toThrow(/quest not created/);
    const after = await questEventRows();

    expect(after).toBe(before + 1);
  });
});
