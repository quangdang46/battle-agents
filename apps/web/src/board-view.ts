import { battles, eq } from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import type { RegisteredActionId } from '@battle-agents/protocol';

import { rewardLabel, remainingLabel } from './labels.js';
import { sharedApi } from './routes.js';
import { sharedRuntime } from './shared-runtime.js';

/**
 * The bounty board's read model.
 *
 * ## The board asks the application command, not the table
 *
 * Every bounty on the board comes out of `bounty.list`, which is the same
 * command the CLI and the MCP adapter call. That is the point of criterion 3:
 * the board is a SECOND CLIENT of the commands, and a board that read
 * `bounties` with its own SQL would be a second implementation of what a bounty
 * is — free to disagree with the one the agents are held to, and invisible from
 * inside a browser when it did.
 *
 * `bounty.list` is also the only listing the feature has. There is no
 * `bounty.read`, so a detail page is a list narrowed to one id rather than a
 * point read. That is a cost, and it is the right cost at this size: the
 * alternative is a route that decides which bounties exist, which is the second
 * answer the whole file is arranged to avoid.
 *
 * ## The response is narrowed here, not cast
 *
 * `act()` answers `unknown`, and this file cannot import `BountySummary`
 * because `packages/features/bounty` is removable and
 * `scripts/removal-test.sh` strips a feature's import from every file under
 * `apps/web` before it typechecks. So the fields this view needs are declared
 * below and the response is CHECKED against them. A cast would compile through a
 * rename upstream and the board would render `undefined` into a page; a refusal
 * says which field stopped being what this file needs.
 *
 * The conformance that the cast would have lost is not gone: `composition.ts`
 * hands `bountyFeature` a `BountyRepository` and a `PayoutIntentStore`, and
 * `bounty.list` is registered against the same feature. This file checks the
 * wire, which is the part a compile-time check cannot see.
 *
 * ## What the API does not answer, and why nothing here invents it
 *
 * Plan §8's row is "amount · difficulty · repo · competitor count". Two of those
 * four are not in the response and are not derivable from anything this app can
 * read:
 *
 * - **difficulty** lives on `quests.difficulty`, `bounties.quest_id` is
 *   nullable, and no summary carries it. A difficulty the board invented from
 *   the reward would be a number the game cannot derive, which is the decoration
 *   DESIGN.md §4's agent-card data rule exists to forbid.
 * - **competitor count** has no table behind it at all. `bounties` holds one
 *   `claimed_agent_id`, so the game's own record of competition is the winner,
 *   not the field. Counting sponsors and calling it competitors would be a lie
 *   with a number on it.
 *
 * Both are reported rather than filled. The board shows the four facts the game
 * can actually stand behind.
 */

/**
 * The listing, written out rather than imported.
 *
 * Same rule and same reason as `bounty-routes.ts`: `satisfies` turns a renamed
 * id upstream into a compile error here rather than a board that quietly
 * renders nothing.
 */
const BOUNTY_LIST = 'bounty.list' satisfies RegisteredActionId;

/** What a sponsor put in, as the detail page shows it. */
export interface SponsorContribution {
  readonly sponsorUserId: string;
  readonly amountCents: number;
  readonly label: string;
}

/** One row of HOT BOUNTIES. */
export interface BountyBoardRow {
  readonly id: string;
  readonly rewardCents: number;
  readonly rewardLabel: string;
  readonly currency: string;
  /**
   * `owner/name`, composed once by the read model.
   *
   * Not two fields the component joins. A row carrying an owner, a name AND the
   * string made from them is three places one fact lives, and the render test
   * caught exactly that on the day this was written: the fixture had the two
   * halves and the component read the whole, so the repository rendered blank
   * and nothing was red until something rendered it.
   */
  readonly repoLabel: string;
  readonly issueNumber: number;
  readonly issueUrl: string;
  readonly status: string;
  readonly mode: string;
  readonly sponsorCount: number;
  readonly claimedByAgentId: string | null;
  readonly expiresLabel: string | null;
}

/** The board, with the counts the top bar shows. */
export interface BountyBoard {
  readonly rows: readonly BountyBoardRow[];
  readonly totalCents: number;
  readonly openCount: number;
}

/** A bounty detail page, carrying what the list does not. */
export interface BountyDetail extends BountyBoardRow {
  readonly requirements: readonly string[];
  readonly funds: readonly SponsorContribution[];
  readonly prUrl: string | null;
  readonly mergedBy: string | null;
  /** The feature's own words, carried verbatim rather than paraphrased here. */
  readonly payoutNotice: string | null;
  readonly refundNotice: string | null;
  /** The public handle of the newest battle fought over this bounty, if any. */
  readonly battle: { readonly replayId: string; readonly status: string } | null;
}

/**
 * The whole board, over the real command.
 *
 * Ordered by reward, descending, because that is the order the plan's own
 * examples are in (`$2000 SSO, $750 memleak, $250 OAuth, $50 CLI bug`) and a
 * board that is hot because it is loud rather than because it is worth the most
 * is a different product. Ties fall back to the creation instant so the order
 * is total: two bounties of equal value must not swap places between two reads
 * of an unchanged board.
 *
 * The status filter is deliberately absent. Every status the API returns is
 * rendered with its status on the row, because "which of these can I still take"
 * is a question the bounty lifecycle answers and a board that hid the closed ones
 * would be making a second, quieter version of that answer.
 */
export async function loadBountyBoard(): Promise<BountyBoard> {
  const summaries = await readBountySummaries(await (await sharedApi()).act(BOUNTY_LIST, {}));
  const now = new Date().toISOString();
  const rows = [...summaries].sort(byRewardThenAge).map((summary) => toBoardRow(summary, now));
  return {
    rows,
    totalCents: rows.reduce((sum, row) => sum + row.rewardCents, 0),
    openCount: rows.filter((row) => row.status === 'open').length,
  };
}

/**
 * One bounty, or undefined for an id no bounty answers to.
 *
 * Undefined rather than a thrown error because a bad id in a URL is a missing
 * page, and the page renders it as a 404 — the same reading `replay-view.ts`
 * gives a replay link that resolves to nothing.
 */
export async function loadBountyDetail(bountyId: string): Promise<BountyDetail | undefined> {
  const summaries = await readBountySummaries(await (await sharedApi()).act(BOUNTY_LIST, {}));
  const summary = summaries.find((entry) => entry.id === bountyId);
  if (summary === undefined) return undefined;
  const row = toBoardRow(summary, new Date().toISOString());
  const battle = await newestBattleFor(bountyId);
  return {
    ...row,
    requirements: summary.requirements,
    funds: summary.funds.map((fund) => ({
      sponsorUserId: fund.sponsorUserId,
      amountCents: fund.amountCents,
      label: rewardLabel(fund.amountCents, row.currency),
    })),
    prUrl: summary.prUrl,
    mergedBy: summary.mergedBy,
    payoutNotice: summary.payout.sandbox ? summary.payout.notice : null,
    refundNotice:
      summary.payout.refund.disposition === 'not-applicable' ? null : summary.payout.refund.notice,
    battle,
  };
}

/**
 * The public replay handle of the newest battle on a bounty, or null.
 *
 * A raw read, and the reason is specific: neither `bounty.list` nor
 * `battle.read` nor `battle.list` carries `battles.replay_id`. The column is
 * the public address a shared replay link holds, and it is deliberately absent
 * from every action summary so that an internal battle id and a public replay
 * link can never be the same value. So the board — which needs the link, not the
 * battle — reads the one column that holds it.
 *
 * It is a READ and it decides nothing: which battle is newest is an ordering the
 * database already answers, and this file does not get to say what a battle
 * means.
 */
async function newestBattleFor(bountyId: string): Promise<BountyDetail['battle']> {
  const { database } = await sharedRuntime();
  const rows = await database
    .select({ replayId: battles.replayId, status: battles.status, startedAt: battles.startedAt })
    .from(battles)
    .where(eq(battles.bountyId, bountyId));
  const newest = [...rows].sort((left, right) =>
    left.startedAt.getTime() === right.startedAt.getTime()
      ? left.replayId.localeCompare(right.replayId)
      : right.startedAt.getTime() - left.startedAt.getTime(),
  )[0];
  return newest === undefined ? null : { replayId: newest.replayId, status: newest.status };
}

/* ───────────────────────── the wire, and what it must carry ───────────────────────── */

/** The subset of `BountySummary` this view reads, declared rather than imported. */
interface BountySummaryView {
  readonly id: string;
  readonly repository: { readonly repoOwner: string; readonly repoName: string };
  readonly issueNumber: number;
  readonly issueUrl: string;
  readonly prUrl: string | null;
  readonly currency: string;
  readonly requirements: readonly string[];
  readonly status: string;
  readonly mode: string;
  readonly claimedAgentId: string | null;
  readonly mergedBy: string | null;
  readonly rewardCents: number;
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly funds: readonly { readonly sponsorUserId: string; readonly amountCents: number }[];
  readonly payout: {
    readonly sandbox: boolean;
    readonly notice: string;
    readonly refund: { readonly disposition: string; readonly notice: string };
  };
}

/** A response this file cannot read, named rather than cast and forgotten. */
export class UnreadableBountyResponseError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(
      `bounty.list answered without a usable "${field}". The bounty board renders what the ` +
        'command returns, and a value it cannot read is reported rather than replaced with a ' +
        'placeholder — a board that quietly showed a blank repository would look like a bounty ' +
        'with no repository rather than a response that stopped matching.',
    );
    this.name = 'UnreadableBountyResponseError';
    this.field = field;
  }
}

/**
 * Checks the answer against the fields above, one at a time.
 *
 * A list rather than a cast because the failure this guards is a SILENT one: a
 * field the response stopped carrying arrives as `undefined`, and `undefined` in
 * a price is a page that says "$NaN". The check turns that into a named error at
 * the boundary.
 */
export function readBountySummaries(value: unknown): readonly BountySummaryView[] {
  if (!Array.isArray(value)) throw new UnreadableBountyResponseError('top-level list');
  return value.map(readBountySummary);
}

function readBountySummary(value: unknown): BountySummaryView {
  const record = objectField(value, 'bounty entry');
  const payout = objectField(record['payout'], 'payout');
  const refund = objectField(payout['refund'], 'payout.refund');
  return {
    id: stringField(record, 'id'),
    repository: readCoordinates(record['repository']),
    issueNumber: numberField(record, 'issueNumber'),
    issueUrl: stringField(record, 'issueUrl'),
    prUrl: nullableString(record['prUrl'], 'prUrl'),
    currency: stringField(record, 'currency'),
    requirements: stringArray(record['requirements'], 'requirements'),
    status: stringField(record, 'status'),
    mode: stringField(record, 'mode'),
    claimedAgentId: nullableString(record['claimedAgentId'], 'claimedAgentId'),
    mergedBy: nullableString(record['mergedBy'], 'mergedBy'),
    rewardCents: numberField(record, 'rewardCents'),
    expiresAt: nullableString(record['expiresAt'], 'expiresAt'),
    createdAt: stringField(record, 'createdAt'),
    funds: readFunds(record['funds']),
    payout: {
      sandbox: booleanField(payout, 'sandbox', 'payout.sandbox'),
      notice: stringField(payout, 'notice', 'payout.notice'),
      refund: {
        disposition: stringField(refund, 'disposition', 'payout.refund.disposition'),
        notice: stringField(refund, 'notice', 'payout.refund.notice'),
      },
    },
  };
}

function readCoordinates(value: unknown): { repoOwner: string; repoName: string } {
  const record = objectField(value, 'repository');
  return {
    repoOwner: stringField(record, 'repoOwner', 'repository.repoOwner'),
    repoName: stringField(record, 'repoName', 'repository.repoName'),
  };
}

function readFunds(value: unknown): readonly { sponsorUserId: string; amountCents: number }[] {
  if (!Array.isArray(value)) throw new UnreadableBountyResponseError('funds');
  return value.map((entry, index) => {
    const record = objectField(entry, `funds[${String(index)}]`);
    return {
      sponsorUserId: stringField(record, 'sponsorUserId', `funds[${String(index)}].sponsorUserId`),
      amountCents: numberField(record, 'amountCents', `funds[${String(index)}].amountCents`),
    };
  });
}

function objectField(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UnreadableBountyResponseError(name);
  }
  return value as Record<string, unknown>;
}

/**
 * A field, and the PATH it was read from.
 *
 * Two arguments because the callers nest. `readCoordinates` holds the repository
 * object and wants to report `repository.repoOwner` when the answer is wrong, and
 * a single-argument version would look that path up as a KEY on the object it
 * had just narrowed — so every nested read failed with a name that named a field
 * that does not exist. The key and the path are different strings and the
 * distinction is the whole function.
 */
function stringField(record: Record<string, unknown>, key: string, path = key): string {
  const value = record[key];
  if (typeof value !== 'string') throw new UnreadableBountyResponseError(path);
  return value;
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new UnreadableBountyResponseError(name);
  return value;
}

function numberField(record: Record<string, unknown>, key: string, path = key): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UnreadableBountyResponseError(path);
  }
  return value;
}

function booleanField(record: Record<string, unknown>, key: string, path = key): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') throw new UnreadableBountyResponseError(path);
  return value;
}

function stringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new UnreadableBountyResponseError(name);
  }
  return value as readonly string[];
}

/* ───────────────────────── projecting to the row the board shows ───────────────────────── */

function toBoardRow(summary: BountySummaryView, now: string): BountyBoardRow {
  return {
    id: summary.id,
    rewardCents: summary.rewardCents,
    rewardLabel: rewardLabel(summary.rewardCents, summary.currency),
    currency: summary.currency,
    repoLabel: `${summary.repository.repoOwner}/${summary.repository.repoName}`,
    issueNumber: summary.issueNumber,
    issueUrl: summary.issueUrl,
    status: summary.status,
    mode: summary.mode,
    sponsorCount: summary.funds.length,
    claimedByAgentId: summary.claimedAgentId,
    expiresLabel: summary.expiresAt === null ? null : remainingLabel(summary.expiresAt, now),
  };
}

/**
 * Reward first, then the older bounty ahead of the newer one.
 *
 * Total, so two equal bounties do not swap places between two reads of an
 * unchanged board — an ordering that is stable within one render and arbitrary
 * between two is a bug report waiting for somebody to notice it.
 */
function byRewardThenAge(left: BountySummaryView, right: BountySummaryView): number {
  if (left.rewardCents !== right.rewardCents) return right.rewardCents - left.rewardCents;
  const byAge = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  return byAge === 0 || Number.isNaN(byAge) ? left.id.localeCompare(right.id) : byAge;
}

/**
 * The board's own handle on the database.
 *
 * Exported for a caller that wants to read the same pool this view does rather
 * than opening a second one. It exists mostly to be the ONE place the pool is
 * reached from, so a second read model in this app has one obvious way in.
 */
export async function boardDatabase(): Promise<Database> {
  const { database } = await sharedRuntime();
  return database;
}
