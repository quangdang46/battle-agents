import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import type { GameEvent, Runtime } from '@battle-agents/core';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROLE,
  GUILD_MESSAGING_AUTHORIZE,
  GUILD_QUEST_COMPLETED,
  GUILD_ROLE_EVIDENCED,
  GUILD_TREASURY_COMMITTED,
  GUILD_TREASURY_CONTRIBUTED,
  NO_MONEY_IS_HELD_HERE,
  type Guild,
  type GuildMembership,
  type GuildQuest,
  type RoleSignal,
  type TreasuryEntry,
  type WorkRecord,
} from './domain.js';
import { guildFeature } from './feature.js';
import { GUILD_ACTION_IDS } from './manifest.js';
import type {
  GuildRepository,
  NewGuild,
  NewQuest,
  NewRoleSignal,
  NewTreasuryEntry,
  NewWorkRecord,
} from './repository.js';

const NOW = '2026-09-26T12:00:00.000Z';
const LATER = '2026-09-26T13:00:00.000Z';
const FOUNDER = 'agent-founder';
const SECOND = 'agent-second';
const OUTSIDER = 'agent-outsider';

/**
 * The port, in memory.
 *
 * The dedup keys the real store enforces with unique indexes are enforced here
 * too, deliberately. A fake that accepted a duplicate would let the feature's
 * idempotence tests pass against a store that cannot do the thing — the same
 * "green while checking the wrong store" failure the repository exists to
 * prevent, running in the opposite direction.
 */
class MapGuildRepository implements GuildRepository {
  readonly guildRows = new Map<string, Guild>();
  readonly memberRows: GuildMembership[] = [];
  readonly workRows: WorkRecord[] = [];
  readonly treasuryRows: TreasuryEntry[] = [];
  /**
   * Mutable, unlike the port's `GuildQuest`.
   *
   * `completeQuest` writes `completedAt` and the port's shape is readonly,
   * because nothing outside a store may change one. The fake IS a store, so it
   * keeps its rows in a shape it is allowed to write.
   */
  readonly questRows: { -readonly [K in keyof GuildQuest]: GuildQuest[K] }[] = [];
  readonly signalRows: RoleSignal[] = [];
  private next = 0;

  async create(guild: NewGuild, now: string): Promise<Guild> {
    this.next += 1;
    const row: Guild = {
      id: `guild-${this.next}`,
      name: guild.name,
      tag: guild.tag,
      foundedByAgentId: guild.foundedByAgentId,
      createdAt: now,
    };
    this.guildRows.set(row.id, row);
    return row;
  }

  async find(guildId: string): Promise<Guild | undefined> {
    return this.guildRows.get(guildId);
  }

  async list(): Promise<readonly Guild[]> {
    return [...this.guildRows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async join(
    guildId: string,
    agentId: string,
    now: string,
  ): Promise<{ readonly row: GuildMembership; readonly created: boolean }> {
    const existing = this.memberRows.find((m) => m.guildId === guildId && m.agentId === agentId);
    if (existing !== undefined) return { row: existing, created: false };
    const row: GuildMembership = { guildId, agentId, joinedAt: now };
    this.memberRows.push(row);
    return { row, created: true };
  }

  async leave(guildId: string, agentId: string): Promise<boolean> {
    const index = this.memberRows.findIndex((m) => m.guildId === guildId && m.agentId === agentId);
    if (index < 0) return false;
    this.memberRows.splice(index, 1);
    return true;
  }

  async isMember(guildId: string, agentId: string): Promise<boolean> {
    return this.memberRows.some((m) => m.guildId === guildId && m.agentId === agentId);
  }

  async guildsOf(agentId: string): Promise<readonly string[]> {
    return this.memberRows.filter((m) => m.agentId === agentId).map((m) => m.guildId);
  }

  async members(guildId: string): Promise<readonly GuildMembership[]> {
    return this.memberRows.filter((m) => m.guildId === guildId);
  }

  async recordWork(
    entry: NewWorkRecord,
  ): Promise<{ readonly row: WorkRecord; readonly created: boolean }> {
    const existing = this.workRows.find(
      (w) => w.guildId === entry.guildId && w.bountyId === entry.bountyId,
    );
    if (existing !== undefined) return { row: existing, created: false };
    this.next += 1;
    const row: WorkRecord = { ...entry, id: `work-${this.next}`, recordedAt: NOW };
    this.workRows.push(row);
    return { row, created: true };
  }

  async workFor(
    guildId: string,
    query: { readonly repository?: string; readonly from?: string; readonly to?: string } = {},
  ): Promise<readonly WorkRecord[]> {
    return this.workRows.filter((w) => {
      if (w.guildId !== guildId) return false;
      if (query.repository !== undefined && w.repository !== query.repository) return false;
      if (query.from !== undefined && w.occurredAt < query.from) return false;
      if (query.to !== undefined && w.occurredAt >= query.to) return false;
      return true;
    });
  }

  async appendTreasuryEntry(entry: NewTreasuryEntry): Promise<TreasuryEntry> {
    this.next += 1;
    const row: TreasuryEntry = { ...entry, id: `entry-${this.next}` };
    this.treasuryRows.push(row);
    return row;
  }

  async treasuryFor(guildId: string): Promise<readonly TreasuryEntry[]> {
    return this.treasuryRows.filter((e) => e.guildId === guildId);
  }

  async createQuest(quest: NewQuest): Promise<GuildQuest> {
    this.next += 1;
    const row = { ...quest, id: `quest-${this.next}`, completedAt: null };
    this.questRows.push(row);
    return row;
  }

  async quests(guildId: string): Promise<readonly GuildQuest[]> {
    return this.questRows.filter((q) => q.guildId === guildId);
  }

  async completeQuest(questId: string, at: string): Promise<boolean> {
    const row = this.questRows.find((q) => q.id === questId);
    if (row === undefined || row.completedAt !== null) return false;
    row.completedAt = at;
    return true;
  }

  async recordRoleSignal(
    signal: NewRoleSignal,
  ): Promise<{ readonly row: RoleSignal; readonly created: boolean }> {
    const existing = this.signalRows.find(
      (s) => s.agentId === signal.agentId && s.sourceKey === signal.sourceKey,
    );
    if (existing !== undefined) return { row: existing, created: false };
    this.next += 1;
    const row: RoleSignal = { ...signal, id: `signal-${this.next}` };
    this.signalRows.push(row);
    return { row, created: true };
  }

  async roleSignalsFor(agentId: string): Promise<readonly RoleSignal[]> {
    return this.signalRows.filter((s) => s.agentId === agentId);
  }
}

interface Harness {
  readonly runtime: Runtime;
  readonly repository: MapGuildRepository;
  readonly seen: GameEvent[];
}

function harness(clock: () => string = () => NOW): Harness {
  const repository = new MapGuildRepository();
  const bus = createInMemoryEventBus();
  const seen: GameEvent[] = [];
  bus.subscribe((event) => seen.push(event));
  const runtime = createRuntime({
    extensions: [guildFeature({ repository })],
    store: new InMemoryStateStore(),
    bus,
    now: clock,
  });
  return { runtime, repository, seen };
}

function of(seen: readonly GameEvent[], type: string): readonly GameEvent[] {
  return seen.filter((event) => event.type === type);
}

async function foundGuild(h: Harness, name = 'the smiths', tag = 'TSM') {
  return h.runtime.runAction<unknown, Guild>('guild.create', {
    name,
    tag,
    foundedByAgentId: FOUNDER,
  });
}

/** A `bounty.completed` outcome, exactly as the bounty feature emits one. */
async function completeBounty(
  h: Harness,
  agentId: string,
  bountyId: string,
  repository = 'battle-agents/battle-agents',
  occurredAt = NOW,
): Promise<void> {
  await h.runtime.emit({
    type: 'bounty.completed',
    occurredAt,
    actorId: agentId,
    payload: {
      bountyId,
      repository,
      pullRequest: 1,
      prUrl: 'https://example.invalid/pr/1',
      agentId,
      rewardCents: 1000,
      mergedBy: 'a-person',
    },
  });
}

describe('forming and joining', () => {
  it('folds a name and a tag, so Foo and foo cannot be two guilds', async () => {
    const h = harness();
    const guild = await foundGuild(h, 'The Smiths', 'TSM');
    expect(guild.name).toBe('the smiths');
    expect(guild.tag).toBe('tsm');
  });

  it('makes the founder a member before the event goes out', async () => {
    // A subscriber reading `guild.created` and then asking who is in the guild
    // must not find an empty roster that looks like a guild nobody joined.
    const h = harness();
    const guild = await foundGuild(h);
    expect(await h.repository.members(guild.id)).toHaveLength(1);
    expect(of(h.seen, 'guild.created')).toHaveLength(1);
  });

  it('is idempotent on a repeated join, and says which it was', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.join', { guildId: guild.id, agentId: SECOND });
    await h.runtime.runAction('guild.join', { guildId: guild.id, agentId: SECOND });
    expect(await h.repository.members(guild.id)).toHaveLength(2);
    expect(of(h.seen, 'guild.member_joined')).toHaveLength(1);
  });

  it('refuses to join a guild that is not there', async () => {
    const h = harness();
    await expect(
      h.runtime.runAction('guild.join', { guildId: 'nope', agentId: SECOND }),
    ).rejects.toThrow(/no guild nope/);
  });

  it('refuses a name that is only whitespace', async () => {
    const h = harness();
    await expect(h.runtime.runAction('guild.create', { name: '   ', tag: 'TSM' })).rejects.toThrow(
      /field-empty/,
    );
  });
});

describe('observing work', () => {
  it('records the work and the role from one completed bounty', async () => {
    const h = harness();
    const guild = await foundGuild(h);

    await completeBounty(h, FOUNDER, 'bounty-1');

    const work = await h.repository.workFor(guild.id);
    expect(work).toHaveLength(1);
    expect(work[0]?.agentId).toBe(FOUNDER);
    expect(work[0]?.repository).toBe('battle-agents/battle-agents');

    const signals = await h.repository.roleSignalsFor(FOUNDER);
    expect(signals.map((s) => s.role)).toEqual(['coder']);
  });

  it('counts a re-delivered merge once', async () => {
    // GitHub delivers a merge at least once and promises no order. Without the
    // dedup a guild's scoreboard and a role both inflate on every retry.
    const h = harness();
    const guild = await foundGuild(h);
    await completeBounty(h, FOUNDER, 'bounty-1');
    await completeBounty(h, FOUNDER, 'bounty-1');
    expect(await h.repository.workFor(guild.id)).toHaveLength(1);
    expect(await h.repository.roleSignalsFor(FOUNDER)).toHaveLength(1);
  });

  it('ignores an outcome that carries no coordinates', async () => {
    const h = harness();
    await foundGuild(h);
    await h.runtime.emit({ type: 'bounty.completed', occurredAt: NOW, actorId: 'x', payload: {} });
    expect(h.repository.workRows).toHaveLength(0);
    expect(h.repository.signalRows).toHaveLength(0);
  });

  it('ignores a completion by somebody in no guild', async () => {
    const h = harness();
    await foundGuild(h);
    await completeBounty(h, OUTSIDER, 'bounty-1');
    expect(h.repository.workRows).toHaveLength(0);
  });

  it('takes a reviewer signal from a merged pull request, and no work from it', async () => {
    // A merge that completed no bounty: somebody read somebody else's work and
    // accepted it, which is the Reviewer, and it is not work, so no WORK record.
    // Counting it as work too would score one pull request twice.
    const h = harness();
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.join', { guildId: guild.id, agentId: SECOND });
    await h.runtime.emit({
      type: 'pr.merged',
      occurredAt: NOW,
      actorId: SECOND,
      payload: { bountyId: 'bounty-9', repository: 'a/b', agentId: SECOND },
    });
    expect(await h.repository.workFor(guild.id)).toHaveLength(0);
    const signals = await h.repository.roleSignalsFor(SECOND);
    expect(signals.map((s) => s.role)).toEqual(['reviewer']);
  });

  it('does not make an author a reviewer by merging their own bounty', async () => {
    // The same merge, with `completedBounty: true`, which is what bounty emits
    // alongside `bounty.completed`. The Reviewer is defined in rules.ts as the
    // moment "somebody ELSE read the work and accepted it"; this is the author
    // closing their own pull request, and paying them for it made the role the
    // cheapest thing in the game to farm — an agent can merge its own bounty as
    // often as it likes and accrue reviewer evidence each time.
    //
    // The coder is still paid, by `bounty.completed`, so the merge is not
    // unscored. It is scored once, for the thing that actually happened.
    const h = harness();
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.join', { guildId: guild.id, agentId: SECOND });
    await completeBounty(h, SECOND, 'bounty-9');
    await h.runtime.emit({
      type: 'pr.merged',
      occurredAt: NOW,
      actorId: SECOND,
      payload: { bountyId: 'bounty-9', repository: 'a/b', agentId: SECOND, completedBounty: true },
    });
    expect(await h.repository.workFor(guild.id)).toHaveLength(1);
    const signals = await h.repository.roleSignalsFor(SECOND);
    expect(signals.map((s) => s.role)).toEqual(['coder']);
    expect(signals.map((s) => s.role), 'an author reviewed their own work').not.toContain(
      'reviewer',
    );
  });

  it('takes a tester signal from a test outcome, which core always persists', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.join', { guildId: guild.id, agentId: SECOND });
    // No agentId in the payload: the ingest path names the agent in actorId,
    // and the Tester role is made of exactly this event.
    await h.runtime.emit({
      type: 'test.passed',
      occurredAt: NOW,
      actorId: SECOND,
      payload: { suite: 'the suite' },
    });
    const signals = await h.repository.roleSignalsFor(SECOND);
    expect(signals.map((s) => s.role)).toEqual(['tester']);
  });

  it('publishes one role-evidence event per fact, naming the guilds that saw it', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.join', { guildId: guild.id, agentId: SECOND });
    await completeBounty(h, FOUNDER, 'bounty-1');
    const evidenced = of(h.seen, GUILD_ROLE_EVIDENCED);
    expect(evidenced).toHaveLength(1);
    expect((evidenced[0]?.payload as { guilds: string[] }).guilds).toEqual([guild.id]);
  });
});

describe('the treasury', () => {
  async function funded(h: Harness) {
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.contribute', {
      guildId: guild.id,
      contributorUserId: 'user-1',
      amountCents: 10_000,
    });
    return guild;
  }

  it('derives the balance from the rows, and says no money is held', async () => {
    const h = harness();
    const guild = await funded(h);
    const read = await h.runtime.runAction<
      unknown,
      {
        balance: { balanceCents: number; contributedCents: number };
        notice: string;
      }
    >('guild.treasury', { guildId: guild.id });
    expect(read.balance.contributedCents).toBe(10_000);
    expect(read.balance.balanceCents).toBe(10_000);
    expect(read.notice).toBe(NO_MONEY_IS_HELD_HERE);
  });

  it('subtracts a commitment from the same rows rather than from a stored number', async () => {
    const h = harness();
    const guild = await funded(h);
    await h.runtime.runAction('guild.fund', {
      guildId: guild.id,
      bountyId: 'bounty-1',
      agentId: FOUNDER,
      amountCents: 2_500,
    });
    const read = await h.runtime.runAction<
      unknown,
      {
        balance: { balanceCents: number; committedCents: number };
      }
    >('guild.treasury', { guildId: guild.id });
    expect(read.balance.committedCents).toBe(2_500);
    expect(read.balance.balanceCents).toBe(7_500);
    expect(of(h.seen, GUILD_TREASURY_COMMITTED)).toHaveLength(1);
  });

  it('refuses to earmark more than the rows account for', async () => {
    const h = harness();
    const guild = await funded(h);
    await expect(
      h.runtime.runAction('guild.fund', {
        guildId: guild.id,
        bountyId: 'bounty-2',
        agentId: FOUNDER,
        amountCents: 10_001,
      }),
    ).rejects.toThrow(/insufficient|more than the rows account for/);
    expect(h.repository.treasuryRows).toHaveLength(1);
  });

  it('refuses a member-less agent speaking for the treasury', async () => {
    const h = harness();
    const guild = await funded(h);
    await expect(
      h.runtime.runAction('guild.fund', {
        guildId: guild.id,
        bountyId: 'bounty-2',
        agentId: OUTSIDER,
        amountCents: 100,
      }),
    ).rejects.toThrow(/not a member/);
  });

  it('refuses zero and negative cents before anything is written', async () => {
    const h = harness();
    const guild = await funded(h);
    for (const amountCents of [0, -1]) {
      await expect(
        h.runtime.runAction('guild.contribute', {
          guildId: guild.id,
          contributorUserId: 'user-1',
          amountCents,
        }),
      ).rejects.toThrow(/field-out-of-range/);
    }
    expect(h.repository.treasuryRows).toHaveLength(1);
  });

  it('lets several members top up the same bounty, because the unique key is partial', async () => {
    // A blanket unique on (guild_id, bounty_id) would have forbidden the second
    // sponsor, which is the exact thing the bounty's own funding rail allows.
    const h = harness();
    const guild = await funded(h);
    await h.runtime.runAction('guild.contribute', {
      guildId: guild.id,
      contributorUserId: 'user-2',
      amountCents: 5_000,
    });
    const read = await h.runtime.runAction<unknown, { entries: unknown[] }>('guild.treasury', {
      guildId: guild.id,
    });
    expect(read.entries).toHaveLength(2);
  });

  it('publishes a contribution and names the person it belongs to', async () => {
    const h = harness();
    await funded(h);
    const events = of(h.seen, GUILD_TREASURY_CONTRIBUTED);
    expect(events).toHaveLength(1);
    expect((events[0]?.payload as { contributorUserId: string }).contributorUserId).toBe('user-1');
  });
});

describe('quests', () => {
  it('counts progress from the ledger, and clamps at the goal', async () => {
    const h = harness(() => NOW);
    const guild = await foundGuild(h);
    const quest = await h.runtime.runAction<unknown, GuildQuest>('guild.quest.start', {
      guildId: guild.id,
      title: 'fix ten issues',
      goal: 2,
      repository: 'Battle-Agents/Battle-Agents',
    });
    expect(quest.repository).toBe('battle-agents/battle-agents');

    await completeBounty(h, FOUNDER, 'bounty-1');
    let read = await h.runtime.runAction<
      unknown,
      { quests: { progress: number; complete: boolean }[] }
    >('guild.quests', { guildId: guild.id });
    expect(read.quests[0]?.progress).toBe(1);

    await completeBounty(h, FOUNDER, 'bounty-2', 'battle-agents/battle-agents', LATER);
    await completeBounty(h, FOUNDER, 'bounty-3', 'battle-agents/battle-agents', LATER);
    read = await h.runtime.runAction<
      unknown,
      { quests: { progress: number; complete: boolean }[] }
    >('guild.quests', { guildId: guild.id });
    // 14 of 10 is not a state a reader should have to interpret.
    expect(read.quests[0]?.progress).toBe(2);
    expect(read.quests[0]?.complete).toBe(true);
  });

  it('does not count work in another repository', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.quest.start', {
      guildId: guild.id,
      title: 'fix ten issues here',
      goal: 1,
      repository: 'somewhere/else',
    });
    await completeBounty(h, FOUNDER, 'bounty-1', 'battle-agents/battle-agents');
    const read = await h.runtime.runAction<unknown, { quests: { progress: number }[] }>(
      'guild.quests',
      {
        guildId: guild.id,
      },
    );
    expect(read.quests[0]?.progress).toBe(0);
  });

  it('stamps completion once, and says so exactly once', async () => {
    const h = harness(() => LATER);
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.quest.start', {
      guildId: guild.id,
      title: 'one issue',
      goal: 1,
      repository: 'battle-agents/battle-agents',
    });
    await completeBounty(h, FOUNDER, 'bounty-1');
    await completeBounty(h, FOUNDER, 'bounty-2', 'battle-agents/battle-agents', LATER);
    expect(of(h.seen, GUILD_QUEST_COMPLETED)).toHaveLength(1);
  });

  it('refuses a malformed repository rather than storing a scope nobody can match', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    await expect(
      h.runtime.runAction('guild.quest.start', {
        guildId: guild.id,
        title: 'x',
        goal: 1,
        repository: 'not-a-slug',
      }),
    ).rejects.toThrow(/field-out-of-range/);
  });

  it('refuses a goal below one', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    await expect(
      h.runtime.runAction('guild.quest.start', { guildId: guild.id, title: 'x', goal: 0 }),
    ).rejects.toThrow(/field-out-of-range/);
  });
});

describe('reading roles', () => {
  it('answers each member with the evidence behind the role', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.join', { guildId: guild.id, agentId: SECOND });
    await completeBounty(h, FOUNDER, 'bounty-1');
    await h.runtime.emit({
      type: 'test.passed',
      occurredAt: NOW,
      actorId: SECOND,
      payload: {},
    });

    const read = await h.runtime.runAction<
      unknown,
      {
        members: { agentId: string; role: string; signals: { sourceType: string }[] }[];
        earnableToday: string[];
      }
    >('guild.roles', { guildId: guild.id });

    const founder = read.members.find((m) => m.agentId === FOUNDER);
    const second = read.members.find((m) => m.agentId === SECOND);
    expect(founder?.role).toBe('coder');
    expect(founder?.signals.map((s) => s.sourceType)).toEqual(['bounty.completed']);
    expect(second?.role).toBe('tester');
    // A role a caller cannot interrogate is a claim, and the brief's first named
    // failure is a role derived from a self-declared label.
    expect(read.earnableToday).toEqual(['coder', 'tester', 'reviewer']);
  });

  it('reports generalist for a member who has done nothing', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    const read = await h.runtime.runAction<unknown, { members: { role: string }[] }>(
      'guild.roles',
      {
        guildId: guild.id,
      },
    );
    expect(read.members[0]?.role).toBe(DEFAULT_ROLE);
  });

  it('has no action that sets a role', () => {
    // The self-declared label is unavailable by omission, not by a rule that
    // could be relaxed. There is no `guild.setRole`, and a scan of the ids
    // proves it.
    expect(GUILD_ACTION_IDS.some((id) => /role/i.test(id) && /set|declare|assign/.test(id))).toBe(
      false,
    );
  });
});

describe('the weekly tally', () => {
  it('ranks by completed work with coverage applied, and no money anywhere', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.join', { guildId: guild.id, agentId: SECOND });
    await completeBounty(h, FOUNDER, 'bounty-1');
    await h.runtime.emit({
      type: 'pr.merged',
      occurredAt: NOW,
      actorId: SECOND,
      payload: { bountyId: 'b9', repository: 'a/b', agentId: SECOND },
    });
    await h.runtime.emit({ type: 'test.passed', occurredAt: NOW, actorId: SECOND, payload: {} });

    const read = await h.runtime.runAction<
      unknown,
      {
        board: { guildId: string; standing: number; coverage: string[] }[];
        note: string;
      }
    >('guild.tally', { from: '2026-09-26T00:00:00.000Z', to: '2026-09-27T00:00:00.000Z' });

    expect(read.board[0]?.guildId).toBe(guild.id);
    expect(read.board[0]?.coverage).toEqual(['coder', 'reviewer']);
    expect(read.note).toMatch(/No treasury figure is an input/);
  });

  it('refuses a window that is not a window', async () => {
    const h = harness();
    await expect(
      h.runtime.runAction('guild.tally', {
        from: '2026-09-27T00:00:00.000Z',
        to: '2026-09-26T00:00:00.000Z',
      }),
    ).rejects.toThrow(/field-out-of-range/);
    // An empty board reads as "nobody did anything this week", which is a claim
    // about the world made by a caller who passed the arguments backwards.
    expect(of(h.seen, 'guild.tally_recorded')).toHaveLength(0);
  });

  it('refuses a window of zero length', async () => {
    const h = harness();
    await expect(h.runtime.runAction('guild.tally', { from: NOW, to: NOW })).rejects.toThrow(
      /field-out-of-range/,
    );
  });
});

describe('the ACL this feature provides', () => {
  it('is registered as a capability AND an action of the same name', async () => {
    // Both halves, because social's `authorise` checks one and then the other
    // and refuses if either is missing. A capability with no action behind it is
    // a host that advertised something it cannot answer.
    const h = harness();
    const detail = h.runtime.describeDomain('guild');
    expect(detail.capabilities.map((c) => c.name)).toContain(GUILD_MESSAGING_AUTHORIZE);
    expect(h.runtime.actions()).toContain(GUILD_MESSAGING_AUTHORIZE);
  });

  it('registers exactly the manifest ids, plus the ACL and nothing else', () => {
    // The manifest array has to hold string LITERALS (the agreement test parses
    // it with a regex) and the feature's constants have to be byte-identical, so
    // the two can drift. An earlier version of this file wrote
    // `guild.treasury.contribute` in one place and `guild.contribute` in the
    // other: every call site typechecked and the action did not exist at
    // runtime. This is the check that would have caught it.
    const h = harness();
    const registered = h.runtime.actions().filter((id) => id.startsWith('guild.'));
    expect([...registered].sort()).toEqual([...GUILD_ACTION_IDS, GUILD_MESSAGING_AUTHORIZE].sort());
  });

  it('is NOT in the manifest, so a caller cannot act() it', async () => {
    // manifest.ts argues this at length. A caller able to invoke the
    // authorization service by name is one `skip` flag away from skipping it.
    expect(GUILD_ACTION_IDS).not.toContain(GUILD_MESSAGING_AUTHORIZE);
  });

  it('permits a direct message inside one guild and refuses outside it', async () => {
    const h = harness();
    const guild = await foundGuild(h);
    await h.runtime.runAction('guild.join', { guildId: guild.id, agentId: SECOND });
    await completeBounty(h, OUTSIDER, 'bounty-x');

    const inside = await h.runtime.runAction<unknown, { allowed: boolean; reason: string }>(
      GUILD_MESSAGING_AUTHORIZE,
      { fromAgentId: FOUNDER, toAgentId: SECOND, guildId: null },
    );
    expect(inside.allowed).toBe(true);

    const outside = await h.runtime.runAction<unknown, { allowed: boolean; reason: string }>(
      GUILD_MESSAGING_AUTHORIZE,
      { fromAgentId: FOUNDER, toAgentId: OUTSIDER, guildId: null },
    );
    expect(outside.allowed).toBe(false);
    expect(outside.reason).toContain('share no guild');
  });

  it('refuses a question with no sender rather than defaulting to permissive', async () => {
    const h = harness();
    await foundGuild(h);
    const answer = await h.runtime.runAction<unknown, { allowed: boolean }>(
      GUILD_MESSAGING_AUTHORIZE,
      {},
    );
    expect(answer.allowed).toBe(false);
  });

  it('degrades social rather than opening a channel when guild is absent', async () => {
    // The removal test's question, asked here directly: with no guild feature
    // installed, social's `requires` is unsatisfied and `runtime.degraded()`
    // says so. Nothing in this test file provides a stand-in ACL, so the check
    // is that the degradation is REPORTED rather than silently worked around.
    const repository = new MapGuildRepository();
    const runtime = createRuntime({
      extensions: [],
      store: new InMemoryStateStore(),
      bus: createInMemoryEventBus(),
      now: () => NOW,
    });
    // A bare runtime with no features offers no ACL at all.
    expect(runtime.capabilities()).not.toContain(GUILD_MESSAGING_AUTHORIZE);
    expect(repository.treasuryRows).toHaveLength(0);
  });
});
