/**
 * Agent identity: the four id classes the plan keeps apart, and why blurring
 * any two of them is expensive.
 *
 *   User          a human, authenticated by GitHub. Owns things.
 *   Agent         a persistent character. Survives every terminal closing.
 *   Installation  a machine or container the agent runs on.
 *   Session       one run. Ends; the character does not.
 *
 * A credential is a fifth thing and deliberately not here: it is a revocable
 * secret rather than an identity, so it is modelled as a value the agent
 * feature stores, not as something that identifies anything.
 *
 * The ids are branded so they cannot be passed for one another. All four are
 * UUIDs in the database, which means a plain `string` lets `sessions.agent_id`
 * quietly receive a user id, and nothing complains until a character's history
 * is attributed to the wrong person.
 */

declare const brand: unique symbol;

/** A value of type T that is only T, produced by whatever created it. */
export type Branded<T, TBrand extends string> = T & { readonly [brand]?: TBrand };

/** The human. Never an agent. */
export type UserId = Branded<string, 'UserId'>;

/** The persistent character. Survives terminal close. */
export type AgentId = Branded<string, 'AgentId'>;

/** A machine the agent runs on: laptop, server, WSL, container. */
export type InstallationId = Branded<string, 'InstallationId'>;

/** One run of one agent on one installation. */
export type SessionId = Branded<string, 'SessionId'>;

/** A repository or workspace the agent is working in. */
export type ProjectId = Branded<string, 'ProjectId'>;

/** Which coding agent is behind the character. */
export type Harness =
  'claude' | 'codex' | 'opencode' | 'cursor' | 'pi' | 'gemini' | 'amp' | 'other';

/** Whether the character is reachable right now. */
export type AgentPresence = 'offline' | 'online' | 'busy' | 'disconnected';

const HARNESSES: ReadonlySet<string> = new Set<Harness>([
  'claude',
  'codex',
  'opencode',
  'cursor',
  'pi',
  'gemini',
  'amp',
]);

/**
 * Narrows whatever the store returned to a harness this domain knows.
 *
 * A store column is free text: a new coding agent ships an adapter before the
 * domain grows an entry for it, and an agent that cannot be recognised is still
 * an agent. 'other' is the escape hatch, so a character is never dropped
 * because its harness is newer than the code reading it.
 */
export function toHarness(stored: string): Harness {
  return HARNESSES.has(stored) ? (stored as Harness) : 'other';
}

/**
 * The character.
 *
 * Level, xp and reputation are here because the row is where they live, not
 * because this feature decides them: progression and reputation are separate
 * features that own those numbers. An agent that never plays a game still has
 * this record, with the counters at their defaults.
 */
export interface AgentIdentity {
  readonly id: AgentId;
  readonly ownerId: UserId;
  readonly name: string;
  readonly harness: Harness;
  readonly level: number;
  readonly xp: number;
  readonly reputation: number;
  readonly presence: AgentPresence;
  readonly lastSeenAt: string | null;
  readonly createdAt: string;
}

/** A machine an agent runs on. One user has many, possibly across devices. */
export interface Installation {
  readonly id: InstallationId;
  readonly ownerId: UserId;
  /**
   * Generated once per install and presented by the adapter on every handshake.
   * Stable across sessions, which is what lets a returning process be matched
   * to the installation it used last time rather than to a new one.
   */
  readonly installationKey: string;
  readonly label: string | null;
  readonly lastSeenAt: string | null;
}

/** A registered character that does not exist yet. */
export interface NewAgent {
  readonly ownerId: UserId;
  readonly name: string;
  readonly harness: Harness;
}

export const MIN_AGENT_NAME_LENGTH = 1;

/**
 * Why a proposed name cannot be used.
 *
 * Returned rather than thrown so a caller can show the reason, and so a
 * registration that fails because of a typo says so instead of reporting a
 * conflict. `name-taken` is deliberately absent: whether a name is free depends
 * on what the owner already has, which only the store knows.
 */
export type AgentNameRejection =
  | { readonly reason: 'name-empty' }
  | { readonly reason: 'name-too-long'; readonly max: number }
  | { readonly reason: 'name-reserved' };

export const MAX_AGENT_NAME_LENGTH = 64;

/**
 * Names the runtime will not let a user take, because they read as system
 * identities in the UI and in command output.
 */
export const RESERVED_AGENT_NAMES: ReadonlySet<string> = new Set([
  'agent',
  'all',
  'everyone',
  'none',
  'root',
  'system',
]);

/**
 * The one place a name is judged acceptable.
 *
 * It lives here rather than in the command handler because a caller validating
 * a name before submitting and the handler validating it on arrival have to
 * agree; two copies of the same rule is how one of them stops being updated.
 * Returns the reason rather than a boolean so the caller learns which rule it
 * broke instead of only that it broke one.
 */
export function whyAgentNameIsRejected(name: string): AgentNameRejection | undefined {
  const trimmed = name.trim();
  if (trimmed.length < MIN_AGENT_NAME_LENGTH) {
    return { reason: 'name-empty' };
  }
  if (name.length > MAX_AGENT_NAME_LENGTH) {
    return { reason: 'name-too-long', max: MAX_AGENT_NAME_LENGTH };
  }
  if (RESERVED_AGENT_NAMES.has(trimmed.toLowerCase())) {
    return { reason: 'name-reserved' };
  }
  return undefined;
}

/** The machine-readable half, for events and error payloads. */
export function describeRejection(rejection: AgentNameRejection): string {
  return rejection.reason === 'name-too-long' ? `name-too-long:${rejection.max}` : rejection.reason;
}
