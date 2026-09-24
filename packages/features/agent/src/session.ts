/**
 * The session state machine.
 *
 * Pure, and deliberately so: this is the part of the session lifecycle that is
 * genuinely hard to reason about, and it is the part that is easiest to get
 * wrong by scattering status checks across route handlers and cron jobs. Every
 * question of the form "may this session go from A to B" is answered here once.
 *
 * The plan describes the states as ACTIVE, COMPLETED, STOPPED, CRASHED and
 * TIMEOUT. The database has four columns, and the mapping is:
 *
 *   ACTIVE              -> active
 *   COMPLETED / CRASHED -> ended      (the run is over; why is a payload field)
 *   STOPPED             -> abandoned  (a run nobody finished)
 *   TIMEOUT             -> disconnected (the run is over until proven otherwise)
 *
 * disconnected and ended are the distinction that matters. A terminal closed
 * does not end a session, because the character is still there and the person
 * may reopen it in a minute. Only `ended` and `abandoned` are terminal.
 */

export const SESSION_STATUSES = ['active', 'ended', 'disconnected', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** Why an `ended` session ended. The status alone cannot say. */
export const SESSION_END_REASONS = ['completed', 'crashed', 'abandoned'] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

const MS_PER_MINUTE = 60_000;

/**
 * The defaults the plan sets, in one place so a change is one edit rather than
 * a hunt through a route and a cron job that were tuned separately.
 *
 * Multiplied out rather than composed from a "minutes per minute" constant:
 * that constant is seconds, it reads as minutes, and writing
 * `15 * MINUTES_PER_MINUTE * MS_PER_MINUTE` produces fifteen hours. The
 * handshake then resumed anything less than half a day old, which is the
 * difference between "they reopened their terminal" and "they are somebody
 * else's session".
 */
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5 * MS_PER_MINUTE;
export const DEFAULT_RESUME_GRACE_MS = 15 * MS_PER_MINUTE;

/** What happened to a session. Each maps to at most one transition. */
export type SessionEvent =
  | { readonly kind: 'heartbeat' }
  | { readonly kind: 'ended'; readonly reason: SessionEndReason }
  | { readonly kind: 'disconnected' }
  | { readonly kind: 'resumed' }
  | { readonly kind: 'grace-expired' };

/** Whether a session in this state can still become active again. */
export function isResumable(status: SessionStatus): boolean {
  return status === 'disconnected';
}

export function isTerminal(status: SessionStatus): boolean {
  return status === 'ended' || status === 'abandoned';
}

/**
 * The status a session moves to, or undefined when the move is not allowed.
 *
 * Returning undefined rather than a status is the point: a caller cannot
 * accidentally treat a refused transition as a successful one, because there is
 * nothing to write. The transitions that matter most to get right:
 *
 *   - only a disconnected session resumes, so a live session is never hijacked
 *     by a second handshake for the same character;
 *   - a terminal session is terminal, so a late heartbeat from a process that
 *     outlived its run cannot resurrect a character that already moved on;
 *   - grace expiry abandons rather than ends, because nothing was proven to
 *     have failed — the person simply did not come back.
 */
export function nextSessionStatus(
  current: SessionStatus,
  event: SessionEvent,
): SessionStatus | undefined {
  switch (event.kind) {
    case 'heartbeat':
      // A heartbeat only means something while the session is live. Accepting
      // one on a disconnected session would resurrect it without a handshake,
      // which is how a zombie process keeps a character "online" forever.
      return current === 'active' ? 'active' : undefined;
    case 'ended':
      return current === 'active' ? 'ended' : undefined;
    case 'disconnected':
      return current === 'active' ? 'disconnected' : undefined;
    case 'resumed':
      return current === 'disconnected' ? 'active' : undefined;
    case 'grace-expired':
      return current === 'disconnected' ? 'abandoned' : undefined;
  }
}

/**
 * Whether a session has gone quiet long enough to be considered disconnected.
 *
 * Measured from the last heartbeat rather than from the start, so a long
 * session that is working normally is never swept up.
 */
export function isHeartbeatStale(
  lastHeartbeatAt: string,
  now: string,
  timeoutMs: number = DEFAULT_HEARTBEAT_TIMEOUT_MS,
): boolean {
  return elapsedMs(lastHeartbeatAt, now) > timeoutMs;
}

/**
 * Whether a disconnected session is still inside the window in which reopening
 * it resumes rather than starting a new one.
 */
export function isWithinResumeGrace(
  disconnectedAt: string,
  now: string,
  graceMs: number = DEFAULT_RESUME_GRACE_MS,
): boolean {
  return elapsedMs(disconnectedAt, now) <= graceMs;
}

function elapsedMs(from: string, now: string): number {
  return new Date(now).getTime() - new Date(from).getTime();
}
