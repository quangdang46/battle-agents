import {
  DEFAULT_METRIC,
  LEADERBOARD_METRICS,
  METRIC_UNITS,
  PUBLIC_PROFILE_FIELDS,
  type CanTalkToDecision,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardRow,
  type Message,
  type ProfileRecord,
  type PublicProfile,
} from './domain.js';

/**
 * The social rules, as pure functions.
 *
 * No clock, no storage, no event bus. Everything a message has to satisfy
 * before it is sent, everything a profile is allowed to show, and everything
 * that decides a board's order is a function of its arguments, which is what
 * makes each of them testable at the boundary instead of only through a
 * database.
 *
 * The two that carry the most weight are `readDecision` and `publicProfileOf`,
 * and both exist because of the same asymmetry: what a caller may be REFUSED
 * is cheap to get right, while what a caller may be SHOWN is where the damage
 * happens. So the ACL parser denies by default, and the profile is an
 * enumeration.
 */

/* ───────────────────────────── bodies ───────────────────────────── */

/**
 * The longest body this feature will store.
 *
 * A bound rather than a policy: a message is prose somebody typed, and a
 * megabyte of it is a payload for something other than a message. The number is
 * generous enough that no honest message reaches it.
 */
export const MAX_BODY_LENGTH = 8_000;

/**
 * Why a body cannot be sent, or undefined when it can.
 *
 * A reason string rather than a boolean, because the answer a caller gets is
 * the answer, and "false" leaves them to guess which of three things was wrong.
 */
export function bodyProblem(body: unknown): string | undefined {
  if (typeof body !== 'string') {
    return 'the body must be text';
  }
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return 'the body is empty';
  }
  if (trimmed.length > MAX_BODY_LENGTH) {
    return `the body is ${trimmed.length} characters; the limit is ${MAX_BODY_LENGTH}`;
  }
  return undefined;
}

/**
 * The body as it is stored: trimmed at the ends, verbatim in the middle.
 *
 * Trimming rather than rejecting, because leading and trailing whitespace is
 * an artefact of a command line rather than something anybody meant to send.
 * Interior whitespace is untouched, which is what lets a body be a sentence
 * with more than one word in it.
 */
export function normaliseBody(body: string): string {
  return body.trim();
}

/* ───────────────────────────── addressing ───────────────────────────── */

/**
 * Why a pair of recipient fields is not a message, or undefined when it is.
 *
 * The rule is exactly one of the two. A row with both null is a message to
 * nobody; a row with both set is a direct message to one agent and a broadcast
 * to a guild at the same time, and every reader of it has to pick which.
 *
 * Enforced here rather than by a database constraint because the table has
 * none today, and adding one means a migration in a tree with other work in
 * flight. That is a deliberate deferral and it has a cost, stated in
 * feature.ts: a write that does not go through this feature is not checked.
 */
export function addressProblem(
  toAgentId: string | null,
  guildId: string | null,
): string | undefined {
  if (toAgentId === null && guildId === null) {
    return 'a message needs either a recipient agent or a guild';
  }
  if (toAgentId !== null && guildId !== null) {
    return 'a message is either direct or a guild broadcast, not both';
  }
  if (toAgentId !== null && toAgentId.trim().length === 0) {
    return 'the recipient agent id is empty';
  }
  if (guildId !== null && guildId.trim().length === 0) {
    return 'the guild id is empty';
  }
  return undefined;
}

/* ───────────────────────────── the ACL ───────────────────────────── */

/**
 * What the ACL answered, whatever it answered.
 *
 * A total function over `unknown`, and the total is the point. The ACL is
 * provided by another feature that does not exist yet, so this is the boundary
 * between two independently built pieces: any answer that is not
 * `{allowed: true}` denies. A missing field, a string where a boolean belongs,
 * `null`, a thrown value upstream — all of them come out as "not allowed",
 * because the alternative is a messaging feature whose authorization fails
 * open on a shape mismatch, which is the failure nobody would notice.
 */
export function readDecision(answer: unknown): CanTalkToDecision {
  if (typeof answer !== 'object' || answer === null) {
    return { allowed: false, reason: 'the authorization service did not return a decision' };
  }
  const candidate = answer as { allowed?: unknown; reason?: unknown };
  const reason =
    typeof candidate.reason === 'string' && candidate.reason.length > 0
      ? candidate.reason
      : undefined;

  // "Not a decision" and "a decision that said no" are told apart, because the
  // first is a broken provider and the second is working as designed, and an
  // operator debugging a refusal needs to know which one they are looking at.
  if (typeof candidate.allowed !== 'boolean') {
    return { allowed: false, reason: 'the authorization service did not return a decision' };
  }
  if (candidate.allowed === false) {
    return {
      allowed: false,
      reason: reason ?? 'the sender is not permitted to reach that recipient',
    };
  }
  return { allowed: true, reason: reason ?? 'permitted' };
}

/* ───────────────────────────── profile ───────────────────────────── */

/**
 * The public view of a character, built field by field.
 *
 * Every line names its field. There is no spread and no `delete`, because a
 * builder that starts from the stored record and removes what looks private
 * only protects against the fields somebody already thought about — and the
 * next column added to `agents` is exactly the one nobody thought about. This
 * one can only ever publish what it spells out.
 *
 * The record is typed, so a field it does not have cannot be read here; the
 * exclusion that matters is the one below, where it has a field it must not
 * hand on.
 */
export function publicProfileOf(record: ProfileRecord): PublicProfile {
  return {
    agentId: record.agentId,
    name: record.name,
    harness: record.harness,
    level: record.level,
    xp: record.xp,
    build: record.build,
    status: record.status,
    lastSeenAt: record.lastSeenAt,
    createdAt: record.createdAt,
    battlesWon: record.battlesWon,
    battlesLost: record.battlesLost,
    prsOpened: record.prsOpened,
    prsMerged: record.prsMerged,
    prsRejected: record.prsRejected,
    achievementCodes: [...record.achievementCodes],
    projectNames: [...record.projectNames],
    // Null until the guild feature ships a membership table. See domain.ts.
    guildId: record.guildId,
  };
}

/** The published field names, for a caller that renders the shape. */
export function publicProfileFields(): readonly string[] {
  return [...PUBLIC_PROFILE_FIELDS];
}

/* ───────────────────────────── leaderboard ───────────────────────────── */

/** Whether a value names a board this build has. */
export function isLeaderboardMetric(value: unknown): value is LeaderboardMetric {
  return typeof value === 'string' && (LEADERBOARD_METRICS as readonly string[]).includes(value);
}

/** The board a caller asked for, or the default. */
export function metricOrDefault(value: unknown): LeaderboardMetric {
  return isLeaderboardMetric(value) ? value : DEFAULT_METRIC;
}

/**
 * The metric's value for one row, in `METRIC_UNITS`.
 *
 * Win rate is the one that needs arguing about. A character with no battles has
 * a 0/0, and every formula that divides produces either NaN or a division by
 * zero; the two ways out are to treat it as 100% (a perfect record nobody has
 * earned) or as 0% (no record yet). This is 0%, so a new character sorts to the
 * bottom of the win-rate board rather than the top of it. The alternative makes
 * the best way to lead a board be to have never fought.
 */
export function scoreFor(row: LeaderboardRow, metric: LeaderboardMetric): number {
  switch (metric) {
    case 'level':
      return row.level;
    case 'xp':
      return row.xp;
    case 'reputation':
      return row.reputation;
    case 'win_rate': {
      const fought = row.battlesWon + row.battlesLost;
      if (fought <= 0) {
        return 0;
      }
      return Math.round((row.battlesWon / fought) * 10_000);
    }
  }
}

/**
 * Orders a board and numbers it.
 *
 * Highest score first, then name, then id. The last two are there so the board
 * is the same on every request: without a total order two agents on the same
 * score can swap places between two calls, and a leaderboard that reshuffles
 * when nobody did anything is one nobody believes.
 *
 * The store is asked to sort, but it is not trusted to: this function sorts,
 * because the order is a rule and rules live in the feature.
 */
export function rankBoard(
  rows: readonly LeaderboardRow[],
  metric: LeaderboardMetric,
  limit: number,
): LeaderboardEntry[] {
  const ordered = [...rows].sort((left, right) => {
    const byScore = scoreFor(right, metric) - scoreFor(left, metric);
    if (byScore !== 0) {
      return byScore;
    }
    const byName = left.name.localeCompare(right.name);
    return byName !== 0 ? byName : left.agentId.localeCompare(right.agentId);
  });

  return ordered.slice(0, Math.max(0, limit)).map((row, index) => ({
    rank: index + 1,
    agentId: row.agentId,
    name: row.name,
    metric,
    score: scoreFor(row, metric),
    unit: METRIC_UNITS[metric],
    level: row.level,
    battlesWon: row.battlesWon,
    battlesLost: row.battlesLost,
  }));
}

/** The most rows a board will return, whatever a caller asks for. */
export const MAX_BOARD_SIZE = 100;

/** A caller-supplied limit, clamped into something a store should be asked for. */
export function boardLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 10;
  }
  return Math.min(MAX_BOARD_SIZE, Math.max(1, Math.trunc(value)));
}

/* ───────────────────────────── the CLI's argument shape ───────────────────────────── */

/**
 * The command line hands an action one string, not a parsed object.
 *
 * `packages/cli/src/commands.ts` resolves `social send <from> <to> <body>` and
 * calls `act('social.send', { args: args.join(' ') })`. Nothing in this
 * repository read `input.args` before, because every other action's input is
 * an object the CLI does not build — which is why the CLI half of "a message can
 * be sent" was untested rather than working. The grammar is therefore fixed
 * here, in the feature, and it is a decision rather than a detail:
 *
 *   fixed  leading arguments, in order, separated by whitespace
 *   body   everything after them, verbatim, so a sentence is one argument
 *
 * No quoting is processed. A shell has already removed one layer of quotes
 * before the CLI sees the string, and inventing a second quoting dialect in
 * the feature would mean two layers disagreeing about the same body.
 *
 * The sender is a leading argument, which means a caller on this path states
 * who it is. That is not authentication and nothing here pretends otherwise —
 * see the note on principals in feature.ts.
 */
export interface SplitArgs {
  readonly head: readonly string[];
  readonly rest: string;
}

/**
 * Splits off `count` leading arguments, leaving the remainder as one body.
 *
 * An empty remainder is allowed here and only here: the readers that take a
 * body are the ones that must refuse an empty one, because a read taking a
 * single agent id has nothing left over by design. Returns a reason rather than
 * undefined so the caller can put the action's own name in the message, which
 * is the only part of the answer that tells somebody which command they got
 * wrong.
 */
export function splitArgs(
  args: string,
  count: number,
):
  | { readonly ok: true; readonly split: SplitArgs }
  | { readonly ok: false; readonly reason: string } {
  const trimmed = args.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'no arguments were given' };
  }
  // Tokens are found with a scanner rather than by splitting and rejoining. The
  // rejoin form collapses every run of whitespace in the body, which silently
  // rewrites what somebody typed — and `normaliseBody`'s promise that interior
  // whitespace is untouched is then a lie. Slicing the ORIGINAL string from
  // where the last token ended is what keeps the body byte-for-byte.
  const token = /\S+/g;
  const head: string[] = [];
  let consumed = 0;
  while (head.length < count) {
    const match = token.exec(trimmed);
    if (match === null) {
      return {
        ok: false,
        reason: `expected ${count} argument${count === 1 ? '' : 's'}, received ${head.length}`,
      };
    }
    head.push(match[0]);
    consumed = match.index + match[0].length;
  }
  return { ok: true, split: { head, rest: trimmed.slice(consumed).trim() } };
}

/**
 * Reads a body from either the structured form or the command line's string.
 *
 * Two shapes at one action, because there are two callers and the difference
 * is not a detail of either of them: a surface holding an authenticated agent
 * passes fields, and the CLI passes one joined string because that is all it
 * has. A caller that passes neither gets an answer naming the action.
 */
export type ParsedInput<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

export function readSendInput(
  input: unknown,
  actionId: string,
): ParsedInput<{
  readonly fromAgentId: string;
  readonly toAgentId: string;
  readonly body: string;
}> {
  if (typeof input === 'object' && input !== null) {
    const fields = input as {
      fromAgentId?: unknown;
      toAgentId?: unknown;
      body?: unknown;
      args?: unknown;
    };
    if (fields.body === undefined && typeof fields.args === 'string') {
      const split = splitArgs(fields.args, 2);
      if (!split.ok) {
        return {
          ok: false,
          reason: `${actionId} expects <fromAgentId> <toAgentId> <body…>: ${split.reason}`,
        };
      }
      if (split.split.rest.length === 0) {
        return { ok: false, reason: `${actionId}: the message body is empty` };
      }
      return {
        ok: true,
        value: {
          fromAgentId: split.split.head[0] ?? '',
          toAgentId: split.split.head[1] ?? '',
          body: split.split.rest,
        },
      };
    }
    const missing = (['fromAgentId', 'toAgentId', 'body'] as const).filter(
      (field) => typeof fields[field] !== 'string',
    );
    if (missing.length > 0) {
      return { ok: false, reason: `${actionId} is missing ${missing.join(', ')}` };
    }
    return {
      ok: true,
      value: {
        fromAgentId: fields.fromAgentId as string,
        toAgentId: fields.toAgentId as string,
        body: fields.body as string,
      },
    };
  }
  return {
    ok: false,
    reason: `${actionId} takes an object of fields, or { args: "<from> <to> <body>" } from the command line`,
  };
}

export function readBroadcastInput(
  input: unknown,
  actionId: string,
): ParsedInput<{
  readonly fromAgentId: string;
  readonly guildId: string;
  readonly body: string;
}> {
  if (typeof input === 'object' && input !== null) {
    const fields = input as {
      fromAgentId?: unknown;
      guildId?: unknown;
      body?: unknown;
      args?: unknown;
    };
    if (fields.body === undefined && typeof fields.args === 'string') {
      const split = splitArgs(fields.args, 2);
      if (!split.ok) {
        return {
          ok: false,
          reason: `${actionId} expects <fromAgentId> <guildId> <body…>: ${split.reason}`,
        };
      }
      if (split.split.rest.length === 0) {
        return { ok: false, reason: `${actionId}: the message body is empty` };
      }
      return {
        ok: true,
        value: {
          fromAgentId: split.split.head[0] ?? '',
          guildId: split.split.head[1] ?? '',
          body: split.split.rest,
        },
      };
    }
    const missing = (['fromAgentId', 'guildId', 'body'] as const).filter(
      (field) => typeof fields[field] !== 'string',
    );
    if (missing.length > 0) {
      return { ok: false, reason: `${actionId} is missing ${missing.join(', ')}` };
    }
    return {
      ok: true,
      value: {
        fromAgentId: fields.fromAgentId as string,
        guildId: fields.guildId as string,
        body: fields.body as string,
      },
    };
  }
  return {
    ok: false,
    reason: `${actionId} takes an object of fields, or { args: "<from> <guild> <body>" } from the command line`,
  };
}

/** Reads the single agent id every read-only social action takes. */
export function readAgentIdInput(
  input: unknown,
  actionId: string,
): ParsedInput<{ readonly agentId: string }> {
  if (typeof input === 'object' && input !== null) {
    const fields = input as { agentId?: unknown; args?: unknown };
    if (fields.agentId === undefined && typeof fields.args === 'string') {
      const split = splitArgs(fields.args, 1);
      return split.ok
        ? { ok: true, value: { agentId: split.split.head[0] ?? '' } }
        : { ok: false, reason: `${actionId} expects <agentId>: ${split.reason}` };
    }
    if (typeof fields.agentId !== 'string' || fields.agentId.trim().length === 0) {
      return { ok: false, reason: `${actionId} needs an agentId` };
    }
    return { ok: true, value: { agentId: fields.agentId } };
  }
  return { ok: false, reason: `${actionId} takes { agentId }` };
}

/* ───────────────────────────── delivery ───────────────────────────── */

/**
 * The attribution line a delivered message carries.
 *
 * Says "from" and names the agent, and never quotes the body: a renderer that
 * pasted the message into the sentence would make the attribution lie about
 * its own boundaries, which is the whole failure this is here to prevent.
 */
export function attributionFor(message: Message): string {
  return `message from agent ${message.fromAgentId}`;
}
