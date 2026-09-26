import { GUILD_ROLES, type GuildRole } from './domain.js';

/**
 * Reading untrusted input, and the refusal each bad shape becomes.
 *
 * `act()` hands an action's payload through as a generic, so a narrower
 * parameter in a `run` is not checked by anything: `act('guild.fund', {})`
 * compiles clean and the handler then reads `guildId` off `undefined`. Every
 * action here takes `unknown` and is guarded, and the guard is a function that
 * returns the REASON so the caller is told which field was wrong rather than
 * just that something was.
 *
 * The pattern is progression's, for the reason its own comment gives: the
 * rejection is built from the verdict and never from the payload, so the
 * guaranteed caller cannot be reading the input back.
 */

export type GuildRejectionReason =
  | 'not-an-object'
  | 'field-missing'
  | 'field-not-a-string'
  | 'field-empty'
  | 'field-not-an-integer'
  | 'field-out-of-range'
  | 'field-not-a-known-instant';

export interface GuildRejection {
  readonly reason: GuildRejectionReason;
  /** Which field, so a caller fixing a request knows where to look. */
  readonly field?: string;
}

/** What each action wanted, as a sentence the caller can act on. */
export const GUILD_CREATE_SHAPE =
  'Creating a guild takes a name (non-empty, folded to lower case) and a tag (1-32 characters, folded to lower case).';
export const GUILD_JOIN_SHAPE = 'Joining takes a guildId and an agentId, each a non-empty string.';
export const GUILD_LEAVE_SHAPE = 'Leaving takes a guildId and an agentId, each a non-empty string.';
export const GUILD_MEMBERS_SHAPE = 'Reading a roster takes a guildId, a non-empty string.';
export const GUILD_ROLES_SHAPE = 'Reading roles takes a guildId, a non-empty string.';
export const GUILD_CONTRIBUTE_SHAPE =
  'A contribution takes a guildId, a contributorUserId, and amountCents as a positive whole number of cents.';
export const GUILD_FUND_SHAPE =
  'A commitment takes a guildId, a bountyId, and amountCents as a positive whole number of cents. It records an earmark; it moves no money.';
export const GUILD_TREASURY_SHAPE = 'Reading a treasury takes a guildId, a non-empty string.';
export const GUILD_QUEST_START_SHAPE =
  'Starting a quest takes a guildId, a title, a goal as a whole number of at least 1, and optionally a repository as "owner/name".';
export const GUILD_QUESTS_SHAPE = 'Reading quests takes a guildId, a non-empty string.';
export const GUILD_TALLY_SHAPE =
  'A tally takes a from and a to, each an ISO instant, with `from` strictly before `to`.';

/** The error a refused payload becomes. */
export function guildInputRejected(
  action: string,
  rejection: GuildRejection,
  expected: string,
): Error {
  const where = rejection.field === undefined ? '' : ` (${rejection.field})`;
  return Object.assign(new Error(`${action} rejected${where}: ${rejection.reason}. ${expected}`), {
    code: 'malformed-input',
  });
}

/* ─────────────────────────── the field readers ─────────────────────────── */

function readString(
  input: Record<string, unknown>,
  field: string,
): { readonly ok: true; readonly value: string } | GuildRejection {
  const value = input[field];
  if (value === undefined || value === null) return { reason: 'field-missing', field };
  if (typeof value !== 'string') return { reason: 'field-not-a-string', field };
  if (value.trim().length === 0) return { reason: 'field-empty', field };
  return { ok: true, value: value.trim() };
}

function readPositiveCents(
  input: Record<string, unknown>,
  field: string,
): { readonly ok: true; readonly value: number } | GuildRejection {
  const value = input[field];
  if (value === undefined || value === null) return { reason: 'field-missing', field };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { reason: 'field-not-an-integer', field };
  }
  // An integer, and positive. Zero is refused rather than recorded: a
  // zero-cent commitment is not a commitment, and the column's CHECK says
  // amount_cents > 0, so accepting it here would produce a row the database
  // rejects three layers down with a worse message.
  if (!Number.isInteger(value) || value <= 0) return { reason: 'field-out-of-range', field };
  return { ok: true, value };
}

function readGoal(
  input: Record<string, unknown>,
  field: string,
): { readonly ok: true; readonly value: number } | GuildRejection {
  const value = input[field];
  if (value === undefined || value === null) return { reason: 'field-missing', field };
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { reason: 'field-not-an-integer', field };
  }
  if (value < 1) return { reason: 'field-out-of-range', field };
  return { ok: true, value };
}

function readInstant(
  input: Record<string, unknown>,
  field: string,
): { readonly ok: true; readonly value: string } | GuildRejection {
  const value = input[field];
  if (value === undefined || value === null) return { reason: 'field-missing', field };
  if (typeof value !== 'string') return { reason: 'field-not-a-string', field };
  if (Number.isNaN(Date.parse(value))) return { reason: 'field-not-a-known-instant', field };
  return { ok: true, value };
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
  return typeof input === 'object' && input !== null
    ? (input as Record<string, unknown>)
    : undefined;
}

/* ─────────────────────────── the per-action readers ─────────────────────────── */

export interface GuildCreateInput {
  readonly name: string;
  readonly tag: string;
}

export function whyGuildCreateIsRejected(input: unknown): GuildRejection | undefined {
  const fields = asRecord(input);
  if (fields === undefined) return { reason: 'not-an-object' };
  const name = readString(fields, 'name');
  if (!('ok' in name)) return name;
  const tag = readString(fields, 'tag');
  if (!('ok' in tag)) return tag;
  if (tag.value.length > 32) return { reason: 'field-out-of-range', field: 'tag' };
  return undefined;
}

export function readGuildCreate(input: unknown): GuildCreateInput | GuildRejection {
  const rejection = whyGuildCreateIsRejected(input);
  if (rejection !== undefined) return rejection;
  const fields = input as Record<string, unknown>;
  return {
    name: (fields['name'] as string).trim().toLowerCase(),
    tag: (fields['tag'] as string).trim().toLowerCase(),
  };
}

export interface GuildMembershipInput {
  readonly guildId: string;
  readonly agentId: string;
}

function readMembership(input: unknown): GuildMembershipInput | GuildRejection {
  const fields = asRecord(input);
  if (fields === undefined) return { reason: 'not-an-object' };
  const guildId = readString(fields, 'guildId');
  if (!('ok' in guildId)) return guildId;
  const agentId = readString(fields, 'agentId');
  if (!('ok' in agentId)) return agentId;
  return { guildId: guildId.value, agentId: agentId.value };
}

function whyMembershipRejected(input: unknown): GuildRejection | undefined {
  const fields = asRecord(input);
  if (fields === undefined) return { reason: 'not-an-object' };
  for (const field of ['guildId', 'agentId'] as const) {
    const read = readString(fields, field);
    if (!('ok' in read)) return read;
  }
  return undefined;
}

// Joining and leaving take the same two ids, and the reasons are the same
// reasons. One implementation rather than two, because a caller who gets
// `guild.join rejected: field-missing (agentId)` and `guild.leave rejected:
// field-missing (agentId)` deserves to be getting the same answer.
export const whyGuildJoinIsRejected = whyMembershipRejected;
export const whyGuildLeaveIsRejected = whyMembershipRejected;
export const readGuildJoin = readMembership;
export const readGuildLeave = readMembership;

export function whyGuildReadIsRejected(input: unknown): GuildRejection | undefined {
  const fields = asRecord(input);
  if (fields === undefined) return { reason: 'not-an-object' };
  const guildId = readString(fields, 'guildId');
  return 'ok' in guildId ? undefined : guildId;
}

export function readGuildId(input: unknown): { guildId: string } | GuildRejection {
  const rejection = whyGuildReadIsRejected(input);
  if (rejection !== undefined) return rejection;
  return { guildId: ((input as Record<string, unknown>)['guildId'] as string).trim() };
}

export interface GuildContributeInput {
  readonly guildId: string;
  readonly contributorUserId: string;
  readonly amountCents: number;
}

export function readGuildContribute(input: unknown): GuildContributeInput | GuildRejection {
  const fields = asRecord(input);
  if (fields === undefined) return { reason: 'not-an-object' };
  const guildId = readString(fields, 'guildId');
  if (!('ok' in guildId)) return guildId;
  const contributor = readString(fields, 'contributorUserId');
  if (!('ok' in contributor)) return contributor;
  const amount = readPositiveCents(fields, 'amountCents');
  if (!('ok' in amount)) return amount;
  return {
    guildId: guildId.value,
    contributorUserId: contributor.value,
    amountCents: amount.value,
  };
}

export interface GuildFundInput {
  readonly guildId: string;
  readonly bountyId: string;
  readonly agentId: string;
  readonly amountCents: number;
}

export function readGuildFund(input: unknown): GuildFundInput | GuildRejection {
  const fields = asRecord(input);
  if (fields === undefined) return { reason: 'not-an-object' };
  const guildId = readString(fields, 'guildId');
  if (!('ok' in guildId)) return guildId;
  const bountyId = readString(fields, 'bountyId');
  if (!('ok' in bountyId)) return bountyId;
  const agentId = readString(fields, 'agentId');
  if (!('ok' in agentId)) return agentId;
  const amount = readPositiveCents(fields, 'amountCents');
  if (!('ok' in amount)) return amount;
  return {
    guildId: guildId.value,
    bountyId: bountyId.value,
    agentId: agentId.value,
    amountCents: amount.value,
  };
}

export interface GuildQuestStartInput {
  readonly guildId: string;
  readonly title: string;
  readonly goal: number;
  readonly repository: string | null;
}

/**
 * The `owner/name` rule, applied rather than trusted.
 *
 * A quest's scope is compared as text against the repository an outcome
 * reported, so a scope of `owner/Name` against work on `owner/name` is a quest
 * nobody can finish — a bug that only appears once a guild has waited weeks for
 * a counter that will not move. Folding both ends at write and read time is the
 * fix, and it is why `repository` is normalised here rather than stored raw.
 */
export function normaliseRepository(value: string): string {
  return value.trim().toLowerCase();
}

export function repositoryProblem(value: string): string | undefined {
  const normalised = normaliseRepository(value);
  const parts = normalised.split('/');
  if (parts.length !== 2) {
    return 'a repository is "owner/name" with exactly one slash';
  }
  if (parts.some((part) => part === undefined || part.length === 0)) {
    return 'both halves of "owner/name" must be non-empty';
  }
  return undefined;
}

export function readGuildQuestStart(input: unknown): GuildQuestStartInput | GuildRejection {
  const fields = asRecord(input);
  if (fields === undefined) return { reason: 'not-an-object' };
  const guildId = readString(fields, 'guildId');
  if (!('ok' in guildId)) return guildId;
  const title = readString(fields, 'title');
  if (!('ok' in title)) return title;
  const goal = readGoal(fields, 'goal');
  if (!('ok' in goal)) return goal;

  const raw = fields['repository'];
  if (raw === undefined || raw === null) {
    return { guildId: guildId.value, title: title.value, goal: goal.value, repository: null };
  }
  if (typeof raw !== 'string') return { reason: 'field-not-a-string', field: 'repository' };
  const problem = repositoryProblem(raw);
  if (problem !== undefined) return { reason: 'field-out-of-range', field: 'repository' };
  return {
    guildId: guildId.value,
    title: title.value,
    goal: goal.value,
    repository: normaliseRepository(raw),
  };
}

export interface GuildTallyInput {
  readonly from: string;
  readonly to: string;
}

/**
 * The window, checked for being a window.
 *
 * An inverted or zero-length range is refused rather than answered with an empty
 * board, because an empty board reads as "nobody did anything this week" and
 * that is a claim about the world made by a caller who passed the arguments
 * backwards. Comparing parsed instants rather than strings, so a caller who sends
 * `2026-01-02T00:00:00Z` and `2026-01-01T23:00:00-01:00` — the same instant,
 * written two ways — is not told the range is inverted.
 */
export function readGuildTallyWindow(input: unknown): GuildTallyInput | GuildRejection {
  const fields = asRecord(input);
  if (fields === undefined) return { reason: 'not-an-object' };
  const from = readInstant(fields, 'from');
  if (!('ok' in from)) return from;
  const to = readInstant(fields, 'to');
  if (!('ok' in to)) return to;
  if (Date.parse(from.value) >= Date.parse(to.value)) {
    return { reason: 'field-out-of-range', field: 'to' };
  }
  return { from: from.value, to: to.value };
}

/* ─────────────────────────── the roles vocabulary ─────────────────────────── */

/**
 * Whether a value names a role this build has.
 *
 * A closed check against the same list the storage layer's CHECK spells out, so
 * a role that reaches the database is one a reader can classify and a role a
 * caller cannot invent. The two lists are copies — infrastructure may not import
 * the layer that consumes it — and
 * `tests/unit/guild-role-signal-durability.test.ts` reads both, which is the
 * check a shared import could not give for free.
 */
export function isGuildRole(value: unknown): value is GuildRole {
  return typeof value === 'string' && (GUILD_ROLES as readonly string[]).includes(value);
}
