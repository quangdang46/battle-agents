import { createRuntime, InMemoryStateStore, createInMemoryEventBus } from '@battle-agents/core';
import type { EventBus, GameEvent, GameFeature, StateStore } from '@battle-agents/core';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ARENA_MIN_TRUST,
  DEFAULT_BATTLE_WEIGHTS,
  JUDGE_CRITERIA,
  type BattleStatus,
  type BattleView,
  type JudgeCriterion,
} from './domain.js';
import { battleFeature, BATTLE_WEIGHTS_READ } from './feature.js';
import { DEFAULT_BATTLE_MODE, DEFAULT_BATTLE_WEIGHTS as RUBRIC } from './domain.js';
import type {
  BattleRepository,
  BattleWithParticipants,
  JoinResult,
  StoredBattle,
  StoredParticipant,
} from './repository.js';

/**
 * The feature, driven through a real runtime.
 *
 * Everything here goes through `runtime.runAction` and `runtime.emit`, which is
 * the path the Application API takes. `packages/api` is classified as an interface
 * layer and a feature may not import one, so a test in this package cannot build
 * an API and go through it — and that is the right constraint anyway, because
 * `api.act()` does three things before it reaches a feature: it checks the id
 * against the generated union, it checks the id against the installed registry,
 * and it refuses a non-object payload. The first is this bead's main loop's to
 * wire, the second and third are `runAction`'s callers' and are not the property
 * under test. `runAction` is the single implementation all three of them
 * delegate to.
 */

/* ───────────────────────────── the fixture store ───────────────────────────── */

/**
 * An in-memory store, holding exactly one invariant the real one holds.
 *
 * `battlesForSession` walks PARTICIPANT ROWS. That is the Battle#918 method, and
 * a fake that kept a `Map<sessionId, battleId>` could not represent one session
 * in two battles — which is the whole case the tests below are about, so the
 * fake would have been quietly unable to fail them.
 */
class MemoryBattles implements BattleRepository {
  readonly battles = new Map<string, StoredBattle>();
  /** Named `rows` rather than `participants` because the port has a `participants()` METHOD,
   *  and a field of the same name shadows it — the fake would have satisfied the
   *  interface and thrown on the first call. */
  readonly rows = new Map<string, StoredParticipant[]>();
  #nextId = 1;

  async create(input: {
    mode: string;
    bountyId: string | null;
    weightsJson: unknown;
    creatorSessionId: string;
    now: string;
  }): Promise<StoredBattle> {
    const battle: StoredBattle = {
      id: `battle-${this.#nextId++}`,
      mode: input.mode,
      bountyId: input.bountyId,
      weightsJson: input.weightsJson,
      status: 'running',
      startedAt: input.now,
      finishedAt: null,
      pausedAt: null,
      resumeDeadline: null,
    };
    this.battles.set(battle.id, battle);
    this.rows.set(battle.id, [
      {
        battleId: battle.id,
        sessionId: input.creatorSessionId,
        joinedAt: input.now,
        submittedAt: null,
        won: false,
        scoreJson: null,
      },
    ]);
    return battle;
  }

  async findById(battleId: string): Promise<StoredBattle | undefined> {
    return this.battles.get(battleId);
  }

  async list(filter: { status?: string }): Promise<readonly StoredBattle[]> {
    return [...this.battles.values()]
      .filter((battle) => filter.status === undefined || battle.status === filter.status)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async participants(battleId: string): Promise<readonly StoredParticipant[]> {
    return this.rows.get(battleId) ?? [];
  }

  async battlesForSession(sessionId: string): Promise<readonly BattleWithParticipants[]> {
    const found: BattleWithParticipants[] = [];
    for (const [battleId, rows] of this.rows) {
      if (!rows.some((row) => row.sessionId === sessionId)) continue;
      const battle = this.battles.get(battleId);
      if (battle !== undefined) found.push({ battle, participants: rows });
    }
    return found.sort((left, right) => left.battle.id.localeCompare(right.battle.id));
  }

  async join(
    battleId: string,
    sessionId: string,
    capacity: number,
    now: string,
  ): Promise<JoinResult> {
    const battle = this.battles.get(battleId);
    if (battle === undefined) return { joined: false, why: 'not-found' };
    if (battle.status !== 'running') return { joined: false, why: 'not-running', battle };
    const rows = this.rows.get(battleId) ?? [];
    if (rows.some((row) => row.sessionId === sessionId)) {
      return { joined: false, why: 'already-in-it', battle };
    }
    if (rows.length >= capacity) return { joined: false, why: 'full', battle };
    const added: StoredParticipant = {
      battleId,
      sessionId,
      joinedAt: now,
      submittedAt: null,
      won: false,
      scoreJson: null,
    };
    const next = [...rows, added];
    this.rows.set(battleId, next);
    return { joined: true, battle, participants: next };
  }

  async move(
    battleId: string,
    from: BattleStatus,
    to: BattleStatus,
    now: string,
  ): Promise<StoredBattle | undefined> {
    const battle = this.battles.get(battleId);
    if (battle === undefined || battle.status !== from) return undefined;
    const moved: StoredBattle = {
      ...battle,
      status: to,
      finishedAt: to === 'completed' || to === 'expired' ? now : battle.finishedAt,
      ...(to === 'running' ? { pausedAt: null, resumeDeadline: null } : {}),
    };
    this.battles.set(battleId, moved);
    return moved;
  }

  async pause(
    battleId: string,
    resumeDeadline: string,
    now: string,
  ): Promise<StoredBattle | undefined> {
    const battle = this.battles.get(battleId);
    if (battle === undefined || battle.status !== 'running') return undefined;
    const paused: StoredBattle = { ...battle, status: 'paused', pausedAt: now, resumeDeadline };
    this.battles.set(battleId, paused);
    return paused;
  }

  async finish(finish: {
    battleId: string;
    from: BattleStatus;
    to: BattleStatus;
    results: readonly {
      sessionId: string;
      scoreJson: unknown;
      submittedAt: string;
      won: boolean;
    }[];
    now: string;
  }): Promise<StoredBattle | undefined> {
    const battle = this.battles.get(finish.battleId);
    if (battle === undefined || battle.status !== finish.from) return undefined;
    const rows = this.rows.get(finish.battleId) ?? [];
    this.rows.set(
      finish.battleId,
      rows.map((row) => {
        const result = finish.results.find((entry) => entry.sessionId === row.sessionId);
        if (result === undefined) return row;
        return {
          ...row,
          submittedAt: result.submittedAt,
          scoreJson: result.scoreJson,
          won: result.won,
        };
      }),
    );
    const finished: StoredBattle = { ...battle, status: finish.to, finishedAt: finish.now };
    this.battles.set(finish.battleId, finished);
    return finished;
  }

  async pausedBefore(deadline: string): Promise<readonly StoredBattle[]> {
    return [...this.battles.values()].filter(
      (battle) =>
        battle.status === 'paused' &&
        battle.resumeDeadline !== null &&
        battle.resumeDeadline <= deadline,
    );
  }
}

/**
 * A reputation provider, built here rather than imported.
 *
 * features/reputation cannot be imported by a feature, which is the rule this
 * whole file is demonstrating, so the provider is written from core alone. It
 * declares the capability and the action under the same name, which is the
 * convention the real provider follows.
 */
function reputationProviding(trust: number): GameFeature {
  return {
    id: 'reputation',
    capabilities: [{ name: 'reputation.read', description: 'Read one character trust.' }],
    actionDefs: [
      {
        id: 'reputation.read',
        permissions: ['reputation.read'],
        run: async (input: unknown) => ({ agentId: (input as { agentId: string }).agentId, trust }),
      },
    ],
  };
}

/** What `battle.sweep` answers, named so the assertions above read as claims. */
interface SweepReport {
  readonly abandoned: readonly string[];
  readonly expired: readonly string[];
}

const AGENT_CLAUDE = 'agent-claude';
const AGENT_CODEX = 'agent-codex';
const MINUTE = 60_000;

interface Harness {
  readonly runtime: ReturnType<typeof createRuntime>;
  readonly store: MemoryBattles;
  readonly bus: EventBus;
  readonly stateStore: StateStore;
  readonly events: GameEvent[];
  readonly warnings: string[];
  clock: { at: number };
  setNow(instant: string): void;
  startSession(sessionId: string, agentId: string): Promise<void>;
  /**
   * `input` is `unknown` and the return is inferred from the caller's annotation,
   * rather than the other way round.
   *
   * Every action in this feature takes `unknown` and guards it, so a helper that
   * took the input as a generic would infer `string` from the action id and
   * reject every object payload at the call site — which is exactly the
   * annotation `act()` itself never checks, reproduced in a test helper.
   */
  act<O>(id: string, input?: unknown): Promise<O>;
}

async function harness(
  options: { readonly trust?: number; readonly degraded?: boolean } = {},
): Promise<Harness> {
  const store = new MemoryBattles();
  const bus = createInMemoryEventBus();
  const stateStore = new InMemoryStateStore();
  const warnings: string[] = [];
  const clock = { at: Date.parse('2026-09-26T10:00:00.000Z') };
  const events: GameEvent[] = [];
  bus.subscribe((event) => events.push(event));

  const features: GameFeature[] = [
    battleFeature({ repository: store, resumeGraceMs: 15 * MINUTE, matchDurationMs: 15 * MINUTE }),
  ];
  if (options.degraded !== true) {
    features.push(reputationProviding(options.trust ?? 10_000));
  }

  const runtime = createRuntime({
    extensions: features,
    store: stateStore,
    bus,
    now: () => new Date(clock.at).toISOString(),
    log: { warn: (message) => warnings.push(message) },
  });

  return {
    runtime,
    store,
    bus,
    stateStore,
    events,
    warnings,
    clock,
    setNow(instant: string) {
      clock.at = Date.parse(instant);
    },
    async startSession(sessionId, agentId) {
      await runtime.emit({
        type: 'session.started',
        occurredAt: new Date(clock.at).toISOString(),
        actorId: agentId,
        payload: { sessionId, agentId, harness: 'claude' },
      });
    },
    async act<O>(id: string, input?: unknown): Promise<O> {
      return (await runtime.runAction(id, input)) as O;
    },
  };
}

function criteria(scores: Partial<Record<JudgeCriterion, number>>) {
  return JUDGE_CRITERIA.map((criterion) => ({
    criterion,
    score: scores[criterion] ?? 0,
  }));
}

interface FightOptions {
  readonly mode?: string;
  readonly weights?: Record<string, number>;
  readonly bountyId?: string;
}

async function fight(world: Harness, options: FightOptions = {}): Promise<BattleView> {
  const created = await world.act<BattleView>('battle.create', {
    sessionId: 'session-241',
    ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.weights === undefined ? {} : { weights: options.weights }),
    ...(options.bountyId === undefined ? {} : { bountyId: options.bountyId }),
  });
  return world.act<BattleView>('battle.join', {
    battleId: created.id,
    sessionId: 'session-552',
  });
}

beforeEach(() => {
  /* nothing shared between cases: every harness builds its own runtime, store and clock */
});

/* ───────────────────────────── the lifecycle ───────────────────────────── */

describe('opening and joining', () => {
  it('puts the creator in the battle it just opened', async () => {
    const world = await harness();
    const battle = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
    });
    expect(battle.participants.map((p) => p.sessionId)).toEqual(['session-241']);
    expect(battle.status).toBe('running');
  });

  it('refuses a third session into a two-fighter battle, and says the battle was full', async () => {
    const world = await harness();
    const battle = await fight(world);
    await expect(
      world.act('battle.join', { battleId: battle.id, sessionId: 'session-999' }),
    ).rejects.toThrow(/full/);
  });

  it('refuses a session to join the same battle twice', async () => {
    const world = await harness();
    const battle = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
    });
    await expect(
      world.act('battle.join', { battleId: battle.id, sessionId: 'session-241' }),
    ).rejects.toThrow(/already-in-it/);
  });

  it('rejects a create with no session, because a battle with no participant cannot finish', async () => {
    const world = await harness();
    await expect(world.act('battle.create', {})).rejects.toMatchObject({ code: 'malformed-input' });
  });

  it('lists the open battles, each carrying ITS OWN rubric rather than the plan defaults', async () => {
    // Non-default weights on purpose, and this is the second time that has been
    // the difference between a real assertion and a decoration. The first version
    // opened a default battle, and a list that answered with the plan's weights
    // regardless of what each battle carried was a NO-OP mutation: the test went
    // green against a list that published nothing at all. A weight set that is
    // stored but not published has not met section 17.4, and only a battle whose
    // weights DIFFER from the defaults can tell the two apart.
    const world = await harness();
    const custom = { correctness: 0.3, tests: 0.3, regression: 0.2, quality: 0.1, efficiency: 0.1 };
    const battle = await fight(world, { weights: custom });
    const open = await world.act<readonly BattleView[]>('battle.list', {});
    const listed = open.find((entry) => entry.id === battle.id);
    expect(listed?.weights).toEqual(custom);
    expect(listed?.weights).not.toEqual(DEFAULT_BATTLE_WEIGHTS);
  });

  it('lists only the battles still open to be joined', async () => {
    // A finished battle in a list of joinable ones is a battle a caller walks
    // into and cannot enter, and the refusal would come as an error rather than
    // as an absence.
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    const battle = await fight(world);
    world.setNow('2026-09-26T10:03:00.000Z');
    await finishBattle(world, battle.id, { 'session-241': 1, 'session-552': 0 });
    const open = await world.act<readonly BattleView[]>('battle.list', {});
    expect(open.map((entry) => entry.id)).not.toContain(battle.id);
  });
});

/* ───────────────────────────── the session binding ───────────────────────────── */

describe('a battle binds sessions, not agents', () => {
  /**
   * Battle#918, the anti-pattern section 3.1 names.
   *
   * One agent, two concurrent sessions, two battles. A design where the
   * participant row carried an agent id and the agent was looked up later would
   * pass every other test in this file: each battle still holds two sessions,
   * each still has a winner, and each still has a score. What it could not do is
   * keep the two apart, because the key it joined on would be the one field the
   * two sessions share.
   */
  it('keeps one agent in two battles through two sessions, with no cross-visibility', async () => {
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-663', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    await world.startSession('session-884', AGENT_CODEX);

    const first = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
    });
    await world.act('battle.join', { battleId: first.id, sessionId: 'session-552' });
    const second = await world.act<BattleView>('battle.create', {
      sessionId: 'session-663',
    });
    await world.act('battle.join', { battleId: second.id, sessionId: 'session-884' });

    expect(first.id).not.toBe(second.id);

    const readFirst = await world.act<BattleView>('battle.read', { battleId: first.id });
    const readSecond = await world.act<BattleView>('battle.read', { battleId: second.id });

    // Neither battle may name the other's session, and both may name the same
    // agent twice over — the agent is shared, the session is not.
    expect(readFirst.participants.map((p) => p.sessionId).sort()).toEqual([
      'session-241',
      'session-552',
    ]);
    expect(readSecond.participants.map((p) => p.sessionId).sort()).toEqual([
      'session-663',
      'session-884',
    ]);
    expect(readFirst.participants.map((p) => p.agentId).sort()).toEqual(
      [AGENT_CLAUDE, AGENT_CODEX].sort(),
    );
    expect(readSecond.participants.map((p) => p.agentId).sort()).toEqual(
      [AGENT_CLAUDE, AGENT_CODEX].sort(),
    );
  });

  it('attributes behaviour to the session that did it, not to the agent behind it', async () => {
    // The counters are keyed battle → session. An implementation that keyed them
    // by agent would give the two sessions of one agent a single shared history,
    // and both would show the sum. This asserts they are kept apart: one session
    // passes twelve tests, the other of the same agent passes one.
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-663', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);

    const first = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
    });
    await world.act('battle.join', { battleId: first.id, sessionId: 'session-552' });
    const second = await world.act<BattleView>('battle.create', {
      sessionId: 'session-663',
    });

    for (let run = 0; run < 12; run += 1) {
      await world.runtime.emit(testEvent('test.passed', 'session-241'));
    }
    await world.runtime.emit(testEvent('test.passed', 'session-663'));

    const readFirst = await world.act<BattleView>('battle.read', { battleId: first.id });
    const readSecond = await world.act<BattleView>('battle.read', { battleId: second.id });

    expect(readFirst.participants.find((p) => p.sessionId === 'session-241')?.stats?.def).toBe(12);
    expect(readSecond.participants.find((p) => p.sessionId === 'session-663')?.stats?.def).toBe(1);
    // And the battle the busy session is NOT in must not have moved at all.
    expect(readSecond.participants.find((p) => p.sessionId === 'session-241')).toBeUndefined();
  });

  it('never offers an agent id as the way into a battle', async () => {
    // The wrong model is not merely discouraged: there is no input that names one.
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    const battle = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
    });
    // `agentId` alongside a valid `sessionId` is ignored rather than honoured.
    const joined = await world.act<BattleView>('battle.join', {
      battleId: battle.id,
      sessionId: 'session-552',
      agentId: AGENT_CLAUDE,
    });
    expect(joined.participants.map((p) => p.sessionId)).toContain('session-552');
    expect(joined.participants.find((p) => p.sessionId === 'session-552')?.agentId).toBeNull();
  });
});

/* ───────────────────────────── the public rubric ───────────────────────────── */

describe('the rubric is public before the battle is judged', () => {
  it('is readable by a caller that supplied nothing but a battle id, while the battle is running', async () => {
    // Section 17.4. The assertion is a VISIBILITY one: the call carries no
    // agentId, no sessionId and no credential, and the battle is still
    // `running`, so this is the rubric BEFORE the verdict. A judge that published
    // its weights only on a finished battle would fail it.
    const world = await harness();
    const battle = await fight(world);

    const published = await world.act<typeof expectedWeights>('battle.weights', {
      battleId: battle.id,
    });

    expect(published.battleId).toBe(battle.id);
    expect(published.status).toBe('running');
    expect(published.weights).toEqual(DEFAULT_BATTLE_WEIGHTS);
    expect(published.criteria).toEqual(JUDGE_CRITERIA);
  });

  it('is the rubric the BATTLE carries, not the plan defaults', async () => {
    // The mutation that matters. A read that answered with the defaults would
    // pass the assertion above for every battle, because the defaults are what a
    // battle gets when nobody says otherwise. So a battle is opened with its own
    // weights and the read has to return THOSE.
    const world = await harness();
    const custom = {
      correctness: 0.4,
      tests: 0.4,
      regression: 0.1,
      quality: 0.05,
      efficiency: 0.05,
    };
    const battle = await fight(world, { weights: custom });

    const published = await world.act<{ weights: Record<string, number> }>(BATTLE_WEIGHTS_READ, {
      battleId: battle.id,
    });
    expect(published.weights).toEqual(custom);
    expect(published.weights).not.toEqual(DEFAULT_BATTLE_WEIGHTS);
  });

  it('matches the weights the repository stored, byte for byte', async () => {
    const world = await harness();
    const custom = {
      correctness: 0.25,
      tests: 0.25,
      regression: 0.25,
      quality: 0.15,
      efficiency: 0.1,
    };
    const battle = await fight(world, { weights: custom });
    const row = await world.store.findById(battle.id);
    const published = await world.act<{ weights: Record<string, number> }>('battle.weights', {
      battleId: battle.id,
    });
    expect(published.weights).toEqual(row?.weightsJson);
  });

  it('refuses to open a battle with weights that do not sum to one', async () => {
    // Checked at creation, not at judging. A rubric that turns out to be unusable
    // after the work is done is one that was hidden until it was too late to
    // argue with.
    const world = await harness();
    await expect(
      world.act('battle.create', {
        sessionId: 'session-241',
        weights: { correctness: 0.9, tests: 0.9, regression: 0.1, quality: 0.1, efficiency: 0.1 },
      }),
    ).rejects.toMatchObject({ code: 'malformed-input' });
  });

  it('carries the rubric on the created event, so a watcher is not left to ask again', async () => {
    const world = await harness();
    const custom = { correctness: 0.2, tests: 0.2, regression: 0.2, quality: 0.2, efficiency: 0.2 };
    const battle = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
      weights: custom,
    });
    const created = world.events.find((event) => event.type === 'battle.created');
    expect((created?.payload as { weights: unknown }).weights).toEqual(custom);
    expect((created?.payload as { battleId: string }).battleId).toBe(battle.id);
  });

  it('is on the read view as well, because a view that could withhold it is a worse answer', async () => {
    const world = await harness();
    const battle = await fight(world);
    const read = await world.act<BattleView>('battle.read', { battleId: battle.id });
    expect(read.weights).toEqual(DEFAULT_BATTLE_WEIGHTS);
  });

  it('still answers after the battle is finished, so a dispute has a rubric to argue against', async () => {
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    const battle = await fight(world);
    await finishBattle(world, battle.id, { 'session-241': 1, 'session-552': 0 });

    const published = await world.act<{ status: string }>('battle.weights', {
      battleId: battle.id,
    });
    expect(published.status).toBe('completed');
  });

  it('refuses a read of a battle that does not exist, rather than inventing one', async () => {
    const world = await harness();
    await expect(world.act('battle.weights', { battleId: 'battle-nope' })).rejects.toMatchObject({
      code: 'battle-not-found',
    });
  });

  it('rejects a weights read that names no battle, because a bare id is the whole contract', async () => {
    // The positive half of the public claim is the test above: a battle id and
    // nothing else is enough. This is the negative — an empty payload and a bare
    // string are both refused, so the read has a shape rather than answering
    // about whatever it was handed.
    const world = await harness();
    await fight(world);
    await expect(world.act('battle.weights', {})).rejects.toMatchObject({
      code: 'malformed-input',
    });
    await expect(world.act('battle.weights', 'battle-1')).rejects.toMatchObject({
      code: 'malformed-input',
    });
  });
});

const expectedWeights = {
  battleId: '',
  status: '',
  weights: DEFAULT_BATTLE_WEIGHTS,
  criteria: JUDGE_CRITERIA,
  published: true as const,
};

/* ───────────────────────────── judging ───────────────────────────── */

describe('judging a battle', () => {
  it('scores against the rubric, stores the parts, and names a winner', async () => {
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    const battle = await fight(world);
    world.setNow('2026-09-26T10:03:00.000Z');

    const finished = await finishBattle(world, battle.id, { 'session-241': 1, 'session-552': 0.4 });

    expect(finished.status).toBe('completed');
    expect(finished.winnerSessionIds).toEqual(['session-241']);
    const winner = finished.participants.find((p) => p.sessionId === 'session-241');
    expect(winner?.score).toBe(1);
    expect(winner?.won).toBe(true);
    // The parts are stored, so a loser can be shown its own arithmetic.
    const stored = (await world.store.participants(battle.id)).find(
      (p) => p.sessionId === 'session-552',
    );
    expect((stored?.scoreJson as { contributions: unknown[] }).contributions).toHaveLength(5);
  });

  it('refuses to score a session that is not in the battle', async () => {
    // The feature-level half of workspace isolation: a session that never entered
    // has no isolated workspace in this match, so its result is refused rather
    // than added. The workspace-level isolation is ba-battle-workspace-judge-jc9.
    const world = await harness();
    const battle = await fight(world);
    world.setNow('2026-09-26T10:03:00.000Z');
    await expect(
      world.act('battle.finish', {
        battleId: battle.id,
        results: [
          {
            sessionId: 'session-241',
            criteria: criteria({ correctness: 1 }),
            submittedAt: '2026-09-26T10:02:00.000Z',
          },
          {
            sessionId: 'session-intruder',
            criteria: criteria({ correctness: 1 }),
            submittedAt: '2026-09-26T10:02:00.000Z',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'session-not-a-participant' });
  });

  it('refuses to finish a battle twice, and the second refusal says somebody else did it', async () => {
    const world = await harness();
    const battle = await fight(world);
    world.setNow('2026-09-26T10:03:00.000Z');
    await finishBattle(world, battle.id, { 'session-241': 1, 'session-552': 0 });
    await expect(
      world.act('battle.finish', {
        battleId: battle.id,
        results: [
          {
            sessionId: 'session-241',
            criteria: criteria({ correctness: 1 }),
            submittedAt: '2026-09-26T10:04:00.000Z',
          },
          {
            sessionId: 'session-552',
            criteria: criteria({}),
            submittedAt: '2026-09-26T10:04:00.000Z',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'battle-finish-refused' });
  });

  it('refuses a battle whose state this build cannot read, rather than guessing a winner', async () => {
    const world = await harness();
    const battle = await fight(world);
    await world.store.battles.set(battle.id, {
      ...(await world.store.findById(battle.id))!,
      status: 'awaiting-review',
    });
    world.setNow('2026-09-26T10:03:00.000Z');
    await expect(
      world.act('battle.finish', {
        battleId: battle.id,
        results: [
          {
            sessionId: 'session-241',
            criteria: criteria({ correctness: 1 }),
            submittedAt: '2026-09-26T10:02:00.000Z',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'unreadable-battle-state' });
  });

  it('refuses a judgement that omits a criterion the rubric names', async () => {
    // A criterion that RAN and found nothing passing scores zero. A criterion
    // that never ran is missing, and a battle judged on checks that did not run
    // is how a broken workspace produces a winner.
    const world = await harness();
    const battle = await fight(world);
    world.setNow('2026-09-26T10:03:00.000Z');
    await expect(
      world.act('battle.finish', {
        battleId: battle.id,
        results: [
          {
            sessionId: 'session-241',
            criteria: [{ criterion: 'correctness', score: 1 }],
            submittedAt: '2026-09-26T10:02:00.000Z',
          },
        ],
      }),
    ).rejects.toThrow();
  });
});

describe('ties', () => {
  it('gives a speed tie to the earlier valid submission', async () => {
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    const battle = await fight(world, { mode: 'speed' });
    world.setNow('2026-09-26T10:05:00.000Z');

    const finished = await world.act<BattleView>('battle.finish', {
      battleId: battle.id,
      results: [
        {
          sessionId: 'session-241',
          criteria: criteria({ correctness: 1 }),
          submittedAt: '2026-09-26T10:04:00.000Z',
        },
        {
          sessionId: 'session-552',
          criteria: criteria({ correctness: 1 }),
          submittedAt: '2026-09-26T10:02:00.000Z',
        },
      ],
    });
    expect(finished.winnerSessionIds).toEqual(['session-552']);
  });

  it('shares a tournament tie, and both sessions are marked as having won', async () => {
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    const battle = await fight(world, { mode: 'tournament' });
    world.setNow('2026-09-26T10:05:00.000Z');

    const finished = await world.act<BattleView>('battle.finish', {
      battleId: battle.id,
      results: [
        {
          sessionId: 'session-241',
          criteria: criteria({ correctness: 1 }),
          submittedAt: '2026-09-26T10:04:00.000Z',
        },
        {
          sessionId: 'session-552',
          criteria: criteria({ correctness: 1 }),
          submittedAt: '2026-09-26T10:02:00.000Z',
        },
      ],
    });
    // The later submission does not win, because the mode says a tournament tie
    // is shared. One winner field on the battle would have to pick one.
    expect(finished.winnerSessionIds).toEqual(['session-241', 'session-552']);
    expect(finished.participants.every((p) => p.won)).toBe(true);
  });

  it('seats one fighter in a mode it does not recognise, because a capacity is a permission', async () => {
    // The same fail-closed rule features/bounty applies to an unrecognised mode,
    // reached through the real path rather than a pure function. A mode this
    // build cannot interpret has not been shown to permit a second fighter, so
    // it permits one — which is also why an unknown mode can never produce the
    // two-way tie its `shared` policy describes. The tie policy and the capacity
    // are separate questions and this is the capacity's half.
    const world = await harness();
    const created = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
      mode: 'ladder',
    });
    expect(created.mode).toBe('ladder');
    await expect(
      world.act('battle.join', { battleId: created.id, sessionId: 'session-552' }),
    ).rejects.toThrow(/full/);
  });

  it('shares a tournament tie, and reads the same instant as no tiebreak at all', async () => {
    // Two submissions stamped identically. Resolving by the order the rows came
    // back would make the winner a function of the database's mood, so a speed
    // tie the clock cannot break is shared too.
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    const battle = await fight(world, { mode: 'speed' });
    world.setNow('2026-09-26T10:05:00.000Z');
    const finished = await world.act<BattleView>('battle.finish', {
      battleId: battle.id,
      results: [
        {
          sessionId: 'session-241',
          criteria: criteria({ correctness: 1 }),
          submittedAt: '2026-09-26T10:02:00.000Z',
        },
        {
          sessionId: 'session-552',
          criteria: criteria({ correctness: 1 }),
          submittedAt: '2026-09-26T10:02:00.000Z',
        },
      ],
    });
    expect(finished.winnerSessionIds).toEqual(['session-241', 'session-552']);
  });
});

/* ───────────────────────────── the reward ───────────────────────────── */

describe('the reward path', () => {
  it('emits one battle.finished carrying the winner session and its agent, for progression to pay', async () => {
    // progression reads `payload.agentId` and `payload.won`. A battle that
    // emitted the event without an agent would pay nothing and say so nowhere.
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    const battle = await fight(world);
    world.setNow('2026-09-26T10:03:00.000Z');
    await finishBattle(world, battle.id, { 'session-241': 1, 'session-552': 0 });

    const rewards = world.events.filter(
      (event) =>
        event.type === 'battle.finished' && (event.payload as { agentId?: string }).agentId,
    );
    expect(rewards).toHaveLength(1);
    expect(rewards[0]?.payload).toMatchObject({
      battleId: battle.id,
      sessionId: 'session-241',
      agentId: AGENT_CLAUDE,
      won: true,
    });
  });

  it('emits a reward for EACH winner of a shared tie, because one award row is per agent', async () => {
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    const battle = await fight(world, { mode: 'tournament' });
    world.setNow('2026-09-26T10:05:00.000Z');
    await world.act('battle.finish', {
      battleId: battle.id,
      results: [
        {
          sessionId: 'session-241',
          criteria: criteria({ correctness: 1 }),
          submittedAt: '2026-09-26T10:04:00.000Z',
        },
        {
          sessionId: 'session-552',
          criteria: criteria({ correctness: 1 }),
          submittedAt: '2026-09-26T10:04:00.000Z',
        },
      ],
    });

    const rewards = world.events.filter(
      (event) =>
        event.type === 'battle.finished' && (event.payload as { agentId?: string }).agentId,
    );
    expect(rewards.map((event) => (event.payload as { agentId: string }).agentId).sort()).toEqual([
      AGENT_CLAUDE,
      AGENT_CODEX,
    ]);
  });

  it('emits no reward for a loser', async () => {
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    const battle = await fight(world);
    world.setNow('2026-09-26T10:03:00.000Z');
    await finishBattle(world, battle.id, { 'session-241': 0, 'session-552': 1 });

    const rewards = world.events.filter(
      (event) =>
        event.type === 'battle.finished' && (event.payload as { agentId?: string }).agentId,
    );
    expect(rewards).toHaveLength(1);
    expect((rewards[0]?.payload as { agentId: string }).agentId).toBe(AGENT_CODEX);
  });

  it('says so in the log when a winner has no agent this feature ever saw, rather than paying nothing quietly', async () => {
    const world = await harness();
    // No session.started for either participant, so neither has an agent.
    const battle = await fight(world);
    world.setNow('2026-09-26T10:03:00.000Z');
    await finishBattle(world, battle.id, { 'session-241': 1, 'session-552': 0 });

    const rewards = world.events.filter(
      (event) =>
        event.type === 'battle.finished' && (event.payload as { agentId?: string }).agentId,
    );
    expect(rewards).toHaveLength(0);
    expect(world.warnings.join(' ')).toMatch(/never saw start/);
  });

  it('records the battle outcome separately, carrying no agent so it cannot be paid twice', async () => {
    const world = await harness();
    await world.startSession('session-241', AGENT_CLAUDE);
    const battle = await fight(world);
    world.setNow('2026-09-26T10:03:00.000Z');
    await finishBattle(world, battle.id, { 'session-241': 1, 'session-552': 0 });

    const records = world.events.filter(
      (event) =>
        event.type === 'battle.finished' && (event.payload as { outcome?: string }).outcome,
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.payload).toMatchObject({ outcome: 'won', reason: 'outscored' });
  });
});

/* ───────────────────────────── the declared capability dependency ───────────────────────────── */

describe('reputation.read is declared, and its absence is a designed mode', () => {
  it('reports no degradation when the capability is installed', async () => {
    const world = await harness({ trust: 10_000 });
    expect(world.runtime.degraded().get('battle')).toBeUndefined();
  });

  it('names the missing capability by name when it is not', async () => {
    // The registry recomputes this after every install and uninstall, and this
    // is the signal scripts/removal-test.sh reads to say that removing a feature
    // left the rest of the tree running in a reduced mode rather than broken.
    const world = await harness({ degraded: true });
    expect(world.runtime.degraded().get('battle')).toEqual(['reputation.read']);
  });

  it('opens the arena rather than closing it, and the view says which happened', async () => {
    const world = await harness({ degraded: true });
    const battle = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
    });
    expect(battle.entryGated).toBe(false);
    expect(battle.entryGatedReason).toBe('open-no-reputation');

    const joined = await world.act<BattleView>('battle.join', {
      battleId: battle.id,
      sessionId: 'session-552',
    });
    expect(joined.participants).toHaveLength(2);
  });

  it('gates on trust when the capability IS there, and names the floor in the refusal', async () => {
    const world = await harness({ trust: 10 });
    // BOTH sessions need an agent, because the gate asks about the agent BEHIND
    // the joining session. A session with no agent observed is let through, and
    // asserting the gate here against a session that has none would have been a
    // test of the escape hatch wearing the gate's name.
    await world.startSession('session-241', AGENT_CLAUDE);
    await world.startSession('session-552', AGENT_CODEX);
    const battle = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
    });
    expect(battle.entryGated).toBe(true);
    expect(battle.entryGatedReason).toBe('gated-on-trust');

    await expect(
      world.act('battle.join', { battleId: battle.id, sessionId: 'session-552' }),
    ).rejects.toThrow(new RegExp(`${ARENA_MIN_TRUST}`));
  });

  it('lets a session with enough trust in, so the gate is not simply closed', async () => {
    const world = await harness({ trust: ARENA_MIN_TRUST });
    await world.startSession('session-241', AGENT_CLAUDE);
    const battle = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
    });
    const joined = await world.act<BattleView>('battle.join', {
      battleId: battle.id,
      sessionId: 'session-552',
    });
    expect(joined.participants).toHaveLength(2);
  });

  it('lets a session in whose agent it has never seen, because the gate cannot ask about a session', async () => {
    // Refusing would make the gate close for every session in a composed runtime
    // that never emitted a session.started — an arena shut for a reason no caller
    // can see or fix.
    const world = await harness({ trust: 0 });
    const battle = await world.act<BattleView>('battle.create', {
      sessionId: 'session-241',
    });
    const joined = await world.act<BattleView>('battle.join', {
      battleId: battle.id,
      sessionId: 'session-552',
    });
    expect(joined.participants).toHaveLength(2);
  });
});

/* ───────────────────────────── the grace period ───────────────────────────── */

describe('a disconnect, a window, and a sweep', () => {
  it('pauses the battle on session.ended and records when the window runs out', async () => {
    const world = await harness();
    const battle = await fight(world);
    world.setNow('2026-09-26T10:05:00.000Z');
    await world.runtime.emit({
      type: 'session.ended',
      occurredAt: '2026-09-26T10:05:00.000Z',
      actorId: 'session-552',
      payload: { sessionId: 'session-552', reason: 'crashed' },
    });

    const read = await world.act<BattleView>('battle.read', { battleId: battle.id });
    expect(read.status).toBe('paused');
    // Measured from the pause, and the pause is a state the view can show, so
    // "this battle is waiting for somebody who has fifteen minutes" needs no
    // arithmetic on the reader's side.
    expect(read.pausedAt).toBe('2026-09-26T10:05:00.000Z');
    expect(read.resumeDeadline).toBe('2026-09-26T10:20:00.000Z');
  });

  it('resumes the battle when the session comes back inside the window', async () => {
    const world = await harness();
    const battle = await fight(world);
    world.setNow('2026-09-26T10:05:00.000Z');
    await endSession(world, 'session-552');
    world.setNow('2026-09-26T10:10:00.000Z');
    await world.runtime.emit({
      type: 'session.resumed',
      occurredAt: '2026-09-26T10:10:00.000Z',
      actorId: 'session-552',
      payload: { sessionId: 'session-552' },
    });

    const read = await world.act<BattleView>('battle.read', { battleId: battle.id });
    expect(read.status).toBe('running');
    expect(read.resumeDeadline).toBeNull();
  });

  it('abandons it when the sweep runs after the window', async () => {
    const world = await harness();
    const battle = await fight(world);
    world.setNow('2026-09-26T10:05:00.000Z');
    await endSession(world, 'session-552');

    // A sweep BEFORE the deadline must leave it alone, which is the half of the
    // rule that says the window is a window.
    world.setNow('2026-09-26T10:19:59.000Z');
    expect((await world.act<SweepReport>('battle.sweep', {})).abandoned).toEqual([]);

    world.setNow('2026-09-26T10:20:01.000Z');
    expect((await world.act<SweepReport>('battle.sweep', {})).abandoned).toEqual([battle.id]);

    const read = await world.act<BattleView>('battle.read', { battleId: battle.id });
    expect(read.status).toBe('abandoned');
  });

  it('expires a battle that has run past the match length, so `expired` is reachable', async () => {
    const world = await harness();
    const battle = await fight(world);
    world.setNow('2026-09-26T10:14:59.000Z');
    expect((await world.act<SweepReport>('battle.sweep', {})).expired).toEqual([]);
    world.setNow('2026-09-26T10:15:01.000Z');
    expect((await world.act<SweepReport>('battle.sweep', {})).expired).toEqual([battle.id]);
    expect((await world.act<BattleView>('battle.read', { battleId: battle.id })).status).toBe(
      'expired',
    );
  });

  it('pauses only the battle the ended session was in', async () => {
    const world = await harness();
    const other = await world.act<BattleView>('battle.create', {
      sessionId: 'session-777',
    });
    const mine = await fight(world);
    world.setNow('2026-09-26T10:05:00.000Z');
    await endSession(world, 'session-552');

    expect((await world.act<BattleView>('battle.read', { battleId: other.id })).status).toBe(
      'running',
    );
    expect((await world.act<BattleView>('battle.read', { battleId: mine.id })).status).toBe(
      'paused',
    );
  });
});

/* ───────────────────────────── the behaviour fold ───────────────────────────── */

describe('coding behaviour maps to stats, and never to a cost', () => {
  it('gives two sessions with the same work the same stats, whatever they cost', async () => {
    // Section 2.2 bans token-count-as-damage by name. The events below are
    // identical apart from a count of what each agent was willing to spend, and
    // the two participants' stats come out identical. A judge that quietly
    // weighted the extra field would pass every fixture test in this package.
    const world = await harness();
    const battle = await fight(world);
    const [cheap, dear] = battle.participants;
    // The two fighters are the two sessions the battle holds, and this test only
    // means anything because they are — an assertion about a list position would
    // be an assertion about nothing.
    if (cheap === undefined || dear === undefined) {
      throw new Error('a fresh battle must hold two participants');
    }

    await runBehaviour(world, cheap.sessionId, { tokensSpent: 4, costCents: 0 });
    await runBehaviour(world, dear.sessionId, { tokensSpent: 87_500_000, costCents: 12_400 });

    const read = await world.act<BattleView>('battle.read', { battleId: battle.id });
    const cheapStats = read.participants.find((p) => p.sessionId === cheap.sessionId);
    const dearStats = read.participants.find((p) => p.sessionId === dear.sessionId);
    expect(cheapStats?.stats).toEqual(dearStats?.stats);
    expect(cheapStats?.charge).toEqual(dearStats?.charge);
  });

  it('charges five consecutive failures as damage, whoever paid for them', async () => {
    const world = await harness();
    const battle = await fight(world);
    const [first, second] = battle.participants;
    if (first === undefined || second === undefined) {
      throw new Error('a fresh battle must hold two participants');
    }
    for (let run = 0; run < 5; run += 1) {
      await world.runtime.emit(
        testEvent('test.failed', first.sessionId, { tokensSpent: 1_000_000 }),
      );
      await world.runtime.emit(testEvent('test.failed', second.sessionId, { tokensSpent: 2 }));
    }
    const read = await world.act<BattleView>('battle.read', { battleId: battle.id });
    expect(read.participants.find((p) => p.sessionId === first.sessionId)?.charge?.damage).toBe(1);
    expect(read.participants.find((p) => p.sessionId === second.sessionId)?.charge?.damage).toBe(1);
  });

  it('reads nothing of a behaviour event it does not recognise, so an unknown field cannot move a stat', async () => {
    const world = await harness();
    const battle = await fight(world);
    const [session] = battle.participants;
    if (session === undefined) {
      throw new Error('a fresh battle must hold a participant');
    }
    await world.runtime.emit({
      type: 'test.passed',
      occurredAt: '2026-09-26T10:01:00.000Z',
      actorId: session.sessionId,
      payload: {
        sessionId: session.sessionId,
        suite: 'unit',
        count: 47,
        testsPassed: 9_000,
        passed: 9_000,
      },
    });
    const read = await world.act<BattleView>('battle.read', { battleId: battle.id });
    // One event, one pass. A handler that read `payload.testsPassed` or
    // `payload.passed` would report 9000 and 47 differently.
    expect(read.participants.find((p) => p.sessionId === session.sessionId)?.stats?.def).toBe(1);
  });

  it('reports null stats for a session that has done nothing, rather than six zeros', async () => {
    const world = await harness();
    const battle = await fight(world);
    const read = await world.act<BattleView>('battle.read', { battleId: battle.id });
    expect(read.participants.every((p) => p.stats === null && p.charge === null)).toBe(true);
  });
});

/* ───────────────────────────── helpers ───────────────────────────── */

async function finishBattle(
  world: Harness,
  battleId: string,
  scores: Readonly<Record<string, number>>,
): Promise<BattleView> {
  return world.act<BattleView>('battle.finish', {
    battleId,
    results: Object.entries(scores).map(([sessionId, score]) => ({
      sessionId,
      // Every criterion at the same value, so `1` reads as a perfect run and
      // `0` as a total failure rather than as "correctness only".
      criteria: criteria(Object.fromEntries(JUDGE_CRITERIA.map((criterion) => [criterion, score]))),
      submittedAt: '2026-09-26T10:02:00.000Z',
    })),
  });
}

function testEvent(
  type: 'test.passed' | 'test.failed',
  sessionId: string,
  extra: object = {},
): GameEvent {
  return {
    type,
    occurredAt: '2026-09-26T10:01:00.000Z',
    actorId: sessionId,
    payload: { sessionId, ...extra },
  };
}

function endSession(world: Harness, sessionId: string): Promise<void> {
  return world.runtime.emit({
    type: 'session.ended',
    occurredAt: new Date(world.clock.at).toISOString(),
    actorId: sessionId,
    payload: { sessionId, reason: 'crashed' },
  });
}

/**
 * The same work, twice, with a different bill attached.
 *
 * The order is the point: five red runs reach the damage threshold in one case
 * and never in the other, so a stat that leaked the extra field would diverge
 * somewhere other than the total.
 */
async function runBehaviour(
  world: Harness,
  sessionId: string,
  cost: Readonly<Record<string, unknown>>,
): Promise<void> {
  await world.runtime.emit({
    type: 'file.write',
    occurredAt: '2026-09-26T10:01:00.000Z',
    actorId: sessionId,
    payload: { sessionId, path: 'src/a.ts', linesAdded: 4, ...cost },
  });
  await world.runtime.emit({
    type: 'thinking',
    occurredAt: '2026-09-26T10:01:30.000Z',
    actorId: sessionId,
    payload: { sessionId, ...cost },
  });
  await world.runtime.emit({
    type: 'tool.completed',
    occurredAt: '2026-09-26T10:01:40.000Z',
    actorId: sessionId,
    payload: { sessionId, tool: 'read', ok: true, durationMs: 12, ...cost },
  });
  await world.runtime.emit(testEvent('test.passed', sessionId, cost));
}

void DEFAULT_BATTLE_MODE;
void RUBRIC;
