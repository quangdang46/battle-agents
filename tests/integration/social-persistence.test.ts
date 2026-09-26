import { createApplicationApi } from '@battle-agents/api';
import { defineAction } from '@battle-agents/core';
import {
  achievements,
  agents,
  agentStats,
  closeDatabasePool,
  createDatabase,
  DrizzleSocialRepository,
  messages,
  projects,
  users,
} from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import { count, and, eq, isNotNull, isNull } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeSharedApi } from '../../apps/web/src/routes.js';
import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';

/**
 * Social against a real database, and the one machine-native path.
 *
 * Three things are worth proving here that an in-memory test cannot:
 *
 *   the null shape survives the round trip. A DM and a broadcast are the same
 *   row with different columns set, and the only thing keeping them apart is
 *   which column is null — so a repository that mapped `null` to `undefined`
 *   would make the two indistinguishable while every unit test stayed green.
 *
 *   the foreign key does what the schema says. `to_agent_id` is declared
 *   `onDelete: 'set null'`, so a message to an agent that is later deleted
 *   survives with no recipient. The alternative, cascading, would erase the
 *   record of what somebody was told, which is the opposite of what a durable
 *   log is for.
 *
 *   the board keeps a character who has never been written about. The join is
 *   a LEFT JOIN for that reason, and an inner join would drop a new agent from
 *   a board they are leading without anything failing.
 *
 * It also drives the whole send through the Application API with no HTTP client
 * and no browser, which is the machine-native rule: `agent-battle social send`
 * and a CI script reach this action the same way, through `act()`.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const ACL = 'guild.messaging.authorize';
const AT = '2026-09-25T00:00:00.000Z';

let pool: Pool;
let database: Database;
let repository: DrizzleSocialRepository;
let writerId: string;
let readerId: string;
let goneId: string;

/** Agents this run created, so cleanup deletes nothing the seed owns. */
const created: string[] = [];

function requireDatabase(): void {
  if (process.env[DATABASE_URL_VARIABLE] === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
}

async function createAgent(name: string): Promise<string> {
  const [owner] = await database
    .insert(users)
    .values({ githubId: `social-${name}-${Math.random().toString(36).slice(2)}`, login: name })
    .returning({ id: users.id });
  const [agent] = await database
    .insert(agents)
    .values({ userId: owner?.id ?? '', name, harness: 'claude', level: 1, xp: 0 })
    .returning({ id: agents.id });
  const id = agent?.id ?? '';
  created.push(id);
  return id;
}

/**
 * A stand-in for the guild feature's ACL.
 *
 * Installed into the composed runtime for the duration of one assertion and
 * removed after, so the refusal that follows each send is the same refusal a
 * build with no ACL provider gives — which is the state this repository is
 * actually in.
 */
function permitAll(allowed: boolean, reason: string) {
  return {
    id: 'guild',
    capabilities: [{ name: ACL, description: 'Decide whether one agent may reach another.' }],
    actionDefs: [
      defineAction({
        id: ACL,
        permissions: [ACL],
        run: async () => ({ allowed, reason }),
      }),
    ],
  };
}

beforeAll(async () => {
  requireDatabase();
  pool = new Pool({ connectionString: process.env[DATABASE_URL_VARIABLE], max: 4 });
  database = createDatabase(pool);
  repository = new DrizzleSocialRepository(database);

  writerId = await createAgent(`social-writer-${process.pid}`);
  readerId = await createAgent(`social-reader-${process.pid}`);
  goneId = await createAgent(`social-gone-${process.pid}`);
});

afterAll(async () => {
  for (const id of created) {
    // `from_agent_id` cascades, so this takes the messages too. Only this run's
    // agents: the seeded ones are shared with the e2e stage.
    await database.delete(agents).where(eq(agents.id, id));
  }
  await closeSharedApi();
  await closeSharedRuntime();
  await closeDatabasePool(pool);
});

describe('the social repository, over a real database', () => {
  it('round-trips a direct message with its guild column still null', async () => {
    const stored = await repository.append({
      fromAgentId: writerId,
      toAgentId: readerId,
      guildId: null,
      body: 'Good luck on issue 42.',
      createdAt: AT,
    });

    expect(stored.toAgentId).toBe(readerId);
    expect(stored.guildId).toBeNull();

    const inbox = await repository.inbox(readerId, 10);
    expect(inbox.find((row) => row.id === stored.id)).toMatchObject({
      body: 'Good luck on issue 42.',
      guildId: null,
    });
  });

  it('round-trips a guild broadcast with its recipient column still null', async () => {
    // The two shapes are one row, so nothing but the nulls tells them apart. A
    // repository that dropped a null on the way out would make a broadcast look
    // like a DM to an agent that does not exist.
    const stored = await repository.append({
      fromAgentId: writerId,
      toAgentId: null,
      guildId: '00000000-0000-0000-0000-0000000000a1',
      body: 'standup at ten',
      createdAt: AT,
    });

    expect(stored.guildId).toBe('00000000-0000-0000-0000-0000000000a1');
    expect(stored.toAgentId).toBeNull();

    const [row] = await database.select().from(messages).where(eq(messages.id, stored.id));
    expect(row?.toAgentId).toBeNull();
    expect(row?.guildId).not.toBeNull();
  });

  it('keeps a message whose recipient is later deleted, with no recipient', async () => {
    // `onDelete: 'set null'` rather than cascade: the row is the record of what
    // somebody was told, and a record that vanishes with its recipient is the
    // one thing a durable log must not do.
    const stored = await repository.append({
      fromAgentId: writerId,
      toAgentId: goneId,
      guildId: null,
      body: 'this is for an agent that will not exist by the time you read it',
      createdAt: AT,
    });

    await database.delete(agents).where(eq(agents.id, goneId));

    const [row] = await database.select().from(messages).where(eq(messages.id, stored.id));
    expect(row).toBeDefined();
    expect(row?.toAgentId).toBeNull();
    expect(row?.body).toContain('will not exist');
  });

  it('returns the newest message first, and only what is waiting for that agent', async () => {
    const early = await repository.append({
      fromAgentId: writerId,
      toAgentId: readerId,
      guildId: null,
      body: 'earlier',
      createdAt: '2026-09-25T00:00:01.000Z',
    });
    const later = await repository.append({
      fromAgentId: writerId,
      toAgentId: readerId,
      guildId: null,
      body: 'later',
      createdAt: '2026-09-25T00:00:02.000Z',
    });

    const inbox = await repository.inbox(readerId, 2);
    expect(inbox.map((row) => row.id)).toEqual([later.id, early.id]);
    // What one agent was sent is not what another has waiting.
    expect((await repository.inbox(writerId, 10)).map((row) => row.id)).not.toContain(early.id);
  });

  it('builds a profile from the character, its stats, its achievements and its projects', async () => {
    const [writer] = await database.select().from(agents).where(eq(agents.id, writerId)).limit(1);
    if (writer === undefined) {
      throw new Error('the writer agent vanished mid-test');
    }
    const stats = {
      battlesWon: 6,
      battlesLost: 2,
      prsOpened: 11,
      prsMerged: 7,
      prsRejected: 1,
    };
    await database
      .insert(agentStats)
      .values({ agentId: writerId, ...stats })
      .onConflictDoUpdate({ target: agentStats.agentId, set: stats });
    await database
      .insert(achievements)
      .values({ agentId: writerId, code: 'social-fixture' })
      .onConflictDoNothing();
    const projectName = `social-project-${process.pid}`;
    await database
      .insert(projects)
      .values({ userId: writer.userId, name: projectName })
      .onConflictDoNothing();

    const record = await repository.profile(writerId);
    expect(record).toMatchObject({ agentId: writerId, harness: 'claude', ...stats });
    expect(record?.achievementCodes).toContain('social-fixture');
    expect(record?.projectNames).toContain(projectName);
    // Private, and the reason this record is wider than a profile: the store
    // needed it to find those projects, so stripping it is the feature's job.
    expect(record?.userId).toBe(writer.userId);
  });

  it('answers zero rather than undefined for a character with no stats row', async () => {
    const record = await repository.profile(readerId);
    expect(record).toBeDefined();
    expect(record).toMatchObject({ battlesWon: 0, battlesLost: 0, achievementCodes: [] });
  });

  it('keeps a character who has no stats row on the board', async () => {
    // The LEFT JOIN, with a character this run created and never written about.
    // An inner join drops them from a board they are leading and nothing fails —
    // the board is simply shorter. The level is set high so the assertion is
    // about the JOIN and not about how many rows the shared test table holds.
    const fresh = await createAgent(`social-boardless-${process.pid}`);
    await database.update(agents).set({ level: 999 }).where(eq(agents.id, fresh));
    const [row] = await database.select().from(agentStats).where(eq(agentStats.agentId, fresh));
    expect(row).toBeUndefined();

    const board = await repository.board({ metric: 'level', limit: 100 });
    expect(board.map((entry) => entry.agentId)).toContain(fresh);
  });

  it('orders a win-rate board so an agent who never fought is at the bottom', async () => {
    // 0/0 is not a perfect record. The store divides with NULLIF and coalesces
    // the result to zero, so an agent who has never fought scores 0 and sorts
    // below one that has actually won. Coalescing the other way would make the
    // best way to lead this board be to have never played.
    const fought = await createAgent(`social-fought-${process.pid}`);
    const unfought = await createAgent(`social-unfought-${process.pid}`);
    await database
      .insert(agentStats)
      .values([
        { agentId: fought, battlesWon: 3, battlesLost: 1 },
        { agentId: unfought, battlesWon: 0, battlesLost: 0 },
      ])
      .onConflictDoNothing();

    // A limit that cannot truncate, DERIVED rather than guessed. This used to
    // ask for 1_000 under a comment calling that generous, and it stopped being
    // generous: the shared test table passed 1,000 agents, an agent that has never
    // fought scores 0 and therefore sorts LAST, so it fell off the end and the
    // test failed on a fact about the database rather than about the ordering it
    // exists to check. Any fixed number has the same expiry date.
    const [row] = await database.select({ total: count() }).from(agents);
    const total = row?.total ?? 0;
    const board = await repository.board({ metric: 'win_rate', limit: total + 10 });
    const order = board.map((entry) => entry.agentId);

    expect(order).toContain(fought);
    expect(order).toContain(unfought);
    expect(order.indexOf(fought)).toBeLessThan(order.indexOf(unfought));
  });

  it('answers nothing for an agent nobody has heard of', async () => {
    await expect(
      repository.profile('00000000-0000-0000-0000-000000000000'),
    ).resolves.toBeUndefined();
  });
});

describe('the machine-native path', () => {
  it('refuses a send while no feature provides the ACL, and says so', async () => {
    // The composed runtime, with the feature wired exactly as it ships. The
    // assertion is that the refusal is loud: an absent authorization service
    // must never read as an open channel.
    const { runtime } = await sharedRuntime();
    const api = createApplicationApi(runtime);

    expect(runtime.degraded().get('social')).toEqual([ACL]);
    await expect(
      api.act('social.send', { fromAgentId: writerId, toAgentId: readerId, body: 'hello' }),
    ).rejects.toThrow(/fails closed/);
  });

  it('sends once a provider is installed, with no HTTP client and no browser', async () => {
    // The same `act()` the CLI and an MCP tool call. Installing the provider
    // also proves the degradation signal is recomputed on install rather than
    // fixed at construction.
    const { runtime, bus } = await sharedRuntime();
    const api = createApplicationApi(runtime, bus);
    const body = `machine-native ${process.pid}`;

    runtime.install(permitAll(true, 'permitted by the fixture'));
    try {
      expect(runtime.degraded().has('social')).toBe(false);

      await api.act('social.send', { fromAgentId: writerId, toAgentId: readerId, body });

      const rows = await database
        .select()
        .from(messages)
        .where(and(eq(messages.fromAgentId, writerId), eq(messages.body, body)));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.toAgentId).toBe(readerId);
      expect(rows[0]?.guildId).toBeNull();

      // And it comes back through the inbox with its provenance intact.
      const inbox = (await api.act('social.inbox', { agentId: readerId })) as {
        kind: string;
        attribution: string;
        body: string;
      }[];
      expect(inbox[0]).toMatchObject({ kind: 'social.message', body });
      expect(inbox[0]?.attribution).toBe(`message from agent ${writerId}`);

      // A board is a read, so it needs no provider at all.
      const board = (await api.act('social.leaderboard', { metric: 'level', limit: 5 })) as {
        metric: string;
        unit: string;
        entries: { rank: number }[];
      };
      expect(board).toMatchObject({ metric: 'level', unit: 'level' });
      expect(board.entries.length).toBeLessThanOrEqual(5);
    } finally {
      runtime.uninstall('guild');
    }

    // Uninstalling puts the refusal back, which is the half that proves the
    // signal is recomputed in both directions.
    expect(runtime.degraded().get('social')).toEqual([ACL]);
    await expect(
      api.act('social.send', { fromAgentId: writerId, toAgentId: readerId, body: 'after' }),
    ).rejects.toThrow(/fails closed/);
  });

  it('leaves nothing behind for a send the ACL refused', async () => {
    const { runtime } = await sharedRuntime();
    const api = createApplicationApi(runtime);
    const body = `refused ${process.pid}`;

    runtime.install(permitAll(false, 'not in a shared guild'));
    try {
      await expect(
        api.act('social.send', { fromAgentId: writerId, toAgentId: readerId, body }),
      ).rejects.toThrow(/not in a shared guild/);
    } finally {
      runtime.uninstall('guild');
    }

    const rows = await database
      .select()
      .from(messages)
      .where(and(eq(messages.fromAgentId, writerId), eq(messages.body, body)));
    expect(rows).toEqual([]);
  });

  it('takes the joined string the command line sends', async () => {
    // `{ args }` is what packages/cli/src/commands.ts passes for every verb, and
    // no action in this repository read it before this one.
    const { runtime, bus } = await sharedRuntime();
    const api = createApplicationApi(runtime, bus);
    const body = `from the command line ${process.pid}`;

    runtime.install(permitAll(true, 'permitted'));
    try {
      await api.act('social.send', { args: `${writerId} ${readerId} ${body}` });
    } finally {
      runtime.uninstall('guild');
    }

    const rows = await database
      .select()
      .from(messages)
      .where(and(eq(messages.fromAgentId, writerId), eq(messages.body, body)));
    expect(rows).toHaveLength(1);
  });

  it('reads a public profile that excludes the owning account', async () => {
    const { runtime } = await sharedRuntime();
    const api = createApplicationApi(runtime);
    const [writer] = await database.select().from(agents).where(eq(agents.id, writerId)).limit(1);

    const profile = (await api.act('social.profile', { agentId: writerId })) as Record<
      string,
      unknown
    >;

    expect(profile).toMatchObject({ agentId: writerId, battlesWon: 6 });
    expect(Object.keys(profile)).not.toContain('userId');
    expect(JSON.stringify(profile)).not.toContain(writer?.userId ?? 'unmatchable');
  });
});

describe('the table has no constraint this feature relies on', () => {
  it('holds no row addressed both ways at once', async () => {
    // A guard on the fixture rather than a claim about the feature. `messages`
    // declares no CHECK on the two address columns, so `addressProblem` in the
    // feature is the only thing refusing a row that is a direct message to one
    // agent AND a broadcast to a guild at the same time — and a write that does
    // not go through the feature is unchecked.
    //
    // The companion invariant is deliberately NOT asserted: "not both null" is
    // false in this table by design, because `to_agent_id` is declared
    // `onDelete: 'set null'` and a DM whose recipient is later deleted becomes
    // exactly that. See the note on `Message` in the feature.
    const [both] = await database
      .select()
      .from(messages)
      .where(and(isNotNull(messages.toAgentId), isNotNull(messages.guildId)));
    expect(both).toBeUndefined();
  });

  it('cannot tell a deleted recipient from a broadcast, and says so here', async () => {
    // The finding this file exists to record, stated as a test so it cannot be
    // quietly forgotten: after a recipient is deleted, a direct message and a
    // broadcast are the same row — `to_agent_id` null, `guild_id` null versus
    // set. The address invariant is therefore a WRITE-time rule and only a
    // write-time rule; nothing about the stored row can recover which it was.
    const orphan = await database
      .select()
      .from(messages)
      .where(and(isNull(messages.toAgentId), isNull(messages.guildId)));
    expect(orphan.length).toBeGreaterThan(0);
  });
});
