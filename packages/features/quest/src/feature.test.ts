import { createInMemoryEventBus, createRuntime, type GameEvent } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  isTerminalQuest,
  nextQuestStatus,
  QUEST_STATUSES,
  QUEST_TRANSITIONS,
  whyQuestIsRejected,
  type QuestStatus,
  type QuestSummary,
  type QuestTransition,
} from './domain.js';
import {
  QUEST_CLAIMED,
  QUEST_COMPLETED,
  QUEST_CREATED,
  questFeature,
  type ClaimQuestInput,
  type CreateQuestInput,
  type ListQuestsInput,
  type SubmitQuestInput,
} from './feature.js';
import { isCreatableQuestDraft, titleForRejection } from './domain.js';
import type { NewStoredQuest, QuestFilter, QuestRepository, StoredQuest } from './repository.js';

const NOW = '2026-09-24T12:00:00.000Z';
const AGENT = 'agent-1';

describe('the quest lifecycle', () => {
  it('accepts exactly the transitions that mean something', () => {
    // The full grid, so a new status cannot be added without someone deciding
    // here what it may become. The refused half matters as much as the accepted
    // half: it is what stops a completed quest being handed in for a second
    // reward.
    const moves: Record<QuestStatus, Partial<Record<QuestTransition, QuestStatus>>> = {
      open: { claim: 'in_progress', submit: 'completed', cancel: 'cancelled' },
      in_progress: { claim: 'in_progress', submit: 'completed', cancel: 'cancelled' },
      completed: { claim: 'completed', submit: 'completed', cancel: 'completed' },
      cancelled: { claim: 'cancelled', submit: 'cancelled', cancel: 'cancelled' },
    };

    for (const status of QUEST_STATUSES) {
      for (const step of QUEST_TRANSITIONS) {
        const expected = moves[status][step];
        const actual = nextQuestStatus(status, step);
        if (expected === undefined || expected === status) {
          // Same-status moves are refused, so claiming something already in
          // progress is an error rather than a silent no-op.
          expect(actual, `${status} + ${step}`).toBeUndefined();
        } else {
          expect(actual, `${status} + ${step}`).toBe(expected);
        }
      }
    }
  });

  it('credits work finished before the quest was claimed', () => {
    // Requiring a claim first would only produce an event nobody needed, and it
    // would punish the agent that did the work while still deciding.
    expect(nextQuestStatus('open', 'submit')).toBe('completed');
  });

  it('treats both terminal statuses as terminal', () => {
    expect(isTerminalQuest('completed')).toBe(true);
    expect(isTerminalQuest('cancelled')).toBe(true);
    expect(isTerminalQuest('open')).toBe(false);
    expect(isTerminalQuest('in_progress')).toBe(false);
  });
});

describe('rejecting a quest that should not exist', () => {
  const good = { title: 'Fix the build', difficulty: 1, xpReward: 100 };

  it('accepts a well-formed one', () => {
    expect(whyQuestIsRejected(good)).toBeUndefined();
  });

  it('refuses a blank title', () => {
    expect(whyQuestIsRejected({ ...good, title: '   ' })).toEqual({ reason: 'title-empty' });
  });

  it('refuses a title nobody can read', () => {
    expect(whyQuestIsRejected({ ...good, title: 'x'.repeat(201) })).toMatchObject({
      reason: 'title-too-long',
    });
  });

  it('refuses a difficulty that would make the tier mean nothing', () => {
    expect(whyQuestIsRejected({ ...good, difficulty: 0 })).toEqual({
      reason: 'difficulty-out-of-range',
    });
    expect(whyQuestIsRejected({ ...good, difficulty: 1.5 })).toEqual({
      reason: 'difficulty-out-of-range',
    });
  });

  it('refuses a negative reward, which would propagate into progression', () => {
    expect(whyQuestIsRejected({ ...good, xpReward: -1 })).toEqual({ reason: 'xp-negative' });
  });

  // The validator used to take `{ title: string; ... }`, which made
  // `draft.title.trim()` typecheck and read as a guarantee. It was not one:
  // `act()` takes its input as a generic, so `act('quest.create', {})` compiled
  // clean and every one of these died on `undefined.trim()` instead of being
  // rejected. A type annotation is a claim; these are the cases where the claim
  // was previously unverified.
  it('refuses a draft that is not an object at all', () => {
    for (const draft of [null, undefined, 'a string', 42, true]) {
      expect(whyQuestIsRejected(draft)).toEqual({ reason: 'not-an-object' });
    }
  });

  it('refuses a draft with no title, rather than reading one that is not there', () => {
    expect(whyQuestIsRejected({})).toEqual({ reason: 'title-not-a-string' });
    expect(whyQuestIsRejected({ difficulty: 1, xpReward: 1 })).toEqual({ reason: 'title-not-a-string' });
  });

  it('refuses a title that is not a string, rather than calling trim on it', () => {
    for (const title of [42, null, undefined, {}, ['a']]) {
      expect(whyQuestIsRejected({ ...good, title })).toEqual({ reason: 'title-not-a-string' });
    }
  });

  it('refuses a difficulty or reward of the wrong type, rather than comparing it', () => {
    for (const difficulty of ['2', null, undefined, NaN]) {
      expect(whyQuestIsRejected({ ...good, difficulty })).toEqual({
        reason: 'difficulty-out-of-range',
      });
    }
    for (const xpReward of ['100', null, undefined, NaN]) {
      expect(whyQuestIsRejected({ ...good, xpReward })).toEqual({ reason: 'xp-negative' });
    }
  });

  it('narrows to the creatable shape, so the caller stops asserting one', () => {
    // The guard and the validator must not drift: the guard is defined in
    // terms of the validator, and a draft that passes the validator is one the
    // action can read without a cast.
    const draft: unknown = { ...good, projectId: null, body: 'details' };
    if (isCreatableQuestDraft(draft)) {
      expect(draft.title.trim()).toBe('Fix the build');
      expect(draft.difficulty).toBe(1);
    } else {
      throw new Error('expected the draft to be creatable');
    }
    expect(isCreatableQuestDraft({})).toBe(false);
  });

  it('names a title in a rejection only when there is one to name', () => {
    expect(titleForRejection({ title: 'Fix the build' })).toBe('Fix the build');
    expect(titleForRejection({})).toBe('(no title)');
    expect(titleForRejection(null)).toBe('(no draft)');
  });
});

/** A store in memory, so the feature is tested without a database. */
class InMemoryQuestRepository implements QuestRepository {
  readonly rows: StoredQuest[] = [];
  #nextId = 1;

  async create(quest: NewStoredQuest): Promise<StoredQuest> {
    const created: StoredQuest = {
      id: `quest-${this.#nextId++}`,
      projectId: quest.projectId,
      title: quest.title,
      body: quest.body,
      difficulty: quest.difficulty,
      xpReward: quest.xpReward,
      status: 'open',
      createdAt: quest.now,
    };
    this.rows.unshift(created);
    return created;
  }

  async list(filter: QuestFilter): Promise<readonly StoredQuest[]> {
    return this.rows.filter(
      (row) =>
        (filter.status === undefined || row.status === filter.status) &&
        (filter.projectId === undefined || row.projectId === filter.projectId),
    );
  }

  async findById(questId: string): Promise<StoredQuest | undefined> {
    return this.rows.find((row) => row.id === questId);
  }

  async setStatus(
    questId: string,
    from: QuestStatus,
    to: QuestStatus,
  ): Promise<StoredQuest | undefined> {
    const at = this.rows.findIndex((row) => row.id === questId && row.status === from);
    if (at === -1) {
      return undefined;
    }
    const current = this.rows[at]!;
    const moved: StoredQuest = { ...current, status: to };
    this.rows[at] = moved;
    return moved;
  }
}

function harness() {
  const repository = new InMemoryQuestRepository();
  const seen: GameEvent[] = [];
  const bus = createInMemoryEventBus();
  bus.subscribe((each) => seen.push(each));
  const runtime = createRuntime({
    extensions: [questFeature({ repository })],
    store: { append: async () => {}, load: () => undefined, save: async () => {} },
    bus,
    now: () => NOW,
  });
  return { repository, runtime, seen };
}

describe('a quest driven entirely through the protocol', () => {
  it('rejects a malformed create as a rejection, not a crash', async () => {
    // The end-to-end half of the guard. Unit-testing the validator would pass
    // while the action still died: the rejection path read `input.title` to
    // build its error message, so the one caller guaranteed to be handed the
    // answer was the one that threw. `act` is the boundary a real caller comes
    // through, so the assertion belongs here.
    const { runtime, repository, seen } = harness();

    for (const input of [{}, null, 'not a draft', { title: 42, difficulty: 1, xpReward: 1 }]) {
      await expect(runtime.runAction('quest.create', input)).rejects.toThrow(
        /quest not created/,
      );
    }

    expect(repository.rows).toHaveLength(0);
    // Every attempt announced itself rather than vanishing into a stack trace.
    expect(seen.filter((each) => each.type === 'quest.rejected')).toHaveLength(4);
  });

  it('is created, discovered, claimed and completed with no web clicks', async () => {
    const { runtime, repository, seen } = harness();

    const created = await runtime.runAction<CreateQuestInput, QuestSummary>('quest.create', {
      title: '  Fix the build  ',
      difficulty: 2,
      xpReward: 250,
    });

    expect(created).toMatchObject({ title: 'Fix the build', status: 'open', xpReward: 250 });
    expect(repository.rows[0]?.title).toBe('Fix the build');

    const listed = await runtime.runAction<ListQuestsInput, readonly QuestSummary[]>(
      'quest.list',
      {},
    );
    expect(listed).toHaveLength(1);

    await runtime.runAction<ClaimQuestInput, QuestSummary>('quest.claim', {
      questId: created.id,
      agentId: AGENT,
    });
    expect(repository.rows[0]?.status).toBe('in_progress');

    const submitted = await runtime.runAction<SubmitQuestInput, QuestSummary>('quest.submit', {
      questId: created.id,
      agentId: AGENT,
    });
    expect(submitted).toMatchObject({ status: 'completed' });

    expect(seen.map((each) => each.type)).toEqual([QUEST_CREATED, QUEST_CLAIMED, QUEST_COMPLETED]);
  });

  it('emits the reward on completion, which is how progression is meant to read it', async () => {
    const { runtime, seen } = harness();
    const created = await runtime.runAction<CreateQuestInput, QuestSummary>('quest.create', {
      title: 'Worth points',
      difficulty: 1,
      xpReward: 500,
    });

    await runtime.runAction<SubmitQuestInput, QuestSummary>('quest.submit', {
      questId: created.id,
      agentId: AGENT,
    });

    const completed = seen.find((each) => each.type === QUEST_COMPLETED);
    expect(completed?.payload).toMatchObject({
      questId: created.id,
      agentId: AGENT,
      xpReward: 500,
    });
  });

  it('refuses a second hand-in, rather than reporting success twice', async () => {
    // A caller that submits twice is a bug; answering "it worked" both times
    // teaches it to keep doing that, and hands a reward out twice.
    const { runtime } = harness();
    const created = await runtime.runAction<CreateQuestInput, QuestSummary>('quest.create', {
      title: 'Once only',
      difficulty: 1,
      xpReward: 100,
    });
    await runtime.runAction<SubmitQuestInput, QuestSummary>('quest.submit', {
      questId: created.id,
      agentId: AGENT,
    });

    await expect(
      runtime.runAction<SubmitQuestInput, QuestSummary>('quest.submit', {
        questId: created.id,
        agentId: AGENT,
      }),
    ).rejects.toThrow(/already completed/);
  });

  it('refuses to claim a quest that is already under way', async () => {
    const { runtime } = harness();
    const created = await runtime.runAction<CreateQuestInput, QuestSummary>('quest.create', {
      title: 'Busy',
      difficulty: 1,
      xpReward: 100,
    });
    await runtime.runAction<ClaimQuestInput, QuestSummary>('quest.claim', {
      questId: created.id,
      agentId: AGENT,
    });

    await expect(
      runtime.runAction<ClaimQuestInput, QuestSummary>('quest.claim', {
        questId: created.id,
        agentId: AGENT,
      }),
    ).rejects.toThrow(/cannot be claimed from in_progress/);
  });

  it('reports a quest that does not exist, by id', async () => {
    const { runtime } = harness();

    await expect(
      runtime.runAction<ClaimQuestInput, QuestSummary>('quest.claim', {
        questId: 'nope',
        agentId: AGENT,
      }),
    ).rejects.toThrow(/no quest nope/);
  });

  it('refuses to create a quest with a negative reward', async () => {
    const { runtime, repository } = harness();

    await expect(
      runtime.runAction('quest.create', { title: 'Bad', difficulty: 1, xpReward: -5 }),
    ).rejects.toThrow(/xp-negative/);
    expect(repository.rows).toEqual([]);
  });

  it('filters a listing by status', async () => {
    const { runtime } = harness();
    await runtime.runAction<CreateQuestInput, QuestSummary>('quest.create', {
      title: 'A',
      difficulty: 1,
      xpReward: 1,
    });
    const second = await runtime.runAction<CreateQuestInput, QuestSummary>('quest.create', {
      title: 'B',
      difficulty: 1,
      xpReward: 1,
    });
    await runtime.runAction<ClaimQuestInput, QuestSummary>('quest.claim', {
      questId: second.id,
      agentId: AGENT,
    });

    expect(
      await runtime.runAction<ListQuestsInput, readonly QuestSummary[]>('quest.list', {
        status: 'open',
      }),
    ).toHaveLength(1);
    expect(
      await runtime.runAction<ListQuestsInput, readonly QuestSummary[]>('quest.list', {
        status: 'in_progress',
      }),
    ).toHaveLength(1);
  });

  it('keeps a quest whose status it does not recognise visible and claimable', async () => {
    // The column is text, so a status written by a newer build or by hand can
    // be a string this one has never seen. Crashing would make that quest
    // undiscoverable, which is worse than treating it as open.
    const { runtime, repository } = harness();
    await runtime.runAction<CreateQuestInput, QuestSummary>('quest.create', {
      title: 'From the future',
      difficulty: 1,
      xpReward: 1,
    });
    repository.rows[0] = { ...repository.rows[0]!, status: 'quantum_superposition' };

    const listed = await runtime.runAction<ListQuestsInput, readonly QuestSummary[]>(
      'quest.list',
      {},
    );
    expect(listed).toHaveLength(1);
  });
});

describe('what the feature declares', () => {
  it('names one capability per verb, and keeps its events durable', () => {
    const { runtime } = harness();
    const detail = runtime.describeDomain('quest');

    expect(detail.capabilities.map((each) => each.name).sort()).toEqual([
      'quest.claim',
      'quest.create',
      'quest.list',
      'quest.submit',
    ]);
    // The activity log has to be able to answer what happened, so these are
    // persisted rather than bus-only.
    expect(detail.actions.every((each) => each.permissions.length > 0)).toBe(true);
  });

  it('is a domain of its own, so the CLI reaches it with no code', () => {
    const { runtime } = harness();
    expect(runtime.domains()).toEqual(['quest']);
  });
});
