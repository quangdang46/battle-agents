/**
 * The battle feature: two real coding agents, the same challenge, the merge is
 * the result, and the rubric was public before anybody was judged on it.
 *
 * ## What this feature does NOT do, so nobody reads the gap as handled
 *
 * ANTI-CHEAT IS STILL OPEN. Plan section 17.4 puts fairness in scope for M4 and
 * full anti-cheat outside it, and nothing here changes that. What is here is the
 * part of fairness that is a property of THIS feature: the rubric is published
 * and readable while the battle is running, the same weights are applied to
 * every participant, the combination is deterministic and decomposable, a tie is
 * resolved by a stated rule or shared, and a half-judged battle is refused rather
 * than scored. What is NOT here is anything that stops a participant from
 * reading the other one's work, from having an unfair environment, or from
 * winning by means the judge cannot see. `workspace.ts` and `judge-run.ts` are
 * that half and they arrived with ba-battle-workspace-judge-jc9; read
 * `workspace.ts`'s own header for the boundary they actually draw, because it is
 * narrower than "two participants cannot see each other" and the difference
 * matters more than the presence of the file.
 *
 * Stated here rather than in a document because a gap written down in a document
 * is a gap nobody reads at the point they decide to trust a result.
 * ba-risk-gates-e74 carries the docs check that fails if any document claims
 * anti-cheat is solved; nothing in this package claims it is.
 *
 * The workspace-level half of isolation — one participant cannot see or affect
 * the other's workspace — is `workspace.ts`, and what it guarantees is narrower
 * than its name: THE JUDGE READS A WORKSPACE THROUGH A HANDLE THAT CANNOT
 * LEAVE IT, and a command a participant runs is not confined by that. What this
 * feature owns of isolation is the one half it always could: a session that is
 * not a participant cannot have a result scored into the battle, and a battle's
 * view never carries another battle's session.
 *
 * The battle itself is not a second resolution path. A participant submits to a
 * BOUNTY through the bounty feature and the merge is what resolves the battle;
 * this feature judges the work and records who won. There is no bounty lifecycle
 * here and no payout.
 */

import { defineAction } from '@battle-agents/core';
import type { EventHandler, GameFeature, Runtime, RuntimeContext } from '@battle-agents/core';

import {
  ARENA_MIN_TRUST,
  battleCapacity,
  DEFAULT_BATTLE_MODE,
  DEFAULT_BATTLE_WEIGHTS,
  isBattleWeights,
  JUDGE_CRITERIA,
  mayEnterArena,
  nextBattleStatus,
  tiePolicyFor,
  toKnownBattleStatus,
  type BattleParticipantView,
  type BattleView,
  type BattleWeights,
} from './domain.js';
import {
  battleInputRejected,
  CREATE_BATTLE_SHAPE,
  FINISH_BATTLE_SHAPE,
  isBattleRefInput,
  isCreateBattleInput,
  isFinishBattleInput,
  isJoinBattleInput,
  JOIN_BATTLE_SHAPE,
  LIST_BATTLES_SHAPE,
  READ_BATTLE_SHAPE,
  whyBattleRefIsRejected,
  whyCreateBattleIsRejected,
  whyFinishBattleIsRejected,
  whyJoinBattleIsRejected,
  type BattleResultInput,
} from './input.js';
import {
  decideOutcome,
  scoreAgainst,
  type CriterionResult,
  type ScoredParticipant,
  type WeightedScore,
} from './judge.js';
import {
  BATTLE_NOT_FOUND,
  type BattleRepository,
  type BattleWithParticipants,
  type StoredBattle,
  type StoredParticipant,
} from './repository.js';
import {
  chargeFor,
  deriveStats,
  emptyAccumulator,
  observeEdit,
  observeReasoning,
  observeTestFailed,
  observeTestPassed,
  observeToolChoice,
  settle,
  type BattleCharge,
  type BattleStats,
  type BehaviourAccumulator,
} from './stats.js';
import { JUDGE_PERSISTED_EVENT_TYPES } from './judge-run.js';

/* ───────────────────────────── events ───────────────────────────── */

export const BATTLE_CREATED = 'battle.created';
export const BATTLE_JOINED = 'battle.joined';
export const BATTLE_JOIN_REFUSED = 'battle.join_refused';
export const BATTLE_PAUSED = 'battle.paused';
export const BATTLE_RESUMED = 'battle.resumed';
export const BATTLE_FINISHED = 'battle.finished';
export const BATTLE_ABANDONED = 'battle.abandoned';
export const BATTLE_EXPIRED = 'battle.expired';

/* ───────────────────────────── actions ───────────────────────────── */

export const BATTLE_CREATE = 'battle.create';
export const BATTLE_JOIN = 'battle.join';
export const BATTLE_FINISH = 'battle.finish';
/**
 * The published rubric, readable while the battle is still running.
 *
 * Section 17.4's fairness property is a VISIBILITY property, so it needs an
 * action to be visible through. `battle.read` and `battle.list` carry the weights
 * too, because a view that could withhold them would be a second and worse
 * answer to this same question.
 */
export const BATTLE_WEIGHTS_READ = 'battle.weights';
export const BATTLE_READ = 'battle.read';
export const BATTLE_LIST = 'battle.list';
export const BATTLE_SWEEP = 'battle.sweep';

/**
 * The capability this feature declares a dependency on, and degrades without.
 *
 * Named as a string rather than imported, which is the whole point: a feature may
 * not import the feature that provides it, and the registry resolves the name
 * against what is installed. `battle.weights` below asks for nothing, and the
 * arena gate asks for exactly this.
 */
export const REPUTATION_READ = 'reputation.read';

export interface BattleDependencies {
  readonly repository: BattleRepository;
  /**
   * How long a disconnected participant has to come back, in milliseconds.
   *
   * REQUIRED, and there is deliberately no default here. The agent feature
   * already has this number — `DEFAULT_RESUME_GRACE_MS`, fifteen minutes — and a
   * second copy inside this package would be two answers to "how long is a
   * disconnect forgiven for", free to drift, with nothing able to say which is
   * right. A feature may not import another feature and core is frozen, so the
   * composition root is the only layer allowed to see both, and it passes them
   * in. Neither constant is exported from `@battle-agents/agent`'s barrel today;
   * that is a one-line addition to that feature's index and therefore not this
   * bead's file to edit.
   */
  readonly graceMs: number;
  /**
   * How long a battle may run before the sweep ends it, in milliseconds.
   *
   * The other half of §3.2, and the only reason `expired` is reachable at all: a
   * state a battle can never reach is a state nothing tests, and a battle that
   * never terminates is worse than no battle. Plan section 10.3 puts a match at
   * five to fifteen minutes, so a host passes the top of that band and the sweep
   * expires anything older.
   *
   * `DEFAULT_HEARTBEAT_TIMEOUT_MS` is deliberately NOT re-declared here. It
   * belongs to the agent feature's sweeper, and this feature reacts to the
   * `session.ended` that sweeper produces; taking the number as well would mean
   * running a second sweeper over somebody else's column, which is duplicating
   * the mechanism rather than reusing the constant.
   */
  readonly matchMs: number;
}

/**
 * What this feature has to remember between events.
 *
 * Two things, and neither can be read from a row.
 *
 * `agentsBySession` is which agent each session belongs to, learned from the
 * platform's own persisted `session.started` and never asked for. It is the ONLY
 * place an agent id enters this package, and it feeds two things: the arena gate
 * and the reward payload. Nothing about who is FIGHTING is derived from it —
 * which is the point, because `battle_participants` is keyed on session_id and
 * db/src/verify.ts fails the build if an `agent_id` column is ever added there.
 * An agent that fights two battles in two sessions therefore has two entries here
 * and one entry in each battle, and neither battle can see the other's session.
 *
 * `behaviour` is the live counter fold, keyed battle → session. It cannot be a
 * row: it is incremented by events the platform does not persist (file writes,
 * reasoning steps, tool choices), so re-deriving it from storage would need those
 * events to be durable, and the persistence policy is not this feature's to
 * change. contracts.ts is explicit that a feature keeps its own state through
 * `StateStore` under its own id, which is what this is.
 */
interface BattleState {
  readonly agentsBySession: Readonly<Record<string, string>>;
  readonly behaviour: Readonly<Record<string, Readonly<Record<string, BehaviourAccumulator>>>>;
}

const EMPTY_STATE: BattleState = { agentsBySession: {}, behaviour: {} };

/** Everything a view needs, resolved once so the reads stay a single pass. */
interface ViewInput {
  readonly battle: StoredBattle;
  readonly participants: readonly StoredParticipant[];
  readonly state: BattleState;
  readonly gateIsOn: boolean;
}

export function battleFeature(dependencies: BattleDependencies): GameFeature {
  const { repository, graceMs, matchMs } = dependencies;

  /**
   * Whether the arena gate is in force, read from the runtime's own recomputed
   * degradation map on every call rather than captured once.
   *
   * `degraded()` is recomputed after every install and uninstall precisely so a
   * capability can disappear while the process is running. A boolean captured at
   * construction would be right until reputation was removed and wrong forever
   * after, which is the exact failure the removal test exists to catch.
   */
  const gateIsOn = (runtime: Runtime): boolean =>
    !(runtime.degraded().get('battle') ?? []).includes(REPUTATION_READ);

  return {
    id: 'battle',
    // `battle.finished` is claimed HERE and was free to claim. Reputation held a
    // declaration for an event it does not emit and deleted it, because
    // FeatureRegistry.register throws on a duplicate persisted type and holding
    // the name would have made this feature fail to INSTALL on the day it
    // declared the event it actually emits. One owner per type, and the owner is
    // the emitter.
    persistedEvents: [
      BATTLE_CREATED,
      BATTLE_JOINED,
      BATTLE_JOIN_REFUSED,
      BATTLE_PAUSED,
      BATTLE_RESUMED,
      BATTLE_FINISHED,
      BATTLE_ABANDONED,
      BATTLE_EXPIRED,
      // The judge RUN's stream, and the reason a replay can show its work.
      //
      // Declared here, by the feature that owns the types, because the
      // alternative is a judge that emits a perfectly good event stream which a
      // restart erases — and it looks identical until then. `judge-run.ts` names
      // the list next to the emitters; this is where it becomes durable, and
      // `tests/integration/battle-judge-persistence.test.ts` breaks the
      // declaration to watch the replay go empty.
      ...JUDGE_PERSISTED_EVENT_TYPES,
    ],
    // Declared, and declared for real. `reputation.read` EXISTS as of today, so
    // this is no longer a claim about a hypothetical provider: install the two
    // and the registry reports no degradation, uninstall reputation and it
    // reports this feature missing exactly one thing. Without the gate the arena
    // opens to everyone, and the view says which of the two happened.
    requires: [REPUTATION_READ],
    capabilities: [
      { name: BATTLE_CREATE, description: 'Open a battle on a challenge two sessions can fight.' },
      { name: BATTLE_JOIN, description: 'Enter an open battle with a session.' },
      { name: BATTLE_FINISH, description: 'Judge a finished battle against its published rubric.' },
      {
        name: BATTLE_WEIGHTS_READ,
        description: "Read a battle's published rubric before it is judged.",
      },
      {
        name: BATTLE_READ,
        description: 'Read one battle, including who is in it and how it stands.',
      },
      { name: BATTLE_LIST, description: 'Browse the battles that can be joined.' },
    ],
    eventHandlers: [
      onSessionStarted(),
      onSessionEnded(repository, graceMs),
      onSessionResumed(repository),
      onTestPassed(repository),
      onTestFailed(repository),
      onFileWritten(repository),
      onThinking(repository),
      onToolCompleted(repository),
    ],
    actionDefs: [
      defineAction({
        id: BATTLE_CREATE,
        permissions: [BATTLE_CREATE],
        run: (input: unknown, context) =>
          create(repository, gateIsOn(context.runtime), input, context),
      }),
      defineAction({
        id: BATTLE_JOIN,
        permissions: [BATTLE_JOIN],
        run: (input: unknown, context) =>
          join(repository, gateIsOn(context.runtime), input, context),
      }),
      defineAction({
        id: BATTLE_FINISH,
        permissions: [BATTLE_FINISH],
        run: (input: unknown, context) => finish(repository, input, context),
      }),
      defineAction({
        id: BATTLE_WEIGHTS_READ,
        // The permission is the read. Nothing here asks who is asking, because a
        // rubric that needs an identity to be read is not public — and section
        // 17.4 puts publication BEFORE the verdict, not after it.
        permissions: [BATTLE_WEIGHTS_READ],
        run: (input: unknown) => readWeights(repository, input),
      }),
      defineAction({
        id: BATTLE_READ,
        permissions: [BATTLE_READ],
        run: (input: unknown, context) =>
          readBattle(repository, gateIsOn(context.runtime), input, context),
      }),
      defineAction({
        id: BATTLE_LIST,
        permissions: [BATTLE_LIST],
        run: (input: unknown, context) =>
          listBattles(repository, gateIsOn(context.runtime), input, context),
      }),
      defineAction({
        id: BATTLE_SWEEP,
        permissions: [BATTLE_SWEEP],
        run: (_input: unknown, context) => sweep(repository, matchMs, context),
      }),
    ],
  };
}

/* ───────────────────────────── create ───────────────────────────── */

async function create(
  repository: BattleRepository,
  gateOn: boolean,
  input: unknown,
  context: RuntimeContext,
): Promise<BattleView> {
  if (!isCreateBattleInput(input)) {
    throw battleInputRejected(
      BATTLE_CREATE,
      whyCreateBattleIsRejected(input) ?? { reason: 'not-an-object' },
      CREATE_BATTLE_SHAPE,
    );
  }
  const now = context.now();
  const mode = input.mode?.trim() || DEFAULT_BATTLE_MODE;
  const created = await repository.create({
    mode,
    bountyId: input.bountyId ?? null,
    // The rubric is frozen onto the battle at creation, and validated here rather
    // than at judging time: a rubric that turns out to be unusable after the work
    // is done is a rubric that was hidden until it was too late to argue with.
    weightsJson: input.weights ?? DEFAULT_BATTLE_WEIGHTS,
    creatorSessionId: input.sessionId,
    now,
  });
  const participants = await repository.participants(created.id);
  const state = await readState(context);

  await context.runtime.emit(
    event(context, BATTLE_CREATED, {
      battleId: created.id,
      mode,
      bountyId: created.bountyId,
      // Carried on the event as well as the row: this event is what somebody
      // watching the bus learns from, and an event that announced a battle
      // without its rubric would make the public claim true only for a caller who
      // came back and asked again.
      weights: weightsOf(created.weightsJson),
      participants: participants.map((participant) => participant.sessionId),
    }),
  );
  return viewOf({ battle: created, participants, state, gateIsOn: gateOn });
}

/* ───────────────────────────── join ───────────────────────────── */

async function join(
  repository: BattleRepository,
  gateOn: boolean,
  input: unknown,
  context: RuntimeContext,
): Promise<BattleView> {
  if (!isJoinBattleInput(input)) {
    throw battleInputRejected(
      BATTLE_JOIN,
      whyJoinBattleIsRejected(input) ?? { reason: 'not-an-object' },
      JOIN_BATTLE_SHAPE,
    );
  }
  const gate = await arenaGate(gateOn, input.sessionId, context);
  if (gate !== null) {
    throw gate;
  }

  // The capacity is read from the row rather than taken from the caller or
  // assumed. A caller who passed it could widen their own battle, so the number
  // that decides who gets a place has to come from the row being constrained.
  const existing = await repository.findById(input.battleId);
  if (existing === undefined) {
    throw Object.assign(new Error(`no battle ${input.battleId}`), { code: BATTLE_NOT_FOUND });
  }
  const result = await repository.join(
    input.battleId,
    input.sessionId,
    battleCapacity(existing.mode),
    context.now(),
  );
  if (!result.joined) {
    await context.runtime.emit(
      event(context, BATTLE_JOIN_REFUSED, {
        battleId: input.battleId,
        sessionId: input.sessionId,
        why: result.why,
      }),
    );
    throw Object.assign(new Error(`cannot join battle ${input.battleId}: ${result.why}`), {
      code: 'battle-join-refused',
    });
  }

  await context.runtime.emit(
    event(context, BATTLE_JOINED, {
      battleId: result.battle.id,
      sessionId: input.sessionId,
      participants: result.participants.map((participant) => participant.sessionId),
    }),
  );
  const state = await readState(context);
  return viewOf({
    battle: result.battle,
    participants: result.participants,
    state,
    gateIsOn: gateOn,
  });
}

/**
 * The arena gate, or null when the session may fight.
 *
 * This is the declared capability dependency doing its job rather than being
 * asserted about. With reputation installed the gate asks it, over the
 * capability the runtime already resolved; with it uninstalled the gate is OFF
 * and every session may enter.
 *
 * Open rather than closed on purpose, and the asymmetry is the design. The
 * capability is a fairness refinement on who may fight; a feature that refused to
 * fight because an optional refinement was missing would be a game with no arena
 * whenever the reputation package was removed, and the bead that declared the
 * dependency says the degraded mode is "open battles" in those words.
 *
 * A session whose agent has not been observed starting is let through, for the
 * same reason a missing reputation is: the gate is asking a question about an
 * agent and this package holds sessions, so a session that has told us nothing
 * about its agent cannot be refused on an agent's behalf.
 */
async function arenaGate(
  gateOn: boolean,
  sessionId: string,
  context: RuntimeContext,
): Promise<Error | null> {
  if (!gateOn) {
    return null;
  }
  const state = await readState(context);
  const agentId = state.agentsBySession[sessionId];
  if (agentId === undefined) {
    return null;
  }
  let trust: number;
  try {
    const view = await context.runtime.runAction<{ readonly agentId: string }, { trust: number }>(
      REPUTATION_READ,
      { agentId },
    );
    trust = view.trust;
  } catch (error) {
    // Present a moment ago and not answering now. Degrade rather than throw: a
    // runtime that installed reputation and then lost it mid-battle should stop
    // gating, which is the same answer as never having had it.
    context.log?.warn(
      `[battle] the arena gate could not read trust and is open: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
  if (mayEnterArena(trust)) {
    return null;
  }
  return Object.assign(
    new Error(
      `session ${sessionId} may not enter the arena: trust ${trust} is below ${ARENA_MIN_TRUST}`,
    ),
    { code: 'arena-gated' },
  );
}

/* ───────────────────────────── finish ───────────────────────────── */

async function finish(
  repository: BattleRepository,
  input: unknown,
  context: RuntimeContext,
): Promise<BattleView> {
  if (!isFinishBattleInput(input)) {
    throw battleInputRejected(
      BATTLE_FINISH,
      whyFinishBattleIsRejected(input) ?? { reason: 'not-an-object' },
      FINISH_BATTLE_SHAPE,
    );
  }
  const battle = await repository.findById(input.battleId);
  if (battle === undefined) {
    throw Object.assign(new Error(`no battle ${input.battleId}`), { code: BATTLE_NOT_FOUND });
  }
  const status = toKnownBattleStatus(battle.status);
  if (status === undefined) {
    throw Object.assign(
      new Error(`battle ${battle.id} is in state "${battle.status}", which this build cannot read`),
      { code: 'unreadable-battle-state' },
    );
  }
  const to = nextBattleStatus(status, 'finish');
  if (to === undefined) {
    throw Object.assign(
      new Error(`battle ${battle.id} cannot be finished from state "${status}"`),
      { code: 'battle-finish-refused' },
    );
  }

  const participants = await repository.participants(battle.id);
  const weights = weightsOf(battle.weightsJson);
  const state = await readState(context);

  // A reported session that is not in this battle is refused rather than added.
  // Scoring a session that never entered would put a name on a result for a
  // workspace nobody isolated for this match, which is exactly the leak the
  // isolation requirement exists to prevent.
  for (const result of input.results) {
    if (!participants.some((participant) => participant.sessionId === result.sessionId)) {
      throw Object.assign(new Error(`session ${result.sessionId} is not in battle ${battle.id}`), {
        code: 'session-not-a-participant',
      });
    }
  }

  const scored = input.results.map((result) => ({
    result,
    score: scoreAgainst(criteriaOf(result), weights),
  }));

  const outcome = decideOutcome(
    scored.map((entry): ScoredParticipant => ({
      sessionId: entry.result.sessionId,
      score: entry.score.total,
      submittedAt: entry.result.submittedAt,
    })),
    tiePolicyFor(battle.mode),
  );
  const winners = new Set(outcome.kind === 'won' ? outcome.winnerSessionIds : []);

  const now = context.now();
  const finished = await repository.finish({
    battleId: battle.id,
    from: status,
    to,
    results: scored.map((entry) => ({
      sessionId: entry.result.sessionId,
      submittedAt: entry.result.submittedAt,
      won: winners.has(entry.result.sessionId),
      scoreJson: entry.score,
    })),
    now,
  });
  if (finished === undefined) {
    // Somebody judged it between the read above and this write. Not an error to
    // retry blindly: a second finish on the same battle is not a second result.
    throw Object.assign(new Error(`battle ${battle.id} was finished by somebody else`), {
      code: 'battle-finish-lost',
    });
  }

  const after = await repository.participants(battle.id);
  // One reward event per WINNER, each carrying that winner's own agent, so
  // progression can pay a win without this feature resolving an agent for a
  // session it did not watch start. A shared win emits two; a battle nobody won
  // emits none, because an outcome that awards nothing is not an award event.
  for (const winner of [...winners].sort()) {
    const agentId = state.agentsBySession[winner];
    if (agentId === undefined) {
      context.log?.warn(
        `[battle] battle ${battle.id} was won by session ${winner}, whose agent this feature ` +
          'never saw start, so no reward event was emitted and progression paid nothing',
      );
      continue;
    }
    await context.runtime.emit(
      event(context, BATTLE_FINISHED, {
        battleId: battle.id,
        sessionId: winner,
        agentId,
        won: true,
        reason: outcome.kind === 'won' ? outcome.reason : 'shared',
        mode: battle.mode,
        weights,
      }),
    );
  }
  // And one battle-level record of how the whole thing ended, for the replay and
  // for a dispute. It carries no agent, so it is not an award and cannot be
  // mistaken for one.
  //
  // The per-participant scores travel WITH it, and the reason is that this row
  // is the log's only record of the arithmetic. `battle_participants.score_json`
  // holds it too, but a trail assembled from a table cannot answer "what
  // happened next" and a dispute rests on the log, so a judgment the log cannot
  // reconstruct is a judgment that only the current state of one row supports.
  // With them, the replay is a pure function of the event stream: read the
  // timeline, read this row, and the scoreboard is the whole of it.
  //
  // Sorted by session id, because a payload whose array order follows the order
  // a query happened to return is a payload that reads differently on the next
  // request, and the replay built from it would not be deterministic.
  await context.runtime.emit(
    event(context, BATTLE_FINISHED, {
      battleId: battle.id,
      mode: battle.mode,
      weights,
      outcome: outcome.kind === 'won' ? 'won' : 'no-winner',
      reason: outcome.kind === 'won' ? outcome.reason : outcome.reason,
      winnerSessionIds: [...winners].sort(),
      participants: after.map((participant) => participant.sessionId),
      scores: [...scored]
        .map((entry) => ({
          sessionId: entry.result.sessionId,
          total: entry.score.total,
          criteria: entry.score.contributions.map((contribution) => ({ ...contribution })),
        }))
        .sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
    }),
  );

  return viewOf({ battle: finished, participants: after, state, gateIsOn: true });
}

function criteriaOf(result: BattleResultInput): CriterionResult[] {
  return result.criteria.map((entry) => ({ criterion: entry.criterion, score: entry.score }));
}

/* ───────────────────────────── public reads ───────────────────────────── */

/**
 * The published rubric, and the battle it belongs to.
 *
 * The function a fairness property is actually tested through. It takes a
 * battleId, it reads a row that may still be `running`, and it returns the
 * weights that row carries — so a judge that stored a rubric and never surfaced
 * one cannot pass it, and neither can one that answers with the defaults whatever
 * the battle actually holds.
 */
async function readWeights(
  repository: BattleRepository,
  input: unknown,
): Promise<{
  readonly battleId: string;
  readonly status: string;
  readonly weights: BattleWeights;
  readonly criteria: readonly (typeof JUDGE_CRITERIA)[number][];
  readonly published: true;
}> {
  if (!isBattleRefInput(input)) {
    throw battleInputRejected(
      BATTLE_WEIGHTS_READ,
      whyBattleRefIsRejected(input) ?? { reason: 'not-an-object' },
      READ_BATTLE_SHAPE,
    );
  }
  const battle = await repository.findById(input.battleId);
  if (battle === undefined) {
    throw Object.assign(new Error(`no battle ${input.battleId}`), { code: BATTLE_NOT_FOUND });
  }
  return {
    battleId: battle.id,
    // The state the battle is in travels with the rubric on purpose: a rubric
    // published for a battle that has not been judged is the claim, and a caller
    // that cannot see which of the two it is looking at has been told a number
    // with no moment attached to it.
    status: battle.status,
    weights: weightsOf(battle.weightsJson),
    criteria: JUDGE_CRITERIA,
    published: true,
  };
}

/** One battle, for anybody: the weights, the sessions in it, and how it stands. */
async function readBattle(
  repository: BattleRepository,
  gateOn: boolean,
  input: unknown,
  context: RuntimeContext,
): Promise<BattleView> {
  if (!isBattleRefInput(input)) {
    throw battleInputRejected(
      BATTLE_READ,
      whyBattleRefIsRejected(input) ?? { reason: 'not-an-object' },
      READ_BATTLE_SHAPE,
    );
  }
  const battle = await repository.findById(input.battleId);
  if (battle === undefined) {
    throw Object.assign(new Error(`no battle ${input.battleId}`), { code: BATTLE_NOT_FOUND });
  }
  const participants = await repository.participants(battle.id);
  const state = await readState(context);
  return viewOf({ battle, participants, state, gateIsOn: gateOn });
}

/**
 * The battles that can be joined, each as a full view.
 *
 * A browse rather than a bare id list, and the weights travel with every entry.
 * That is not generosity: a caller deciding whether to enter a battle is deciding
 * whether to be judged by it, and the only moment at which that question is
 * answerable is before the match.
 */
async function listBattles(
  repository: BattleRepository,
  gateOn: boolean,
  input: unknown,
  context: RuntimeContext,
): Promise<readonly BattleView[]> {
  // An empty object is the only accepted payload. Guarded rather than ignored
  // because `act()` hands a generic through unchecked, and an action that
  // tolerates anything is an action whose contract nobody wrote down.
  if (!isEmptyListInput(input)) {
    throw battleInputRejected(BATTLE_LIST, { reason: 'not-an-object' }, LIST_BATTLES_SHAPE);
  }
  const battles = await repository.list({ status: 'running' });
  const state = await readState(context);
  return Promise.all(
    battles.map((battle) =>
      repository
        .participants(battle.id)
        .then((participants) => viewOf({ battle, participants, state, gateIsOn: gateOn })),
    ),
  );
}

function isEmptyListInput(input: unknown): boolean {
  return typeof input === 'object' && input !== null && Object.keys(input).length === 0;
}

/* ───────────────────────────── sweep ───────────────────────────── */

/**
 * Closes the battles whose grace period has run out.
 *
 * An explicit action because the runtime has no clock and core is frozen. Nothing
 * schedules work, and a feature that quietly evaluated elapsed time on the next
 * read would be a read that writes — the defect packages/api already had to be
 * taught about in `inspect`, where two inspect calls moved a counter. A host calls
 * this on a timer; a test calls it against a clock it controls.
 */
async function sweep(
  repository: BattleRepository,
  matchMs: number,
  context: RuntimeContext,
): Promise<{ readonly abandoned: readonly string[]; readonly expired: readonly string[] }> {
  const now = context.now();
  const abandoned: string[] = [];
  const expired: string[] = [];

  for (const battle of await repository.pausedBefore(now)) {
    const status = toKnownBattleStatus(battle.status);
    if (status === undefined) {
      continue;
    }
    const to = nextBattleStatus(status, 'abandon');
    if (to === undefined) {
      continue;
    }
    if ((await repository.move(battle.id, status, to, now)) === undefined) {
      continue;
    }
    abandoned.push(battle.id);
    await context.runtime.emit(
      event(context, BATTLE_ABANDONED, {
        battleId: battle.id,
        reason: 'resume-grace-expired',
        pausedAt: battle.pausedAt,
        resumeDeadline: battle.resumeDeadline,
      }),
    );
  }

  for (const battle of await repository.list({ status: 'running' })) {
    if (Date.parse(now) - Date.parse(battle.startedAt) < matchMs) {
      continue;
    }
    const status = toKnownBattleStatus(battle.status);
    if (status === undefined) {
      continue;
    }
    const to = nextBattleStatus(status, 'expire');
    if (to === undefined) {
      continue;
    }
    if ((await repository.move(battle.id, status, to, now)) === undefined) {
      continue;
    }
    expired.push(battle.id);
    await context.runtime.emit(
      event(context, BATTLE_EXPIRED, {
        battleId: battle.id,
        reason: 'match-duration-elapsed',
        startedAt: battle.startedAt,
        matchMs,
      }),
    );
  }
  return { abandoned, expired };
}

/* ───────────────────────────── handlers ───────────────────────────── */

/**
 * Which agent a session belongs to, learned from the platform's own event.
 *
 * `session.started` carries the agent and is persisted by the platform, so this
 * needs no import of the agent feature and no table of its own: the answer
 * arrives as a fact. It is the only place an agent id enters this package.
 */
function onSessionStarted(): EventHandler {
  return {
    on: 'session.started',
    async handle(gameEvent, context) {
      const sessionId = sessionIdOf(gameEvent.payload);
      const agentId = agentIdOf(gameEvent.payload);
      if (sessionId === undefined || agentId === undefined) {
        return;
      }
      const state = await readState(context);
      await writeState(context, {
        ...state,
        agentsBySession: { ...state.agentsBySession, [sessionId]: agentId },
      });
    },
  };
}

/**
 * A participant's session ended: pause the battle and start the grace clock.
 *
 * §3.2's rule — resume if the session returns in time, otherwise abandoned — is
 * this pause, the resume handler, and the sweep. None of the three is inside the
 * others, which is what makes the sweep a visible action rather than a hidden
 * one, and what lets a test move the clock and watch exactly one of them act.
 */
function onSessionEnded(repository: BattleRepository, graceMs: number): EventHandler {
  return {
    on: 'session.ended',
    async handle(gameEvent, context) {
      const sessionId = sessionIdOf(gameEvent.payload);
      if (sessionId === undefined) {
        return;
      }
      const mine = await repository.battlesForSession(sessionId);
      const now = context.now();
      for (const { battle } of mine) {
        const status = toKnownBattleStatus(battle.status);
        if (status === undefined) {
          continue;
        }
        const to = nextBattleStatus(status, 'pause');
        if (to === undefined) {
          continue;
        }
        const deadline = new Date(Date.parse(now) + graceMs).toISOString();
        const paused = await repository.pause(battle.id, deadline, now);
        if (paused === undefined) {
          continue;
        }
        await context.runtime.emit(
          event(context, BATTLE_PAUSED, {
            battleId: battle.id,
            sessionId,
            resumeDeadline: deadline,
          }),
        );
      }
    },
  };
}

/** A session came back inside the window: the battle is live again. */
function onSessionResumed(repository: BattleRepository): EventHandler {
  return {
    on: 'session.resumed',
    async handle(gameEvent, context) {
      const sessionId = sessionIdOf(gameEvent.payload);
      if (sessionId === undefined) {
        return;
      }
      const mine = await repository.battlesForSession(sessionId);
      for (const { battle } of mine) {
        const status = toKnownBattleStatus(battle.status);
        if (status === undefined) {
          continue;
        }
        const to = nextBattleStatus(status, 'resume');
        if (to === undefined) {
          continue;
        }
        const moved = await repository.move(battle.id, status, to, context.now());
        if (moved === undefined) {
          continue;
        }
        await context.runtime.emit(
          event(context, BATTLE_RESUMED, { battleId: battle.id, sessionId }),
        );
      }
    },
  };
}

/**
 * Behaviour events, folded into the live battle of THAT session.
 *
 * Five handlers over one shared routine rather than five copies. Each reads a
 * counter and nothing else: no handler in this file reads a field of a payload
 * except the two session/agent facts above, which is the mechanical half of
 * section 2.2's ban on token-count-as-damage. A payload field named for a cost is
 * simply not in reach of the arithmetic.
 */
function onTestPassed(repository: BattleRepository): EventHandler {
  return behaviourHandler(repository, 'test.passed', observeTestPassed);
}

function onTestFailed(repository: BattleRepository): EventHandler {
  return behaviourHandler(repository, 'test.failed', observeTestFailed);
}

function onFileWritten(repository: BattleRepository): EventHandler {
  return behaviourHandler(repository, 'file.write', observeEdit);
}

function onThinking(repository: BattleRepository): EventHandler {
  return behaviourHandler(repository, 'thinking', observeReasoning);
}

function onToolCompleted(repository: BattleRepository): EventHandler {
  return behaviourHandler(repository, 'tool.completed', observeToolChoice);
}

function behaviourHandler(
  repository: BattleRepository,
  on: string,
  apply: (accumulator: BehaviourAccumulator) => BehaviourAccumulator,
): EventHandler {
  return {
    on,
    async handle(gameEvent, context) {
      const sessionId = sessionIdOf(gameEvent.payload);
      if (sessionId === undefined) {
        return;
      }
      const live = await repository.battlesForSession(sessionId);
      if (live.length === 0) {
        return;
      }
      const state = await readState(context);
      let behaviour = state.behaviour;
      for (const { battle } of live) {
        const inBattle = behaviour[battle.id] ?? {};
        const current = inBattle[sessionId] ?? emptyAccumulator();
        behaviour = { ...behaviour, [battle.id]: { ...inBattle, [sessionId]: apply(current) } };
      }
      await writeState(context, { ...state, behaviour });
    },
  };
}

/* ───────────────────────────── views ───────────────────────────── */

function viewOf(input: ViewInput): BattleView {
  return {
    id: input.battle.id,
    mode: input.battle.mode,
    status: toKnownBattleStatus(input.battle.status) ?? 'running',
    weights: weightsOf(input.battle.weightsJson),
    bountyId: input.battle.bountyId,
    startedAt: input.battle.startedAt,
    finishedAt: input.battle.finishedAt,
    pausedAt: input.battle.pausedAt,
    resumeDeadline: input.battle.resumeDeadline,
    participants: input.participants.map((participant) =>
      participantView(participant, input.state),
    ),
    winnerSessionIds: input.participants
      .filter((participant) => participant.won)
      .map((participant) => participant.sessionId)
      .sort(),
    entryGated: input.gateIsOn,
    entryGatedReason: input.gateIsOn ? 'gated-on-trust' : 'open-no-reputation',
  };
}

function participantView(
  participant: StoredParticipant,
  state: BattleState,
): BattleParticipantView {
  const accumulator = state.behaviour[participant.battleId]?.[participant.sessionId];
  const settled = accumulator === undefined ? undefined : settle(accumulator);
  return {
    sessionId: participant.sessionId,
    agentId: state.agentsBySession[participant.sessionId] ?? null,
    joinedAt: participant.joinedAt,
    submittedAt: participant.submittedAt,
    score: totalOf(participant.scoreJson),
    won: participant.won,
    // Null for a session that has done nothing this battle, rather than six
    // zeros. "Has not fought" and "fought and achieved nothing" are different
    // readings of the same numbers and the arena should be able to tell them.
    stats: settled === undefined ? null : deriveStats(settled),
    charge: settled === undefined ? null : chargeFor(settled),
  };
}

function totalOf(scoreJson: unknown): number | null {
  if (typeof scoreJson !== 'object' || scoreJson === null) {
    return null;
  }
  const total = (scoreJson as { total?: unknown }).total;
  return typeof total === 'number' && Number.isFinite(total) ? total : null;
}

/**
 * The weights a row carries, or the published defaults.
 *
 * Falling back rather than refusing, because the failure is asymmetric. A row
 * whose weights column is empty is a battle nobody published a rubric for, and
 * refusing to read it would leave the one battle whose rubric is genuinely absent
 * as the one battle a spectator cannot ask about. The defaults are the plan's, so
 * a caller still gets a real rubric rather than an error page, and the state
 * beside it says what they are looking at.
 */
function weightsOf(stored: unknown): BattleWeights {
  return isBattleWeights(stored) ? stored : DEFAULT_BATTLE_WEIGHTS;
}

function sessionIdOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const candidate = (payload as { sessionId?: unknown }).sessionId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function agentIdOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const candidate = (payload as { agentId?: unknown }).agentId;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

/* ───────────────────────────── per-feature state ───────────────────────────── */

async function readState(context: RuntimeContext): Promise<BattleState> {
  return context.store.load<BattleState>('battle') ?? EMPTY_STATE;
}

async function writeState(context: RuntimeContext, state: BattleState): Promise<void> {
  await context.store.save('battle', state);
}

function event(context: RuntimeContext, type: string, payload: unknown) {
  return { type, occurredAt: context.now(), actorId: 'battle', payload };
}

/** The types a caller or a sibling bead needs to read what this feature produced. */
export type { BattleCharge, BattleStats, BattleWithParticipants, WeightedScore };
export { isTerminalBattle, toKnownBattleStatus } from './domain.js';
