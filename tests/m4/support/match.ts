import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import {
  agents as agentsTable,
  DrizzleReputationRepository,
  installations,
  sessions,
  users,
} from '@battle-agents/db';
import {
  DEFAULT_BATTLE_WEIGHTS,
  emitJudgeEvents,
  makeScratchBase,
  provisionWorkspace,
  removeScratchBase,
  runJudge,
  type BattleView,
  type BattleWeights,
  type WorkspaceHandle,
  type WorkspaceProvision,
  type WorkspaceRunResult,
} from '@battle-agents/battle';
import { freshRecord } from '@battle-agents/reputation';

import { sharedRuntime } from '../../../apps/web/src/shared-runtime.js';

/**
 * The M4 fixtures, shared by the two suites that need a real finished battle.
 *
 * Not a `.test.ts`, and deliberately: `tests/unit/no-orphan-tests.test.ts` holds
 * every test FILE to a stage config, and a fixture module named like a suite
 * would be a file that runs no assertions and is reported as covered. It lives
 * under tests/m4/ so the two milestone suites import it by a path that says which
 * milestone it belongs to, and vitest's include glob never picks it up.
 *
 * Everything here goes through the COMPOSED runtime, so a fixture that needed a
 * hand-built feature would be testing a wiring that no deployment has. The one
 * exception is noted on `twoFighters`.
 */

const REPO_OWNER = 'battle-agents';
const ISSUE_NUMBER = 4409;

/** A real scratch base per process, removed by {@link releaseScratchBase}. */
let scratchBase: string | undefined;

export function scratchWorkspaceBase(): string {
  scratchBase ??= makeScratchBase('m4-battle-');
  return scratchBase;
}

export function releaseScratchBase(): void {
  if (scratchBase === undefined) return;
  const base = scratchBase;
  scratchBase = undefined;
  // The feature's own remover, so this file does not grow a second `rmSync` that
  // could disagree with it about what a workspace is.
  removeScratchBase(base);
}

export interface Fighter {
  readonly sessionId: string;
  readonly agentId: string;
  readonly label: string;
}

/**
 * Enough completed work to clear ARENA_MIN_TRUST. The gate is asserted rather
 * than routed around: a suite that only ever seats pre-qualified fighters cannot
 * tell a working gate from one that is always open, and that difference is the
 * whole of the fairness claim in plan section 17.4.
 */
export const FIGHTER_TRUST_RECORD = {
  completed: 8,
  acceptanceRate: 1,
  reviewScore: 4,
  earnedCents: 90_000,
} as const;

/** Give a fighter a reputation record, so the arena gate is satisfied for real. */
export async function giveARecord(fighter: Fighter): Promise<void> {
  const { database } = await sharedRuntime();
  await new DrizzleReputationRepository(database).save({
    ...freshRecord(fighter.agentId, new Date().toISOString()),
    ...FIGHTER_TRUST_RECORD,
  });
}

export async function xpOf(agentId: string): Promise<number> {
  const { database } = await sharedRuntime();
  const [row] = await database
    .select({ xp: agentsTable.xp })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);
  return row?.xp ?? 0;
}

export async function trustOf(agentId: string): Promise<number> {
  const { database } = await sharedRuntime();
  const record = await new DrizzleReputationRepository(database).find(agentId);
  if (record === undefined) throw new Error('the fixture gave this fighter a record; it is gone');
  return (await act<{ trust: number }>('reputation.read', { agentId })).trust;
}

export async function act<T>(id: string, input: unknown): Promise<T> {
  const { runtime } = await sharedRuntime();
  return (await runtime.runAction(id, input)) as T;
}

/**
 * Two agents, each with a REAL session row and a real `session.started` on the
 * bus.
 *
 * The event is not optional and the reason is specific: it is the only thing that
 * tells the battle feature which agent a session belongs to, and that one fact
 * feeds both the arena gate and the reward payload. An emitted `battle.finished`
 * for a session the feature cannot place emits no reward, warns in a log nobody
 * reads, and the XP assertion reads zero — which is a real product behaviour
 * mistaken for a passing gate.
 *
 * Emitted through `runtime.emit` rather than by POSTing to the ingest route,
 * because the ingest transport is what `apps/web/src/event-routes.test.ts` and
 * the load harness settle, and these suites are about the battle. What the route
 * does with a `session.started` is `runtime.emit(session.started)`, and that is
 * the line this depends on.
 */
export async function twoFighters(): Promise<readonly [Fighter, Fighter]> {
  const { database } = await sharedRuntime();
  const githubId = `m4-owner-${randomUUID()}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const [installation] = await database
    .insert(installations)
    .values({ userId: owner?.id ?? '', installationKey: `m4-installation-${randomUUID()}` })
    .returning({ id: installations.id });

  const made: Fighter[] = [];
  for (const [index, harness] of ['claude-code', 'codex'].entries()) {
    const label = `m4-fighter-${index}-${randomUUID().slice(0, 8)}`;
    const [agent] = await database
      .insert(agentsTable)
      .values({ userId: owner?.id ?? '', name: label, harness })
      .returning({ id: agentsTable.id });
    const [row] = await database
      .insert(sessions)
      .values({
        agentId: agent?.id ?? '',
        installationId: installation?.id ?? '',
        status: 'active',
        startedAt: new Date(),
      })
      .returning({ id: sessions.id });
    if (row === undefined || agent === undefined) {
      throw new Error('a fighter was created and could not be read back');
    }
    made.push({ sessionId: row.id, agentId: agent.id, label });
  }

  const { runtime } = await sharedRuntime();
  for (const fighter of made) {
    await runtime.emit({
      type: 'session.started',
      occurredAt: new Date().toISOString(),
      actorId: fighter.agentId,
      payload: { sessionId: fighter.sessionId, agentId: fighter.agentId, harness: 'claude' },
    });
  }
  return [made[0] as Fighter, made[1] as Fighter];
}

/** One bounty on a real GitHub issue. Both fighters are on THIS one, which is the
 *  M4 claim — two agents, same problem. */
export async function oneSharedIssue(): Promise<string> {
  const created = await act<{ id: string }>('bounty.create', {
    repoOwner: REPO_OWNER,
    repoName: `m4-${randomUUID().slice(0, 8)}`,
    issueNumber: ISSUE_NUMBER,
  });
  return created.id;
}

export interface Match {
  readonly battle: BattleView;
  readonly weights: BattleWeights;
  readonly alice: Fighter;
  readonly bob: Fighter;
  readonly aliceWorkspace: WorkspaceProvision;
  readonly bobWorkspace: WorkspaceProvision;
}

/** A 1v1 on one issue, both fighters qualified, workspaces provisioned, unjudged. */
export async function aMatchOnOneIssue(): Promise<Match> {
  const [alice, bob] = await twoFighters();
  await giveARecord(alice);
  await giveARecord(bob);
  const bountyId = await oneSharedIssue();

  const battle = await act<BattleView>('battle.create', {
    sessionId: alice.sessionId,
    bountyId,
    weights: DEFAULT_BATTLE_WEIGHTS,
  });
  const joined = await act<BattleView>('battle.join', {
    battleId: battle.id,
    sessionId: bob.sessionId,
  });

  // Read while the battle is STILL RUNNING. That is the fairness claim in §17.4
  // and the moment is the whole of it: a rubric readable only after the verdict
  // is a receipt, not a publication.
  const published = await act<{ status: string; weights: BattleWeights }>('battle.weights', {
    battleId: battle.id,
  });

  const base = scratchWorkspaceBase();
  return {
    battle: joined,
    weights: published.weights,
    alice,
    bob,
    aliceWorkspace: provisionWorkspace(base, battle.id, alice.sessionId),
    bobWorkspace: provisionWorkspace(base, battle.id, bob.sessionId),
  };
}

/** A command that always passes, so the judge's arithmetic is what is under test. */
export const ALWAYS_GREEN = async (
  _workspace: WorkspaceHandle,
  _step: unknown,
  command: string,
): Promise<WorkspaceRunResult> => ({
  command,
  exitCode: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  refusedBy: null,
  refusalReason: null,
});

export interface FinishInput {
  readonly battleId: string;
  readonly results: readonly {
    readonly sessionId: string;
    readonly submittedAt: string;
    readonly criteria: readonly { readonly criterion: string; readonly score: number }[];
  }[];
}

/** Alice outscores Bob on every criterion, so the winner is decided and not a tie. */
export function finishInput(match: Match): FinishInput {
  const at = new Date().toISOString();
  return {
    battleId: match.battle.id,
    results: [
      {
        sessionId: match.alice.sessionId,
        submittedAt: at,
        criteria: [
          { criterion: 'correctness', score: 0.9 },
          { criterion: 'tests', score: 0.8 },
          { criterion: 'regression', score: 0.9 },
          { criterion: 'quality', score: 0.9 },
          { criterion: 'efficiency', score: 0.9 },
        ],
      },
      {
        sessionId: match.bob.sessionId,
        submittedAt: at,
        criteria: [
          { criterion: 'correctness', score: 0.3 },
          { criterion: 'tests', score: 0.2 },
          { criterion: 'regression', score: 0.4 },
          { criterion: 'quality', score: 0.3 },
          { criterion: 'efficiency', score: 0.3 },
        ],
      },
    ],
  };
}

/** A judged, finished match, with the judge's own steps on the bus. */
export async function aFinishedMatch(): Promise<Match> {
  const match = await aMatchOnOneIssue();
  const { runtime } = await sharedRuntime();
  const report = await runJudge({
    battleId: match.battle.id,
    sessionId: match.alice.sessionId,
    workspace: match.aliceWorkspace.handle,
    // The battle's own weights, not the default. A judge handed a rubric that is
    // not the battle's would score a match nobody could have read the terms of,
    // and the number would still look like a score.
    weights: match.weights,
    execute: ALWAYS_GREEN as never,
  });
  await emitJudgeEvents(runtime, report);
  return match;
}
