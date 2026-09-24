/**
 * The activity log: one ordered, attributed trail of what happened.
 *
 * Replay, achievements and reputation all read from here rather than from
 * feature tables. That is the point of the feature, not a convenience: a
 * dispute between a sponsor and a solver is settled by replaying what actually
 * happened, and a trail assembled from five tables that each know their own
 * slice cannot answer "what happened next".
 *
 * The feature owns the read API and the retention policy. It does not own the
 * write path — core decides that, before anything is handed to a store, so that
 * the policy cannot be bypassed by a caller that happens to have a store.
 */

/** One row of the trail, as a reader sees it. */
export interface ActivityEntry {
  /** Monotonic per log, which is what ordering is decided by. */
  readonly sequence: number;
  readonly type: string;
  readonly actorId: string | null;
  readonly sessionId: string | null;
  /** The event this one caused, when there was one. */
  readonly causationId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

/**
 * A session's story, in the shape section 30 of the plan describes it:
 *
 *   Agent #123 / Session #456
 *   10:02 claim bounty -> 10:04 modify 3 files -> 10:07 run tests ->
 *   10:08 submit PR -> 10:11 PR merged -> 10:11 bounty completed -> +500 XP
 *
 * A summary, not the raw rows: a reader wants the shape of what happened, and
 * the raw trail for the detail. Deriving it here rather than in each consumer is
 * what stops three features from disagreeing about what a session did.
 */
export interface SessionTrail {
  readonly sessionId: string;
  readonly agentId: string;
  readonly entries: readonly ActivityEntry[];
}

export interface TrailQuery {
  readonly sessionId: string;
  /** Reading a trail from the beginning is the common case; cap it anyway. */
  readonly limit?: number;
}

export interface ActivityLog {
  /** The raw trail for one session, oldest first. */
  trail(query: TrailQuery): Promise<readonly ActivityEntry[]>;

  /**
   * The most recent entries for a session, newest first.
   *
   * Separate from trail() because the two callers want opposite things: a
   * replay wants the whole story in order, and a dashboard wants "what just
   * happened" without paging through everything before it.
   */
  recent(sessionId: string, limit: number): Promise<readonly ActivityEntry[]>;
}

/** Ordering and the shape of a summary line. Both belong to the log, not to
 *  each consumer, so three features cannot render the same session differently. */
export interface TrailLine {
  readonly at: string;
  readonly description: string;
}

/**
 * How long a run's trail is kept.
 *
 * Replays are shareable, and a replay whose events have been deleted is a dead
 * link, so the window is long enough that a link someone found last year still
 * resolves. It is a decision rather than a constant to be tuned later, so it
 * lives next to the reason.
 */
export const DEFAULT_RETENTION_DAYS = 365;

export const MILLIS_PER_DAY = 86_400_000;

/** The instant before which entries are eligible for deletion. */
export function retentionCutoff(now: string, retentionDays = DEFAULT_RETENTION_DAYS): string {
  return new Date(Date.parse(now) - retentionDays * MILLIS_PER_DAY).toISOString();
}

/**
 * Whether an entry has aged out.
 *
 * Separate from the cutoff so the rule is testable at its boundary rather than
 * by comparing dates, and so a caller that keeps a different window is making a
 * visible choice rather than editing a query.
 */
export function hasExpired(
  occurredAt: string,
  now: string,
  retentionDays = DEFAULT_RETENTION_DAYS,
): boolean {
  return Date.parse(occurredAt) < Date.parse(retentionCutoff(now, retentionDays));
}

/**
 * Turns a trail into the summary lines a reader sees.
 *
 * Unknown event types are rendered from their type rather than dropped. A trail
 * that silently omits an event a future version added is a trail that lies
 * about what happened, which is the one thing an audit trail must not do.
 */
export function summarise(entries: readonly ActivityEntry[]): readonly TrailLine[] {
  return entries.map((entry) => ({
    at: entry.occurredAt,
    description: describe(entry),
  }));
}

function describe(entry: ActivityEntry): string {
  const fields = Object.entries(entry.payload);
  if (fields.length === 0) {
    return entry.type;
  }
  // Sorted, because a summary whose field order follows the database is not
  // reproducible: jsonb does not preserve key order, so the same event rendered
  // as `count=12 suite=unit` on one read and `suite=unit count=12` on the next.
  // A trail that changes shape between renders cannot be compared, quoted, or
  // diffed, and a test asserting on it fails for reasons nobody can explain.
  const details = fields
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(' ');
  return `${entry.type} (${details})`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || typeof value !== 'object') {
    return String(value);
  }
  return JSON.stringify(value);
}
