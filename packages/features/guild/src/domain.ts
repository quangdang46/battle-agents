/**
 * Guild vocabulary: the four team roles, the treasury's two kinds of row, the
 * money that is not money, and the events the feature owns.
 *
 * ── What a guild is here ───────────────────────────────────────────────────
 *
 * §10.4 calls guilds the social endgame: shared agents, projects and research,
 * guild quests like "fix 10 issues in project X", weekly Guild A versus Guild B
 * tallies, and explicitly NO pay-to-win. That last clause is the one this file
 * is shaped by. A pay-to-win failure is not a balance that is too large, it is a
 * score that money can move — so the design consequence is that **no path
 * exists from a treasury row to a guild's standing.** Not "we kept it small":
 * there is no edge. `treasuryStandingInput` says so in one place, and
 * `tests/unit/rules.test.ts` breaks the assertion by earning a tall score with
 * an empty ledger.
 *
 * ── Why a role is not stored ───────────────────────────────────────────────
 *
 * §10.2: "Class from BEHAVIOUR not model name", and the TFT half of the same
 * section is "role COVERAGE over raw stacking" — three Coder is not three times
 * a Coder. So a role here is a projection over what an agent did, never a
 * label it chose and never a property of the model it runs on. There is no
 * `role` column on the membership, because a stored role is a claim with no
 * evidence beside it and a role a player can set is the exact thing the plan
 * forbids.
 */

/* ─────────────────────────────── roles ─────────────────────────────── */

/**
 * The four team roles, from §10.2's TFT synthesis.
 *
 * A closed union. A character that is none of them is a generalist, which is
 * the same word progression uses for a build no evidence has specialised, and
 * reusing it here means a caller already knows what to expect.
 */
export const GUILD_ROLES = ['researcher', 'coder', 'tester', 'reviewer'] as const;

export type GuildRole = (typeof GUILD_ROLES)[number];

/** What a character is before any behaviour has specialised it. */
export const DEFAULT_ROLE = 'generalist' as const;

export type GuildRoleOrGeneralist = GuildRole | typeof DEFAULT_ROLE;

/* ─────────────────────────── the treasury ─────────────────────────── */

/**
 * A treasury row is one of two things, and neither is a payment.
 *
 * `docs/design/payout-rail.md` section 1 is the reason: the platform does not
 * hold, route or process money. A contribution is a person saying they are
 * putting money in; a commitment is a guild earmarking money for one bounty.
 * Neither is a transfer, and the feature's own refund vocabulary says so out
 * loud rather than leaving a reader to assume a balance is escrowed.
 */
export const TREASURY_KINDS = ['contribution', 'commitment'] as const;

export type TreasuryKind = (typeof TREASURY_KINDS)[number];

/**
 * What is true of every treasury figure, in the same words, on purpose.
 *
 * The failure this exists to prevent is a reader seeing `balance_cents:
 * 50_000` and concluding the platform is holding fifty thousand dollars on a
 * guild's behalf. It is not, and a number is exactly the kind of thing that
 * gets screenshot-ed and believed. A guild that has "committed" 50_000 to a
 * bounty has recorded an intention, and the money that eventually moves is moved
 * by the people who own it, off this platform, through the bounty's own
 * funding path.
 *
 * It is exported so a test can assert the refusal carries it, which is the only
 * way the sentence is known to have survived an edit to the text above it.
 */
export const NO_MONEY_IS_HELD_HERE =
  'No money is held here and none was taken. This platform never takes a payment — sponsors pay ' +
  'solves directly, off-platform — so a treasury row records what the guild has agreed or ' +
  'earmarked, not a balance in escrow. The money behind it never left the person it belongs to.';

/** One treasury row, as a reader is given it. */
export interface TreasuryEntry {
  readonly id: string;
  readonly guildId: string;
  readonly kind: TreasuryKind;
  readonly amountCents: number;
  /** A contribution only. The person whose money it is. */
  readonly contributorUserId: string | null;
  /** A commitment only. The bounty earmarked. */
  readonly bountyId: string | null;
  /** A commitment only. Which member made the call. */
  readonly committedByAgentId: string | null;
  readonly createdAt: string;
}

/**
 * A guild's money, derived.
 *
 * Every field here is a sum or a count over `TreasuryEntry`. There is no
 * `balance` column anywhere in this feature, and `db:verify` fails the build if
 * one is added — the same arrangement that forbids `bounties.amount_cents`.
 */
export interface TreasuryBalance {
  readonly guildId: string;
  readonly contributedCents: number;
  readonly committedCents: number;
  /** `contributed - committed`. Negative is a real state, not a bug. */
  readonly balanceCents: number;
  readonly entryCount: number;
}

/* ──────────────────────────────── work ──────────────────────────────── */

/**
 * One completed outcome a guild has counted.
 *
 * The same row answers three questions — a quest's progress, the weekly tally,
 * and whether an outcome has already been counted — because three tables each
 * keeping their own copy of "what this guild finished" is how those copies stop
 * agreeing. `bountyId` is the dedup key, so a re-delivered GitHub merge is
 * recognisable as the outcome it already was.
 */
export interface WorkRecord {
  readonly id: string;
  readonly guildId: string;
  readonly agentId: string;
  readonly bountyId: string;
  /** `owner/name`, as the outcome reported it. A quest scopes on this. */
  readonly repository: string;
  /** The event this row is evidence of, kept so a reader can trace it. */
  readonly sourceType: string;
  readonly occurredAt: string;
  readonly recordedAt: string;
}

/* ─────────────────────────────── quests ─────────────────────────────── */

/**
 * A guild quest: "fix 10 issues in project X".
 *
 * `progress` is not a field. It is `count(WorkRecord)` filtered to this quest's
 * repository and start instant, and the reason is the one the bounty's funding
 * total sets: a stored counter is a number that is right until the second
 * contribution arrives and then is right about nothing. A reader who wants the
 * progress counts the rows.
 */
export interface GuildQuest {
  readonly id: string;
  readonly guildId: string;
  readonly title: string;
  /** `owner/name`, or null for a quest about any repository. */
  readonly repository: string | null;
  readonly goal: number;
  readonly createdAt: string;
  /** When the goal was FIRST met. A fact, not a total: a count cannot say when. */
  readonly completedAt: string | null;
}

/* ─────────────────────────────── roles' evidence ─────────────────────────────── */

/**
 * One observed behaviour that is evidence of a role.
 *
 * `sourceKey` identifies the durable fact, so a projection built from these rows
 * is idempotent: the same outcome arriving twice records once. A role derived by
 * counting rows with no way to tell them apart is a role that inflates every
 * time a webhook retries, and a role that inflates is a role the game pays for.
 */
export interface RoleSignal {
  readonly id: string;
  readonly agentId: string;
  readonly role: GuildRole;
  readonly weight: number;
  readonly sourceType: string;
  readonly sourceKey: string;
  readonly occurredAt: string;
}

/* ──────────────────────────── membership ──────────────────────────── */

export interface GuildMembership {
  readonly guildId: string;
  readonly agentId: string;
  readonly joinedAt: string;
}

export interface Guild {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly foundedByAgentId: string | null;
  readonly createdAt: string;
}

/* ───────────────────────────── the events ───────────────────────────── */

/**
 * The events this feature owns.
 *
 * One owner per type, and the registry throws on a duplicate — so none of these
 * may collide with a type another feature already declares in its
 * `persistedEvents`. They are all `guild.`-prefixed for that reason rather than
 * for tidiness: the social feature persists `social.message_broadcast`, and a
 * bare `guild.broadcast` would have been one rename away from a duplicate.
 */
export const GUILD_CREATED = 'guild.created';
export const GUILD_MEMBER_JOINED = 'guild.member_joined';
export const GUILD_MEMBER_LEFT = 'guild.member_left';
export const GUILD_TREASURY_CONTRIBUTED = 'guild.treasury_contributed';
export const GUILD_TREASURY_COMMITTED = 'guild.treasury_committed';
export const GUILD_QUEST_STARTED = 'guild.quest_started';
export const GUILD_QUEST_COMPLETED = 'guild.quest_completed';
export const GUILD_ROLE_EVIDENCED = 'guild.role_evidenced';
export const GUILD_TALLY_RECORDED = 'guild.tally_recorded';

/**
 * The events kept forever.
 *
 * Everything here is something a later reader has to be able to settle a
 * question from: who was in the guild when, what the treasury agreed, and when
 * a quest closed. The registry unions these with core's own list, so adding one
 * widens durability without a core edit — which is the property that makes this
 * feature addable at all.
 */
export const GUILD_PERSISTED_EVENTS: readonly string[] = [
  GUILD_CREATED,
  GUILD_MEMBER_JOINED,
  GUILD_MEMBER_LEFT,
  GUILD_TREASURY_CONTRIBUTED,
  GUILD_TREASURY_COMMITTED,
  GUILD_QUEST_STARTED,
  GUILD_QUEST_COMPLETED,
  GUILD_ROLE_EVIDENCED,
] as const;

/* ───────────────────────────── the ACL ───────────────────────────── */

/**
 * The capability social has been requiring and no feature has provided.
 *
 * `packages/features/social/src/domain.ts` declares `GUILD_CAN_TALK_TO` with
 * this exact string and refuses to send anything while it is missing, which is
 * the fail-closed half of an authorization boundary. This feature is the other
 * half: it answers the question, and it answers it as narrowly as it can.
 *
 * The name is not incidental. `guild.messaging.authorize` says the answer is
 * expected to be a property of guild MEMBERSHIP, which is the strongest claim
 * this repository can currently make — see the honesty note on
 * `canTalkToDecision` in `rules.ts` for what it still cannot say.
 */
export const GUILD_MESSAGING_AUTHORIZE = 'guild.messaging.authorize';

/** What social sends, and what this feature answers. */
export interface CanTalkToQuery {
  readonly fromAgentId: string;
  /** A direct message's recipient. Null for a guild broadcast. */
  readonly toAgentId: string | null;
  /** A broadcast's guild. Null for a direct message. */
  readonly guildId: string | null;
}

/**
 * The answer, in the shape social's `readDecision` expects.
 *
 * A total shape rather than a boolean, because "not allowed" and "the service
 * is not installed" are different facts and an operator reading a refusal needs
 * to know which one they are looking at.
 */
export interface CanTalkToDecision {
  readonly allowed: boolean;
  readonly reason: string;
}
