import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { GameEvent, GameFeature, Logger, StateStore } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import { ACHIEVEMENT_AWARDED, type AchievementsView } from './domain.js';
import { ACHIEVEMENTS_LIST, achievementsFeature } from './feature.js';
import type { AchievementsRepository, AwardedAchievement } from './repository.js';
import { ACHIEVEMENT_RULES, type RecordedRow } from './rules.js';

/**
 * The feature, over a log the store actually recorded.
 *
 * The repository fake below reads from the SAME `InMemoryStateStore` the runtime
 * writes its persisted events into, and attributes them with the same rule the
 * drizzle adapter writes in SQL. That is the load-bearing decision of this file:
 * an achievements fake backed by its own map would be a second store, and every
 * assertion about deriving from the log would then be true of a projection that
 * never read one.
 */

const NOW = '2026-09-26T10:00:00.000Z';

const BOUNTY_COMPLETED = 'bounty.completed';
const SESSION_ENDED = 'session.ended';
const TEST_FAILED = 'test.failed';
const TEST_PASSED = 'test.passed';

const AGENT = '11111111-1111-1111-1111-111111111111';

/**
 * A feature that widens the persistence filter for the types below.
 *
 * The real ones are other features' — bounty owns `bounty.completed` and this
 * one cannot take it, because the registry allows exactly one owner and bounty
 * would then fail to install on the day it declares it. A literal feature
 * declaring the type is the same mechanism at the same seam, which is why the
 * "requires the filter to be widened" cases below are about the mechanism and
 * not about a stub standing in for something.
 */
function declaring(events: readonly string[]): GameFeature {
  return { id: `widener-${events.join('-')}`, persistedEvents: [...events] };
}

function widen(): GameFeature {
  return declaring([BOUNTY_COMPLETED]);
}

/**
 * The fake, and it is a projection reader rather than a store.
 *
 * `history` is answered from what the runtime handed the store, so a rule can
 * only be met by an event the persistence policy let through. `award` is the
 * unique (agentId, code) key, refused rather than overwritten.
 */
class LogBackedRepository implements AchievementsRepository {
  readonly #store: StateStore;
  readonly #rows: AwardedAchievement[] = [];
  /** Every write this repository was asked for, including the refused ones. */
  readonly attempts: { code: string; now: string }[] = [];
  /**
   * Every port method that was called, in order.
   *
   * Asserted on rather than the interface's shape, because an interface is
   * erased and `AchievementsRepository.prototype` is a thing that does not
   * exist. The behaviour is the stronger claim anyway: it says which reads this
   * feature actually makes, and adding a read of somebody else's table to the
   * port shows up here whether or not anybody reads the type.
   */
  readonly calls: string[] = [];

  constructor(store: StateStore) {
    this.#store = store;
  }

  async history(agentId: string, eventTypes: readonly string[]): Promise<readonly RecordedRow[]> {
    this.calls.push('history');
    return (this.#store as InMemoryStateStore)
      .recorded()
      .filter((event) => eventTypes.includes(event.type))
      .filter((event) => agentIdOf(event) === agentId)
      .map((event, index) => ({
        // The position within this agent's recorded rows, which preserves the
        // log's order. Drizzle gets the real thing from the bigserial; here the
        // position is the same fact by another route, and the ordering is what
        // `critical-hit` is replayed on.
        sequence: index + 1,
        type: event.type,
        sessionId: sessionIdOf(event),
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        payload: payloadOf(event),
      }));
  }

  async list(agentId: string): Promise<readonly AwardedAchievement[]> {
    this.calls.push('list');
    return this.#rows.filter((awarded) => awarded.agentId === agentId);
  }

  async award(agentId: string, code: AwardedAchievement['code'], now: string): Promise<boolean> {
    this.calls.push('award');
    this.attempts.push({ code, now });
    if (this.#rows.some((awarded) => awarded.agentId === agentId && awarded.code === code)) {
      return false;
    }
    this.#rows.push({ agentId, code, awardedAt: now });
    return true;
  }
}

/**
 * The same attribution the drizzle adapter writes in SQL, applied by hand so the
 * two can be compared against a real database in the integration test rather
 * than assumed to agree.
 */
function agentIdOf(event: GameEvent): string | undefined {
  const named = payloadOf(event)['agentId'];
  if (typeof named === 'string' && named.length > 0) {
    return named;
  }
  return typeof event.actorId === 'string' && event.actorId.length > 0 ? event.actorId : undefined;
}

function sessionIdOf(event: GameEvent): string | null {
  const inPayload = payloadOf(event)['sessionId'];
  return typeof inPayload === 'string' && inPayload.length > 0 ? inPayload : null;
}

function payloadOf(event: GameEvent): Record<string, unknown> {
  return typeof event.payload === 'object' &&
    event.payload !== null &&
    !Array.isArray(event.payload)
    ? (event.payload as Record<string, unknown>)
    : {};
}

interface Harness {
  readonly runtime: ReturnType<typeof createRuntime>;
  readonly store: InMemoryStateStore;
  readonly repository: LogBackedRepository;
  readonly published: GameEvent[];
  readonly warnings: string[];
}

function harness(extra: readonly GameFeature[] = [widen()]): Harness {
  const store = new InMemoryStateStore();
  const published: GameEvent[] = [];
  const warnings: string[] = [];
  const bus = createInMemoryEventBus();
  bus.subscribe((event) => published.push(event));
  const log: Logger = {
    warn: (message) => warnings.push(message),
    info: () => {},
    error: () => {},
  };
  const repository = new LogBackedRepository(store);
  const runtime = createRuntime({
    extensions: [achievementsFeature({ repository }), ...extra],
    store,
    bus,
    log,
    now: () => NOW,
  });
  return { runtime, store, repository, published, warnings };
}

/** A game's own event: names the agent in the payload, actor is the feature. */
function gameEvent(type: string, payload: Record<string, unknown>, actorId = 'bounty'): GameEvent {
  return { type, occurredAt: NOW, actorId, payload: { ...payload, agentId: AGENT } };
}

/** An adapter's event: no agent in the payload, actor is the session's agent. */
function adapterEvent(
  type: string,
  payload: Record<string, unknown>,
  sessionId: string,
): GameEvent {
  return { type, occurredAt: NOW, actorId: AGENT, payload: { ...payload, sessionId } };
}

async function badgesOf(h: Harness): Promise<readonly string[]> {
  const view = (await h.runtime.runAction(ACHIEVEMENTS_LIST, {
    agentId: AGENT,
  })) as AchievementsView;
  return view.badges.map((badge) => badge.code);
}

describe('the awards', () => {
  it('grants first-bounty exactly once, for the first completed bounty', async () => {
    const h = harness();
    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-1', rewardCents: 5000 }));
    expect(await badgesOf(h)).toEqual(['first-bounty.v1']);

    // A second bounty changes nothing. The badge is one per character, and what
    // keeps it that way is the (agentId, code) key rather than a check the
    // handler remembered to make.
    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-2', rewardCents: 5000 }));
    expect(await badgesOf(h)).toEqual(['first-bounty.v1']);
  });

  it('grants survived-a-crash for a crashed session, and nothing for a completed one', async () => {
    // Section 10.2's death rule: HP 0 never kills the character, only the
    // session fails, and the run is a recordable fact rather than a lost one.
    const h = harness();
    await h.runtime.emit(adapterEvent(SESSION_ENDED, { reason: 'completed' }, 'run-1'));
    expect(await badgesOf(h)).toEqual([]);

    await h.runtime.emit(adapterEvent(SESSION_ENDED, { reason: 'crashed' }, 'run-2'));
    expect(await badgesOf(h)).toEqual(['survived-a-crash.v1']);
  });

  it('grants critical-hit on the pass after five failures in one run', async () => {
    const h = harness();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await h.runtime.emit(adapterEvent(TEST_FAILED, { failure: `case-${attempt}` }, 'run-1'));
    }
    expect(await badgesOf(h)).toEqual([]);

    await h.runtime.emit(adapterEvent(TEST_PASSED, { suite: 'unit' }, 'run-1'));
    expect(await badgesOf(h)).toEqual(['critical-hit.v1']);
  });

  it('does not grant critical-hit to a pass that came before the failures', async () => {
    // The order-sensitivity of the whole projection. The same five rows in the
    // same log, evaluated as a set instead of replayed, would say yes here.
    const h = harness();
    await h.runtime.emit(adapterEvent(TEST_PASSED, { suite: 'unit' }, 'run-1'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await h.runtime.emit(adapterEvent(TEST_FAILED, { failure: `case-${attempt}` }, 'run-1'));
    }
    expect(await badgesOf(h)).toEqual([]);
  });

  it('attributes a platform event by its payload, never by the feature that emitted it', async () => {
    // `actorId: 'bounty'` is a feature's own name, set on purpose by
    // features/bounty because a GitHub login is a person and not an agent. A
    // badge must never land on the character because that string was the nearest
    // thing to a name in the event.
    const h = harness();
    await h.runtime.emit({
      type: BOUNTY_COMPLETED,
      occurredAt: NOW,
      actorId: 'bounty',
      payload: { bountyId: 'b-1' },
    });
    expect(await badgesOf(h)).toEqual([]);
  });

  it('ignores an event with no actor at all, and says so', async () => {
    // The refusal a caller can actually observe. A blank actor is what an event
    // emitted without a resolvable principal looks like, and a warning is the
    // only honest answer: the log keeps it, every other feature keeps reacting
    // to it, and there is no character here to award.
    const h = harness();
    await h.runtime.emit({ type: BOUNTY_COMPLETED, occurredAt: NOW, actorId: '', payload: {} });
    expect(await badgesOf(h)).toEqual([]);
    expect(h.warnings.join('\n')).toContain('naming no agent');
    expect(h.repository.attempts).toEqual([]);
  });

  it('announces each award once, and dates it to the recorded outcome', async () => {
    const h = harness();
    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-1' }));
    const awarded = h.published.filter((event) => event.type === ACHIEVEMENT_AWARDED);
    expect(awarded).toHaveLength(1);
    expect(awarded[0]?.actorId).toBe(AGENT);
    expect(awarded[0]?.payload).toMatchObject({
      agentId: AGENT,
      code: 'first-bounty.v1',
      evidenceType: BOUNTY_COMPLETED,
    });

    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-2' }));
    expect(h.published.filter((event) => event.type === ACHIEVEMENT_AWARDED)).toHaveLength(1);
  });
});

describe('an award is derived from the log, not from a counter', () => {
  it('earns nothing for a type the persistence filter does not carry', async () => {
    // The whole claim, stated as a mutation: take the widening away and the
    // badge disappears. Nothing else changes — the handler still runs, the rules
    // still evaluate, and the log has no row for them to count, so there is
    // nothing to award from and nothing is even written.
    const widened = harness([widen()]);
    await widened.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-1' }));
    expect(await badgesOf(widened)).toEqual(['first-bounty.v1']);

    const undeclared = harness([]);
    await undeclared.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-1' }));
    expect(await badgesOf(undeclared)).toEqual([]);
    expect(undeclared.repository.attempts).toEqual([]);
  });

  it('has no way to read another feature’s table', async () => {
    // "Derived from the log rather than from feature-table joins" is otherwise a
    // promise. As a set of calls it is a fact: the only reads this feature makes
    // are the log and the award ledger. Adding a `progression()` to the port and
    // calling it puts a fourth name in this set.
    const h = harness();
    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-1' }));
    expect([...new Set(h.repository.calls)].sort()).toEqual(['award', 'history', 'list']);
  });

  it('reads nothing at all once every badge is held', async () => {
    // The early exit, asserted rather than assumed: an established agent's work
    // produces events almost every time, and the log read behind them is the
    // expensive half. All THREE have to be held — one bounty leaves two rules
    // outstanding, and the read is correctly still happening then.
    const h = harness();
    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-1' }));
    await h.runtime.emit(adapterEvent(SESSION_ENDED, { reason: 'crashed' }, 'run-1'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await h.runtime.emit(adapterEvent(TEST_FAILED, { failure: `case-${attempt}` }, 'run-1'));
    }
    await h.runtime.emit(adapterEvent(TEST_PASSED, { suite: 'unit' }, 'run-1'));
    expect((await badgesOf(h)).length).toBe(3);

    h.repository.calls.length = 0;
    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-2' }));
    expect(h.repository.calls).toEqual(['list']);
  });

  it('still reads the log while any badge is outstanding, because the count is the decision', async () => {
    // The other side of the exit above, so it cannot be a test that passes
    // because the handler stopped doing anything.
    const h = harness();
    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-1' }));
    h.repository.calls.length = 0;
    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-2' }));
    expect(h.repository.calls).toEqual(['list', 'history']);
  });

  it('earns a badge from rows recorded before the feature existed', async () => {
    // Backfill is allowed, and the bead asks for the decision to be made
    // explicitly: an established agent who completed four bounties before
    // `first-bounty` was written has earned it, and withholding it because the
    // rule is newer than the work is the plan's own mistake repeated. So the log
    // is filled by a runtime this feature is not installed in, and the feature
    // arrives afterwards — which is the order a rule added tomorrow actually
    // runs in.
    const store = new InMemoryStateStore();
    const bus = createInMemoryEventBus();
    const runtime = createRuntime({
      extensions: [widen()],
      store,
      bus,
      now: () => NOW,
    });
    for (const bounty of ['b-1', 'b-2', 'b-3', 'b-4']) {
      await runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: bounty }));
    }
    expect(store.recorded()).toHaveLength(4);

    const repository = new LogBackedRepository(store);
    runtime.install(achievementsFeature({ repository }));
    const view = (await runtime.runAction('achievements.project', {
      agentId: AGENT,
    })) as AchievementsView;
    expect(view.badges.map((badge) => badge.code)).toEqual(['first-bounty.v1']);

    // And the second run changes nothing, which is the property that makes the
    // first one safe to run on a whole table.
    const again = (await runtime.runAction('achievements.project', {
      agentId: AGENT,
    })) as AchievementsView;
    expect(again.count).toBe(1);
    expect(repository.attempts.filter((entry) => entry.code === 'first-bounty.v1')).toHaveLength(1);
  });

  it('replays a backfilled run in order, so a pass before the failures earns nothing', async () => {
    // The set-versus-sequence case again, but through the backfill, which is
    // where it actually bites: the rows already exist and the projection is
    // choosing which of them to consider. A pass on row 1 and five failures on
    // rows 2-6 must not produce the badge.
    const store = new InMemoryStateStore();
    const bus = createInMemoryEventBus();
    const runtime = createRuntime({ extensions: [declaring([TEST_PASSED])], store, bus, now: () => NOW });
    await runtime.emit(adapterEvent(TEST_PASSED, { suite: 'unit' }, 'run-1'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await runtime.emit(adapterEvent(TEST_FAILED, { failure: `case-${attempt}` }, 'run-1'));
    }

    const repository = new LogBackedRepository(store);
    runtime.install(achievementsFeature({ repository }));
    const view = (await runtime.runAction('achievements.project', {
      agentId: AGENT,
    })) as AchievementsView;
    expect(view.count).toBe(0);
  });

  it('refuses to write a badge it already holds, which is what makes a re-derivation safe', async () => {
    const h = harness();
    await h.runtime.emit(gameEvent(BOUNTY_COMPLETED, { bountyId: 'b-1' }));
    const afterLive = h.repository.attempts.length;

    await h.runtime.runAction('achievements.project', { agentId: AGENT });
    await h.runtime.runAction('achievements.project', { agentId: AGENT });

    // No further writes at all, not "writes that happened to be refused": a
    // projection that re-derives a rule and then declines to record it is doing
    // the work twice and leaving the key to decide. The count is the property.
    expect(h.repository.attempts.length).toBe(afterLive);
    expect(await badgesOf(h)).toEqual(['first-bounty.v1']);
  });
});

describe('the surface', () => {
  it('grows the registry, not the primitive list', async () => {
    const h = harness();
    expect(h.runtime.actions()).toContain('achievements.list');
    expect(h.runtime.actions()).toContain('achievements.catalogue');
    expect(h.runtime.actions()).toContain('achievements.project');
    // The domain exists, which is what makes `search({type: 'achievements'})`
    // and `discover('achievements')` answer rather than throw.
    expect(h.runtime.domains()).toContain('achievements');
    expect(h.runtime.describeDomain('achievements').capabilities.map((entry) => entry.name)).toEqual([
      'achievements.read',
      'achievements.catalogue',
    ]);
  });

  it('declares exactly one persisted event type, and it is its own', async () => {
    // The registry throws on a second owner, so a declaration here about
    // somebody else's event would make the feature that owns it fail to install
    // on the day it declares it. Asserting the list rather than the throw.
    const { persistedEvents } = achievementsFeature({
      repository: new LogBackedRepository(new InMemoryStateStore()),
    });
    expect(persistedEvents).toEqual([ACHIEVEMENT_AWARDED]);
  });

  it('is not degraded by anything, because it needs nothing', async () => {
    // No `requires`: a badge is derived from the log, which is the platform's
    // own persistence boundary rather than another feature's capability. That is
    // what keeps the removal test honest — removing achievements does not make
    // another feature degraded, and removing the bounty feature does not make
    // this one throw.
    const h = harness();
    expect(h.runtime.degraded().size).toBe(0);
  });

  it('answers for a character nobody has heard of, rather than throwing', async () => {
    // A caller asking about a brand-new agent needs an answer, and an exception
    // is not one. The flag is what keeps "earned nothing" and "no record" apart.
    const h = harness();
    const view = (await h.runtime.runAction(ACHIEVEMENTS_LIST, { agentId: AGENT })) as AchievementsView;
    expect(view).toEqual({ agentId: AGENT, badges: [], count: 0, exists: false });
  });

  it('refuses a payload that names no agent, and says which action and why', async () => {
    const h = harness();
    for (const action of ['achievements.list', 'achievements.project']) {
      await expect(h.runtime.runAction(action, {})).rejects.toThrow(/agent-id-not-a-string/);
      await expect(h.runtime.runAction(action, { agentId: '' })).rejects.toThrow(/agent-id-empty/);
      await expect(h.runtime.runAction(action, 'agent-1')).rejects.toThrow(/not-an-object/);
      // The code is part of the error because a transport turns this into a 400
      // and a caller cannot act on a rejection that does not say what was wrong.
      await expect(h.runtime.runAction(action, {})).rejects.toMatchObject({
        code: 'malformed-input',
      });
    }
  });

  it('returns the catalogue, with wording that is stored on no row', async () => {
    const h = harness();
    const entries = (await h.runtime.runAction('achievements.catalogue', {})) as readonly {
      code: string;
      slug: string;
      version: number;
      title: string;
      trigger: string;
    }[];
    expect(entries.map((entry) => entry.code).sort()).toEqual(
      ACHIEVEMENT_RULES.map((rule) => rule.code).sort(),
    );
    for (const entry of entries) {
      expect(entry.slug).not.toContain('.v');
      expect(entry.version).toBe(1);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.trigger.length).toBeGreaterThan(0);
    }
  });
});
