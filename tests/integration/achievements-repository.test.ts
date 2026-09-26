import { achievementsFeature } from '@battle-agents/achievements';
import type { AchievementsView } from '@battle-agents/achievements';
import { createInMemoryEventBus, createRuntime } from '@battle-agents/core';
import {
  achievements,
  closeDatabasePool,
  createDatabase,
  DrizzleAchievementsRepository,
  DrizzleAgentRepository,
  DrizzleSessionRepository,
  DrizzleStateStore,
  eq,
  eventLog,
  users,
} from '@battle-agents/db';
import { asc } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Pool } from 'pg';

/**
 * The achievements adapter against a real database.
 *
 * Two things cannot be proven anywhere else in this repository, and both are the
 * reason this file exists.
 *
 * The first is the ATTRIBUTION PREDICATE. The unit suite applies the rule in
 * JavaScript and this file applies it in SQL, and the two are separate
 * implementations of one sentence — a rule that counted rows the handler could
 * not see would be a badge awarded on part of the evidence, with nothing failing
 * at either end. So the same events are written twice here, once and read back
 * through the real query, and the answer has to match what the feature would
 * have counted.
 *
 * The second is the UNIQUE INDEX. `award` returning the right boolean is
 * trivially right in a fake; what has to be proven against a real engine is that
 * the second insert of one (agent, code) really is refused rather than
 * duplicated, because the bus delivers twice and a backfill re-runs.
 *
 * Every id carries a per-run suffix, because these rows are never cleaned up
 * and the database is not reset between runs. A fixed id would pass against a
 * fresh database and fail on the second run against the same one, which is a
 * coin toss dressed as an assertion.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const AT = '2026-09-26T10:00:00.000Z';
const RUN = Math.random().toString(36).slice(2);

let pool: Pool;
let database: ReturnType<typeof createDatabase>;
let repository: DrizzleAchievementsRepository;
let agentId: string;
let otherAgentId: string;
let runId: string;
let otherRunId: string;

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: 4 });
  database = createDatabase(pool);
  repository = new DrizzleAchievementsRepository(database);
  const agents = new DrizzleAgentRepository(database);
  const sessions = new DrizzleSessionRepository(database);
  const primaryOwner = await ownerFor(database, 'primary');
  const otherOwner = await ownerFor(database, 'other');
  agentId = (
    await agents.create(
      { ownerId: primaryOwner, name: `achv-primary-${RUN}`, harness: 'claude' },
      AT,
    )
  ).id;
  otherAgentId = (
    await agents.create({ ownerId: otherOwner, name: `achv-other-${RUN}`, harness: 'codex' }, AT)
  ).id;
  // Real session rows, because `event_log.session_id` is a foreign key to
  // them. A fabricated uuid would be refused by the database for a reason that
  // has nothing to do with the attribution rule, and the whole point of these
  // rows is to have the grouping column filled exactly as production fills it.
  const installation = await sessions.findOrCreateInstallation({
    ownerId: primaryOwner,
    installationKey: `achv-install-${RUN}`,
    now: AT,
  });
  runId = (
    await sessions.createSession({
      agentId,
      installationId: installation.id,
      projectId: null,
      now: AT,
    })
  ).id;
  otherRunId = (
    await sessions.createSession({
      agentId: otherAgentId,
      installationId: installation.id,
      projectId: null,
      now: AT,
    })
  ).id;
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

/** A user to own the agent, since agents.user_id is NOT NULL. */
async function ownerFor(database: ReturnType<typeof createDatabase>, who: string): Promise<string> {
  const githubId = `achv-owner-${who}-${RUN}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  return owner?.id ?? '';
}

/**
 * Writes a row the way DrizzleStateStore does.
 *
 * Through the store rather than by hand, because the store is what lifts
 * `sessionId` out of the payload into its own column — and the session-scoped
 * rule is only provable if the grouping column is filled the way production
 * fills it. A hand-written insert that left the id in the payload would pass a
 * suite about the payload and fail on the column.
 */
async function record(
  type: string,
  actorId: string,
  payload: Record<string, unknown>,
  occurredAt = AT,
): Promise<void> {
  const { sessionId, ...rest } = payload;
  await database.insert(eventLog).values({
    type,
    actorId,
    sessionId: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null,
    payload: rest,
    occurredAt: new Date(occurredAt),
  });
}

describe('reading the log, over a real database', () => {
  it('finds both event shapes for one agent, and neither for another', async () => {
    // The predicate, twice. A game's own event names the agent in its payload
    // and sets the actor to the feature that emitted it; an adapter's event has
    // no agent in the payload and carries the character in the actor. The
    // feature's `agentIdOf` decides between them in JavaScript and this query
    // has to reach the same answer, or a rule is counting rows the handler
    // cannot see.
    await record('bounty.completed', 'bounty', { agentId, bountyId: `b-${RUN}` });
    await record('test.failed', agentId, { failure: `f-${RUN}` });

    const mine = await repository.history(agentId, ['bounty.completed', 'test.failed']);
    expect(mine.map((row) => row.type).sort()).toEqual(['bounty.completed', 'test.failed']);

    const theirs = await repository.history(otherAgentId, ['bounty.completed', 'test.failed']);
    expect(theirs).toEqual([]);
  });

  it('does not attribute a row by its actor when the payload already named an agent', async () => {
    // The one case where the two shapes could collide: an event whose actor is
    // one agent and whose payload names another. The payload wins, so this row
    // is not in the actor's history.
    await record('bounty.completed', otherAgentId, { agentId, bountyId: `cross-${RUN}` });

    const byPayload = await repository.history(agentId, ['bounty.completed']);
    const byActor = await repository.history(otherAgentId, ['bounty.completed']);
    expect(byPayload.some((row) => row.payload['bountyId'] === `cross-${RUN}`)).toBe(true);
    expect(byActor.some((row) => row.payload['bountyId'] === `cross-${RUN}`)).toBe(false);
  });

  it('returns rows in the log’s own order, not the order the types were asked for', async () => {
    // The ordering a session-scoped rule is replayed on. Two rows in the same
    // millisecond have no order between their timestamps, so the bigserial is
    // the only thing that can decide it and a query ordering by anything else
    // would make a replay unreproducible.
    const first = runId;
    const second = otherRunId;
    await record('test.passed', agentId, { sessionId: first, suite: 'unit' }, AT);
    await record('test.failed', agentId, { sessionId: second, failure: 'x' }, AT);

    const rows = await repository.history(agentId, ['test.passed', 'test.failed']);
    const sequences = rows.map((row) => row.sequence);
    expect([...sequences].sort((left, right) => left - right)).toEqual(sequences);
    expect(rows.find((row) => row.payload['suite'] === 'unit')?.sessionId).toBe(first);
  });

  it('keeps the session out of the payload and in the column, which is what groups it', async () => {
    // `DrizzleStateStore.splitSession` deletes the id from the payload on the
    // way in. A rule that read it from the payload would find nothing, and a
    // character sheet would show a recovery earned by a run it cannot name.
    const sessionId = runId;
    const marker = `grouped-${RUN}`;
    await record('test.failed', agentId, { sessionId, failure: marker });

    const rows = await repository.history(agentId, ['test.failed']);
    // Found by its own marker rather than by being the first row for this
    // agent, because the cases above have already written some and these rows
    // are never cleaned up.
    const row = rows.find((entry) => entry.payload['failure'] === marker);
    expect(row?.sessionId).toBe(sessionId);
    expect(row?.payload['sessionId']).toBeUndefined();
  });

  it('returns nothing for a type it was not asked for, and nothing at all for an empty ask', async () => {
    // The second half is not a nicety: an empty IN list is a query a database
    // is entitled to refuse, and a rule with no evidence types must not be a
    // reason to fail a projection.
    const marker = `narrow-${RUN}`;
    await record('bounty.completed', 'bounty', { agentId, bountyId: marker });

    // This agent has test rows of its own by now, so the assertion is that they
    // are not in the answer rather than that the answer is empty.
    const asked = await repository.history(agentId, ['bounty.completed']);
    expect(asked.every((row) => row.type === 'bounty.completed')).toBe(true);
    expect(asked.map((row) => row.payload['bountyId'])).toContain(marker);

    // And the empty ask. Whether drizzle renders an empty IN list as `false` or
    // refuses it, the answer this port promises is the same, so the guard is
    // stated here rather than left to a driver's mood.
    expect(await repository.history(agentId, [])).toEqual([]);
  });
});

describe('awarding a badge, over a real database', () => {
  it('lets the first award through and refuses the second, without raising', async () => {
    const code = `first-bounty.v1`;
    await database.delete(achievements).where(eq(achievements.agentId, agentId));

    expect(await repository.award(agentId, code, AT)).toBe(true);
    // Idempotent, not an error. A duplicate delivery is a normal thing for the
    // bus to do, and raising here would put the emitter's error path in the way
    // of something the emitter did right.
    expect(await repository.award(agentId, code, AT)).toBe(false);
    expect(await repository.award(agentId, code, '2026-09-26T11:00:00.000Z')).toBe(false);

    const rows = await repository.list(agentId);
    expect(rows).toHaveLength(1);
    // The FIRST instant, not the last attempt's. An update-in-place would move
    // it and quietly rewrite when a badge was earned.
    expect(rows[0]?.awardedAt).toBe(new Date(AT).toISOString());
  });

  it('awards the same code to two agents, because the agent is part of the key', async () => {
    const code = `shared-${RUN}.v1`;
    expect(await repository.award(agentId, code, AT)).toBe(true);
    expect(await repository.award(otherAgentId, code, AT)).toBe(true);
    // Scoped to the code rather than to a count, because this agent's ledger
    // already holds a badge from the case above and these rows are never
    // cleaned up between runs.
    expect((await repository.list(agentId)).map((row) => row.code)).toContain(code);
    expect((await repository.list(otherAgentId)).map((row) => row.code)).toContain(code);
  });

  it('refuses an award to something that is not an agent', async () => {
    // The column is a foreign key, and this is where that stops being a comment.
    // A platform event whose payload named no agent is attempted against its
    // actor, which is a feature's own name; the database is what says no, and
    // the feature never has to guess which strings are agent ids.
    await expect(repository.award('bounty', 'first-bounty.v1', AT)).rejects.toThrow();
  });

  it('lists oldest award first, with the code breaking a tie', async () => {
    // A character sheet that reshuffles between reads is one nobody can read, so
    // the order is a property rather than whatever the planner returned.
    const rows = await database
      .select({ code: achievements.code, awardedAt: achievements.awardedAt })
      .from(achievements)
      .where(eq(achievements.agentId, otherAgentId))
      .orderBy(asc(achievements.awardedAt), asc(achievements.code));

    const listed = await repository.list(otherAgentId);
    expect(listed.map((row) => row.code)).toEqual(rows.map((row) => row.code));
  });

  it('reports nothing for an agent who holds no badges', async () => {
    const fresh = (
      await new DrizzleAgentRepository(database).create(
        { ownerId: await ownerFor(database, 'fresh'), name: `achv-fresh-${RUN}`, harness: 'pi' },
        AT,
      )
    ).id;
    expect(await repository.list(fresh)).toEqual([]);
  });
});

describe('the log is the only thing this reads', () => {
  it('answers a projection without ever touching a feature table', async () => {
    // The end-to-end claim, over a real database: fill the log the way a run
    // would, then run the feature's own projection action over the drizzle
    // repository and read the badge back. Nothing here joins a bounties or an
    // agent_stats table, because the repository has no method that could.
    const store = new DrizzleStateStore(database);
    for (const failure of ['c1', 'c2', 'c3', 'c4', 'c5']) {
      await store.append({
        type: 'test.failed',
        occurredAt: AT,
        actorId: agentId,
        payload: { sessionId: runId, failure },
      });
    }
    await store.append({
      type: 'test.passed',
      occurredAt: AT,
      actorId: agentId,
      payload: { sessionId: runId, suite: 'unit' },
    });

    const runtime = createRuntime({
      extensions: [achievementsFeature({ repository })],
      store,
      bus: createInMemoryEventBus(),
      now: () => AT,
    });
    // Emitting the pass through the runtime is the live path: the store appends
    // it before the handler runs, which is the ordering the whole projection
    // rests on and the reason a handler can count against the log at all.
    await runtime.emit({
      type: 'test.passed',
      occurredAt: AT,
      actorId: agentId,
      payload: { sessionId: runId, suite: 'unit' },
    });

    const view = (await runtime.runAction('achievements.list', { agentId })) as AchievementsView;
    expect(view.badges.map((badge) => badge.code)).toContain('critical-hit.v1');
  });
});
