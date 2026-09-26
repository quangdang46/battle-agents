import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplicationApi, type ApplicationApi } from '@battle-agents/api';
import { createInMemoryEventBus, createRuntime, type GameFeature, type Runtime } from '@battle-agents/core';
import {
  agents as agentsTable,
  bounties,
  closeDatabasePool,
  createDatabase,
  DrizzleAchievementsRepository,
  DrizzleBountyRepository,
  DrizzleGuildRepository,
  DrizzlePayoutIntentStore,
  DrizzleProgressionRepository,
  DrizzleReputationRepository,
  DrizzleStateStore,
  users,
  type Database,
} from '@battle-agents/db';
import { achievementsFeature } from '@battle-agents/achievements';
import { bountyFeature, type BountySummary } from '@battle-agents/bounty';
import { guildFeature } from '@battle-agents/guild';
import { progressionFeature } from '@battle-agents/progression';
import { reputationFeature } from '@battle-agents/reputation';

/**
 * The other half of `core-loop.test.ts`: what the loop does when a consumer of
 * `bounty.completed` is NOT installed, and the one stage the shipped composition
 * root cannot reach at all.
 *
 * ## Why a hand-built runtime, and why that is not a weaker claim
 *
 * `core-loop.test.ts` drives `apps/web/src/shared-runtime.ts`, which composes the
 * eight features the product ships. That is the strongest available statement
 * about the wiring, and it cannot answer this bead's other question, because
 * there is no way to uninstall a feature from it without editing the composition
 * root — and that file is frozen, and is the one place
 * `scripts/removal-test.sh` strips. So the runtimes here are built the way
 * `tests/integration/bounty-persistence.test.ts` and its neighbours build them,
 * and the trade is stated: **this file proves the loop composes, not that the
 * product installs it.** The two halves are complementary and neither is the
 * other.
 *
 * The cost is that this file names features, so it lives where
 * `scripts/removal-test.sh` cannot reach it: that script runs `pnpm -r typecheck`
 * and the unit stage, and `tests/integration/` is in neither. A file that named a
 * feature AND lived in the unit stage would fail the removal test for a reason
 * that has nothing to do with the architecture. The general removal guarantee is
 * still `scripts/removal-test.sh`; this file adds the behavioural half that no
 * directory-move can check.
 *
 * ## The shape the bead asks for
 *
 * Each runtime below runs the SAME loop — create, fund, claim, submit, merge —
 * and the merge is a bare `github.pull_request.merged` event carrying a
 * repository, a pull request number and a person's login. The transport that
 * produces that event is the webhook route's, and the shared runtime cannot be
 * pointed at a runtime built here, so the delivery is emitted directly. That is
 * the same line `apps/web/src/event-routes.ts` runs after normalising a delivery,
 * and the correlation the assertions depend on — rebuilding the pull request URL
 * and looking the bounty up — is entirely inside the bounty feature.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;
const REPO_OWNER = 'battle-agents';
const ISSUE_NUMBER = 6601;
const PULL_REQUEST = 6602;
const REWARD_CENTS = 20_000;

let pool: Pool;
let database: Database;

beforeAll(() => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: POOL_MAX_CONNECTIONS });
  database = createDatabase(pool);
});

afterAll(async () => {
  await closeDatabasePool(pool);
});

/* ── the loop, runnable against any subset of features ───────────────────── */

/** What one pass produced. Every field is read back, not returned. */
interface Pass {
  readonly bountyId: string;
  readonly agentId: string;
  readonly repository: string;
  readonly prUrl: string;
  /** The bounty row after the merge, from Postgres. */
  readonly status: string;
  readonly mergedBy: string | null;
}

function compose(...extensions: readonly GameFeature[]): { readonly runtime: Runtime; readonly api: ApplicationApi } {
  const bus = createInMemoryEventBus();
  const runtime = createRuntime({
    extensions,
    store: new DrizzleStateStore(database),
    bus,
  });
  return { runtime, api: createApplicationApi(runtime, bus) };
}

const bounty = (): GameFeature =>
  bountyFeature({
    repository: new DrizzleBountyRepository(database),
    payouts: new DrizzlePayoutIntentStore(database),
  });
const reputation = (): GameFeature => reputationFeature({ repository: new DrizzleReputationRepository(database) });
const progression = (): GameFeature => progressionFeature({ repository: new DrizzleProgressionRepository(database) });
const achievements = (): GameFeature => achievementsFeature({ repository: new DrizzleAchievementsRepository(database) });
const guild = (): GameFeature => guildFeature({ repository: new DrizzleGuildRepository(database) });

/** A user and an agent the foreign keys will accept, and that nobody else owns. */
async function aSolver(label: string): Promise<{ readonly userId: string; readonly agentId: string }> {
  const githubId = `fanout-${label}-${randomUUID()}`;
  const [user] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const [agent] = await database
    .insert(agentsTable)
    .values({
      userId: user?.id ?? '',
      name: `fanout-${label}-${randomUUID().slice(0, 8)}`,
      harness: 'claude',
    })
    .returning({ id: agentsTable.id });
  return { userId: user?.id ?? '', agentId: agent?.id ?? '' };
}

/**
 * create -> fund -> claim -> submit -> merge, and read the bounty back.
 *
 * The delivery names a person. Nothing in the loop names the agent to the merge,
 * so every award below was attributed by the bounty feature from the CLAIM.
 */
async function runTheLoop(
  api: ApplicationApi,
  runtime: Runtime,
  label: string,
): Promise<Pass> {
  const { userId, agentId } = await aSolver(label);
  const repoName = `fanout-${randomUUID().slice(0, 12)}`;
  const repository = `${REPO_OWNER}/${repoName}`;

  const created = (await api.act('bounty.create', {
    repoOwner: REPO_OWNER,
    repoName,
    issueNumber: ISSUE_NUMBER,
  })) as BountySummary;
  await api.act('bounty.fund', {
    bountyId: created.id,
    amountCents: REWARD_CENTS,
    sponsorUserId: userId,
    reportedBy: 'fanout-maintainer',
  });
  await api.act('bounty.claim', { bountyId: created.id, agentId });
  const prUrl = `https://github.com/${repository}/pull/${PULL_REQUEST}`;
  await api.act('bounty.submit', { bountyId: created.id, agentId, prUrl });

  await runtime.emit({
    type: 'github.pull_request.merged',
    occurredAt: new Date().toISOString(),
    actorId: 'github',
    payload: {
      merged: true,
      repository,
      pullRequest: PULL_REQUEST,
      mergedAt: '2026-09-26T12:00:00.000Z',
      githubLogin: 'fanout-maintainer',
      deliveryId: `fanout-${randomUUID()}`,
    },
  });

  const [row] = await database.select().from(bounties).where(eq(bounties.id, created.id)).limit(1);
  if (row === undefined) {
    throw new Error(`bounty ${created.id} was written by this run and cannot be read back`);
  }
  return {
    bountyId: created.id,
    agentId,
    repository,
    prUrl,
    status: row.status,
    mergedBy: row.mergedBy,
  };
}

async function xpOf(agentId: string): Promise<number> {
  const [row] = await database
    .select({ xp: agentsTable.xp })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);
  return row?.xp ?? 0;
}

/* ── 1. progression absent ────────────────────────────────────────────────── */

describe("the loop closes with progression NOT installed", () => {
  it('completes the bounty and pays the two consumers that are present', async () => {
    const { runtime, api } = compose(bounty(), reputation(), achievements());
    const pass = await runTheLoop(api, runtime, 'no-progression');

    // The loop closed. Bounty, not the absence of a subscriber, is what the
    // completion depends on.
    expect(pass.status).toBe('completed');
    expect(pass.mergedBy).toBe('fanout-maintainer');

    const trust = (await api.act('reputation.read', { agentId: pass.agentId })) as {
      completed: number;
      earnedCents: number;
    };
    expect(trust.completed).toBe(1);
    expect(trust.earnedCents).toBe(REWARD_CENTS);

    const badges = (await api.act('achievements.list', { agentId: pass.agentId })) as {
      badges: readonly { code: string }[];
    };
    expect(badges.badges.map((badge) => badge.code)).toContain('first-bounty.v1');
  });

  it('has no progression at all, rather than a progression that answers zero', async () => {
    const { runtime, api } = compose(bounty(), reputation(), achievements());

    // The distinction the removal principle turns on. A feature that is installed
    // but broken answers zero, and zero is indistinguishable from a new player.
    // A feature that is ABSENT says so, and a caller can tell the two.
    expect((await api.discover()).domains ?? []).not.toContain('progression');
    expect(runtime.degraded().get('progression')).toBeUndefined();

    const refused = await api.act('progression.read', { agentId: randomUUID() }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(Error);
    expect((refused as Error).message).toMatch(/unknown action/);
  });

  it('writes no experience, and that is the absence showing rather than a silent zero award', async () => {
    const { runtime, api } = compose(bounty(), reputation(), achievements());
    const pass = await runTheLoop(api, runtime, 'no-xp');

    // The two consumers that WERE installed both moved, and the column nobody
    // owns stayed at zero. If bounty had reached into progression's state
    // instead of leaving the fan-out alone, this number would be non-zero in a
    // runtime with no progression in it — which is the God Bus the plan forbids.
    expect(await xpOf(pass.agentId)).toBe(0);
    expect((await xpOf(pass.agentId)) === 0).toBe(true);
  });
});

/* ── 2. achievements absent ───────────────────────────────────────────────── */

describe('the loop closes with achievements NOT installed', () => {
  it('still pays experience and trust', async () => {
    const { runtime, api } = compose(bounty(), reputation(), progression());
    const pass = await runTheLoop(api, runtime, 'no-achievements');

    expect(pass.status).toBe('completed');
    const sheet = (await api.act('progression.read', { agentId: pass.agentId })) as { xp: number };
    const award = (await api.act('progression.awards', { eventType: 'bounty.completed' })) as {
      xp: number;
      recognised: boolean;
    };
    expect(award.recognised).toBe(true);
    expect(sheet.xp).toBe(award.xp);
    expect(await xpOf(pass.agentId)).toBe(award.xp);

    const trust = (await api.act('reputation.read', { agentId: pass.agentId })) as { completed: number };
    expect(trust.completed).toBe(1);
  });
});

/* ── 3. the SOCIAL stage the composition root cannot reach ────────────────── */

describe('SOCIAL, with guild installed', () => {
  it('the guild learns of the work from the event, and can be seen by another member', async () => {
    const { runtime, api } = compose(bounty(), guild());
    const { userId, agentId } = await aSolver('guild-member');

    const founded = (await api.act('guild.create', {
      name: `the loop runners ${randomUUID().slice(0, 8)}`,
      tag: `loop${randomUUID().slice(0, 4)}`,
    })) as { id: string };
    await api.act('guild.join', { guildId: founded.id, agentId });

    const repoName = `guild-loop-${randomUUID().slice(0, 12)}`;
    const repository = `${REPO_OWNER}/${repoName}`;
    const created = (await api.act('bounty.create', {
      repoOwner: REPO_OWNER,
      repoName,
      issueNumber: ISSUE_NUMBER,
    })) as BountySummary;
    await api.act('bounty.fund', {
      bountyId: created.id,
      amountCents: REWARD_CENTS,
      sponsorUserId: userId,
      reportedBy: 'fanout-maintainer',
    });
    await api.act('bounty.claim', { bountyId: created.id, agentId });
    await api.act('bounty.submit', {
      bountyId: created.id,
      agentId,
      prUrl: `https://github.com/${repository}/pull/${PULL_REQUEST}`,
    });

    // A quest the work will close, so the contribution is visible as a number
    // the guild reads rather than as a signal row nothing summarises.
    await api.act('guild.quest.start', {
      guildId: founded.id,
      title: 'ship three fixes',
      goal: 1,
      repository,
    });

    const before = await rolesOf(api, founded.id, agentId);
    expect(before.signals, 'the guild knew about the work before it happened').toHaveLength(0);

    await runtime.emit({
      type: 'github.pull_request.merged',
      occurredAt: new Date().toISOString(),
      actorId: 'github',
      payload: {
        merged: true,
        repository,
        pullRequest: PULL_REQUEST,
        mergedAt: '2026-09-26T12:00:00.000Z',
        githubLogin: 'fanout-maintainer',
        deliveryId: `fanout-${randomUUID()}`,
      },
    });

    // The hand-off, through the bus. The guild learned the bounty's id from the
    // event payload, not from anything this file passed it, and the source key
    // it recorded names that id.
    const after = await rolesOf(api, founded.id, agentId);
    const work = after.signals.filter((signal) => signal.sourceType === 'bounty.completed');
    expect(work).toHaveLength(1);
    expect(work[0]?.sourceKey).toBe(`bounty.completed|${created.id}`);

    // The second signal is the one this file pins rather than expects. One merge
    // that completed a bounty emits `bounty.completed` AND `pr.merged`
    // (features/bounty/src/merge.ts), and guild's ROLE_SIGNALS scores `pr.merged`
    // toward `reviewer` without reading the `completedBounty: true` the same
    // payload carries. So an agent who merges their own bounty accrues reviewer
    // evidence for work they did. The work LEDGER is not affected — the handler
    // records work only from `bounty.completed` — and the quest below is what
    // proves that. This is the signal half, stated rather than left to be
    // discovered by whoever reads the roster first.
    expect(after.signals.filter((signal) => signal.sourceType === 'pr.merged')).toHaveLength(1);

    const quests = (await api.act('guild.quests', { guildId: founded.id })) as {
      quests: readonly { id: string; completedAt: string | null; progress: number }[];
    };
    expect(quests.quests[0]?.completedAt).not.toBeNull();
    expect(quests.quests[0]?.progress).toBe(1);
  });

  it('records the same work once when the outcome is told twice', async () => {
    const { runtime, api } = compose(bounty(), guild());
    const { userId, agentId } = await aSolver('guild-idempotent');

    const founded = (await api.act('guild.create', {
      name: `the told twice ${randomUUID().slice(0, 8)}`,
      tag: `twice${randomUUID().slice(0, 4)}`,
    })) as { id: string };
    await api.act('guild.join', { guildId: founded.id, agentId });

    const repoName = `guild-twice-${randomUUID().slice(0, 12)}`;
    const repository = `${REPO_OWNER}/${repoName}`;
    const created = (await api.act('bounty.create', {
      repoOwner: REPO_OWNER,
      repoName,
      issueNumber: ISSUE_NUMBER,
    })) as BountySummary;
    await api.act('bounty.fund', {
      bountyId: created.id,
      amountCents: REWARD_CENTS,
      sponsorUserId: userId,
      reportedBy: 'fanout-maintainer',
    });
    await api.act('bounty.claim', { bountyId: created.id, agentId });
    await api.act('bounty.submit', {
      bountyId: created.id,
      agentId,
      prUrl: `https://github.com/${repository}/pull/${PULL_REQUEST}`,
    });

    const completed = (await runtime.runAction('bounty.list', { repoName })) as readonly BountySummary[];
    expect(completed[0]?.status).toBe('submitted');

    // The same merge, delivered twice. The first completes the bounty; the second
    // finds nothing in `submitted` and says nothing. Nothing anywhere moves
    // twice, and the guild is not even asked.
    const delivery = {
      type: 'github.pull_request.merged',
      occurredAt: new Date().toISOString(),
      actorId: 'github',
      payload: {
        merged: true,
        repository,
        pullRequest: PULL_REQUEST,
        mergedAt: '2026-09-26T12:00:00.000Z',
        githubLogin: 'fanout-maintainer',
        deliveryId: `fanout-${randomUUID()}`,
      },
    };
    await runtime.emit(delivery);
    await runtime.emit({ ...delivery, payload: { ...delivery.payload, deliveryId: `retry-${randomUUID()}` } });

    const afterRetries = await rolesOf(api, founded.id, agentId);
    expect(workSignals(afterRetries)).toHaveLength(1);

    // And the guild's OWN mutex, tested where the index is the only thing
    // standing between a retried webhook and an inflated roster: the same
    // `bounty.completed` told to the bus a second time, with the bounty feature
    // out of the picture entirely.
    await runtime.emit({
      type: 'bounty.completed',
      occurredAt: new Date().toISOString(),
      actorId: 'bounty',
      payload: {
        bountyId: created.id,
        repository,
        pullRequest: PULL_REQUEST,
        prUrl: `https://github.com/${repository}/pull/${PULL_REQUEST}`,
        agentId,
        rewardCents: REWARD_CENTS,
        mergedBy: 'fanout-maintainer',
      },
    });

    const signals = workSignals(await rolesOf(api, founded.id, agentId));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.sourceKey).toBe(`bounty.completed|${created.id}`);
  });
});

/**
 * The signals that count as WORK, which is the half the dedup is about.
 *
 * One completed bounty produces two events and guild records a role signal for
 * each, so counting every signal would report one merge as two facts and the
 * idempotency assertion would pass for the wrong reason.
 */
function workSignals(member: {
  signals: readonly { sourceType: string; sourceKey: string }[];
}): readonly { sourceType: string; sourceKey: string }[] {
  return member.signals.filter((signal) => signal.sourceType === 'bounty.completed');
}

/** What `guild.roles` says about one member, narrowed to what this file reads. */
async function rolesOf(
  api: ApplicationApi,
  guildId: string,
  agentId: string,
): Promise<{
  role: string;
  signals: readonly { sourceType: string; sourceKey: string }[];
}> {
  const view = (await api.act('guild.roles', { guildId })) as {
    members: readonly {
      agentId: string;
      role: string;
      signals: readonly { sourceType: string; sourceKey: string }[];
    }[];
  };
  const member = view.members.find((candidate) => candidate.agentId === agentId);
  if (member === undefined) {
    throw new Error(`guild ${guildId} has no member ${agentId}; the join did not happen`);
  }
  return { role: member.role, signals: member.signals };
}
