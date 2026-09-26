import type { BattleStatus, BattleWeights } from './domain.js';
import type { CriterionResult } from './judge.js';

/**
 * How the battle feature stores its records, described without naming a database.
 *
 * The feature may not import infrastructure — that is what makes
 * `presentation -> features -> core` mean something — so the feature states what
 * it needs and the wiring supplies it. Same shape and same reason as
 * features/reputation/src/repository.ts.
 *
 * Every id is a plain string because a database column is a UUID and has no idea
 * what it is holding.
 *
 * ## Every move is one method, never a read followed by a write
 *
 * A join that read the participants, counted them, decided there was room, and
 * then wrote would let two sessions both believe they are the second fighter, and
 * the loser's score would be judged against a battle it is not in. GitHub
 * re-delivers and adapters retry, so "two callers at once" is the normal case
 * rather than the pathological one. Each move below takes the state it expects
 * and the store performs the check and the write as one statement, returning
 * undefined when somebody else got there first.
 *
 * `undefined` is therefore a meaningful answer and not a missing row: it means
 * "you lost", and the caller has to treat losing differently from not existing.
 */

/** A failure a store reports, as a discriminant rather than a class. */
export const BATTLE_NOT_FOUND = 'battle-not-found';
export const BATTLE_JOIN_REFUSED = 'battle-join-refused';
export const BATTLE_FINISH_LOST = 'battle-finish-lost';
export const BATTLE_MOVE_LOST = 'battle-move-lost';

export type BattleStorageFailure =
  | typeof BATTLE_NOT_FOUND
  | typeof BATTLE_JOIN_REFUSED
  | typeof BATTLE_FINISH_LOST
  | typeof BATTLE_MOVE_LOST;

export function isBattleStorageFailure(error: unknown, code: BattleStorageFailure): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

/**
 * A battle as the store holds it.
 *
 * `mode`, `status` and the weights are all stored as the shape the column holds —
 * two of them as plain strings — and the feature narrows them. A store that
 * refused to hand back a row whose status this build does not know would have to
 * throw away a battle nobody can move, and this feature's answer to an
 * unreadable status is to refuse every move on it, which needs the row.
 */
export interface StoredBattle {
  readonly id: string;
  readonly mode: string;
  readonly bountyId: string | null;
  readonly weightsJson: unknown;
  readonly status: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly pausedAt: string | null;
  /** When the current pause runs out. Null whenever the battle is not paused. */
  readonly resumeDeadline: string | null;
}

export interface NewStoredBattle {
  readonly mode: string;
  readonly bountyId: string | null;
  readonly weightsJson: BattleWeights;
  /** The session that called `battle.create`, who is therefore the first fighter. */
  readonly creatorSessionId: string;
  readonly now: string;
}

export interface StoredParticipant {
  readonly battleId: string;
  readonly sessionId: string;
  readonly joinedAt: string;
  readonly submittedAt: string | null;
  readonly won: boolean;
  /** The per-criterion results and the weighted total, once judged. */
  readonly scoreJson: unknown;
}

/** What a join needs to be told apart from a refusal. */
export type JoinRefusal = 'not-found' | 'not-running' | 'full' | 'already-in-it';

export type JoinResult =
  | {
      readonly joined: true;
      readonly battle: StoredBattle;
      readonly participants: readonly StoredParticipant[];
    }
  | { readonly joined: false; readonly why: JoinRefusal; readonly battle?: StoredBattle };

export interface BattleFilter {
  readonly status?: string;
}

export interface BattleRepository {
  /**
   * Creates a battle with its creator already in it, or reports that the id is
   * taken.
   *
   * Creator and battle in one call rather than a create followed by a join: a
   * battle created with no participant is a battle nobody can finish, and the
   * window between the two calls is a window somebody else can join into.
   */
  create(battle: NewStoredBattle): Promise<StoredBattle>;

  findById(battleId: string): Promise<StoredBattle | undefined>;

  /**
   * A battle by the handle its public replay link carries, or undefined.
   *
   * A SECOND identifier rather than reusing `id`, and the reason is that a
   * replay link is permanent and public while a battle's primary key is an
   * internal handle. Handing the same value to both means every leak of the
   * internal id — a log line, a support ticket, an error message — is also a
   * leak of a public address, and it means the day the internal read path gets
   * an access rule the shared link becomes the way around it. `replay_id` is
   * random rather than derived, so the public handle cannot be walked back to
   * the row from anything else.
   */
  findByReplayId(replayId: string): Promise<StoredBattle | undefined>;

  /**
   * Battles matching the filter, newest first.
   *
   * No limit, for the reason features/quest states: a store that silently capped
   * the list would make a battle silently undiscoverable, which is the failure
   * mode the whole design has to avoid.
   */
  list(filter: BattleFilter): Promise<readonly StoredBattle[]>;

  participants(battleId: string): Promise<readonly StoredParticipant[]>;

  /**
   * Every live battle the session is currently in, and the participants of each.
   *
   * Plural on purpose, and this is the Battle#918 method. One agent can hold two
   * concurrent sessions and be in two battles at once, so "the battle this session
   * is in" is the wrong question and would have to be answered by guessing. The
   * key is the SESSION throughout: no field of the return value is an agent, and
   * nothing here can be keyed by one.
   */
  battlesForSession(sessionId: string): Promise<readonly BattleWithParticipants[]>;

  /** One statement, or undefined when the battle was not joinable. */
  join(battleId: string, sessionId: string, capacity: number, now: string): Promise<JoinResult>;

  /**
   * Moves a battle from one state to another, refusing the move when the battle
   * is not in the state the caller expected.
   *
   * `from` is in the WHERE clause rather than checked by the caller, so the check
   * and the write are one statement and two hosts cannot both pause one battle.
   */
  move(
    battleId: string,
    from: BattleStatus,
    to: BattleStatus,
    now: string,
  ): Promise<StoredBattle | undefined>;

  /** Records the pause, and the instant it runs out. */
  pause(battleId: string, resumeDeadline: string, now: string): Promise<StoredBattle | undefined>;

  /**
   * Judges the battle: the participants' scores, who won, and the state it ends
   * in — all in one statement.
   *
   * One call because a half-written result is worse than no result: scores
   * committed with no winner leave a battle that looks finished and pays nobody,
   * and a winner committed with no scores cannot be shown its own arithmetic.
   */
  finish(finish: {
    readonly battleId: string;
    readonly from: BattleStatus;
    readonly to: BattleStatus;
    readonly results: readonly {
      readonly sessionId: string;
      readonly scoreJson: unknown;
      readonly submittedAt: string;
      readonly won: boolean;
    }[];
    readonly now: string;
  }): Promise<StoredBattle | undefined>;

  /** Battles whose pause has run out, for the sweep that closes them. */
  pausedBefore(deadline: string): Promise<readonly StoredBattle[]>;
}

export interface BattleWithParticipants {
  readonly battle: StoredBattle;
  readonly participants: readonly StoredParticipant[];
}

/** The criteria a judge reports, re-exported so a store can type a score blob. */
export type { CriterionResult };
