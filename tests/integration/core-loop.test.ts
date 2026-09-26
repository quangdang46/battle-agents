import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import {
  agents as agentsTable,
  battles,
  bounties,
  DrizzleReputationRepository,
  users,
} from '@battle-agents/db';
import { signPayload, WEBHOOK_SECRET_VARIABLE } from '@battle-agents/github';
import { createTools, type ToolContext } from '@battle-agents/mcp-server';

import { loadPublicReplay } from '../../apps/web/src/replay-view.js';
import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';
import { sharedGithubWebhook, type WebhookHttpRequest } from '../../apps/web/src/webhook-routes.js';

/**
 * Plan §10.5, the whole loop, in one observed run.
 *
 *   DISCOVER -> CLAIM -> CODE -> VALIDATE -> REWARD -> BATTLE -> SOCIAL
 *
 * ## What this file is not
 *
 * `tests/m2/bounty-loop.test.ts` runs DISCOVER..REWARD on the composed runtime.
 * `tests/m4/battle-to-replay.test.ts` runs BATTLE on the composed runtime. Both
 * are real, and neither can fail because a stage is missing: each draws its
 * fixtures from a helper that starts where the other one would have to end.
 * Seven unit tests in a trenchcoat is the shape this bead warns about, so this
 * file refuses to be that. One run, in `beforeAll`, and every `it` below is a
 * separate CLAIM about that same run — the arrangement
 * `tests/integration/two-harnesses-live.test.ts` uses and says why: the claims
 * stay separate, and none of them asserts "the test passed".
 *
 * ## What makes it a loop rather than a sequence
 *
 * Each stage is handed the previous stage's OUTPUT, and never a value this file
 * kept. Concretely:
 *
 *   - CLAIM is given the id `bounty.list` returned, not the id `bounty.create`
 *     returned. The solver's half of the run starts from a board read, and
 *     `created` is not threaded into it.
 *   - REWARD is given a GitHub delivery carrying a repository, a pull request
 *     number and a PERSON's login, which is all GitHub knows. The bounty is
 *     found by REBUILDING the pull request URL from the first two and looking it
 *     up (packages/db/src/repositories/bounties.ts, findByPrUrl), and the agent
 *     is read off the CLAIM record. Neither is an input here.
 *   - BATTLE is refused entry before the merge and admitted after it, on the
 *     same session and the same command. Trust is the only thing that opens the
 *     arena, and the only thing in this run that moved trust is the REWARD stage.
 *
 * ## The fan-out
 *
 * One `bounty.completed` emission moves three features, and no two of them see
 * each other: progression's experience, reputation's trust, achievements' badge.
 * `tests/integration/core-loop-fanout.test.ts` proves the other half — that the
 * loop still closes with a consumer not installed at all, and that the one stage
 * the composition root cannot reach (SOCIAL) closes when guild is present.
 *
 * ## What this does NOT cover, stated rather than implied
 *
 * - **CODE runs no subprocess.** The agent's work enters the protocol the way
 *   every harness enters it: as `session.started` and work events on the bus.
 *   `tests/integration/two-harnesses-live.test.ts` is the suite that runs two
 *   real harnesses into this same seam.
 * - **JUDGING is not a command.** `runJudge` is a plain export of the battle
 *   feature, so this file hands `battle.finish` the per-criterion scores a judge
 *   would have produced. What the judge computes is `tests/m4`'s claim, not this
 *   file's; what is claimed here is that the loop carries the verdict through
 *   `battle.finish` to the reward and the public replay.
 * - **SOCIAL cannot be reached through the composition root at all.** `guild` is
 *   not installed by `apps/web/src/composition.ts`, so `social.send` is degraded
 *   and every `guild.*` id throws `UnknownActionError`. That is asserted here
 *   rather than hidden, and `core-loop-fanout.test.ts` closes the stage with a
 *   runtime that has guild in it.
 * - **Nothing is rendered.** The public face is the replay DATA read through the
 *   same `loadPublicReplay` the page calls, with no credential. React's server
 *   renderer is not in the root dependency set and `page.tsx` imports
 *   `next/headers`, so the markup is not asserted; `tests/m4/public-boundary.test.ts`
 *   says the same about the same page.
 *
 * ## The mutation record
 *
 * A comment describing behaviour is only true once something tried to break it,
 * so here is what was broken and what each break did. Every one of these was
 * reverted by hand afterwards; the tree is as it was found.
 *
 * 1. `packages/db/src/repositories/bounties.ts` — `findByPrUrl` correlates on
 *    `bounties.issueUrl` instead of `bounties.prUrl`. The delivery rebuilds a
 *    PULL REQUEST url, so the lookup matches nothing and the merge completes no
 *    bounty. RED: this file's run aborts in `beforeAll` with
 *    `the solver could not enter the arena after earning the reward: trust 0 is
 *    below 500` — the loop breaks at the hand-off rather than at an assertion
 *    about a zero, which is the reason the run checks the post-reward entry
 *    rather than trusting the final reads. Also RED in
 *    `core-loop-fanout.test.ts` (4).
 * 2. `packages/features/bounty/src/feature.ts` — `onPullRequestMerged` takes the
 *    agent from `delivery.githubLogin` instead of the claim record. The delivery
 *    carries a PERSON, so the award moves to a login that is not an agent.
 *    RED: the same beforeAll abort, plus 5 in `core-loop-fanout.test.ts`.
 * 3. `packages/features/battle/src/feature.ts` — the per-winner `battle.finished`
 *    payload says `won: false`. progression prices the award behind
 *    `requires: {field: 'won', equals: true}`, so the battle pays nothing.
 *    RED: exactly one assertion, "BATTLE carries the loop's bounty, pays the
 *    winner", with `expected +0 to be 500`. GREEN: the other fifteen, which is
 *    the point — the award rides on a field the event carries, not on a battle
 *    id this file supplied.
 * 4. `packages/features/progression/src/feature.ts` — `agentIdOf` falls back to
 *    `actorId` when the payload names no agent. This is the FIX for the gap the
 *    failure branch pins, and it turns that pin red with
 *    `expected 100 to be +0`: the crash character's experience is the passing
 *    test's award, exactly as the comment predicts. RED: one assertion.
 * 5. `packages/features/reputation/src/feature.ts` — `onBountyCompleted` throws.
 *    The most consequential of the five and the reason this record is here:
 *    `runtime.emit` awaits handlers in registration order and does not catch, so
 *    ONE consumer failing starves every consumer registered after it and unwinds
 *    the whole loop — the bounty never completes and the merge returns the
 *    error. Uninstalling a consumer is clean (that is what
 *    `core-loop-fanout.test.ts` proves); FAILING one is fatal. RED: 3 in
 *    `core-loop-fanout.test.ts` and the beforeAll abort here.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const SECRET = 'core-loop-secret-not-real';
const REPO_OWNER = 'battle-agents';
const ISSUE_NUMBER = 5501;
const PULL_REQUEST = 5502;
/**
 * Large, and deliberately so.
 *
 * The claim this file makes is that REWARD is what opens BATTLE, and the only
 * thing that opens the arena is trust (battle/src/domain.ts, mayEnterArena).
 * Trust is scored out of completed work AND money earned (reputation/src/rules.ts,
 * trustScore), so a $5 chore cannot clear the floor however many times it is
 * completed. This amount clears it once. The floor itself is not written down
 * here: it is parsed out of the refusal the platform gives, so a retune of
 * ARENA_MIN_TRUST retunes this fixture's meaning instead of leaving a literal
 * that quietly stopped describing the gate.
 */
const REWARD_CENTS = 80_000;

let closed = false;
let api: ApplicationApi;
let act: <T>(action: string, input: unknown) => Promise<T>;

/** Everything one pass of the loop produced, asserted on by the `it` blocks. */
interface Observed {
  readonly repository: string;
  /** The board as `bounty.list` returned it, before anything was claimed. */
  readonly boardSize: number;
  readonly discovered: BountyRow;
  /** Read back out of Postgres after the claim, not the action's return value. */
  readonly claimedRow: DurableBountyRow;
  readonly submitted: BountyRow;
  readonly completed: DurableBountyRow;
  readonly solver: Character;
  readonly challenger: Character;
  /** What the arena said to the same session before the merge, and after it. */
  readonly entryBeforeReward: unknown;
  readonly entryAfterReward: BattleView;
  /** The arena as it stood when it opened, before the solver could get in. */
  readonly openedBattle: BattleView;
  /** The trust the platform refused entry at, and the trust it then granted. */
  readonly trustBeforeReward: ReputationSheet;
  readonly trustAfterReward: ReputationSheet;
  readonly gateFloor: number;
  readonly battle: BattleView;
  readonly finished: BattleView;
  readonly xp: {
    readonly solverAfterBounty: number;
    readonly solverAfterBattle: number;
    readonly challengerAfterBattle: number;
    readonly crasher: number;
  };
  readonly awards: {
    readonly bounty: AwardView;
    readonly battle: AwardView;
    readonly testPassed: AwardView;
  };
  readonly crasher: Character;
  /** The crashed character's sheets, read after the ending reached the bus. */
  readonly crashed: { readonly sheet: ProgressionSheet; readonly badges: AchievementSheet };
  readonly domains: readonly string[];
  readonly socialSend: unknown;
  readonly guildCreate: unknown;
  /**
   * What the three consumers of `bounty.completed` said, read IMMEDIATELY after
   * the merge. Reading them at assert time would read them after the battle, and
   * the character sheet has moved on by then — which is how "one emission pays
   * three features" turns into a test that cannot tell three payments from one.
   */
  readonly afterMerge: {
    readonly xp: ProgressionSheet;
    readonly trust: ReputationSheet;
    readonly badges: AchievementSheet;
  };
  readonly replay: {
    readonly replayId: string;
    readonly state: string;
    readonly beats: readonly { readonly beat: string }[];
  };
  readonly replayIdIsInternalId: boolean;
  /**
   * A well-formed id for an agent nobody has ever heard of.
   *
   * A literal string would not do: the agents table keys on uuid, so reading a
   * non-uuid is a Postgres `22P02` rather than the "nobody has heard of this
   * character" answer the assertion is about.
   */
  readonly strangerAgentId: string;
}

let observed: Observed;

beforeAll(async () => {
  if (process.env[DATABASE_URL_VARIABLE] === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  const { runtime, bus } = await sharedRuntime();
  api = createApplicationApi(runtime, bus);

  // The MCP `act` tool, invoked in process. Not `api.act` dressed up: the tool is
  // what an agent calls, and it carries the registered-action check the
  // Application API also carries. What calling it this way does NOT exercise is
  // the zod input schema, which belongs to the transport and is proved by
  // tests/integration/achievements-parity.test.ts instead.
  const actTool = createTools().get('act');
  if (actTool === undefined) {
    throw new Error('the MCP act tool is not registered; the protocol changed under this file');
  }
  const context: ToolContext = {
    api,
    subscribe: (domain) => {
      api.observe(domain === undefined ? {} : { domain }, () => {});
      return 'core-loop-subscription';
    },
  };
  act = async <T,>(action: string, input: unknown): Promise<T> =>
    (await actTool.handle(context, { action, input })) as T;

  // The webhook reads its secret from the environment on every delivery, by
  // design, so rotating it needs no restart. Without this the handler refuses
  // the delivery — correctly — and the failure surfaces much later as an
  // experience total of zero rather than as an error where it happened.
  process.env[WEBHOOK_SECRET_VARIABLE] = SECRET;
  observed = await runTheLoop();
}, 60_000);

afterAll(async () => {
  delete process.env[WEBHOOK_SECRET_VARIABLE];
  if (closed) return;
  closed = true;
  await closeSharedRuntime();
});

/* ── the run ──────────────────────────────────────────────────────────────── */

async function runTheLoop(): Promise<Observed> {
  const { runtime } = await sharedRuntime();
  const repoName = `core-loop-${randomUUID().slice(0, 12)}`;
  const repository = `${REPO_OWNER}/${repoName}`;

  /* DISCOVER — a sponsor opens the bounty, the solver finds it on the board. */
  const sponsor = await aCharacter('sponsor', 'claude');
  const created = await act<BountyRow>('bounty.create', {
    repoOwner: REPO_OWNER,
    repoName,
    issueNumber: ISSUE_NUMBER,
  });
  await act<BountyRow>('bounty.fund', {
    bountyId: created.id,
    amountCents: REWARD_CENTS,
    sponsorUserId: sponsor.ownerId,
    reportedBy: 'core-loop-maintainer',
  });

  const solver = await aCharacter('solver', 'codex');
  const challenger = await aCharacter('challenger', 'claude');
  // The challenger is a veteran, and nothing in this loop made them one. Saying
  // so is the point: every arena assertion below is about the SOLVER, whose only
  // completed work is the bounty this run is about to finish.
  await giveARecord(challenger.agentId);

  // The board read is the only route to the id from here. `created` is
  // deliberately not threaded into the solver's half of the run.
  const board = await act<readonly BountyRow[]>('bounty.list', { repoOwner: REPO_OWNER, repoName });
  const discovered = board.find((row) => row.repository.repoName === repoName);
  if (discovered === undefined) {
    throw new Error(
      `bounty.list returned no row for ${repository}; discovery is this loop's first hand-off`,
    );
  }

  /* CLAIM — the discovered row is the one that gets mutated. */
  await act<BountyRow>('bounty.claim', { bountyId: discovered.id, agentId: solver.agentId });
  const claimedRow = await durableBounty(discovered.id);

  /* CODE — the session tells the runtime which agent a session belongs to, which
     is the only thing that lets the arena gate judge anybody. */
  for (const fighter of [solver, challenger]) {
    await runtime.emit({
      type: 'session.started',
      occurredAt: new Date().toISOString(),
      actorId: fighter.agentId,
      payload: { sessionId: fighter.sessionId, agentId: fighter.agentId, harness: fighter.harness },
    });
  }

  /* BATTLE opens on the SAME bounty the solver is working, and the solver is
     kept out of it for now. The veteran opens it; the gate that refuses the
     solver is on `battle.join`, and that asymmetry is reported rather than
     designed around — see the header. */
  const openedBattle = await act<BattleView>('battle.create', {
    sessionId: challenger.sessionId,
    bountyId: discovered.id,
  });

  /* The arena BEFORE anything has been earned: refused, and the refusal names
     the floor. Probed without unwinding, because the run continues past it. */
  const entryBeforeReward = await attempt('battle.join', {
    battleId: openedBattle.id,
    sessionId: solver.sessionId,
  });
  const gateFloor = trustFloorIn(entryBeforeReward);
  const trustBeforeReward = await act<ReputationSheet>('reputation.read', {
    agentId: solver.agentId,
  });

  /* VALIDATE — the pull request is the artifact under review. Its URL is written
     here in the canonical GitHub shape; the merge delivery below carries only
     the repository and the number, and the feature rebuilds the URL from those. */
  const submitted = await act<BountyRow>('bounty.submit', {
    bountyId: discovered.id,
    agentId: solver.agentId,
    prUrl: `https://github.com/${repository}/pull/${PULL_REQUEST}`,
  });

  /* REWARD — GitHub says a merge happened. Nothing else. */
  await postMerge(repository);
  const completed = await durableBounty(discovered.id);
  const solverAfterBounty = await xpOf(solver.agentId);
  const trustAfterReward = await act<ReputationSheet>('reputation.read', {
    agentId: solver.agentId,
  });
  // Read the three consumers HERE, before the battle moves the character sheet,
  // so the fan-out assertion is about what one emission did and not about
  // whatever the sheet happens to say when the test gets round to asking.
  const afterMerge = {
    xp: await act<ProgressionSheet>('progression.read', { agentId: solver.agentId }),
    trust: await act<ReputationSheet>('reputation.read', { agentId: solver.agentId }),
    badges: await act<AchievementSheet>('achievements.list', { agentId: solver.agentId }),
  };

  /* BATTLE — the same battle, the same session, the same command, admitted. */
  const entryAfterReward = await attempt('battle.join', {
    battleId: openedBattle.id,
    sessionId: solver.sessionId,
  });
  if (!isBattleView(entryAfterReward)) {
    throw new Error(
      `the solver could not enter the arena after earning the reward: ${say(entryAfterReward)}`,
    );
  }
  const joined = entryAfterReward;

  // Work inside the arena. The battle feature's behaviour handler records it and
  // no action reads the accumulator back, which is why nothing here asserts on it.
  for (const fighter of [solver, challenger]) {
    await runtime.emit({
      type: 'file.write',
      occurredAt: new Date().toISOString(),
      actorId: fighter.agentId,
      payload: { sessionId: fighter.sessionId, path: 'src/answer.ts' },
    });
  }

  const finished = await act<BattleView>('battle.finish', {
    battleId: joined.id,
    results: [
      {
        sessionId: solver.sessionId,
        submittedAt: new Date().toISOString(),
        criteria: [
          { criterion: 'correctness', score: 0.9 },
          { criterion: 'tests', score: 0.8 },
          { criterion: 'regression', score: 0.9 },
          { criterion: 'quality', score: 0.9 },
          { criterion: 'efficiency', score: 0.9 },
        ],
      },
      {
        sessionId: challenger.sessionId,
        submittedAt: new Date().toISOString(),
        criteria: [
          { criterion: 'correctness', score: 0.3 },
          { criterion: 'tests', score: 0.2 },
          { criterion: 'regression', score: 0.4 },
          { criterion: 'quality', score: 0.3 },
          { criterion: 'efficiency', score: 0.3 },
        ],
      },
    ],
  });

  /* The public face. Read through the same function the page calls, with no
     credential, by a handle that is not the battle's internal id. */
  const replayId = await replayIdFor(joined.id);
  const page = await loadPublicReplay(replayId);
  if (page.replay === undefined) {
    throw new Error(`the public replay for ${replayId} did not assemble`);
  }

  /* FAILURE — §10.2's other branch, in the same run. A character whose run
     crashed: five failing tests, one passing, then the crash. */
  const crasher = await aCharacter('crasher', 'gemini');
  await runtime.emit({
    type: 'session.started',
    occurredAt: new Date().toISOString(),
    actorId: crasher.agentId,
    payload: { sessionId: crasher.sessionId, agentId: crasher.agentId, harness: crasher.harness },
  });
  for (let failure = 0; failure < 5; failure += 1) {
    await runtime.emit({
      type: 'test.failed',
      occurredAt: new Date().toISOString(),
      actorId: crasher.agentId,
      // The shape the ingest route produces: `toGameEvent` in
      // apps/web/src/event-routes.ts sets actorId to the session's agent and
      // passes the AgentEvent through as the payload untouched. So the agent is
      // on `actorId` and NOT in the payload, and that is what the assertions
      // below are about. A payload carrying an agentId would be a shape
      // production never emits, and the gap it hides is the point.
      payload: { type: 'test.failed', at: new Date().toISOString(), sessionId: crasher.sessionId },
    });
  }
  await runtime.emit({
    type: 'test.passed',
    occurredAt: new Date().toISOString(),
    actorId: crasher.agentId,
    payload: { type: 'test.passed', at: new Date().toISOString(), sessionId: crasher.sessionId },
  });
  await act<{ readonly sessionId: string; readonly reason: string }>('session.end', {
    sessionId: crasher.sessionId,
    reason: 'crashed',
  });
  // `session.end` writes the row and emits NOTHING. Every consumer of the ending
  // — the crash badge, the activity trail, the arena's pause clock, the public
  // stream — reads a `session.ended` EVENT, and in this repository only the
  // harness adapters produce one (packages/adapters/*/src). So the run emits it
  // the way a harness would, and the gap between the command and the event is
  // the report rather than something this file routes around.
  await runtime.emit({
    type: 'session.ended',
    occurredAt: new Date().toISOString(),
    actorId: crasher.agentId,
    payload: { type: 'session.ended', sessionId: crasher.sessionId, at: new Date().toISOString(), reason: 'crashed' },
  });
  const crasherBadges = await act<AchievementSheet>('achievements.list', {
    agentId: crasher.agentId,
  });
  const crasherSheet = await act<ProgressionSheet>('progression.read', {
    agentId: crasher.agentId,
  });
  return {
    repository,
    boardSize: board.length,
    discovered,
    claimedRow,
    submitted,
    completed,
    solver,
    challenger,
    entryBeforeReward,
    entryAfterReward: joined,
    trustBeforeReward,
    trustAfterReward,
    gateFloor,
    openedBattle,
    battle: joined,
    finished,
    xp: {
      solverAfterBounty,
      solverAfterBattle: await xpOf(solver.agentId),
      challengerAfterBattle: await xpOf(challenger.agentId),
      crasher: await xpOf(crasher.agentId),
    },
    awards: {
      bounty: await award('bounty.completed'),
      battle: await award('battle.finished'),
      testPassed: await award('test.passed'),
    },
    crasher,
    crashed: { sheet: crasherSheet, badges: crasherBadges },
    domains: (await api.discover()).domains ?? [],
    socialSend: await attempt('social.send', {
      fromAgentId: solver.agentId,
      toAgentId: challenger.agentId,
      body: 'good game',
    }),
    guildCreate: await attempt('guild.create', { name: 'the unreachable', tag: 'nope' }),
    afterMerge,
    replay: {
      replayId,
      state: page.replay.state,
      beats: page.replay.beats.map((beat) => ({ beat: beat.beat })),
    },
    replayIdIsInternalId: replayId === joined.id,
    strangerAgentId: randomUUID(),
  };
}

/* ── the claims ───────────────────────────────────────────────────────────── */

describe("plan 10.5: one agent's work, through seven stages, to somewhere another can see it", () => {
  it('DISCOVER hands CLAIM a row, and the row it named is the row that changed', () => {
    // The board the solver read, and the status it read. A discovery that
    // returned something else would make every later stage a different bounty.
    expect(observed.boardSize).toBeGreaterThan(0);
    expect(observed.discovered.status).toBe('open');
    expect(observed.discovered.claimedAgentId).toBeNull();

    // Read out of POSTGRES rather than from the claim's return value. An action
    // that reported a summary it had not written would satisfy the id comparison
    // and nothing here would notice.
    expect(observed.claimedRow.id).toBe(observed.discovered.id);
    expect(observed.claimedRow.status).toBe('claimed');
    expect(observed.claimedRow.claimedAgentId).toBe(observed.solver.agentId);
  });

  it('CODE and VALIDATE leave a claim naming one agent and one pull request', () => {
    expect(observed.submitted.claimedAgentId).toBe(observed.solver.agentId);
    expect(observed.submitted.prUrl).toBe(
      `https://github.com/${observed.repository}/pull/${PULL_REQUEST}`,
    );
    // Derived by the feature from the coordinates, never supplied. A bounty
    // whose issue link is free text is a bounty nobody can check.
    expect(observed.discovered.issueUrl).toBe(
      `https://github.com/${observed.repository}/issues/${ISSUE_NUMBER}`,
    );
    // Still waiting when the pull request went in. The half a pipeline passes
    // without noticing: a bounty that sits `submitted` forever looks identical,
    // from the outside, to one that completed.
    expect(observed.submitted.status).toBe('submitted');
  });

  it('REWARD turns a merge into a completion, and nothing else turns it into one', async () => {
    const after = await durableBounty(observed.discovered.id);
    expect(observed.completed.status).toBe('completed');
    expect(observed.completed.prUrl).toBe(observed.submitted.prUrl);
    // A PERSON's account, recorded because a dispute needs to know who pressed
    // the button — and emphatically not the agent.
    expect(observed.completed.mergedBy).toBe('core-loop-maintainer');
    expect(observed.completed.claimedAgentId).toBe(observed.solver.agentId);
    expect(after.status).toBe('completed');
  });

  it('REWARD pays one award, to the CLAIM record and not to the merge author', async () => {
    // The price comes from the table that pays it, asked for by the question a
    // client would ask, so a retune retunes this rather than leaving a literal.
    expect(observed.awards.bounty.recognised).toBe(true);
    expect(observed.xp.solverAfterBounty).toBe(observed.awards.bounty.xp);
    expect(observed.afterMerge.xp.xp).toBe(observed.awards.bounty.xp);
    expect(observed.afterMerge.xp.build).toBe('builder');

    // The delivery carried a person's login. Had the award been attributed off
    // it, this agent would be at zero and a stranger who does not exist here
    // would be rich.
    const stranger = await act<ProgressionSheet>('progression.read', {
      agentId: observed.strangerAgentId,
    });
    expect(stranger.exists).toBe(false);
  });

  it('REWARD fans out to three features that never see each other', () => {
    // Read immediately after the merge, so this is about the single emission and
    // not about whatever the sheet says by the end of the run.
    const { xp, trust, badges } = observed.afterMerge;

    expect(xp.xp).toBe(observed.awards.bounty.xp);
    expect(trust.completed).toBe(1);
    expect(trust.earnedCents).toBe(REWARD_CENTS);
    expect(trust.failed).toBe(0);
    expect(badges.badges.map((badge) => badge.code)).toContain('first-bounty.v1');
  });

  it('BATTLE is shut before the reward and open after it, and the thing that moved is trust', () => {
    // Before. A gate nobody ever refuses is not a gate, and a suite that only
    // ever seats qualified fighters cannot tell the two apart.
    expect(isBattleView(observed.entryBeforeReward)).toBe(false);
    expect(say(observed.entryBeforeReward)).toMatch(/may not enter the arena/);
    expect(observed.gateFloor).toBeGreaterThan(0);
    expect(observed.trustBeforeReward.trust).toBeLessThan(observed.gateFloor);

    // After — same session, same command, the only difference between the two
    // attempts being the merge.
    expect(observed.entryAfterReward.bountyId).toBe(observed.completed.id);
    expect(observed.entryAfterReward.entryGated).toBe(true);
    expect(observed.entryAfterReward.entryGatedReason).toBe('gated-on-trust');
    expect(observed.trustAfterReward.trust).toBeGreaterThanOrEqual(observed.gateFloor);
  });

  it('BATTLE carries the loop\'s bounty, pays the winner from the event, and the loser nothing', () => {
    // The linkage is a column the loop filled in from the stage before, not a
    // coincidence: a battle with no bountyId would satisfy every other assertion
    // in this file.
    expect(observed.battle.bountyId).toBe(observed.completed.id);
    expect(observed.finished.status).toBe('completed');
    expect(observed.finished.winnerSessionIds).toEqual([observed.solver.sessionId]);

    // The battle award is the DELTA between the bounty award and the total, so
    // this cannot be satisfied by a reward that paid the bounty twice or not at
    // all. And the loser is not paid: "XP applied" that pays both sides is not
    // a reward.
    expect(observed.xp.solverAfterBattle - observed.xp.solverAfterBounty).toBe(
      observed.awards.battle.xp,
    );
    expect(observed.xp.challengerAfterBattle).toBe(0);
  });

  it('the finished battle is readable with no credential, by a handle that is not its id', () => {
    expect(observed.replayIdIsInternalId).toBe(false);
    // 'available' is this feature's own word for a finished battle, read out of
    // PublicReplayState rather than invented here.
    expect(observed.replay.state).toBe('available');
    // A replay with no verdict beat is an empty page that renders as a plausible
    // story, so the beat is named rather than counted.
    expect(observed.replay.beats.map((beat) => beat.beat)).toContain('battle.finished');
  });

  it('FAILURE leaves the character alive, and pins exactly what a crash pays', () => {
    // Alive. HP 0 fails the session, never the agent (§10.2).
    expect(observed.crashed.sheet.exists).toBe(true);
    // The badges failure is FOR, and these two are the half that is wired.
    // Achievements falls back to `actorId` when the payload names no agent
    // (packages/features/achievements/src/feature.ts), which is why they land on
    // an event the shipped ingest route could have produced.
    const codes = observed.crashed.badges.badges.map((badge) => badge.code);
    expect(codes).toContain('survived-a-crash.v1');
    expect(codes).toContain('critical-hit.v1');
    // The experience is NOT paid, and the number below is the report rather than
    // a passing expectation. `test.passed` is priced at 100 in
    // progression/src/rules.ts and has a handler for it, but that handler
    // resolves the agent from `payload.agentId` and nothing that reaches it
    // carries one: `toGameEvent` puts the agent on `actorId`. So the price
    // exists, the subscriber exists, and the award is unreachable. Wired the way
    // achievements is, this would be
    // `expect(observed.xp.crasher).toBe(observed.awards.testPassed.xp)`.
    expect(observed.awards.testPassed.recognised).toBe(true);
    expect(observed.xp.crasher).toBe(0);
  });

  it('SOCIAL does not exist in the composed runtime, and this file says so rather than skipping it', () => {
    // The stage the composition root cannot reach. Asserted rather than hidden,
    // because a loop test that quietly stopped at BATTLE would look identical to
    // this one if nobody wrote it down.
    expect(observed.domains).not.toContain('guild');
    expect(say(observed.guildCreate)).toMatch(/unknown action/);
    // social itself IS installed and IS degraded, so it refuses rather than
    // throwing: the message is the feature's, not the registry's.
    expect(say(observed.socialSend)).not.toMatch(/unknown action/);
  });
});

/* ── fixtures and reads ───────────────────────────────────────────────────── */

interface Character {
  readonly agentId: string;
  readonly sessionId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly harness: string;
}

/**
 * A character, created the way a person creates one.
 *
 * The user and agent rows are inserted directly, which every suite here does and
 * which exists because `agent.register` is a CommandHandler rather than an
 * action — so there is no `act()` that creates a character and this file cannot
 * reach the step where one would be minted. The SESSION is created through
 * `session.create`, which is a real action, so the row the loop fights over is
 * one the protocol made.
 */
async function aCharacter(label: string, harness: string): Promise<Character> {
  const { database } = await sharedRuntime();
  const githubId = `core-loop-${label}-${randomUUID()}`;
  const [user] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const ownerId = user?.id ?? '';
  const name = `core-loop-${label}-${randomUUID().slice(0, 8)}`;
  const [agent] = await database
    .insert(agentsTable)
    .values({ userId: ownerId, name, harness })
    .returning({ id: agentsTable.id });
  const hello = await act<{ readonly sessionId: string; readonly agentId: string }>('session.create', {
    installationKey: `core-loop-install-${randomUUID()}`,
    ownerId,
    agentName: name,
    harness,
  });
  if (agent === undefined) {
    throw new Error('a character was inserted and could not be read back');
  }
  return { agentId: agent.id, sessionId: hello.sessionId, ownerId, name, harness };
}

/**
 * A reputation record, the way a veteran has one.
 *
 * Written through the concrete Drizzle store rather than through a feature
 * action, because no action creates a record: `reputation` reacts to outcomes
 * and reads what it built. This is the one piece of state the loop does not
 * produce, and it belongs to the challenger's half of the fixture.
 */
async function giveARecord(agentId: string): Promise<void> {
  const { database } = await sharedRuntime();
  await new DrizzleReputationRepository(database).save({
    agentId,
    completed: 8,
    failed: 0,
    acceptanceRate: 1,
    reviewScore: 4,
    earnedCents: 90_000,
    refusedOutcomes: 0,
    updatedAt: new Date().toISOString(),
  });
}

async function xpOf(agentId: string): Promise<number> {
  const { database } = await sharedRuntime();
  const [row] = await database
    .select({ xp: agentsTable.xp })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);
  return row?.xp ?? 0;
}

/** The durable row, so an assertion can be about storage rather than a return value. */
async function durableBounty(bountyId: string): Promise<DurableBountyRow> {
  const { database } = await sharedRuntime();
  const [row] = await database.select().from(bounties).where(eq(bounties.id, bountyId)).limit(1);
  if (row === undefined) {
    throw new Error(`bounty ${bountyId} was written by this run and cannot be read back`);
  }
  return row as unknown as DurableBountyRow;
}

async function replayIdFor(battleId: string): Promise<string> {
  const { database } = await sharedRuntime();
  const [row] = await database
    .select({ replayId: battles.replayId })
    .from(battles)
    .where(eq(battles.id, battleId))
    .limit(1);
  if (row?.replayId === undefined || row.replayId === null) {
    throw new Error(`battle ${battleId} finished without a replay handle`);
  }
  return row.replayId;
}

async function award(eventType: string): Promise<AwardView> {
  return act<AwardView>('progression.awards', { eventType });
}

/** A body GitHub would actually send, pretty-printed as it sends it. */
function mergeBody(repository: string): string {
  return JSON.stringify(
    {
      action: 'closed',
      repository: { full_name: repository },
      pull_request: {
        number: PULL_REQUEST,
        merged: true,
        merged_at: '2026-09-26T12:00:00Z',
        user: { login: 'core-loop-maintainer' },
      },
    },
    null,
    2,
  );
}

function delivery(body: string, deliveryId: string, secret: string): WebhookHttpRequest {
  return {
    method: 'POST',
    url: 'https://game.example/api/webhooks/github',
    headers: {
      get: (name: string): string | null => {
        switch (name.toLowerCase()) {
          case 'x-hub-signature-256':
            return signPayload(secret, body);
          case 'x-github-delivery':
            return deliveryId;
          case 'x-github-event':
            return 'pull_request';
          default:
            return null;
        }
      },
    },
    rawBody: body,
  };
}

async function postMerge(repository: string): Promise<number> {
  const response = await (
    await sharedGithubWebhook()
  )(delivery(mergeBody(repository), `core-loop-${randomUUID()}`, SECRET));
  return response.status;
}

/* ── shapes the API answers with, declared for the fields this file reads ──── */

/**
 * `api.act` returns `unknown`, and the API says why: each feature has to declare
 * its own output shape first. So these are the shapes this file READS, and each
 * is a subset. Anything a feature adds to a view is not asserted here, which is
 * the trade for not importing the feature to read its types — a test that
 * imported a feature would stop running the moment the feature is removed, and
 * `scripts/removal-test.sh` removes each of them on every run.
 */
interface BountyRow {
  readonly id: string;
  readonly status: string;
  readonly repository: { readonly repoOwner: string; readonly repoName: string };
  readonly issueUrl: string;
  readonly prUrl: string | null;
  readonly claimedAgentId: string | null;
}

interface DurableBountyRow extends BountyRow {
  readonly mergedBy: string | null;
  readonly rewardCents: number;
}

interface ProgressionSheet {
  readonly xp: number;
  readonly level: number;
  readonly build: string;
  readonly exists: boolean;
}

interface ReputationSheet {
  readonly trust: number;
  readonly completed: number;
  readonly failed: number;
  readonly earnedCents: number;
}

interface AchievementSheet {
  readonly badges: readonly { readonly code: string }[];
  readonly count: number;
  readonly exists: boolean;
}

interface AwardView {
  readonly eventType: string;
  readonly xp: number;
  readonly recognised: boolean;
}

interface BattleView {
  readonly id: string;
  readonly status: string;
  readonly bountyId: string | null;
  readonly winnerSessionIds: readonly string[];
  readonly entryGated: boolean;
  readonly entryGatedReason: string;
}

/* ── small readers that keep the assertions about the loop, not about JS ──── */

function isBattleView(value: unknown): value is BattleView {
  return typeof value === 'object' && value !== null && 'id' in value && 'status' in value;
}

/** An error as a string, so an assertion can say what the platform refused. */
function say(value: unknown): string {
  if (value instanceof Error) {
    const code = (value as { readonly code?: unknown }).code;
    return `${value.name}${code === undefined ? '' : ` [${String(code)}]`}: ${value.message}`;
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, (_key, entry: unknown) => entry, 2);
  }
  return String(value);
}

/**
 * The floor the arena gate named, read out of its own refusal.
 *
 * The message is `session X may not enter the arena: trust N is below M`. The
 * test takes M from the platform rather than importing ARENA_MIN_TRUST from the
 * battle feature, which keeps this file importing no feature at all — and makes
 * a retune of the floor an event this test re-reads instead of a constant it
 * quietly disagrees with.
 */
function trustFloorIn(refusal: unknown): number {
  const match = /trust \d+ is below (\d+)/.exec(say(refusal));
  if (match?.[1] === undefined) {
    throw new Error(`the arena did not name a trust floor in its refusal: ${say(refusal)}`);
  }
  return Number(match[1]);
}

/**
 * The value, or the refusal. Never a throw.
 *
 * A stage the loop expects to be closed has to be probed without unwinding the
 * run, because the run continues past it into the stages that matter.
 */
async function attempt(action: string, input: unknown): Promise<unknown> {
  return act(action, input).then(
    (value) => value,
    (error: unknown) => error,
  );
}
