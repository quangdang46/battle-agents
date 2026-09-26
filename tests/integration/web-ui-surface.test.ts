import {
  agentStats,
  agents,
  battles,
  bounties,
  closeDatabasePool,
  createDatabase,
  eq,
  installations,
  quests,
  sessions,
  users,
  type Database,
} from '@battle-agents/db';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  loadBountyBoard,
  loadBountyDetail,
  readBountySummaries,
} from '../../apps/web/src/board-view.js';
import { closeSharedApi, sharedApi } from '../../apps/web/src/routes.js';
import { loadAgentCard, loadRoster, presenceOf } from '../../apps/web/src/roster-view.js';

/**
 * The board and the roster, over the real commands and a real database.
 *
 * ## What this file is the half of
 *
 * The bead has three criteria and the one this settles is "renders from REAL
 * data". A component that renders a hardcoded array passes every visual check,
 * so the check has to be that the values on the page came out of a command. So
 * this file:
 *
 *   - writes a bounty through `bounty.create` and `bounty.fund`, and asserts
 *     the repository, the issue number and the reward that came BACK are the
 *     ones it wrote;
 *   - writes four characters whose sessions are, in turn, reporting, silent for
 *     three hours while the row still says `active`, ended, and absent — and
 *     asserts all four are in the roster with a presence derived from the row.
 *
 * ## Which part is real and which part is not, stated plainly
 *
 * REAL: the commands, the runtime, the pool, the rows. `bounty.list` and
 * `progression.read` answer through the composition root that every HTTP route
 * uses, so a value that reaches the view model reached it the way it would in
 * production.
 *
 * FAKED: nothing about the DATA. The only thing this file writes by hand is the
 * session state, because there is no command that ends a session on demand and
 * waiting three hours is not a test. The characters themselves are rows in
 * `agents`, which is what a real registration writes.
 *
 * NOT PROVEN HERE: that those values reach the SCREEN.
 * `apps/web/src/ui.test.ts` renders the components and asserts they put the
 * view model's values on the page. The two halves cannot be one file, and the
 * reason is a toolchain fact rather than a preference: the root tsconfig
 * typechecks everything under `tests/`, and it cannot resolve `react` or a
 * `.tsx` file — both are declared by `apps/web` and nowhere else. An import of
 * a component from here fails the typecheck with TS2307 and TS6142 before a
 * single assertion runs.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;

/** Fixed, so a last-seen label is a value a test can state rather than a window. */
const NOW = '2026-09-26T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Distinctive on purpose: nothing in the seed uses these strings. */
const REPO_OWNER = 'boundary-probe';
const REPO_NAME = 'rendered-from-the-wire';
const ISSUE_NUMBER = 4242;
const REWARD_CENTS = 200_000;
const REQUIREMENT = 'a requirement that exists nowhere but in this test';

const AGENT_ONLINE = 'roster-online';
const AGENT_STALE = 'roster-stale';
const AGENT_ENDED = 'roster-ended';
const AGENT_NEVER = 'roster-never';

let pool: Pool;
let database: Database;
let sponsorUserId: string;
let bountyId: string;
let replayId: string;
/** Name to id, because the assertions talk about characters by name. */
const agentIdByName = new Map<string, string>();

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose ` +
        'Postgres is up, or export it before running this suite.',
    );
  }
  pool = new Pool({ connectionString, max: POOL_MAX_CONNECTIONS });
  database = createDatabase(pool);
  await seed();
});

afterAll(async () => {
  await removeFixtures();
  // The shared runtime opened its own pool on the first read, and vitest will
  // not exit while one is open.
  await closeSharedApi();
  await closeDatabasePool(pool);
});

describe('the bounty board answers with what the command was told', () => {
  it('carries the repository, the issue and the reward that were written', async () => {
    const board = await loadBountyBoard();
    const row = board.rows.find((entry) => entry.id === bountyId);

    expect(row).toBeDefined();
    expect(row?.repoLabel).toBe(`${REPO_OWNER}/${REPO_NAME}`);
    expect(row?.issueNumber).toBe(ISSUE_NUMBER);
    expect(row?.rewardCents).toBe(REWARD_CENTS);
    expect(row?.rewardLabel).toBe('$2,000');
    expect(row?.sponsorCount).toBe(1);
  });

  it('orders the board by reward, which is the order the plan lists them in', async () => {
    const board = await loadBountyBoard();
    const rewards = board.rows.map((row) => row.rewardCents);
    expect([...rewards].sort((left, right) => right - left)).toEqual(rewards);
  });

  it('refuses a response that stopped carrying a field it reads', () => {
    // The narrowing is the point of `readBountySummaries`. A cast would render
    // `undefined` into a price; this throws naming the FIELD, and the field it
    // names is the one that is gone rather than the first one it looked for.
    const whole = readBountySummaries([wireShape()])[0]!;
    expect(whole.repository.repoName).toBe('a-repository');

    for (const [field, path] of [
      ['repository', /repository/],
      ['payout', /payout/],
      ['funds', /funds/],
    ] as const) {
      const broken = wireShape() as Record<string, unknown>;
      delete broken[field];
      expect(() => readBountySummaries([broken]), `dropping ${field}`).toThrow(path);
    }
  });

  it('carries the requirements, the sponsors and the payout notice into the detail', async () => {
    const detail = await loadBountyDetail(bountyId);
    expect(detail?.requirements).toContain(REQUIREMENT);
    expect(detail?.funds).toHaveLength(1);
    expect(detail?.funds[0]?.amountCents).toBe(REWARD_CENTS);
    // The notice the payout rail requires a surface to show. It is the
    // feature's own sentence, carried rather than paraphrased.
    expect(detail?.payoutNotice).toContain('not a payment');
  });

  it('resolves the replay handle of a battle fought over the bounty', async () => {
    const detail = await loadBountyDetail(bountyId);
    expect(detail?.battle?.replayId).toBe(replayId);
  });

  it('has no battle, and no replay link, for a bounty nobody has fought over', async () => {
    const second = await createFundedBounty('unfought', 'no-battle-here', 9, 60_000);
    const detail = await loadBountyDetail(second);
    expect(detail?.battle).toBeNull();
  });

  it('answers undefined for an id no bounty answers to', async () => {
    // A URL that matches nothing is a 404 rather than a bounty with nothing on
    // it, and the page is what turns this into one.
    expect(await loadBountyDetail('00000000-0000-0000-0000-000000000000')).toBeUndefined();
  });
});

describe('the roster keeps every character, online or not', () => {
  it('renders a character whose session is still reporting', async () => {
    const entry = await rosterEntry(AGENT_ONLINE);
    expect(entry.presence).toBe('online');
    // The label is computed from the row, not asserted as a presence: a badge
    // that says "online" and a last-seen that says nothing would leave a reader
    // unable to tell a run that reported ten seconds ago from one that has been
    // quiet since lunch.
    expect(entry.lastSeenLabel).toBe('just now');
    expect(entry.lastSeenAt).toBe('2026-09-26T11:59:50.000Z');
  });

  it('keeps a character whose session row still says active but has gone quiet', async () => {
    // The case a `WHERE status = 'active'` roster gets wrong in the other
    // direction: the row looks alive and the process is gone.
    const entry = await rosterEntry(AGENT_STALE);
    expect(entry.presence).toBe('offline');
    expect(entry.lastSeenLabel).toBe('3h ago');
  });

  it('keeps a character whose session ended', async () => {
    const entry = await rosterEntry(AGENT_ENDED);
    expect(entry.presence).toBe('offline');
    expect(entry.lastSeenLabel).toBe('2d ago');
  });

  it('keeps a character that has never had a session at all', async () => {
    // The case a join against the live sessions drops, and the one nobody
    // notices until they go looking for a teammate.
    const entry = await rosterEntry(AGENT_NEVER);
    expect(entry.presence).toBe('offline');
    expect(entry.lastSeenAt).toBeNull();
    expect(entry.lastSeenLabel).toBe('never reported');
  });

  it('reads the level and the experience from the progression command', async () => {
    const entry = await rosterEntry(AGENT_ONLINE);
    const card = await loadAgentCard(idOf(AGENT_ONLINE), NOW);
    // Through the command rather than off the row, so the roster, the card, the
    // CLI and the MCP tool are all reading one definition of a character sheet.
    // The command is what agrees with them; a query here would agree by
    // coincidence until one of them changed.
    expect(entry.level).toBe(12);
    expect(entry.xp).toBe(3_400);
    expect(card?.level).toBe(12);
    expect(card?.skills.length).toBe(8);
    expect(card?.skills.find((skill) => skill.skill === 'debugging')?.xp).toBe(2_200);
  });

  it('names the quest behind the bounty a character holds', async () => {
    await claimFor(idOf(AGENT_ONLINE));
    const entry = await rosterEntry(AGENT_ONLINE);
    expect(entry.currentQuest).toBe('Ship the boundary');
  });

  it('gives a character that has done nothing level one and eight empty skills', async () => {
    // A FINDING, asserted rather than assumed: `DrizzleProgressionRepository.find`
    // synthesises a row from `agents` when `agent_stats` has none, so
    // `progression.read` reports `exists: true` for every character that exists.
    // The card's "no recorded outcomes" branch is therefore unreachable through
    // this build's storage, and a brand-new character renders eight level-1
    // bars rather than the empty-state sentence.
    const card = await loadAgentCard(idOf(AGENT_NEVER), NOW);
    expect(card?.level).toBe(1);
    expect(card?.xp).toBe(0);
    expect(card?.hasProgress).toBe(true);
    expect(card?.skills.map((skill) => skill.level)).toEqual(Array(8).fill(1));
  });
});

describe('presence, from the session row alone', () => {
  it('calls an active session inside the window online', () => {
    expect(presenceOf(session('active', NOW_MS - 10_000), NOW)).toBe('online');
  });

  it('calls an active session outside the window offline', () => {
    expect(presenceOf(session('active', NOW_MS - 3 * HOUR), NOW)).toBe('offline');
  });

  it('calls an ended session offline however recently it ended', () => {
    expect(presenceOf(session('ended', NOW_MS - MINUTE), NOW)).toBe('offline');
  });

  it('calls a character with no session offline rather than guessing', () => {
    expect(presenceOf(undefined, NOW)).toBe('offline');
  });
});

/* ───────────────────────── fixtures ───────────────────────── */

/**
 * One bounty summary, complete, as the command writes it.
 *
 * Hand-written rather than captured, because a fixture taken from a live
 * response cannot be edited: the whole assertion here is that dropping one field
 * is caught, which needs a shape that CAN be edited.
 */
function wireShape(): Record<string, unknown> {
  return {
    id: 'b-1',
    repository: { repoOwner: 'an-owner', repoName: 'a-repository' },
    issueNumber: 7,
    issueUrl: 'https://github.com/an-owner/a-repository/issues/7',
    prUrl: null,
    currency: 'USD',
    requirements: [],
    status: 'open',
    mode: 'first-valid',
    claimedAgentId: null,
    mergedBy: null,
    rewardCents: 100,
    expiresAt: null,
    createdAt: NOW,
    funds: [{ sponsorUserId: 'u-1', amountCents: 100 }],
    payout: {
      sandbox: true,
      notice: 'a notice',
      refund: { disposition: 'not-applicable', notice: 'nothing to refund' },
    },
  };
}

function session(status: string, lastSeenMs: number) {
  return {
    id: 'session-under-test',
    status,
    lastSeenAt: new Date(lastSeenMs).toISOString(),
    endedAt: null,
  };
}

async function rosterEntry(agentName: string) {
  const roster = await loadRoster(NOW);
  const agentId = agentIdByName.get(agentName);
  expect(agentId, `the fixture character ${agentName} was never written`).toBeDefined();
  const entry = roster.find((candidate) => candidate.id === agentId);
  expect(entry, `character ${agentName} is missing from the roster`).toBeDefined();
  return entry as NonNullable<typeof entry>;
}

/** The id of a fixture character, because the assertions talk about names. */
function idOf(agentName: string): string {
  const id = agentIdByName.get(agentName);
  if (id === undefined) throw new Error(`the fixture character ${agentName} was never written`);
  return id;
}

async function seed(): Promise<void> {
  const [user] = await database
    .insert(users)
    .values({ githubId: `web-ui-${String(Date.now())}`, login: 'web-ui-probe' })
    .returning({ id: users.id });
  sponsorUserId = user!.id;

  const [installation] = await database
    .insert(installations)
    .values({ userId: sponsorUserId, installationKey: `web-ui-${String(Date.now())}` })
    .returning({ id: installations.id });

  const names = [AGENT_ONLINE, AGENT_STALE, AGENT_ENDED, AGENT_NEVER];
  const created = await database
    .insert(agents)
    .values(names.map((name) => ({ userId: sponsorUserId, name, harness: 'codex' })))
    .returning({ id: agents.id, name: agents.name });

  const byName = new Map(created.map((row) => [row.name, row.id]));
  for (const [name, id] of byName) agentIdByName.set(name, id);

  // Reporting inside the window.
  await database.insert(sessions).values({
    agentId: byName.get(AGENT_ONLINE)!,
    installationId: installation!.id,
    status: 'active',
    startedAt: at(NOW_MS - 2 * HOUR),
    lastHeartbeatAt: at(NOW_MS - 10_000),
  });
  // The row still says `active` and nothing has reported for three hours.
  await database.insert(sessions).values({
    agentId: byName.get(AGENT_STALE)!,
    installationId: installation!.id,
    status: 'active',
    startedAt: at(NOW_MS - 5 * HOUR),
    lastHeartbeatAt: at(NOW_MS - 3 * HOUR),
  });
  // Finished, two days ago.
  await database.insert(sessions).values({
    agentId: byName.get(AGENT_ENDED)!,
    installationId: installation!.id,
    status: 'ended',
    endReason: 'completed',
    startedAt: at(NOW_MS - 3 * 24 * HOUR),
    endedAt: at(NOW_MS - 2 * 24 * HOUR),
    lastHeartbeatAt: at(NOW_MS - 2 * 24 * HOUR),
  });
  // AGENT_NEVER gets no session row at all.

  // Level and experience live on the character row, which is where
  // `DrizzleProgressionRepository.find` reads them from — so this is where a
  // registration plus a few outcomes leaves a character that is not level 1.
  // The skills are the other half: they live on the progression record and are
  // the only thing there that a harness name could ever have faked.
  await database.insert(agentStats).values({
    agentId: byName.get(AGENT_ONLINE)!,
    skillsJson: { coding: 1_200, debugging: 2_200 },
  });
  await database
    .update(agents)
    .set({ xp: 3_400, level: 12 })
    .where(eq(agents.id, byName.get(AGENT_ONLINE)!));

  bountyId = await createFundedBounty(REPO_OWNER, REPO_NAME, ISSUE_NUMBER, REWARD_CENTS, [
    REQUIREMENT,
  ]);

  // A fresh public handle per run, because `replay_id` is UNIQUE and a fixed
  // one turns the second run of this suite into a duplicate-key failure that
  // has nothing to do with what the suite is testing.
  replayId = randomUUID();
  await database.insert(battles).values({
    mode: 'duel',
    bountyId,
    weightsJson: { correctness: 1 },
    status: 'completed',
    startedAt: at(NOW_MS - HOUR),
    finishedAt: at(NOW_MS - HOUR + MINUTE),
    replayId,
  });
}

/**
 * A bounty written the way a sponsor writes one: created, then funded.
 *
 * `reportedBy` is stated here rather than derived, and that asymmetry is the
 * point of `bounty-routes.ts`: the HTTP route fills BOTH identity fields from
 * the caller's credential and refuses a body that names a different one, because
 * `act()` has no principal to fill them from. Over the protocol the caller is
 * the sponsor and says so — which is why a loop run without the UI is a complete
 * loop, and not a lesser one.
 */
async function createFundedBounty(
  repoOwner: string,
  repoName: string,
  issueNumber: number,
  amountCents: number,
  requirements: readonly string[] = [],
): Promise<string> {
  const api = await sharedApi();
  const created = (await api.act('bounty.create', {
    repoOwner,
    repoName,
    issueNumber,
    requirements,
  })) as { id: string };
  await api.act('bounty.fund', {
    bountyId: created.id,
    amountCents,
    sponsorUserId,
    reportedBy: 'web-ui-probe',
  });
  return created.id;
}

/** Puts the online character on a quest, the only way the schema records one. */
async function claimFor(agentId: string): Promise<void> {
  const [quest] = await database
    .insert(quests)
    .values({ title: 'Ship the boundary' })
    .returning({ id: quests.id });
  await database
    .update(bounties)
    .set({ claimedAgentId: agentId, questId: quest!.id })
    .where(eq(bounties.id, bountyId));
}

function at(epochMs: number): Date {
  return new Date(epochMs);
}

async function removeFixtures(): Promise<void> {
  if (database === undefined) return;
  // The battle first: `bounties.bounty_id` is `on delete set null`, so deleting
  // the bounty would leave a battle with no bounty and a public handle that
  // nothing owns.
  await database.delete(battles).where(eq(battles.replayId, replayId));
  await database.delete(bounties).where(sql`${bounties.repoOwner} in (${REPO_OWNER}, 'unfought')`);
  await database.delete(quests).where(eq(quests.title, 'Ship the boundary'));
  await database.delete(agents).where(sql`${agents.name} like ${'roster-%'}`);
  await database.delete(users).where(sql`${users.login} = ${'web-ui-probe'}`);
}
