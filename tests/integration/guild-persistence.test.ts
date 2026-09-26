import {
  closeDatabasePool,
  createDatabase,
  DrizzleAgentRepository,
  DrizzleGuildRepository,
  sql,
  users,
} from '@battle-agents/db';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The guild adapter against a real database.
 *
 * A repository test is only worth anything where the STORE is doing the work.
 * Three things in this feature are enforced by the database rather than by the
 * feature's own code, and a fake store proves none of them:
 *
 *   the DEDUP on (guild_id, bounty_id) and (agent_id, source_key), which is
 *     what stops a re-delivered GitHub merge counting twice
 *   the PARTIAL unique on treasury commitments, which must forbid a second
 *     earmark for one bounty while still allowing a second member to top up
 *   the shape CHECK, so no row is half a contribution and half a commitment
 *
 * And one invariant is checked against the CATALOG rather than through the
 * adapter: `checkNoCachedTotals` forbids `guilds.balance_cents` and
 * `guild_quests.progress`, and reading information_schema here is what proves
 * the migration did not quietly add one.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const NOW = '2026-09-26T12:00:00.000Z';
const LATER = '2026-09-26T14:00:00.000Z';

let pool: Pool;
let database: ReturnType<typeof createDatabase>;
let repository: DrizzleGuildRepository;
let ownerId: string;
let outsider: string;

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

  const githubId = `guild-owner-${Math.random().toString(36).slice(2)}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  ownerId = owner?.id ?? '';

  const agents = new DrizzleAgentRepository(database);
  const created = [];
  for (const label of ['founder', 'second', 'outsider']) {
    const agent = await agents.create(
      {
        ownerId,
        name: `guild-${label}-${Math.random().toString(36).slice(2)}`,
        harness: 'claude',
      },
      NOW,
    );
    created.push(agent.id);
  }
  // The agents are all created because the fixtures below count ROWS, and a
  // guild with one member is not the case being tested. Only the outsider is
  // named: the second agent is needed as data and read through `created`.
  outsider = created[2] ?? '';
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

/**
 * A guild with a fresh founder, a fresh name and a fresh tag.
 *
 * The tag is UNIQUE, which the tests above depend on: the same tag twice is the
 * cheapest way to prove the index exists, and it is also why every fixture has
 * to mint its own.
 */
async function freshGuild(name = 'the persisters') {
  const first = await agents();
  const suffix = Math.random().toString(36).slice(2, 8);
  // Folded here because the FEATURE folds, not the store: `readGuildCreate`
  // lowercases before it writes, and going around the feature is exactly the
  // path the folded CHECK exists to refuse. There is a test below that does
  // precisely that and expects the refusal.
  const guild = await repository.create(
    { name: `${name}-${suffix}`.toLowerCase(), tag: `g${suffix}`, foundedByAgentId: first },
    NOW,
  );
  await repository.join(guild.id, first, NOW);
  return guild;
}

const agents = async (): Promise<string> => {
  const githubId = `guild-agent-${Math.random().toString(36).slice(2)}`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const agent = await new DrizzleAgentRepository(database).create(
    { ownerId: owner?.id ?? ownerId, name: githubId, harness: 'claude' },
    NOW,
  );
  return agent.id;
};

describe('membership, over a real database', () => {
  it('reports the second join as already there rather than failing', async () => {
    const guild = await freshGuild();
    const first = await agents();
    expect((await repository.join(guild.id, first, NOW)).created).toBe(true);
    const again = await repository.join(guild.id, first, LATER);
    expect(again.created).toBe(false);
    // The ORIGINAL join instant, because a re-join does not make somebody a
    // newer member and a roster sorted by tenure would otherwise refresh.
    expect(again.row.joinedAt).toBe(NOW);
  });

  it('answers the ACL’s question without a table scan being the only way', async () => {
    const guild = await freshGuild();
    const first = await agents();
    await repository.join(guild.id, first, NOW);
    expect(await repository.isMember(guild.id, first)).toBe(true);
    expect(await repository.isMember(guild.id, outsider)).toBe(false);
    expect(await repository.guildsOf(first)).toContain(guild.id);
  });

  it('deletes the membership and says whether there was one', async () => {
    const guild = await freshGuild();
    const first = await agents();
    await repository.join(guild.id, first, NOW);
    expect(await repository.leave(guild.id, first)).toBe(true);
    expect(await repository.leave(guild.id, first)).toBe(false);
  });
});

describe('the work ledger is deduplicated by the database', () => {
  it('records an outcome once and reports the second as already counted', async () => {
    const guild = await freshGuild();
    const first = await agents();
    const entry = {
      guildId: guild.id,
      agentId: first,
      bountyId: crypto.randomUUID(),
      repository: 'battle-agents/battle-agents',
      sourceType: 'bounty.completed',
      occurredAt: NOW,
    };
    expect((await repository.recordWork(entry)).created).toBe(true);
    const again = await repository.recordWork({ ...entry, occurredAt: LATER });
    // A GitHub merge is delivered at least once. Without the unique index the
    // guild's quest counter and its tally both inflate on every retry.
    expect(again.created).toBe(false);
    expect(await repository.workFor(guild.id)).toHaveLength(1);
    expect(again.row.occurredAt).toBe(NOW);
  });

  it('lets two guilds count the same bounty, because membership is not single', async () => {
    const a = await freshGuild('alpha');
    const b = await freshGuild('bravo');
    const first = await agents();
    await repository.join(a.id, first, NOW);
    await repository.join(b.id, first, NOW);
    const entry = {
      agentId: first,
      bountyId: crypto.randomUUID(),
      repository: 'a/b',
      sourceType: 'bounty.completed',
      occurredAt: NOW,
    };
    expect((await repository.recordWork({ ...entry, guildId: a.id })).created).toBe(true);
    // The unique key is (guild_id, bounty_id), not bounty_id: the question is
    // "has THIS guild counted it", and an agent in two guilds has done one
    // thing that both are entitled to count.
    expect((await repository.recordWork({ ...entry, guildId: b.id })).created).toBe(true);
  });

  it('filters a window half-openly, so a boundary belongs to the caller', async () => {
    const guild = await freshGuild();
    const first = await agents();
    await repository.recordWork({
      guildId: guild.id,
      agentId: first,
      bountyId: crypto.randomUUID(),
      repository: 'a/b',
      sourceType: 'bounty.completed',
      occurredAt: NOW,
    });
    expect(await repository.workFor(guild.id, { from: NOW, to: LATER })).toHaveLength(1);
    // `to` is exclusive, so a window that ends exactly at the delivery excludes
    // it rather than depending on whether the two instants were written the same
    // way.
    expect(await repository.workFor(guild.id, { from: NOW, to: NOW })).toHaveLength(0);
  });
});

describe('the treasury shape is a constraint, not a convention', () => {
  it('refuses a row that is half a contribution and half a commitment', async () => {
    const guild = await freshGuild();
    await expect(
      repository.appendTreasuryEntry({
        guildId: guild.id,
        kind: 'contribution',
        amountCents: 100,
        contributorUserId: ownerId,
        bountyId: crypto.randomUUID(),
        committedByAgentId: null,
        createdAt: NOW,
      }),
    ).rejects.toThrow();
  });

  it('refuses an unfolded name or tag, because two guilds must not render alike', async () => {
    // The unique indexes are only case-blind if the stored value is folded, and
    // the FEATURE is what folds. A write that goes around the feature is what
    // this catches, and it is a write the composition root never makes — which
    // is why the constraint rather than a convention is the right home for it.
    const first = await agents();
    await expect(
      repository.create(
        {
          name: 'The Persisters',
          tag: `T${Math.random().toString(36).slice(2, 8)}`,
          foundedByAgentId: first,
        },
        NOW,
      ),
    ).rejects.toThrow();
  });

  it('refuses a zero or negative amount, which is not a contribution of nothing', async () => {
    const guild = await freshGuild();
    for (const amountCents of [0, -500]) {
      await expect(
        repository.appendTreasuryEntry({
          guildId: guild.id,
          kind: 'contribution',
          amountCents,
          contributorUserId: ownerId,
          bountyId: null,
          committedByAgentId: null,
          createdAt: NOW,
        }),
      ).rejects.toThrow();
    }
  });

  it('forbids a second earmark for the same bounty and allows a second top-up', async () => {
    const guild = await freshGuild();
    const bountyId = crypto.randomUUID();
    const first = await agents();
    const commitment = {
      guildId: guild.id,
      kind: 'commitment' as const,
      amountCents: 1_000,
      contributorUserId: null,
      committedByAgentId: first,
      createdAt: NOW,
    };
    expect((await repository.appendTreasuryEntry({ ...commitment, bountyId })).amountCents).toBe(
      1_000,
    );
    // A retried `guild.fund` after a timeout the caller cannot distinguish from
    // success. The PARTIAL index is what makes it a no-op rather than a second
    // earmark — and partial, because the same column pair must still allow a
    // second member to contribute toward the same bounty.
    await expect(repository.appendTreasuryEntry({ ...commitment, bountyId })).rejects.toThrow();
    const topUp = await repository.appendTreasuryEntry({
      guildId: guild.id,
      kind: 'contribution',
      amountCents: 2_000,
      contributorUserId: ownerId,
      bountyId: null,
      committedByAgentId: null,
      createdAt: NOW,
    });
    expect(topUp.amountCents).toBe(2_000);
  });
});

describe('the derived balance agrees with the view that exists for it', () => {
  it('matches guild_treasury_balances to the cent', async () => {
    // The view exists so a query can join a balance without re-deriving it, and
    // the feature folds the same rows itself. Two answers to one question is
    // how they stop agreeing, so the fold and the view are compared rather than
    // trusted.
    const guild = await freshGuild();
    const first = await agents();
    await repository.appendTreasuryEntry({
      guildId: guild.id,
      kind: 'contribution',
      amountCents: 5_000,
      contributorUserId: ownerId,
      bountyId: null,
      committedByAgentId: null,
      createdAt: NOW,
    });
    await repository.appendTreasuryEntry({
      guildId: guild.id,
      kind: 'contribution',
      amountCents: 1_500,
      contributorUserId: ownerId,
      bountyId: null,
      committedByAgentId: null,
      createdAt: NOW,
    });
    await repository.appendTreasuryEntry({
      guildId: guild.id,
      kind: 'commitment',
      amountCents: 2_000,
      contributorUserId: null,
      bountyId: crypto.randomUUID(),
      committedByAgentId: first,
      createdAt: NOW,
    });

    const entries = await repository.treasuryFor(guild.id);
    const folded = entries.reduce(
      (acc, e) =>
        e.kind === 'contribution'
          ? { ...acc, in: acc.in + e.amountCents, out: acc.out }
          : { ...acc, in: acc.in, out: acc.out + e.amountCents },
      { in: 0, out: 0 },
    );

    const viewed = await database.execute(sql`
      SELECT contributed_cents, committed_cents, balance_cents
      FROM guild_treasury_balances WHERE guild_id = ${guild.id}
    `);
    const row = viewed.rows[0] as
      { contributed_cents: number; committed_cents: number; balance_cents: number } | undefined;
    expect(row?.contributed_cents).toBe(folded.in);
    expect(row?.committed_cents).toBe(folded.out);
    expect(row?.balance_cents).toBe(folded.in - folded.out);
  });

  it('reports a guild with no rows as zero, not as absent', async () => {
    // An empty treasury and a missing guild are different situations, and only
    // the LEFT JOIN tells them apart.
    const guild = await freshGuild();
    const viewed = await database.execute(sql`
      SELECT contributed_cents, balance_cents
      FROM guild_treasury_balances WHERE guild_id = ${guild.id}
    `);
    const row = viewed.rows[0] as { contributed_cents: number; balance_cents: number } | undefined;
    expect(row?.contributed_cents).toBe(0);
    expect(row?.balance_cents).toBe(0);
  });
});

describe('quest completion is stamped once', () => {
  it('does not move completed_at when the goal is crossed twice', async () => {
    const guild = await freshGuild();
    const quest = await repository.createQuest({
      guildId: guild.id,
      title: 'two issues',
      repository: 'a/b',
      goal: 1,
      createdAt: NOW,
    });
    expect(await repository.completeQuest(quest.id, LATER)).toBe(true);
    expect(await repository.completeQuest(quest.id, '2026-09-27T00:00:00.000Z')).toBe(false);
    const [after] = await repository.quests(guild.id);
    // WHEN the goal was first met is a fact; a counter that moves is not.
    expect(after?.completedAt).toBe(LATER);
  });
});

describe('the migration added no cached totals', () => {
  it('has no balance column on guilds and no progress counter on guild_quests', async () => {
    // Read from the catalog, not from the schema file: drizzle-kit keeps its
    // ledger in a separate schema, so `db:migrate` reporting success is not
    // evidence the database is the shape the source says. AGENTS.md calls that
    // out, and this is where it is checked for the guild tables.
    const result = await database.execute(sql`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('guilds', 'guild_quests')
    `);
    const columns = (result.rows as unknown as readonly { table_name: string; column_name: string }[]).map(
      (row) => `${row.table_name}.${row.column_name}`,
    );
    expect(columns).toContain('guilds.name');
    expect(columns.some((c) => c.startsWith('guilds.') && c.endsWith('_cents'))).toBe(false);
    expect(columns).not.toContain('guild_quests.progress');
  });

  it('keeps the money in integer cents', async () => {
    const result = await database.execute(sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'guild_treasury_entries'
        AND column_name = 'amount_cents'
    `);
    expect((result.rows[0] as { data_type: string } | undefined)?.data_type).toBe('integer');
  });
});
