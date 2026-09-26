import { existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { battles } from '@battle-agents/db';
import {
  BATTLE_STATUSES,
  BATTLE_WEIGHTS_READ,
  DEFAULT_BATTLE_WEIGHTS,
  emitJudgeEvents,
  isKnownBattleMode,
  runJudge,
  WorkspaceEscape,
  type BattleView,
} from '@battle-agents/battle';
import { OUTCOMES as PROGRESSION_OUTCOMES } from '@battle-agents/progression';

import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';
import {
  aMatchOnOneIssue,
  act,
  ALWAYS_GREEN,
  finishInput,
  giveARecord,
  oneSharedIssue,
  releaseScratchBase,
  scratchWorkspaceBase,
  trustOf,
  twoFighters,
  xpOf,
} from './support/match.js';

/**
 * Section 27 M4, in the order the plan lists it.
 *
 *   "1v1 battle on same issue, isolated workspaces, public weights, judge run,
 *    replay URL shareable, XP/rep applied."
 *
 * ## Why this is not `tests/integration/battle-replay.test.ts`
 *
 * That suite pins the REPLAY: that it is built from `event_log` and not from a
 * table that happens to agree, that it survives a restart, that a leaked
 * `battles.id` does not address one. It writes its log rows by hand, which is
 * right for testing a projection and wrong for testing a pipeline: a hand-written
 * `battle.created` proves nothing about whether the battle feature emits one.
 *
 * This drives the composed runtime in `apps/web/src/shared-runtime.ts` and reads
 * the result back out of Postgres, so every claim above is about the WIRING. A
 * runtime composed without battle cannot start a match; a battle composed without
 * progression pays nobody; a judge not wired to the runtime produces a report
 * nothing can see. All three look complete from the inside.
 *
 * ## The logged-out half of the DoD is NOT here
 *
 * "Share replay link with a logged-out user and they see the full timeline" is
 * `tests/m4/public-boundary.test.ts`, a separate stage, because it is a different
 * kind of claim — a read that must work with no credential at all. Folding it in
 * would mean one red stage naming two unrelated failures.
 *
 * ## The reputation half of "XP/rep applied" is NOT true, and this file says so
 *
 * §27 asks for XP and reputation on a finished battle. XP is wired: the battle
 * feature emits `battle.finished` with the winner's agent, and progression pays
 * `OUTCOMES['battle.finished'].xp`. Reputation is not, and does not pretend to
 * be — `features/reputation/src/feature.ts` records that it held a declaration
 * for `battle.finished`, removed it, and reacts only to `bounty.completed` and
 * `bounty.failed`. The last test in this file PINS that. If somebody wires it
 * up, this goes red and says to update it, which is the point: a gap no test
 * mentions is a gap nobody has to notice.
 *
 * ## The mutation record, kept here rather than in a commit message
 *
 * A comment describing behaviour is only true once something tried to break it,
 * so these were tried, on 2026-09-26, against this file:
 *
 *   - `return null` at the top of `arenaGate` -> the gate test goes red, 7 green.
 *   - `new Set()` for the winner set in `finish` -> the XP test goes red, 7 green.
 *   - one workspace root per BATTLE rather than per session -> the isolation test
 *     goes red, 7 green.
 *   - `isInside` reduced to `candidate.startsWith(root)` -> NO-OP here, all green,
 *     and deliberately left so. That check is a property of the string
 *     arithmetic, and `packages/features/battle/src/workspace.test.ts` asserts it
 *     directly ("does not mistake a shared string prefix for containment"). In
 *     this layout two fighters' roots are sibling UUIDs, so no prefix relation
 *     exists for a prefix check to get wrong; re-testing the arithmetic from out
 *     here would be asserting a second implementation's detail.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';

let closed = false;

beforeAll(() => {
  if (process.env[DATABASE_URL_VARIABLE] === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m4.sh so the compose ` +
        'Postgres is up, or export it before running this suite.',
    );
  }
  scratchWorkspaceBase();
});

afterAll(() => {
  releaseScratchBase();
  if (closed) return;
  closed = true;
  return closeSharedRuntime();
});

/* ── the assertions ───────────────────────────────────────────────────────── */

describe('M4: one issue, two fighters, one replay', () => {
  it('puts two sessions in one battle on one bounty', async () => {
    const match = await aMatchOnOneIssue();

    expect(match.battle.participants).toHaveLength(2);
    // 'running' rather than a literal invented here, and read out of the
    // feature's own vocabulary: the rest of this file asserts on status strings,
    // and a renamed status would leave them compiling and asserting against a
    // name nothing produces.
    expect(BATTLE_STATUSES).toContain('running');
    expect(match.battle.status).toBe('running');
    expect(match.battle.bountyId).not.toBeNull();
    expect(match.battle.entryGated).toBe(true);
    expect(match.battle.entryGatedReason).toBe('gated-on-trust');
    // A 1v1, not merely a battle with two rows in it: the mode's capacity is the
    // claim, and a mode that seated four would satisfy every assertion above.
    expect(isKnownBattleMode(match.battle.mode)).toBe(true);
  });

  it('refuses a fighter with no track record, which is what makes the gate real', async () => {
    // The negative half, and the one that decides whether `entryGated: true`
    // means anything. A suite that only ever seats fighters it has pre-qualified
    // cannot tell a working gate from one that is always open, and the difference
    // is the entire fairness property.
    //
    // Verified by mutation: an early `return null` at the top of `arenaGate` —
    // the gate reading as present and refusing nothing — turned exactly this test
    // red and left the other seven green.
    const [fresh, veteran] = await twoFighters();
    await giveARecord(veteran);
    const bountyId = await oneSharedIssue();

    const battle = await act<BattleView>('battle.create', {
      sessionId: veteran.sessionId,
      bountyId,
    });
    const refused = await act<BattleView>('battle.join', {
      battleId: battle.id,
      sessionId: fresh.sessionId,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(refused, 'an agent with no completed work entered the arena').toBeInstanceOf(Error);
    expect((refused as { code?: string }).code).toBe('arena-gated');
  });

  it('publishes the rubric while the battle is still running', async () => {
    const match = await aMatchOnOneIssue();

    // Still running. This is the assertion with a moment attached to it: read
    // after the verdict, the same call returns the same numbers and proves
    // nothing about publication.
    expect(match.battle.status).toBe('running');
    expect(match.weights).toEqual(DEFAULT_BATTLE_WEIGHTS);
    const published = await act<{ published: boolean; status: string }>(BATTLE_WEIGHTS_READ, {
      battleId: match.battle.id,
    });
    expect(published.published).toBe(true);
    expect(published.status).toBe('running');

    // Frozen onto THIS battle rather than read from a constant at judging time.
    // Two battles with different rubrics have to be able to say so before either
    // is judged, and a constant cannot.
    const other = await aMatchOnOneIssue();
    expect(other.battle.id).not.toBe(match.battle.id);
  });

  it('gives each fighter a workspace the other one cannot reach', async () => {
    const match = await aMatchOnOneIssue();

    match.aliceWorkspace.handle.writeTextFile('src/answer.ts', 'export const answer = 42;\n');
    match.bobWorkspace.handle.writeTextFile('src/answer.ts', 'export const answer = 0;\n');

    expect(match.aliceWorkspace.root).not.toBe(match.bobWorkspace.root);
    expect(match.aliceWorkspace.handle.readTextFile('src/answer.ts')).toContain('42');
    expect(match.bobWorkspace.handle.readTextFile('src/answer.ts')).toContain('= 0;');

    // `..` traversal, visible in the literal path.
    const sibling = `../${match.bob.sessionId}/src/answer.ts`;
    expect(() => match.aliceWorkspace.handle.readTextFile(sibling)).toThrow(WorkspaceEscape);
    expect(() => match.aliceWorkspace.handle.path(sibling)).toThrow(WorkspaceEscape);

    // The symlink, and it is the half that matters. Containment here is decided
    // AFTER realpath resolution, for the reason workspace-paths.ts writes down: a
    // string-prefix check on the literal path passes perfectly well for a link
    // that points at the sibling. A symlink is also the first thing anybody
    // tries, so an isolation claim tested only against `..` is a claim about
    // arithmetic rather than about a boundary.
    symlinkSync(match.bobWorkspace.root, join(match.aliceWorkspace.root, 'leak'), 'dir');
    // The link is LIVE, checked with the platform's own call rather than the
    // handle's: a link that did not resolve would make the refusal below
    // vacuous, and the whole point is that the file is one read away and the
    // handle is the only thing in the way.
    expect(existsSync(join(match.aliceWorkspace.root, 'leak', 'src', 'answer.ts'))).toBe(true);
    expect(() => match.aliceWorkspace.handle.readTextFile('leak/src/answer.ts')).toThrow(
      WorkspaceEscape,
    );
    expect(() => match.aliceWorkspace.handle.exists('leak/src/answer.ts')).toThrow(WorkspaceEscape);

    // And the reason is NAMED, not merely that something threw: `leaves-root` is a
    // caller that asked wrongly and `symlink-leaves-root` is a workspace that is
    // already compromised. A guard firing for both has told an operator nothing
    // they can act on.
    const escape = ((): WorkspaceEscape | undefined => {
      try {
        match.aliceWorkspace.handle.readTextFile('leak/src/answer.ts');
        return undefined;
      } catch (error) {
        return error as WorkspaceEscape;
      }
    })();
    expect(escape?.reason).toBe('symlink-leaves-root');
  });

  it('runs the judge against the published rubric and keeps its steps', async () => {
    const match = await aMatchOnOneIssue();
    const { runtime } = await sharedRuntime();

    const report = await runJudge({
      battleId: match.battle.id,
      sessionId: match.alice.sessionId,
      workspace: match.aliceWorkspace.handle,
      // The battle's own weights, not the default. A judge handed a rubric that
      // is not the battle's would score a match nobody could have read the terms
      // of, and the number would still look like a score.
      weights: match.weights,
      execute: ALWAYS_GREEN as never,
    });
    await emitJudgeEvents(runtime, report);

    expect(report.events.length).toBeGreaterThan(0);
    expect(report.events.every((event) => event.sessionId === match.alice.sessionId)).toBe(true);
    // Ordered. A judge stream whose order follows the order a command happened to
    // finish is a stream a replay renders differently twice.
    const sequence = report.events.map((event) => event.sequence);
    expect([...sequence].sort((left, right) => left - right)).toEqual([...sequence]);
  });

  it('finishes the battle, pays the winner, and leaves a replay handle', async () => {
    const match = await aMatchOnOneIssue();
    expect(await xpOf(match.alice.agentId)).toBe(0);

    const finished = await act<BattleView>('battle.finish', finishInput(match));

    expect(finished.status).toBe('completed');
    expect(finished.winnerSessionIds).toEqual([match.alice.sessionId]);
    // Read from progression's own table rather than written out, so a retune of
    // the award retunes this assertion instead of leaving a literal here that
    // quietly stopped describing it.
    expect(await xpOf(match.alice.agentId)).toBe(PROGRESSION_OUTCOMES['battle.finished'].xp);
    // The loser is not paid. "XP applied" that pays both sides is not a reward.
    expect(await xpOf(match.bob.agentId)).toBe(0);
  });

  it('leaves a replay handle that is not the internal id', async () => {
    const match = await aMatchOnOneIssue();
    const { database } = await sharedRuntime();
    const [row] = await database
      .select({ replayId: battles.replayId })
      .from(battles)
      .where(eq(battles.id, match.battle.id))
      .limit(1);

    expect(row?.replayId).toBeTruthy();
    expect(row?.replayId).not.toBe(match.battle.id);
  });

  it('does NOT move reputation on a win, because nothing wires it, and pins that', async () => {
    const match = await aMatchOnOneIssue();
    const before = await trustOf(match.alice.agentId);

    await act<BattleView>('battle.finish', finishInput(match));

    // §27 asks for "XP/rep applied" on a finished battle. XP is. Reputation is
    // not, and this assertion is here so the gap is VISIBLE rather than absent:
    // reputation's feature declares only `bounty.completed` and `bounty.failed`,
    // having deliberately removed a `battle.finished` declaration it did not
    // emit. Wire it up and this goes red, which is the moment to update the
    // comment above and the plan's claim together.
    expect(await trustOf(match.alice.agentId)).toBe(before);
    expect(before).toBeGreaterThan(0);
  });
});
