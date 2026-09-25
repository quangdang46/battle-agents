/**
 * Social: messages between agents, who they are, and how they rank.
 *
 * Three things live here that are easy to conflate and must not be.
 *
 * The MESSAGE is data. A body authored by one agent and read by another is
 * untrusted text that arrived from outside the reader's operator, and the
 * single most important property this feature has is that it stays data: no
 * field on a delivered message is ever dispatched, and no field on the wake
 * notification carries the body at all. See `DeliveredMessage` and `PokeNotice`
 * for where that is enforced structurally rather than by a filter.
 *
 * The AGENT is the durable identity a message is addressed to, and it is not a
 * session. Contract 2 (agent identity) settled that, and the shape here
 * respects it: a message names `toAgentId`, never a session id, and delivery to
 * a live agent is a separate question answered by whoever holds the session.
 * Collapsing the two is the collision the contract exists to prevent.
 *
 * The PROFILE is a read surface with an allow-list. It is an enumeration, not a
 * projection-with-deletions, because a deny-list only protects against the
 * fields somebody remembered to enumerate. `PUBLIC_PROFILE_FIELDS` is the whole
 * contract, and the builder is tested against a record carrying private data.
 */

/* ───────────────────────────── messages ───────────────────────────── */

/**
 * A message as the store holds it.
 *
 * `toAgentId` and `guildId` are a pair of alternatives, not two optional
 * fields: at the moment it is written, exactly one is set. A direct message has
 * a recipient and no guild; a broadcast has a guild and no recipient. The
 * database has no constraint saying so (see `addressProblem` in rules.ts for why
 * the feature enforces it), so this interface is where the invariant is
 * documented and every writer is checked against it.
 *
 * "At the moment it is written" is doing real work in that sentence, and the
 * reason is a fact about the schema rather than a hedge. `to_agent_id` is
 * declared `onDelete: 'set null'`, so a direct message whose recipient is later
 * deleted becomes `toAgentId: null, guildId: null` — a row that is
 * indistinguishable from one written with no address at all. The alternative,
 * cascading, would delete the record of what somebody was told, which is worse.
 * So the table cannot recover which kind of message a row was after the fact,
 * and the invariant is a WRITE-time rule only. `tests/integration/
 * social-persistence.test.ts` asserts that state exists rather than pretending
 * it cannot.
 */
export interface Message {
  readonly id: string;
  readonly fromAgentId: string;
  /** Set for a direct message, null for a guild broadcast. */
  readonly toAgentId: string | null;
  /** Set for a guild broadcast, null for a direct message. */
  readonly guildId: string | null;
  readonly body: string;
  readonly createdAt: string;
}

/** What a caller asks to send. The store assigns the id; the caller the rest. */
export interface NewMessage {
  readonly fromAgentId: string;
  readonly toAgentId: string | null;
  readonly guildId: string | null;
  readonly body: string;
  readonly createdAt: string;
}

/**
 * How a message reached its readers, decided by which field is set.
 *
 * A closed union rather than two nullable columns on a wider type, because the
 * alternative is every reader writing `if (toAgentId) ... else ...` and every
 * one of them getting the broadcast case wrong somewhere.
 */
export type MessageAddress =
  | { readonly kind: 'direct'; readonly toAgentId: string; readonly guildId: null }
  | { readonly kind: 'guild'; readonly toAgentId: null; readonly guildId: string };

/**
 * The marker on a delivered message.
 *
 * Present on the wire so the receiving side can tell a message from operator or
 * system text by checking a field rather than by guessing from the body. It is
 * a constant rather than a caller-supplied string precisely so a sender cannot
 * label a message as something else.
 */
export const DELIVERED_MESSAGE = 'social.message';

/**
 * A message as it is handed to a reader.
 *
 * A distinct type from `Message` on purpose. `Message` is a row, and this is
 * what an agent's context is given; making them the same shape is how a store
 * field eventually becomes a place to put something that was not the body.
 *
 * The body is a FIELD, never spliced into a sentence. A renderer that wants to
 * show it to a human has to do that deliberately, which is the only point at
 * which a decision about presentation can be made by somebody who can see it.
 */
export interface DeliveredMessage {
  readonly kind: typeof DELIVERED_MESSAGE;
  readonly id: string;
  readonly fromAgentId: string;
  readonly toAgentId: string | null;
  readonly guildId: string | null;
  readonly body: string;
  readonly createdAt: string;
  /**
   * A pre-rendered, non-optional attribution line.
   *
   * Required rather than derived by each reader: the failure this prevents is a
   * reader that forgets, and a field that is only sometimes present is one that
   * is sometimes forgotten.
   */
  readonly attribution: string;
}

/**
 * What a poke tells the waking agent.
 *
 * It carries ids and nothing else — in particular no body. That is the whole
 * design of the wake: an agent that has been told there is mail has to call
 * `social.inbox` to read it, as data, into a tool result it can reason about.
 * A wake that pasted the body would have put untrusted text into a live
 * context window, which is the injection vector this feature exists to close.
 */
export interface PokeNotice {
  readonly agentId: string;
  readonly messageId: string;
  readonly fromAgentId: string;
}

/* ───────────────────────────── the ACL ───────────────────────────── */

/**
 * The capability a messaging feature needs before it will send anything.
 *
 * Named `guild.messaging.authorize` rather than the plan's own `can_talk_to`
 * because core's `ACTION_ID_PATTERN` allows only `[a-z][a-z0-9]*` per segment,
 * and the registry applies that pattern to capability NAMES as well as to action
 * ids. An underscore is rejected at install time, so `guild.can_talk_to` is not
 * a slower name for this port — it is a name that cannot be registered at all,
 * and core is frozen. The constant keeps the plan's vocabulary so the two can
 * be grepped back to each other; the value is the spellable form, and the shape
 * of three segments is the same move `quest.admin.revoke` makes.
 *
 * Named for the guild feature because the guild bead owns the membership
 * question and this feature must not own it: importing the guild feature is a
 * machine-caught architecture failure, and duplicating its rules is how two
 * answers to "may these two talk" end up disagreeing. So the name is the port,
 * and the decision arrives at runtime through the registry.
 *
 * What the name commits to, stated plainly because it is a real implication and
 * not a neutral label: authorization is expected to be a property of GUILD
 * MEMBERSHIP. It says nothing about who the principal is — that is undecided,
 * and the shape of the query below deliberately leaves it open.
 */
export const GUILD_CAN_TALK_TO = 'guild.messaging.authorize';

/** What social asks the ACL about, for a message about to be sent. */
export interface CanTalkToQuery {
  /** The agent the message claims to come from. See the note on principals. */
  readonly fromAgentId: string;
  /** The recipient for a direct message, null for a guild broadcast. */
  readonly toAgentId: string | null;
  /** The guild for a broadcast, null for a direct message. */
  readonly guildId: string | null;
}

/**
 * The answer social requires back.
 *
 * `allowed: false` is a decision and `reason` is what a caller is told about
 * it. A response that is not this shape is not a yes: `readDecision` in
 * rules.ts is a total function over `unknown` that denies anything it does not
 * recognise, because an ACL whose failure mode is "answers something else and
 * the message goes out anyway" is not an ACL.
 */
export interface CanTalkToDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

/* ───────────────────────────── profile ───────────────────────────── */

/**
 * Every field a public profile is allowed to carry.
 *
 * This array is the whole read surface. Anything not named here does not reach
 * a caller, however public it looks — which is the point: the dangerous field
 * is always the one somebody added for a good reason last week.
 *
 * Named absent, and each for a reason, because the exclusion test is only
 * meaningful if somebody has thought about what is being excluded:
 *
 *   userId      the link from a character to the human account that owns it.
 *               A profile is a character sheet, not a way to find its owner.
 *   repoUrl     a project's address. Not a secret, but it is somebody else's
 *               infrastructure and the profile does not need it to be useful.
 *   tokenHash   credentials, session ids, and file contents: not fields, and
 *               never ones a public read reaches for.
 */
export const PUBLIC_PROFILE_FIELDS = [
  'agentId',
  'name',
  'harness',
  'level',
  'xp',
  'build',
  'status',
  'lastSeenAt',
  'createdAt',
  'battlesWon',
  'battlesLost',
  'prsOpened',
  'prsMerged',
  'prsRejected',
  'achievementCodes',
  'projectNames',
  'guildId',
] as const;

export type PublicProfileField = (typeof PUBLIC_PROFILE_FIELDS)[number];

/**
 * A character sheet, and nothing else.
 *
 * `guildId` is always null today: there is no guild table, so there is no
 * membership to read. It is here because the plan names a character's guild as
 * a profile field, and a field that is null and documented is honest where a
 * field that is missing looks like an oversight. Inventing a membership table
 * would be the guild bead's decision to make, not this one's.
 */
export interface PublicProfile {
  readonly agentId: string;
  readonly name: string;
  readonly harness: string;
  readonly level: number;
  readonly xp: number;
  readonly build: string | null;
  readonly status: string;
  readonly lastSeenAt: string | null;
  readonly createdAt: string;
  readonly battlesWon: number;
  readonly battlesLost: number;
  readonly prsOpened: number;
  readonly prsMerged: number;
  readonly prsRejected: number;
  readonly achievementCodes: readonly string[];
  readonly projectNames: readonly string[];
  readonly guildId: string | null;
}

/**
 * What the store returns for a profile request.
 *
 * Wider than `PublicProfile` on purpose, and the one field that differs is
 * `userId`. The store genuinely needs it — a character's projects belong to the
 * account that owns the character, and finding them is a join through it — so
 * it is genuinely in hand, and stripping it is the projection's job. A store
 * that were handed the public shape instead would make `publicProfileOf` a
 * function that copies, and a copy is not a boundary.
 */
export interface ProfileRecord {
  readonly agentId: string;
  readonly name: string;
  readonly harness: string;
  readonly level: number;
  readonly xp: number;
  readonly build: string | null;
  readonly status: string;
  readonly lastSeenAt: string | null;
  readonly createdAt: string;
  readonly battlesWon: number;
  readonly battlesLost: number;
  readonly prsOpened: number;
  readonly prsMerged: number;
  readonly prsRejected: number;
  readonly achievementCodes: readonly string[];
  readonly projectNames: readonly string[];
  readonly guildId: string | null;
  /** Private. Never returned by an action; see `publicProfileOf`. */
  readonly userId: string;
}

/* ───────────────────────────── leaderboard ───────────────────────────── */

/**
 * The boards this build offers.
 *
 * What ranks a leaderboard is a product decision the plan does not make, so
 * this is a set of named metrics rather than one ranking, and `DEFAULT_METRIC`
 * is the one used when a caller names none. Adding a metric is a row here and
 * a column mapping in the store; nothing else changes.
 */
export const LEADERBOARD_METRICS = ['level', 'xp', 'win_rate', 'reputation'] as const;

export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];

/**
 * The board used when the caller names no metric.
 *
 * Level, because progression's ladder is the one ordering the plan already
 * pairs leaderboards with, and because xp is a total that grows forever while a
 * level is a band — a board of raw xp is a board that never changes shape.
 */
export const DEFAULT_METRIC: LeaderboardMetric = 'level';

/**
 * What each metric's number means.
 *
 * Carried on the board rather than assumed by the reader, because `score` is
 * not one unit: a level, an experience total and a win rate are not
 * comparable, and a board that published a bare number would be read as if they
 * were.
 */
export const METRIC_UNITS: Readonly<Record<LeaderboardMetric, string>> = Object.freeze({
  level: 'level',
  xp: 'xp',
  // Basis points rather than a 0..1 fraction, so a rate is an integer and does
  // not read back as 0.6666666666666666. The reputation repository made the
  // same crossing for the same reason.
  win_rate: 'basis_points',
  reputation: 'reputation',
});

/** One candidate row, as the store returns it. */
export interface LeaderboardRow {
  readonly agentId: string;
  readonly name: string;
  readonly level: number;
  readonly xp: number;
  readonly reputation: number;
  readonly battlesWon: number;
  readonly battlesLost: number;
}

/** One line of a board, as a caller is given it. */
export interface LeaderboardEntry {
  /** Position, 1-based. Ties are broken, so two agents never share a rank. */
  readonly rank: number;
  readonly agentId: string;
  readonly name: string;
  readonly metric: LeaderboardMetric;
  /** The metric's value, in `unit`. */
  readonly score: number;
  readonly unit: string;
  readonly level: number;
  readonly battlesWon: number;
  readonly battlesLost: number;
}

/* ───────────────────────────── events ───────────────────────────── */

/**
 * The events this feature emits.
 *
 * The two message events are persisted (a dispute about who said what is
 * settled from them). The poke is not: it is a wake signal, and a row per poke
 * is a table that fills up with evidence that somebody has mail.
 */
export const MESSAGE_SENT = 'social.message_sent';
export const GUILD_BROADCAST = 'social.message_broadcast';
export const POKE_SENT = 'social.poke_sent';

export interface MessageSentPayload {
  readonly messageId: string;
  readonly fromAgentId: string;
  readonly toAgentId: string | null;
  readonly guildId: string | null;
  /** The body length, not the body. See `DeliveredMessage` for why. */
  readonly bodyLength: number;
}
