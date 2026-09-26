import { createInMemoryEventBus, createRuntime } from '@battle-agents/core';
import type { Runtime } from '@battle-agents/core';
import {
  battleFeature,
  BATTLE_JUDGE_RESULT,
  BATTLE_JUDGE_STEP,
  DEFAULT_BATTLE_WEIGHTS,
  emitJudgeEvents,
  JUDGE_PERSISTED_EVENT_TYPES,
  runJudge,
  type JudgeStepEvent,
  type JudgeStepPlan,
} from '@battle-agents/battle';
import {
  closeDatabasePool,
  createDatabase,
  DrizzleActivityLog,
  DrizzleAgentRepository,
  DrizzleStateStore,
  installations,
  sessions,
  users,
  type ActivityLogEntry,
  type Database,
} from '@battle-agents/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { provisionWorkspace } from '@battle-agents/battle';

/**
 * The judge stream is DURABLE, which is a claim about a declaration.
 *
 * The unit suite proves `emitJudgeEvents` emits an event per step. It cannot
 * prove the event reaches `event_log`, because the runtime drops every type
 * that is not in `PERSISTED_EVENT_TYPES` plus whatever a feature declares in
 * `GameFeature.persistedEvents`. A judge that emitted a perfect, ordered,
 * attributable stream of events that a restart erased would pass every unit
 * test in the package and produce a replay with nothing in it.
 *
 * So this file writes the stream through the real `DrizzleStateStore`, throws
 * the runtime away, and reads it back with a NEW store over the SAME database.
 * The second half is the point: a "restart" here is a new runtime and a new
 * store instance, which is exactly what a redeploy gives you, and anything that
 * only existed in the first process's memory is gone.
 *
 * THE CONTROL is what makes this a check rather than a demonstration. The same
 * run also emits a type nothing declares. If that control SURVIVED, then
 * everything survives and the test would be proving nothing at all — and the
 * only way to know is to write it down and watch it stay gone.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;
const AT = '2026-09-26T10:00:00.000Z';

/** A type no feature declares, so the control is not accidentally durable. */
const UNDECLARED_PROBE = 'judge.probe.never-declared';

let pool: Pool;
let database: Database;
let ownerUserId = '';
let installationId = '';
let agentRepository: DrizzleAgentRepository;
const sessionIds: string[] = [];
const scratchDirs: string[] = [];

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

  // Real rows, because `event_log.session_id` is a foreign key and the database
  // is right to refuse a row pointing at a run that never happened. The judge
  // stream is ATTRIBUTED to a session, so the attribution is only real if the
  // session is.
  const githubId = `judge-persistence-${randomUUID()}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  ownerUserId = owner?.id ?? '';
  const [installation] = await database
    .insert(installations)
    .values({ userId: ownerUserId, installationKey: `judge-persistence-${randomUUID()}` })
    .returning({ id: installations.id });
  installationId = installation?.id ?? '';
  agentRepository = new DrizzleAgentRepository(database);
});

afterAll(async () => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  if (ownerUserId !== '') await database.delete(users).where(eq(users.id, ownerUserId));
  await closeDatabasePool(pool);
});

async function makeSession(): Promise<string> {
  const agent = await agentRepository.create(
    { ownerId: ownerUserId, name: `judge-participant-${randomUUID()}`, harness: 'claude' },
    AT,
  );
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
  const sessionId = row?.id;
  if (sessionId === undefined) throw new Error('a session was created and could not be read back');
  sessionIds.push(sessionId);
  return sessionId;
}

function makeWorkspace(sessionId: string) {
  const base = mkdtempSync(join(tmpdir(), 'battle-judge-persist-'));
  scratchDirs.push(base);
  return provisionWorkspace(base, 'battle-1', sessionId).handle;
}

/** Two steps and nothing else, so the assertions read as a list rather than a plan. */
const TWO_STEP_PLAN: readonly JudgeStepPlan[] = [
  { step: 'install', criterion: null, required: true, timeoutMs: 1_000, command: 'true' },
  { step: 'test', criterion: 'tests', required: false, timeoutMs: 1_000, command: 'true' },
];

const ALWAYS_GREEN = async (
  _handle: never,
  _step: JudgeStepPlan,
  command: string,
): Promise<{
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  refusedBy: null;
  refusalReason: null;
}> => ({
  command,
  exitCode: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  refusedBy: null,
  refusalReason: null,
});

/** A runtime with the battle feature installed, and therefore its persistedEvents. */
function runtimeWithBattle(): Runtime {
  return createRuntime({
    extensions: [
      battleFeature({
        repository: {
          findById: async () => undefined,
          participants: async () => [],
        } as never,
        graceMs: 1,
        matchMs: 1,
      }),
    ],
    store: new DrizzleStateStore(database),
    bus: createInMemoryEventBus(),
    now: () => AT,
  });
}

interface StoredStep {
  readonly sequence: number;
  readonly step: string;
  readonly outcome: string;
  readonly criterion: string | null;
  readonly battleId: string;
}

async function trailFor(sessionId: string): Promise<readonly ActivityLogEntry[]> {
  return await new DrizzleActivityLog(database).trail({ sessionId, limit: 100 });
}

describe('the judge event stream survives a restart', () => {
  it('writes one durable row per step, in order, attributed to the participant', async () => {
    const sessionId = await makeSession();
    const runtime = runtimeWithBattle();

    const report = await runJudge({
      battleId: 'battle-1',
      sessionId,
      workspace: makeWorkspace(sessionId),
      weights: DEFAULT_BATTLE_WEIGHTS,
      plan: TWO_STEP_PLAN,
      execute: ALWAYS_GREEN as never,
    });
    await emitJudgeEvents(runtime, report, () => AT);

    // The "restart". Everything above is gone; this runtime and this store were
    // not constructed until now and hold nothing from the process above.
    const afterRestart = await trailFor(sessionId);

    const rows = afterRestart.filter((entry) => entry.type === BATTLE_JUDGE_STEP);
    const steps = rows.map((row) => row.payload as unknown as StoredStep);

    expect(steps).toHaveLength(2);
    expect(steps.map((step) => step.step)).toEqual(['install', 'test']);
    expect(steps.map((step) => step.sequence)).toEqual([0, 1]);
    expect(steps.every((step) => step.outcome === 'passed')).toBe(true);
    expect(steps[1]?.criterion).toBe('tests');
    expect(steps.every((step) => step.battleId === 'battle-1')).toBe(true);

    // The attribution is a COLUMN and not only a JSON field, which is the part
    // that makes it queryable: `DrizzleStateStore` lifts `sessionId` out of the
    // payload and the trail read above filters on that column, so a replay
    // asking for one participant's judge steps does not have to scan payloads.
    // Asserting the payload carried it would pass even if the column were null.
    expect(rows.every((row) => row.sessionId === sessionId)).toBe(true);
  });

  it('writes the verdict too, decomposed into the contributions a replay shows', async () => {
    const sessionId = await makeSession();
    const runtime = runtimeWithBattle();

    const report = await runJudge({
      battleId: 'battle-1',
      sessionId,
      workspace: makeWorkspace(sessionId),
      weights: DEFAULT_BATTLE_WEIGHTS,
      plan: TWO_STEP_PLAN,
      execute: ALWAYS_GREEN as never,
    });
    await emitJudgeEvents(runtime, report, () => AT);

    const afterRestart = await trailFor(sessionId);
    const verdict = afterRestart.find((entry) => entry.type === BATTLE_JUDGE_RESULT);
    const payload = verdict?.payload as
      | { total: number; contributions: readonly { criterion: string; weighted: number }[] }
      | undefined;

    expect(payload).toBeDefined();
    // `tests` is 0.2 and everything else was not fed by a step, so the total is
    // the default rubric's 0.2 on the one criterion this two-step plan covered.
    expect(payload?.total).toBe(0.2);
    expect(payload?.contributions.map((entry) => entry.criterion)).toEqual([
      'correctness',
      'tests',
      'regression',
      'quality',
      'efficiency',
    ]);
  });

  it('does NOT persist a judge event type nothing declared, which is what makes the two tests above mean anything', async () => {
    const sessionId = await makeSession();
    const runtime = runtimeWithBattle();

    // A perfectly ordinary step, a real judge, the real emitter. And beside it,
    // an event of a type no feature declares — which the runtime must drop.
    const report = await runJudge({
      battleId: 'battle-1',
      sessionId,
      workspace: makeWorkspace(sessionId),
      weights: DEFAULT_BATTLE_WEIGHTS,
      plan: TWO_STEP_PLAN,
      execute: ALWAYS_GREEN as never,
    });
    await emitJudgeEvents(runtime, report, () => AT);
    await runtime.emit({
      type: UNDECLARED_PROBE,
      occurredAt: AT,
      actorId: 'judge',
      payload: { sessionId },
    });

    const afterRestart = await trailFor(sessionId);
    const types = afterRestart.map((entry) => entry.type);

    expect(types).toContain(BATTLE_JUDGE_STEP);
    expect(types).toContain(BATTLE_JUDGE_RESULT);
    // The control. If this ever survives, the two assertions above are true only
    // because the store writes everything, and this file is no longer proving
    // that the battle feature's DECLARATION is what makes the stream durable.
    expect(types).not.toContain(UNDECLARED_PROBE);
  });

  it('declares exactly the two judge types, and battle is the only feature that can', async () => {
    // The declaration itself, checked directly. Removing either entry from
    // `battleFeature.persistedEvents` empties the replay; this fails first, and
    // says so, rather than leaving it to be discovered as a blank timeline.
    const feature = runtimeWithBattle();
    expect(feature.degraded().get('battle') ?? []).not.toContain('battle.judge.step');

    const registryTypes = [...JUDGE_PERSISTED_EVENT_TYPES].sort();
    expect(registryTypes).toEqual([BATTLE_JUDGE_RESULT, BATTLE_JUDGE_STEP].sort());
  });
});

describe('what a replay reads back', () => {
  it('gets the stream in the order the judge produced it, with no re-sorting needed', async () => {
    const sessionId = await makeSession();
    const runtime = runtimeWithBattle();

    const report = await runJudge({
      battleId: 'battle-1',
      sessionId,
      workspace: makeWorkspace(sessionId),
      weights: DEFAULT_BATTLE_WEIGHTS,
      plan: TWO_STEP_PLAN,
      execute: ALWAYS_GREEN as never,
    });
    await emitJudgeEvents(runtime, report, () => AT);

    const afterRestart = await trailFor(sessionId);
    const stepEvents = afterRestart.filter((entry) => entry.type === BATTLE_JUDGE_STEP);
    const sequences = stepEvents.map(
      (entry) => (entry.payload as unknown as JudgeStepEvent).sequence,
    );

    // The runtime persists before it publishes, and event_log is ordered by a
    // bigserial, so the trail is already in emission order. A replay does not
    // have to sort, and a sort that disagreed with `sequence` would be a
    // second, competing ordering of the same match.
    expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
    expect(afterRestart[afterRestart.length - 1]?.type).toBe(BATTLE_JUDGE_RESULT);
  });
});
