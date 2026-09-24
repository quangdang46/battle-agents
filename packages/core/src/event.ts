/**
 * A fact that already happened. Events are the only cross-feature channel
 * (plan section 29.3): a feature that wants another feature to react emits an
 * event, and the other feature subscribes. Two features never call each other.
 *
 * `occurredAt` is set by whoever emits, and `causationId` links an event back
 * to the event that caused it, which is what makes an activity log readable as
 * a story rather than a flat pile of rows.
 */
export interface GameEvent<P = unknown> {
  readonly type: string;
  /** ISO 8601 instant. */
  readonly occurredAt: string;
  /** Who or what caused this. System-originated events use a system actor id. */
  readonly actorId: string;
  /** The id of the event that caused this one, when there is one. */
  readonly causationId?: string;
  readonly payload: P;
}
