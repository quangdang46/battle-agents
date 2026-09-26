import { buildPublicReplay } from '@battle-agents/activity';
import type { ActivityLog } from '@battle-agents/activity';
import { battleFeature } from '@battle-agents/battle';
import { createInMemoryEventBus, createRuntime } from '@battle-agents/core';
import type { Runtime } from '@battle-agents/core';
import {
  battles,
  closeDatabasePool,
  createDatabase,
  DrizzleActivityLog,
  DrizzleAgentRepository,
  DrizzleBattleRepository,
  DrizzleStateStore,
  eventLog,
  installations,
  sessions,
  users,
  type Database,
} from '@battle-agents/db';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The public replay, against a real database.
 *
 * The unit tests pin the projection and the merge. These pin the four things a
 * fake would wave through and a wrong answer would still look right:
 *
 *  1. THE TIMELINE COMES FROM `event_log`. Not from a table that happens to
 *     agree. The proof is adversarial rather than structural: the battles row is
 *     rewritten to say something different from the log, and the replay does not
 *     move. A projection that read the row would move with it, and nobody would
 *     see anything wrong — a replay that disagrees with itself is invisible.
 *
 *  2. IT SURVIVES A RESTART. Every reader here is constructed fresh against the
 *     database, with no runtime, no bus and no in-memory store. A bus-only event
 *     is emitted through a real runtime and asserted absent from the replay,
 *     which is what "reconstructable ONLY from persisted events" means in
 *     practice rather than in a comment.
 *
 *  3. THE PUBLIC HANDLE IS NOT THE INTERNAL ONE. A leaked `battles.id` must not
 *     address a replay, and a replay link must not be walkable back to the row.
 *     The random default is read out of `information_schema` rather than
 *     assumed, because the alternative — a sequential id on public data — is the
 *     bulk-scrape the brief names.
 *
 *  4. A SCOPED READ WITH NO SUBJECT IS EMPTY. The other answer is the whole
 *     audit trail, and it is one missing `if` away.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;
const AT = '2026-09-26T10:00:00.000Z';

let pool: Pool;
let database: Database;
let battles_: DrizzleBattleRepository;
let alice: string;
let bob: string;
let battleId = '';
let replayId = '';

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: POOL_MAX_CONNECTIONS });
  database = createDatabase(pool);
  battles_ = new DrizzleBattleRepository(database);

  const githubId = `replay-owner-${randomUUID()}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const ownerId = owner?.id ?? '';
  const [installation] = await database
    .insert(installations)
    .values({ userId: ownerId, installationKey: `replay-installation-${randomUUID()}` })
    .returning({ id: installations.id });
  const installationId = installation?.id ?? '';

  // Real sessions, because `event_log.session_id` is a foreign key and the
  // database is right to refuse a row pointing at a run that never happened.
  const agents = new DrizzleAgentRepository(database);
  const newSession = async (name: string, harness: 'claude' | 'codex'): Promise<string> => {
    const agent = await agents.create({ ownerId, name, harness }, AT);
    const [row] = await database
      .insert(sessions)
      .values({
        agentId: agent.id,
        installationId,
        status: 'disconnected',
        startedAt: new Date(AT),
        endedAt: new Date(AT),
      })
      .returning({ id: sessions.id });
    if (row === undefined) throw new Error('a session was created and could not be read back');
    return row.id;
  };
  alice = await newSession(`replay-claude-${randomUUID()}`, 'claude');
  bob = await newSession(`replay-codex-${randomUUID()}`, 'codex');

  const [created] = await database
    .insert(battles)
    .values({
      mode: 'speed',
      weightsJson: { correctness: 0.5, tests: 0.2, security: 0.3 },
      status: 'completed',
      startedAt: new Date('2026-09-26T10:00:00.000Z'),
      finishedAt: new Date('2026-09-26T10:20:00.000Z'),
    })
    .returning({ id: battles.id, replayId: battles.replayId });
  battleId = created?.id ?? '';
  replayId = created?.replayId ?? '';

  await writeLog([
    {
      type: 'battle.created',
      payload: {
        battleId,
        mode: 'speed',
        weights: { correctness: 0.5, tests: 0.2, security: 0.3 },
        participants: [alice, bob],
      },
      at: '2026-09-26T10:00:00.000Z',
    },
    {
      type: 'battle.joined',
      sessionId: bob,
      payload: { battleId, participants: [alice, bob] },
      at: '2026-09-26T10:00:30.000Z',
    },
    {
      type: 'session.started',
      sessionId: alice,
      payload: { harness: 'claude' },
      at: '2026-09-26T10:01:00.000Z',
    },
    {
      type: 'test.passed',
      sessionId: alice,
      payload: { suite: 'unit', count: 47 },
      at: '2026-09-26T10:05:00.000Z',
    },
    {
      type: 'test.failed',
      sessionId: alice,
      payload: {
        suite: 'integration',
        failure: 'AssertionError at /Users/someone/secret/src/auth.ts:42',
      },
      at: '2026-09-26T10:06:00.000Z',
    },
    {
      type: 'session.started',
      sessionId: bob,
      payload: { harness: 'codex' },
      at: '2026-09-26T10:02:00.000Z',
    },
    {
      type: 'test.passed',
      sessionId: bob,
      payload: { suite: 'unit', count: 12 },
      at: '2026-09-26T10:07:00.000Z',
    },
    {
      type: 'file.write',
      sessionId: alice,
      payload: { path: '/Users/someone/secret/src/auth.ts' },
      at: '2026-09-26T10:05:30.000Z',
    },
    {
      type: 'battle.finished',
      payload: {
        battleId,
        mode: 'speed',
        weights: { correctness: 0.5, tests: 0.2, security: 0.3 },
        outcome: 'won',
        reason: 'outscored',
        winnerSessionIds: [alice],
        participants: [alice, bob],
        scores: [
          {
            sessionId: bob,
            total: 0.61,
            criteria: [{ criterion: 'tests', weight: 0.2, score: 0.9, weighted: 0.18 }],
          },
          {
            sessionId: alice,
            total: 0.94,
            criteria: [{ criterion: 'tests', weight: 0.2, score: 0.95, weighted: 0.19 }],
          },
        ],
      },
      at: '2026-09-26T10:20:00.000Z',
    },
  ]);
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

interface SeedEvent {
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly at: string;
  readonly sessionId?: string;
}

/**
 * Writes rows the way the runtime does: the session is lifted out of the payload
 * into its own column and DELETED from the payload, which is
 * `DrizzleStateStore.splitSession`. Writing them any other way would test a log
 * the real system never produces.
 */
async function writeLog(rows: readonly SeedEvent[]): Promise<void> {
  const runtime = await seedRuntime();
  for (const row of rows) {
    const payload: Record<string, unknown> = {
      ...row.payload,
      ...(row.sessionId === undefined ? {} : { sessionId: row.sessionId }),
    };
    await runtime.emit({
      type: row.type,
      occurredAt: row.at,
      actorId: 'battle',
      payload,
    });
  }
}

let seeded: { runtime: Runtime; prime: () => Promise<void> } | undefined;
async function seedRuntime(): Promise<Runtime> {
  if (seeded !== undefined) return seeded.runtime;
  const store = new DrizzleStateStore(database);
  await store.prime();
  // The REAL battle feature is installed, not a stub list of persisted types.
  // The persistence filter is the union of the platform's own list and whatever
  // each installed feature declares, so a runtime with no features would drop
  // every battle event and this test would pass against an empty timeline.
  const runtime = createRuntime({
    extensions: [battleFeature({ repository: battles_, graceMs: 900_000, matchMs: 900_000 })],
    store,
    bus: createInMemoryEventBus(),
  });
  seeded = { runtime, prime: store.prime.bind(store) };
  return runtime;
}

/** A brand-new reader, as a process that has just started would build. */
function freshLog(): ActivityLog {
  return new DrizzleActivityLog(database);
}

async function readTimeline(id: string) {
  const { readBattleTimeline } = await import('../../apps/web/src/replay-view.js');
  return readBattleTimeline(freshLog(), id);
}

/** The REAL public read, end to end: locator, both log reads, merge, projection. */
async function readPublicReplay(id: string) {
  const { assemblePublicReplay } = await import('../../apps/web/src/replay-view.js');
  const { replay } = await assemblePublicReplay(
    { battles: battles_, log: new DrizzleActivityLog(database) },
    id,
  );
  return replay;
}

describe('a replay read by somebody with only the link', () => {
  it('shows the whole timeline, rebuilt from the log alone', async () => {
    const replay = await readPublicReplay(replayId);
    if (replay === undefined) throw new Error('a battle row exists, so the handle must resolve');

    expect(replay.state).toBe('available');
    expect(replay.mode).toBe('speed');
    expect(replay.fighters.map((fighter) => fighter.harness)).toEqual(['claude', 'codex']);
    expect(replay.fighters.map((fighter) => fighter.label)).toEqual(['Fighter A', 'Fighter B']);
    expect(replay.beats.map((beat) => beat.beat)).toEqual([
      'battle.opened',
      'fighter.joined',
      'session.started',
      'test.passed',
      'test.failed',
      'session.started',
      'test.passed',
      'battle.finished',
    ]);
    expect(replay.fighters.find((fighter) => fighter.won)?.total).toBe(0.94);
  });

  it('leaves out a file path and a test failure a logged-out viewer must not see', async () => {
    const replay = await readPublicReplay(replayId);
    const published = JSON.stringify(replay);
    expect(published).not.toContain('secret');
    expect(published).not.toContain('AssertionError');
    expect(published).not.toContain(alice);
    expect(published).not.toContain(bob);
  });

  it('builds the same replay twice from the same log', async () => {
    expect(await readPublicReplay(replayId)).toEqual(await readPublicReplay(replayId));
  });
});

describe('the battles row is a locator, not a source', () => {
  it('does not change the replay when it is rewritten to contradict the log', async () => {
    const before = await readPublicReplay(replayId);

    // The row now says a different mode and a different rubric from the log.
    await database
      .update(battles)
      .set({ mode: 'ranked-siege', weightsJson: { correctness: 0.99, tests: 0.01 } })
      .where(eq(battles.id, battleId));

    const after = await readPublicReplay(replayId);
    expect(after).toEqual(before);
    expect(after?.mode).toBe('speed');
    expect(after?.rubric).toEqual({ correctness: 0.5, tests: 0.2, security: 0.3 });
  });

  it('still finds the battle by its public handle after the row was rewritten', async () => {
    const found = await battles_.findByReplayId(replayId);
    expect(found?.id).toBe(battleId);
  });

  it('answers nothing at all for a handle no battle answers to', async () => {
    // Not an empty replay and not an expired one: a link that was never a link
    // is a 404, and a page that explained itself as an expired replay would be
    // inventing a history for a battle it cannot see.
    expect(await readPublicReplay(randomUUID())).toBeUndefined();
  });
});

describe('the public handle', () => {
  it('is not the battle’s primary key, in either direction', async () => {
    expect(replayId).not.toBe(battleId);
    // A leaked internal id must not address a public page, or every leak of one
    // is a leak of the other.
    expect(await battles_.findByReplayId(battleId)).toBeUndefined();
    expect((await battles_.findByReplayId(replayId))?.id).toBe(battleId);
  });

  it('is drawn from a random default, not a sequence', async () => {
    // Read out of the database rather than assumed. A default swapped for
    // `nextval(...)` is a bulk-scrape of every battle on the platform, and this
    // is the only place that can see it.
    const result = await database.execute<{ column_default: string | null }>(sql`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'battles' AND column_name = 'replay_id'
    `);
    expect(result.rows[0]?.column_default ?? '').toContain('gen_random_uuid()');
  });

  it('is unique across battles', async () => {
    const result = await database.execute<{ duplicates: number }>(sql`
      SELECT count(*)::int AS duplicates FROM (
        SELECT replay_id FROM battles GROUP BY replay_id HAVING count(*) > 1
      ) duplicated
    `);
    expect(result.rows[0]?.duplicates ?? 1).toBe(0);
  });

  it('404s on an id that matches nothing, rather than inventing a replay', async () => {
    expect(await battles_.findByReplayId(randomUUID())).toBeUndefined();
  });
});

describe('a scoped read', () => {
  it('returns the tagged rows and the rows of the sessions asked for, in log order', async () => {
    const rows = await freshLog().scopedTimeline({
      tagged: { key: 'battleId', value: battleId },
      sessionIds: [bob],
    });
    const types = rows.map((row) => row.type);
    expect(types).toContain('battle.created');
    expect(types).toContain('test.passed');
    const sequences = rows.map((row) => row.sequence);
    expect([...sequences].sort((left, right) => left - right)).toEqual(sequences);
  });

  it('is empty when it names no subject at all', async () => {
    // The alternative is a predicate-free read of the audit trail. A replay that
    // asked an empty question and got the whole log would publish another
    // battle's timeline.
    const log = freshLog();
    expect(await log.scopedTimeline({})).toEqual([]);
    expect(await log.scopedTimeline({ sessionIds: [] })).toEqual([]);
    expect(await log.scopedTimeline({ tagged: { key: 'battleId', value: '' } })).toEqual([]);
  });

  it('leaves out a session that took no part in the battle', async () => {
    const rows = await freshLog().scopedTimeline({
      tagged: { key: 'battleId', value: battleId },
      sessionIds: [alice],
    });
    expect(
      rows.every((row) => row.sessionId === alice || row.payload['battleId'] === battleId),
    ).toBe(true);
  });
});

describe('a bus-only event', () => {
  it('never reaches the replay, because it never reaches the log', async () => {
    // `thinking` is published to the bus and never persisted: it is not in
    // PERSISTED_EVENT_TYPES and no feature declares it. The replay is built from
    // the log, so a restart cannot lose it — and the event is not there either.
    const runtime = await seedRuntime();
    await runtime.emit({
      type: 'thinking',
      occurredAt: '2026-09-26T10:08:00.000Z',
      actorId: alice,
      payload: { sessionId: alice, text: 'the user asked me to bypass the check' },
    });
    const stored = await database.select().from(eventLog).where(eq(eventLog.type, 'thinking'));
    expect(stored).toHaveLength(0);

    const replay = buildPublicReplay({ replayId, entries: await readTimeline(battleId) });
    expect(JSON.stringify(replay)).not.toContain('bypass');
  });
});
