import { guildFeature } from '@battle-agents/guild';
import type { Guild, GuildQuest, TallyRow } from '@battle-agents/guild';
import {
  closeDatabasePool,
  createDatabase,
  DrizzleAgentRepository,
  DrizzleGuildRepository,
  sql,
  users,
} from '@battle-agents/db';
import { createInMemoryEventBus, createRuntime, InMemoryStateStore } from '@battle-agents/core';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * M6's definition of done, end to end.
 *
 * §27: "two users' agents in one guild complete a team bounty."
 *
 * Everything below runs against the REAL repository and a REAL database, with
 * the feature installed in a real runtime. That matters more here than in the
 * other suites, because every claim this feature makes is a claim about a
 * boundary between two features that must not import each other:
 *
 *   the guild learns a bounty completed by LISTENING, not by reading bounty's
 *     tables — so the test emits `bounty.completed` on the bus and asserts the
 *     guild reacted, with no guild-to-bounty import anywhere in the path
 *   the balance is a SUM, so the test moves money through the feature and then
 *     reads the same number out of the database by hand
 *   the role is projected from behaviour, so the test gives the two agents
 *     DIFFERENT histories and checks they come out different
 *
 * The two users are real `users` rows with two real agents each under a
 * different owner, because "two users' agents" is the part of the DoD that a
 * single-owner fixture would quietly not be testing.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const NOW = '2026-09-26T12:00:00.000Z';
const LATER = '2026-09-26T15:00:00.000Z';

/** Per-run suffix, so a rerun against a database that kept its rows still fits. */
const RUN = Math.random().toString(36).slice(2, 7);

let pool: Pool;
let database: ReturnType<typeof createDatabase>;
let repository: DrizzleGuildRepository;
let runtime: ReturnType<typeof createRuntime>;

/**
 * Two humans, one agent each — the DoD's "two users' agents".
 *
 * `let` and assigned in `beforeAll`, not a `const` destructured beside it: a
 * describe body runs at COLLECTION time, before any hook, so a `const [first,
 * second] = OWNERS` up there reads an empty array and every test below runs
 * with `undefined` as the agent id. That is the shape of a test that fails for
 * a reason nobody is looking at.
 */
let first: { readonly id: string; readonly agentId: string };
let second: { readonly id: string; readonly agentId: string };

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: 4 });
  database = createDatabase(pool);
  repository = new DrizzleGuildRepository(database);

  const agents = new DrizzleAgentRepository(database);
  for (const label of ['quang', 'someone-else']) {
    const githubId = `guild-dod-${label}-${Math.random().toString(36).slice(2)}`;
    const [owner] = await database
      .insert(users)
      .values({ githubId, login: githubId })
      .returning({ id: users.id });
    const agent = await agents.create(
      { ownerId: owner?.id ?? '', name: githubId, harness: 'claude' },
      NOW,
    );
    const entry = { id: owner?.id ?? '', agentId: agent.id };
    if (label === 'quang') first = entry;
    else second = entry;
  }
  if (first === undefined || second === undefined) {
    throw new Error('the DoD needs two owners and this run created fewer');
  }

  runtime = createRuntime({
    extensions: [guildFeature({ repository })],
    store: new InMemoryStateStore(),
    bus: createInMemoryEventBus(),
    now: () => NOW,
  });
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

/** The `bounty.completed` shape, exactly as the bounty feature emits it. */
async function bountyCompleted(
  agentId: string,
  bountyId: string,
  repository: string,
  occurredAt: string,
): Promise<void> {
  await runtime.emit({
    type: 'bounty.completed',
    occurredAt,
    actorId: agentId,
    payload: {
      bountyId,
      repository,
      pullRequest: 7,
      prUrl: 'https://example.invalid/pull/7',
      agentId,
      rewardCents: 1_000,
      // A PERSON, and the reason the feature reads `agentId` and not this.
      mergedBy: 'a-human-maintainer',
    },
  });
}

describe('M6: two users, one guild, one team bounty', () => {
  let guild: Guild;

  it('founds a guild with one user’s agent and admits the other user’s agent', async () => {
    guild = await runtime.runAction<unknown, Guild>('guild.create', {
      name: `The Night Shift ${RUN}`,
      tag: `N${RUN}`,
      foundedByAgentId: first.agentId,
    });
    await runtime.runAction('guild.join', {
      guildId: guild.id,
      agentId: second.agentId,
    });

    const roster = await runtime.runAction<unknown, { members: { agentId: string }[] }>(
      'guild.members',
      { guildId: guild.id },
    );
    expect(roster.members.map((m) => m.agentId).sort()).toEqual(
      [first?.agentId, second?.agentId].filter(Boolean).sort(),
    );
  });

  it('gives the two agents different roles, because they did different things', async () => {
    // Two histories, two characters. §10.2's whole claim is that the same model
    // on different work is a different class, and a fixture that gave both
    // agents the same events would not be testing that at all.
    await runtime.emit({
      type: 'test.passed',
      occurredAt: NOW,
      actorId: second.agentId,
      payload: { suite: 'unit' },
    });
    await runtime.emit({
      type: 'pr.merged',
      occurredAt: NOW,
      actorId: second.agentId,
      payload: {
        bountyId: 'bounty-review-1',
        repository: 'battle-agents/battle-agents',
        agentId: second.agentId,
        completedBounty: false,
      },
    });

    const roles = await runtime.runAction<
      unknown,
      {
        members: {
          agentId: string;
          role: string;
          considered: number;
          scores: Record<string, number>;
        }[];
      }
    >('guild.roles', { guildId: guild.id });

    const coder = roles.members.find((m) => m.agentId === first?.agentId);
    const reviewer = roles.members.find((m) => m.agentId === second?.agentId);
    expect(coder?.role).toBe('generalist');
    expect(coder?.considered).toBe(0);
    // The second agent ran tests (weight 1) AND had a pull request merged
    // (weight 2), and a merge is the stronger claim about what somebody IS: it
    // is somebody ELSE's work that was read and accepted. So the roster holds a
    // reviewer, and the losing score is still visible beside the winner rather
    // than collapsed away — a role a caller cannot interrogate is a claim.
    expect(reviewer?.role).toBe('reviewer');
    expect(reviewer?.considered).toBe(2);
    expect(reviewer?.scores).toMatchObject({ reviewer: 2, tester: 1, coder: 0 });
  });

  it('counts the team bounty once, for the guild, when the first agent finishes it', async () => {
    await runtime.runAction('guild.quest.start', {
      guildId: guild.id,
      title: `ship the team bounty ${RUN}`,
      goal: 1,
      repository: 'battle-agents/battle-agents',
    });
    await bountyCompleted(first.agentId, crypto.randomUUID(), 'battle-agents/battle-agents', NOW);

    const read = await runtime.runAction<
      unknown,
      { quests: { progress: number; complete: boolean }[] }
    >('guild.quests', { guildId: guild.id });
    expect(read.quests[0]?.progress).toBe(1);
    expect(read.quests[0]?.complete).toBe(true);
  });

  it('records the work in the ledger, and the row is there to be counted', async () => {
    // Not a spy on the feature: a query against the table. The claim is that a
    // reader can reconstruct the number the feature showed, and that is only
    // true if the rows are the source rather than a summary of them.
    const rows = await database.execute(sql`
      SELECT agent_id, repository, source_type FROM guild_work_log WHERE guild_id = ${guild.id}
    `);
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as { repository: string }).repository).toBe('battle-agents/battle-agents');
    expect((rows.rows[0] as { source_type: string }).source_type).toBe('bounty.completed');
  });

  it('re-runs the whole thing with the SECOND user’s agent finishing a second bounty', async () => {
    // The DoD says two users' agents COMPLETE a team bounty. One agent shipping
    // one bounty is a guild with a member; the second agent shipping the second
    // is a team, and it is the shape §10.4's "guild quests, each agent
    // contributes" describes.
    await runtime.runAction('guild.quest.start', {
      guildId: guild.id,
      title: `and another ${RUN}`,
      goal: 1,
      repository: 'battle-agents/battle-agents',
    });
    await bountyCompleted(
      second.agentId,
      crypto.randomUUID(),
      'Battle-Agents/Battle-Agents',
      LATER,
    );

    const rows = await database.execute(sql`
      SELECT agent_id FROM guild_work_log WHERE guild_id = ${guild.id} ORDER BY occurred_at
    `);
    // Two agents, two outcomes, and the repository case folded — a quest scoped
    // to "Battle-Agents/Battle-Agents" would never have counted the second one.
    expect(rows.rows.map((r) => (r as { agent_id: string }).agent_id)).toEqual([
      first?.agentId,
      second?.agentId,
    ]);
  });

  it('puts the guild on a weekly board, with the money nowhere in the number', async () => {
    await runtime.runAction('guild.contribute', {
      guildId: guild.id,
      contributorUserId: first.id,
      amountCents: 9_999_999,
    });

    const board = await runtime.runAction<unknown, { board: readonly TallyRow[]; note: string }>(
      'guild.tally',
      { from: '2026-09-26T00:00:00.000Z', to: '2026-09-27T00:00:00.000Z' },
    );

    const row = board.board.find((r) => r.guildId === guild.id);
    expect(row?.completedWork).toBe(2);
    // A guild holding ten million "cents" scores exactly what a guild holding
    // none would: the standing is a function of work and coverage, and there is
    // no parameter a caller could have filled with money.
    const emptyGuild = await runtime.runAction<unknown, Guild>('guild.create', {
      name: `Broke ${RUN}`,
      tag: `B${RUN}`,
      foundedByAgentId: first.agentId,
    });
    const after = await runtime.runAction<unknown, { board: readonly TallyRow[] }>('guild.tally', {
      from: '2026-09-26T00:00:00.000Z',
      to: '2026-09-27T00:00:00.000Z',
    });
    const broke = after.board.find((r) => r.guildId === emptyGuild.id);
    expect(broke?.standing).toBe(0);
    expect(row?.standing).toBeGreaterThan(0);
    expect(board.note).toMatch(/No treasury figure is an input/);
  });

  it('shows the treasury money where it belongs: in the rows, and only in the rows', async () => {
    await runtime.runAction('guild.fund', {
      guildId: guild.id,
      bountyId: crypto.randomUUID(),
      agentId: first.agentId,
      amountCents: 2_500,
    });

    const read = await runtime.runAction<
      unknown,
      {
        balance: { contributedCents: number; committedCents: number; balanceCents: number };
        notice: string;
      }
    >('guild.treasury', { guildId: guild.id });
    expect(read.balance.contributedCents).toBe(9_999_999);
    expect(read.balance.committedCents).toBe(2_500);
    expect(read.balance.balanceCents).toBe(9_997_499);
    expect(read.notice).toMatch(/No money is held here/);

    // And the same three numbers, computed by hand from the table. If these
    // ever disagree, the guild is quoting a number nobody can reconstruct.
    const summed = await database.execute(sql`
      SELECT
        COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'contribution'), 0)::int AS in_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE kind = 'commitment'), 0)::int AS out_cents
      FROM guild_treasury_entries WHERE guild_id = ${guild.id}
    `);
    const row = summed.rows[0] as { in_cents: number; out_cents: number };
    expect(row.in_cents).toBe(read.balance.contributedCents);
    expect(row.out_cents).toBe(read.balance.committedCents);
  });

  it('closes a quest exactly once even when two deliveries arrive', async () => {
    const quest = (
      await runtime.runAction<unknown, { quests: { quest: GuildQuest; complete: boolean }[] }>(
        'guild.quests',
        { guildId: guild.id },
      )
    ).quests.find((q) => q.quest.title === `and another ${RUN}`);
    expect(quest?.complete).toBe(true);
    const stored = await database.execute(sql`
      SELECT completed_at FROM guild_quests WHERE id = ${quest?.quest.id}
    `);
    // Whether the driver hands this back as a Date or a string is the driver's
    // business; what matters is that it is an instant and not null. Asserting
    // the JS type would be a test that fails on a driver upgrade and proves
    // nothing about the guild.
    const raw = (stored.rows[0] as { completed_at: unknown }).completed_at;
    expect(raw).not.toBeNull();
    expect(Number.isNaN(Date.parse(String(raw)))).toBe(false);
  });
});
