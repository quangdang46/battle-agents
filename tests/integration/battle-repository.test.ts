import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Pool } from 'pg';

import { sql } from 'drizzle-orm';

import {
  closeDatabasePool,
  createDatabase,
  DrizzleAgentRepository,
  DrizzleBattleRepository,
  installations,
  sessions,
  users,
} from '@battle-agents/db';

/**
 * The battle adapter against a real database.
 *
 * Four things cross this boundary that a fake would wave through, and each is
 * worth a test rather than a type:
 *
 *  1. THE SESSION BINDING. `battle_participants` is keyed on (battle_id,
 *     session_id) and the invariant is a build gate rather than a comment. One
 *     agent in two concurrent sessions must find two battles, and a query that
 *     resolved the agent anywhere near this one would make that impossible to
 *     express. This proves the query, against rows that really exist.
 *  2. THE CAPACITY MUTEX. "Do not seat a third fighter" is a `SELECT ... FOR
 *     UPDATE` in the statement. A boolean in a hand-written store is right by
 *     construction and proves nothing about the engine, so this fires two
 *     concurrent joins at a one-seat battle and requires that exactly one lands.
 *  3. THE CHECKS. `battles.status_known` and the two participant checks are
 *     written because ba-risk-gates-e74 handed this repository a comment
 *     claiming a constraint that did not exist. A CHECK that is not exercised is
 *     a comment that has not been tested, so the integration suite is where it
 *     gets its evidence.
 *  4. THE STATE MOVES. `move` takes the state it expects, so two hosts cannot
 *     both finish one battle. That is a WHERE clause, and a WHERE clause is the
 *     engine's to enforce.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const AT = '2026-09-26T10:00:00.000Z';

let pool: Pool;
let database: ReturnType<typeof createDatabase>;
let repository: DrizzleBattleRepository;
/** Two sessions of ONE agent, which is the whole point of the session binding. */
let claudeAgentId: string;
let claudeFirstSession: string;
let codexAgentId: string;
let codexSession: string;
let thirdAgentId: string;
let thirdSession: string;
/** Hoisted out of `beforeAll` so a test can mint a session the others never touched. */
let installationId: string;

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: 8 });
  database = createDatabase(pool);
  repository = new DrizzleBattleRepository(database);

  const githubId = `battle-owner-${Math.random().toString(36).slice(2)}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const ownerId = owner?.id ?? '';
  // `installation_key` rather than an `installationId`: the column is a per-user
  // key, not a uuid, and a value that does not fit it is the sort of thing that
  // reads as a passing insert in a fake and throws here.
  const [installation] = await database
    .insert(installations)
    .values({
      userId: ownerId,
      installationKey: `battle-installation-${Math.random().toString(36).slice(2)}`,
    })
    .returning({ id: installations.id });
  installationId = installation?.id ?? '';

  const agents = new DrizzleAgentRepository(database);
  const makeAgent = async (name: string) =>
    (await agents.create({ ownerId, name, harness: 'claude' }, AT)).id;

  claudeAgentId = await makeAgent(`battle-claude-${Math.random().toString(36).slice(2)}`);
  codexAgentId = await makeAgent(`battle-codex-${Math.random().toString(36).slice(2)}`);
  thirdAgentId = await makeAgent(`battle-third-${Math.random().toString(36).slice(2)}`);

  claudeFirstSession = await makeSessionFor(claudeAgentId, 'claude-a');
  codexSession = await makeSessionFor(codexAgentId, 'codex-a');
  thirdSession = await makeSessionFor(thirdAgentId, 'third-a');
});

/** A fresh session, for a test that needs one no other test has touched. */
let sessionCounter = 0;
async function makeSessionFor(agentId: string, ref: string): Promise<string> {
  const [row] = await database
    .insert(sessions)
    .values({
      agentId,
      installationId,
      harnessSessionRef: `${ref}-${sessionCounter++}-${Math.random().toString(36).slice(2)}`,
      status: 'active',
      startedAt: new Date(AT),
    })
    .returning({ id: sessions.id });
  if (row === undefined) {
    throw new Error('a session was created and could not be read back');
  }
  return row.id;
}

afterAll(async () => {
  await closeDatabasePool(pool);
});

async function openBattle(options: { readonly creatorSessionId: string; readonly mode?: string }) {
  return repository.create({
    mode: options.mode ?? 'speed',
    bountyId: null,
    weightsJson: { correctness: 0.5, tests: 0.2, regression: 0.1, quality: 0.1, efficiency: 0.1 },
    creatorSessionId: options.creatorSessionId,
    now: AT,
  });
}

describe('a battle and its sessions, over a real database', () => {
  it('creates a battle with its creator already in it', async () => {
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    const participants = await repository.participants(battle.id);
    expect(participants.map((row) => row.sessionId)).toEqual([claudeFirstSession]);
    expect(participants[0]?.won).toBe(false);
  });

  it('stores the rubric the battle was opened with, and reads it back unchanged', async () => {
    const weights = {
      correctness: 0.4,
      tests: 0.3,
      regression: 0.15,
      quality: 0.1,
      efficiency: 0.05,
    };
    const battle = await repository.create({
      mode: 'quality',
      bountyId: null,
      weightsJson: weights,
      creatorSessionId: claudeFirstSession,
      now: AT,
    });
    const read = await repository.findById(battle.id);
    // The public-rubric read path reads this column, so a round trip that lost
    // precision here would silently publish a different rubric than the one the
    // battle is judged by.
    expect(read?.weightsJson).toEqual(weights);
  });

  it('refuses to seat a third session in a two-fighter battle', async () => {
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    const joined = await repository.join(battle.id, codexSession, 2, AT);
    expect(joined.joined).toBe(true);

    const refused = await repository.join(battle.id, thirdSession, 2, AT);
    expect(refused.joined).toBe(false);
    expect(refused.joined === false && refused.why).toBe('full');
  });

  it('seats exactly one of two concurrent joins into the last place', async () => {
    // The `SELECT ... FOR UPDATE` in the join statement, exercised rather than
    // asserted about. Two callers both reading "one participant, capacity two"
    // and both inserting is what a read-then-write join does, and the result is a
    // three-way battle the judge cannot score.
    //
    // Two seats and one place left, NOT a one-seat battle: `create` seats its
    // creator, so a one-seat battle is full before anybody asks and the race
    // never happens. The first version of this test did exactly that and admitted
    // nobody, which reads like a passing assertion of "at most one" and is in
    // fact an assertion of nothing.
    const battle = await openBattle({ creatorSessionId: claudeFirstSession, mode: 'speed' });
    const [left, right] = await Promise.all([
      repository.join(battle.id, codexSession, 2, AT),
      repository.join(battle.id, thirdSession, 2, AT),
    ]);
    expect([left, right].filter((result) => result.joined)).toHaveLength(1);
    const seated = await repository.participants(battle.id);
    expect(seated).toHaveLength(2);
    // And the winner is a real one of the two racers, not a row that appeared
    // from nowhere: the loser is refused, and the battle holds its creator plus
    // exactly one of them.
    const admitted = left.joined ? codexSession : thirdSession;
    expect(seated.map((row) => row.sessionId).sort()).toEqual(
      [claudeFirstSession, admitted].sort(),
    );
  });

  it('seats nobody into a one-seat battle, because its creator already holds the seat', async () => {
    const battle = await openBattle({ creatorSessionId: claudeFirstSession, mode: 'boss' });
    const result = await repository.join(battle.id, codexSession, 1, AT);
    expect(result.joined).toBe(false);
    expect(result.joined === false && result.why).toBe('full');
  });

  it('reports a battle that does not exist, and a session already in it', async () => {
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    expect(
      await repository.join('00000000-0000-4000-8000-999999999999', codexSession, 2, AT),
    ).toEqual({ joined: false, why: 'not-found' });
    const again = await repository.join(battle.id, claudeFirstSession, 2, AT);
    expect(again.joined).toBe(false);
    expect(again.joined === false && again.why).toBe('already-in-it');
  });
});

describe('one agent, two sessions, two battles', () => {
  it('finds both battles from each session, and never from the agent', async () => {
    // Fresh sessions. Every other test in this file reuses the same four, so an
    // assertion of "exactly one battle" against them counts the battles the
    // earlier tests left behind — which is how the first version of this test came
    // to expect one row and see six.
    const alphaAgentId = claudeAgentId;
    const alphaFirst = await makeSessionFor(alphaAgentId, 'alpha-a');
    const alphaSecond = await makeSessionFor(alphaAgentId, 'alpha-b');
    const betaSession = await makeSessionFor(codexAgentId, 'beta-a');

    const first = await openBattle({ creatorSessionId: alphaFirst });
    await repository.join(first.id, betaSession, 2, AT);
    const second = await openBattle({ creatorSessionId: alphaSecond });
    await repository.join(second.id, betaSession, 2, AT);

    // One session, one battle. If this ever returned two, the two battles of one
    // agent would have become indistinguishable, and the whole reason
    // `battle_participants` is keyed on a session would be gone.
    const fromFirst = await repository.battlesForSession(alphaFirst);
    const fromSecond = await repository.battlesForSession(alphaSecond);
    expect(fromFirst.map((entry) => entry.battle.id)).toEqual([first.id]);
    expect(fromSecond.map((entry) => entry.battle.id)).toEqual([second.id]);

    // And the fighter on both sides sees both, which is what makes the assertion
    // above a statement about the KEY rather than about a battle being one-row.
    const fromBeta = await repository.battlesForSession(betaSession);
    expect(fromBeta.map((entry) => entry.battle.id).sort()).toEqual([first.id, second.id].sort());

    // Neither battle may carry the other's session.
    expect(fromFirst[0]?.participants.map((row) => row.sessionId)).not.toContain(alphaSecond);
    expect(fromSecond[0]?.participants.map((row) => row.sessionId)).not.toContain(alphaFirst);
    // Nothing anywhere in the result is the agent, even though both sessions
    // belong to the same one.
    expect(JSON.stringify(fromFirst)).not.toContain(alphaAgentId);
  });
});

/**
 * Every message in an error's cause chain, joined.
 *
 * drizzle replaces the driver's message with `Failed query: <sql>` and hangs the
 * original off `cause`, so matching the top-level message for a constraint name
 * finds nothing and a test written that way either fails for the wrong reason or
 * — worse — gets loosened to `/Failed query/`, which every database error matches
 * and which therefore asserts that the database is connected. This walks the
 * chain so the assertion is about the CONSTRAINT.
 */
function messagesOf(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    const candidate = current as { message?: unknown; cause?: unknown };
    if (typeof candidate.message === 'string') parts.push(candidate.message);
    current = candidate.cause;
  }
  return parts.join(' | ');
}

async function expectRefusedBy(promise: Promise<unknown>, constraint: string): Promise<void> {
  // A try/catch rather than `rejects.toThrow`, because the constraint NAME is the
  // assertion and a matcher over the top-level message cannot see it.
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }
  if (thrown === undefined) {
    throw new Error(`the database accepted a write that ${constraint} should have refused`);
  }
  expect(messagesOf(thrown), `expected the refusal to name ${constraint}`).toContain(constraint);
}

describe('the states the database itself refuses', () => {
  it('rejects a status outside the five the plan names', async () => {
    // The CHECK is the reason this exists. A drizzle `enum` is a TypeScript type
    // and emits a bare text column, so without the constraint a future build or
    // a hand-written row could write a state this build has never heard of — and
    // the feature's answer to that (refuse every move) is only reachable if the
    // row can exist.
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    await expectRefusedBy(
      database.execute(sql`UPDATE battles SET status = 'awaiting-review' WHERE id = ${battle.id}`),
      'battles_status_known',
    );
  });

  it('rejects a paused battle with no resume deadline', async () => {
    // A paused battle nothing can ever abandon: the sweep asks
    // `resume_deadline <= now`, and a null never compares true. Invisible without
    // this constraint — the row would read as paused and simply never move.
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    await expectRefusedBy(
      database.execute(sql`UPDATE battles SET status = 'paused' WHERE id = ${battle.id}`),
      'battles_paused_has_resume_deadline',
    );
  });

  it('rejects a finished battle with no finished_at', async () => {
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    await expectRefusedBy(
      database.execute(sql`UPDATE battles SET status = 'completed' WHERE id = ${battle.id}`),
      'battles_finished_has_finished_at',
    );
  });

  it('rejects a won flag that is neither zero nor one', async () => {
    // The row carries a score FIRST, and that is not tidiness. `won = 2` on a row
    // with no score breaks `battle_participants_won_has_a_score` as well, and
    // Postgres reports whichever CHECK it reaches first — so the obvious version
    // of this test asserts the wrong constraint and passes for the wrong reason.
    // A scored row leaves `won_is_zero_or_one` as the only thing left to break.
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    await database.execute(
      sql`UPDATE battle_participants SET score_json = '{"total":0.5}'::jsonb WHERE battle_id = ${battle.id}`,
    );
    await expectRefusedBy(
      database.execute(sql`UPDATE battle_participants SET won = 2 WHERE battle_id = ${battle.id}`),
      'battle_participants_won_is_zero_or_one',
    );
  });

  it('rejects a winner carrying no score', async () => {
    // A row that says somebody won and cannot say why. The weight is applied to
    // a score that is not there, and a replay has nothing to show.
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    await expectRefusedBy(
      database.execute(sql`UPDATE battle_participants SET won = 1 WHERE battle_id = ${battle.id}`),
      'battle_participants_won_has_a_score',
    );
  });
});

describe('the moves', () => {
  it('moves only from the state the caller expected, so two hosts cannot both finish it', async () => {
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    const finished = await repository.finish({
      battleId: battle.id,
      from: 'running',
      to: 'completed',
      results: [
        {
          sessionId: claudeFirstSession,
          scoreJson: { total: 0.9, contributions: [] },
          submittedAt: AT,
          won: true,
        },
      ],
      now: AT,
    });
    expect(finished?.status).toBe('completed');
    expect(finished?.finishedAt).toBe(AT);

    // The second caller expected `running` and the row is `completed`, so the
    // WHERE clause matches nothing. This is the exactly-once gate: two deliveries
    // of one finish produce one result and one undefined.
    const second = await repository.finish({
      battleId: battle.id,
      from: 'running',
      to: 'completed',
      results: [
        {
          sessionId: claudeFirstSession,
          scoreJson: { total: 0.1, contributions: [] },
          submittedAt: AT,
          won: true,
        },
      ],
      now: AT,
    });
    expect(second).toBeUndefined();
    const stored = await repository.participants(battle.id);
    expect(stored[0]?.scoreJson).toMatchObject({ total: 0.9 });
  });

  it('marks BOTH winners of a shared win, because one column could hold only one', async () => {
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    await repository.join(battle.id, codexSession, 2, AT);
    await repository.finish({
      battleId: battle.id,
      from: 'running',
      to: 'completed',
      results: [
        { sessionId: claudeFirstSession, scoreJson: { total: 0.7 }, submittedAt: AT, won: true },
        { sessionId: codexSession, scoreJson: { total: 0.7 }, submittedAt: AT, won: true },
      ],
      now: AT,
    });
    const stored = await repository.participants(battle.id);
    expect(
      stored
        .filter((row) => row.won)
        .map((row) => row.sessionId)
        .sort(),
    ).toEqual([claudeFirstSession, codexSession].sort());
  });

  it('pauses with a deadline, resumes, and clears the pause on the way back', async () => {
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    const deadline = '2026-09-26T10:15:00.000Z';
    const paused = await repository.pause(battle.id, deadline, AT);
    expect(paused?.status).toBe('paused');
    expect(paused?.resumeDeadline).toBe(deadline);

    // The sweep's query, against a real row.
    const overdue = await repository.pausedBefore('2026-09-26T10:14:59.000Z');
    expect(overdue.map((row) => row.id)).not.toContain(battle.id);
    expect(
      (await repository.pausedBefore('2026-09-26T10:15:01.000Z')).map((row) => row.id),
    ).toContain(battle.id);

    const resumed = await repository.move(battle.id, 'paused', 'running', AT);
    // Cleared, not left in place: a running battle that still carries a pause is a
    // battle the sweep will abandon while it is being fought.
    expect(resumed?.status).toBe('running');
    expect(resumed?.pausedAt).toBeNull();
    expect(resumed?.resumeDeadline).toBeNull();
  });

  it('moves only from running when pausing, so a paused battle is not re-paused', async () => {
    const battle = await openBattle({ creatorSessionId: claudeFirstSession });
    await repository.pause(battle.id, '2026-09-26T10:15:00.000Z', AT);
    expect(await repository.pause(battle.id, '2026-09-26T10:30:00.000Z', AT)).toBeUndefined();
  });
});
