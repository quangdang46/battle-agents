import { summarise } from '@battle-agents/activity';
import { createInMemoryEventBus, createRuntime } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import {
  agents,
  closeDatabasePool,
  createDatabase,
  DrizzleActivityLog,
  DrizzleStateStore,
  installations,
  sessions,
  users,
  type Database,
} from '@battle-agents/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The activity log against a live Postgres.
 *
 * The unit tests pin the policy. These prove the wiring end to end: a runtime
 * whose store is the real database, emitting the events an agent actually
 * emits, and the rows that come back. The transient ones matter most — a log
 * that quietly records `thinking` and `tool.started` is a log that fills the
 * storage budget within an afternoon and nobody notices until the database
 * refuses writes.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;
const AT = '2026-09-24T12:00:00.000Z';

// A real session, because event_log.session_id is a foreign key and the
// database is right to refuse a row that points at a run that never happened.
// Faking the id would have meant dropping the constraint to test the log.
let SESSION_ID = '';
let ownerUserId = '';
let agentId = '';
let installationId = '';

let pool: Pool;
let database: Database;
let log: DrizzleActivityLog;
let runtime: Runtime;

/** An event shaped the way a run emits it: the session travels in the payload. */
function event(type: string, payload: Record<string, unknown> = {}): GameEvent {
  return {
    type,
    occurredAt: AT,
    actorId: 'agent-1',
    payload: { sessionId: SESSION_ID, ...payload },
  };
}

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: POOL_MAX_CONNECTIONS });
  database = createDatabase(pool);
  log = new DrizzleActivityLog(database);

  const githubId = `${randomUUID()}-activity`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  ownerUserId = owner?.id ?? '';
  const [agent] = await database
    .insert(agents)
    .values({ userId: ownerUserId, name: 'ActivityTester', harness: 'claude' })
    .returning({ id: agents.id });
  agentId = agent?.id ?? '';
  const [installation] = await database
    .insert(installations)
    .values({ userId: ownerUserId, installationKey: `${randomUUID()}-activity` })
    .returning({ id: installations.id });
  installationId = installation?.id ?? '';
  const [session] = await database
    .insert(sessions)
    .values({ agentId, installationId })
    .returning({ id: sessions.id });
  SESSION_ID = session?.id ?? '';

  runtime = createRuntime({
    extensions: [],
    store: new DrizzleStateStore(database),
    bus: createInMemoryEventBus(),
    now: () => AT,
  });
});

afterAll(async () => {
  await clearLog();
  if (ownerUserId !== '') {
    // Cascades to the agent, its installations and its sessions.
    await database.delete(users).where(eq(users.id, ownerUserId));
  }
  await closeDatabasePool(pool);
});

async function clearLog(): Promise<void> {
  await database.execute(`DELETE FROM event_log WHERE session_id = '${SESSION_ID}'`);
}

describe('what reaches the log', () => {
  it('records a key event with its actor, its session and its payload', async () => {
    await clearLog();

    await runtime.emit(event('session.started', { harness: 'claude' }));

    const entries = await log.trail({ sessionId: SESSION_ID });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'session.started',
      actorId: 'agent-1',
      sessionId: SESSION_ID,
    });
    expect(entries[0]?.payload).toEqual({ harness: 'claude' });
  });

  it('provably does not record the events a busy agent emits by the thousand', async () => {
    await clearLog();

    for (const type of [
      'thinking',
      'waiting',
      'session.heartbeat',
      'tool.started',
      'tool.completed',
      'file.read',
      'file.write',
      'command.run',
      'permission.requested',
    ]) {
      await runtime.emit(event(type));
    }

    expect(await log.trail({ sessionId: SESSION_ID })).toEqual([]);
  });

  it('still shows the dropped events to a live listener', async () => {
    // The point of the filter is that the database never sees these, not that
    // the game stops seeing them. A spectator watching a run must still watch
    // it move.
    await clearLog();
    const seen: string[] = [];
    const bus = createInMemoryEventBus();
    bus.subscribe((each) => seen.push(each.type));
    const watching = createRuntime({
      extensions: [],
      store: new DrizzleStateStore(database),
      bus,
      now: () => AT,
    });

    await watching.emit(event('thinking'));
    await watching.emit(event('tool.started'));

    expect(seen).toEqual(['thinking', 'tool.started']);
    expect(await log.trail({ sessionId: SESSION_ID })).toEqual([]);
  });

  it('keeps the order events were emitted in', async () => {
    await clearLog();
    const order = ['session.started', 'test.failed', 'test.passed', 'session.ended'];

    for (const type of order) {
      await runtime.emit(event(type));
    }

    const entries = await log.trail({ sessionId: SESSION_ID });
    expect(entries.map((entry) => entry.type)).toEqual(order);
    // Ordering is decided by the append sequence, not by the timestamp, which
    // is identical for all four here.
    expect(new Set(entries.map((entry) => entry.occurredAt)).size).toBe(1);
    expect(entries.map((entry) => entry.sequence)).toEqual(
      [...entries.map((entry) => entry.sequence)].sort((a, b) => a - b),
    );
  });

  it('keeps two concurrent runs apart', async () => {
    await clearLog();
    const [second] = await database
      .insert(sessions)
      .values({ agentId: agentId, installationId: installationId })
      .returning({ id: sessions.id });
    const other = second?.id ?? '';

    await runtime.emit(event('session.started'));
    await runtime.emit({ ...event('session.started'), payload: { sessionId: other } });

    expect(await log.trail({ sessionId: SESSION_ID })).toHaveLength(1);
    expect(await log.trail({ sessionId: other })).toHaveLength(1);
  });
});

describe('reading a trail', () => {
  it('summarises a session the way section 30 describes it', async () => {
    // Through a feature that declares bounty.claimed as one of its own key
    // events, which is how a game event reaches the log at all. Core knows
    // nothing about bounties, and the alternative — putting the list in core —
    // would make every new feature a core edit.
    await clearLog();
    const withBountyFeature = createRuntime({
      extensions: [{ id: 'fake-bounty', persistedEvents: ['bounty.claimed'] }],
      store: new DrizzleStateStore(database),
      bus: createInMemoryEventBus(),
      now: () => AT,
    });

    await withBountyFeature.emit(event('bounty.claimed', { bountyId: 'b-1' }));
    await withBountyFeature.emit(event('test.passed', { suite: 'unit', count: 12 }));

    const lines = summarise(await log.trail({ sessionId: SESSION_ID }));

    expect(lines.map((line) => line.description)).toEqual([
      'bounty.claimed (bountyId=b-1)',
      'test.passed (count=12 suite=unit)',
    ]);
  });

  it('does not record a game event whose feature does not declare it', async () => {
    // The other half of the same rule: declaring is what makes an event
    // durable, and an undeclared one stays on the bus.
    await clearLog();
    await runtime.emit(event('bounty.claimed', { bountyId: 'b-1' }));

    expect(await log.trail({ sessionId: SESSION_ID })).toEqual([]);
  });

  it('reads the newest entries first when asked what just happened', async () => {
    await clearLog();
    // Key events, in order: an event the log drops is not evidence of an
    // ordering bug, it is the filter working.
    const order = ['session.started', 'test.failed', 'session.ended'];
    for (const type of order) {
      await runtime.emit(event(type));
    }

    expect((await log.recent(SESSION_ID, 2)).map((entry) => entry.type)).toEqual([
      'session.ended',
      'test.failed',
    ]);
  });
});

describe('retention', () => {
  it('removes only what has aged past the cutoff, and says how much', async () => {
    await clearLog();
    await database.execute(
      `INSERT INTO event_log (type, actor_id, session_id, payload, occurred_at)
       VALUES ('session.started', 'agent-1', '${SESSION_ID}', '{}'::jsonb, '2020-01-01T00:00:00.000Z')`,
    );
    await database.execute(
      `INSERT INTO event_log (type, actor_id, session_id, payload, occurred_at)
       VALUES ('session.ended', 'agent-1', '${SESSION_ID}', '{}'::jsonb, '${AT}')`,
    );

    const removed = await log.prune('2025-09-24T12:00:00.000Z');

    expect(removed).toBe(1);
    expect((await log.trail({ sessionId: SESSION_ID })).map((entry) => entry.type)).toEqual([
      'session.ended',
    ]);
  });
});
