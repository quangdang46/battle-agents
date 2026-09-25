import type { EventBus, GameEvent } from '@battle-agents/core';

/**
 * The realtime fan-out: an in-process hub that turns the event bus into
 * `full_state`-then-`delta` server-sent streams.
 *
 * Plan section 7.2 is the reason this file exists and the reason it is NOT the
 * database: Neon stores durable state, and realtime is a different job done by a
 * different layer. A spectator watching a run must see the run move — every
 * transient `tool.started`, every `thinking` — while the same events are being
 * filtered on their way to the log. Those two paths are independent and this hub
 * sits only on the realtime one.
 *
 * The stream shape is `full_state` first, `delta` after, ported from agent-move's
 * Broadcaster and the diff-broadcast shape from codemoo/agent-world (plan
 * section 28.1 item 12). Broadcast diffs, not whole state: a client that
 * rehydrates a full world model per event pays the whole model per event, and
 * 2000 events/s is exactly when that stops being affordable.
 */

/** The world a subscriber starts from, before any delta arrives. */
export interface GameSnapshot {
  /** The protocol the stream speaks, so a client can refuse one it does not know. */
  readonly protocolVersion: string;
  /**
   * Sessions currently reporting on this channel, oldest first.
   *
   * Empty is a legitimate value, not a placeholder: there is no live-registry
   * work in this bead. It is here so the snapshot has a real field a client can
   * hydrate, and so the state-delta split is exercised against something rather
   * than against `{}`.
   */
  readonly liveSessionIds: readonly string[];
}

/** The opening frame: everything a client needs before deltas start. */
export interface FullStateFrame {
  readonly kind: 'full_state';
  readonly state: GameSnapshot;
}

/**
 * A subsequent frame: one event, and nothing else.
 *
 * There is deliberately NO `state` field on this variant. A delta that also
 * carried a `state` would make "this frame is a snapshot" and "this frame is a
 * change" the same question asked two ways, and a client that checked the wrong
 * one would hydrate from a delta or patch from a snapshot. The type makes the
 * two mutually exclusive at compile time and the test makes it true at runtime.
 */
/**
 * What the public stream may carry, and what it must not.
 *
 * The classification is not this file's invention: it is
 * docs/design/public-event-stream.md, written before the filter so that the
 * filter could be a consequence of a decision rather than a guess. Read that
 * document to change anything here.
 *
 * The shape of the fix follows from one fact about the protocol. In
 * packages/protocol/src/agent-event.ts the payload fields are
 * `identifierSchema`, which is `z.string().min(...)` — an unbounded string.
 * So `file.write.path`, `command.run.argv0`, `message.sent.body` and
 * `thinking` can hold anything, and an event cannot be published and then have
 * its dangerous field stripped. A public event is built here, field by field,
 * and an event with nothing publishable in it yields undefined rather than an
 * empty object.
 */

/** Events a spectator may see whole. None of them carries a free-form field. */
const PUBLISHED_WHOLE: ReadonlySet<string> = new Set([
  'session.started',
  'session.ended',
  'session.resumed',
  'subagent.spawned',
  'subagent.completed',
]);

/**
 * Events a spectator may see in reduced form.
 *
 * The reduction is not a filter applied afterwards. `test.failed.failure` and
 * `waiting.reason` are unbounded strings, so publishing the event and
 * deleting the field is the same as publishing the field.
 */
const PUBLISHED_REDUCED: Readonly<Record<string, readonly string[]>> = {
  'test.passed': ['suite', 'count'],
  'test.failed': ['suite'],
  waiting: [],
};

/**
 * The public form of an event, or undefined when it has none.
 *
 * Returning undefined rather than a stripped copy matters: an empty frame is a
 * frame a client has to interpret, and there is no sensible reading of a delta
 * with no event in it.
 */
export function toPublicEvent(event: GameEvent): GameEvent | undefined {
  if (PUBLISHED_WHOLE.has(event.type)) return event;

  const kept = PUBLISHED_REDUCED[event.type];
  if (kept === undefined) return undefined;

  const source = event.payload;
  const payload: Record<string, unknown> = {};
  for (const field of kept) {
    const value = (source as Record<string, unknown>)[field];
    // Copied only when present, so a reduced event never grows a key the
    // feature did not set.
    if (value !== undefined) payload[field] = value;
  }
  return { ...event, payload };
}

export interface DeltaFrame {
  readonly kind: 'delta';
  readonly event: GameEvent;
}

export type StreamFrame = FullStateFrame | DeltaFrame;

export interface EventStreamHubOptions {
  readonly bus: EventBus;
  /** Read once per subscriber to build that subscriber's opening frame. */
  readonly snapshot: () => GameSnapshot;
  /**
   * How many undelivered frames one subscriber may fall behind by.
   *
   * Past this the subscriber is CLOSED, not skipped. A delta stream cannot
   * survive a gap — a client that missed an event and kept going would be
   * permanently wrong, with nothing to tell it — so the only safe response to a
   * subscriber that cannot keep up is to hang up and let it reconnect for a
   * fresh `full_state`. Skipping frames would trade a visible reconnect for an
   * invisible corruption, which is the worse of the two.
   */
  readonly maxSubscriberLag?: number;
}

const DEFAULT_MAX_SUBSCRIBER_LAG = 1024;

/**
 * One connected client.
 *
 * The queue is the lag. `pull` is the only thing that removes from it, and the
 * transport only calls `pull` when the consumer is ready for bytes, so a client
 * that stops reading stops being pulled from, its queue grows, and the hub closes
 * it. The highWaterMark of whatever is writing these frames is the backpressure
 * signal; this queue is where the decision to give up on the client is made.
 */
/**
 * Who is receiving.
 *
 * `public` is a spectator: a socket anyone can open, so it gets the
 * classification and nothing more. `operator` is the game's own activity view,
 * which is entitled to the transient events the spectator view drops — a busy
 * agent is exactly what that view exists to show, and the ingest bead is
 * explicit that not persisting must not become dropping.
 *
 * The default is the strict one. A new caller gets the safe view unless it
 * says otherwise, so a forgotten argument narrows what is shared rather than
 * widening it.
 */
export type StreamView = 'public' | 'operator';

export class StreamSubscriber {
  readonly #queue: StreamFrame[] = [];
  readonly #maxLag: number;
  readonly #onClose: () => void;
  readonly view: StreamView;
  #closed = false;
  #waiter: (() => void) | undefined;

  constructor(maxLag: number, onClose: () => void, view: StreamView = 'public') {
    this.#maxLag = maxLag;
    this.#onClose = onClose;
    this.view = view;
  }

  /**
   * Queues a frame, or closes this subscriber if it has fallen too far behind.
   *
   * Returns false when the frame was not accepted — either because the
   * subscriber was already gone, or because accepting it would have taken the
   * queue past the lag limit, in which case the subscriber is closed and the
   * frame is discarded. The discard is not a silent skip: the close is the
   * signal, and the reconnect that follows fetches a new `full_state`.
   */
  offer(frame: StreamFrame): boolean {
    if (this.#closed) {
      return false;
    }
    if (this.#queue.length >= this.#maxLag) {
      this.close();
      return false;
    }
    this.#queue.push(frame);
    this.#wake();
    return true;
  }

  /**
   * The next frame, or undefined once the subscriber is closed.
   *
   * Resolves as soon as a frame is queued and the subscriber is not closed; it
   * does NOT drain what was already queued first. On close the queue is dropped,
   * because the client is resynchronising from a fresh snapshot and replaying a
   * partial tail of deltas it can no longer vouch for would defeat that.
   */
  async pull(): Promise<StreamFrame | undefined> {
    while (this.#queue.length === 0 && !this.#closed) {
      await new Promise<void>((resolve) => {
        this.#waiter = resolve;
      });
    }
    // Once closed, the queue is dropped rather than drained. A closed subscriber
    // is about to reconnect for a fresh full_state, and a partial tail of deltas
    // it can no longer vouch for is not worth delivering on the way out. This is
    // the difference between "closed" meaning one thing — no more frames — and
    // it quietly meaning "no more NEW frames, but here is the backlog anyway".
    return this.#closed ? undefined : this.#queue.shift();
  }

  /** Idempotent. Ends the stream; the client reconnects for a fresh snapshot. */
  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#onClose();
    this.#wake();
  }

  /** For tests and diagnostics: how many frames are waiting to be pulled. */
  get pending(): number {
    return this.#queue.length;
  }

  get closed(): boolean {
    return this.#closed;
  }

  #wake(): void {
    const waiter = this.#waiter;
    this.#waiter = undefined;
    waiter?.();
  }
}

/** One hub, one bus, one snapshot provider. */
export class EventStreamHub {
  readonly #subscribers = new Set<StreamSubscriber>();
  readonly #snapshot: () => GameSnapshot;
  readonly #maxLag: number;
  #unsubscribeBus: (() => void) | undefined;

  constructor(options: EventStreamHubOptions) {
    this.#snapshot = options.snapshot;
    this.#maxLag = options.maxSubscriberLag ?? DEFAULT_MAX_SUBSCRIBER_LAG;
    // The hub reads the bus directly. This is the realtime path, and it has no
    // dependency on the store: whether or not an event was persisted, everything
    // on the bus is a delta to whoever is watching.
    // Everything on the bus reaches the hub. The classification is applied per
    // subscriber instead, at the point of delivery, because there are two
    // different viewers and only one of them is a spectator.
    //
    // The first attempt filtered here, on the bus. That broke the property the
    // ingest bead cares most about: a transient event must reach the game's own
    // activity view, because "we do not persist it" must not quietly become "we
    // drop it". Filtering at the bus made every viewer public by default and
    // took the game with it. The activity log keeps the detail and so does the
    // operator view; the spectator view keeps the scoreboard.
    this.#unsubscribeBus = options.bus.subscribe((event) => {
      this.broadcast(event);
    });
  }

  /**
   * Registers a subscriber and hands it the opening `full_state` frame.
   *
   * The snapshot is taken and queued before the subscriber joins the broadcast
   * set, and both happen without yielding, so no event can be published between
   * "this is the world" and "this client is watching". That is the ordering the
   * full_state-then-delta contract rests on, and it is why the snapshot provider
   * is synchronous: an async one would reopen exactly that window.
   */
  subscribe(view: StreamView = 'public'): StreamSubscriber {
    let subscriber: StreamSubscriber;
    const forget = (): void => {
      this.#subscribers.delete(subscriber);
    };
    subscriber = new StreamSubscriber(this.#maxLag, forget, view);
    subscriber.offer({ kind: 'full_state', state: this.#snapshot() });
    this.#subscribers.add(subscriber);
    return subscriber;
  }

  /**
   * Fans one event out to the subscribers allowed to see it.
   *
   * Copied because offer can close a subscriber, which deletes it from the set
   * mid-iteration.
   */
  broadcast(event: GameEvent): void {
    for (const subscriber of [...this.#subscribers]) {
      if (subscriber.view === 'public') {
        const publishable = toPublicEvent(event);
        // Undefined rather than an empty frame: there is no sensible reading of
        // a delta carrying no event, and a client would have to invent one.
        if (publishable !== undefined) subscriber.offer({ kind: 'delta', event: publishable });
        continue;
      }
      subscriber.offer({ kind: 'delta', event });
    }
  }

  get subscriberCount(): number {
    return this.#subscribers.size;
  }

  /** Detaches from the bus. For shutdown, not for per-request cleanup. */
  close(): void {
    this.#unsubscribeBus?.();
    this.#unsubscribeBus = undefined;
    for (const subscriber of [...this.#subscribers]) {
      subscriber.close();
    }
  }
}

/**
 * Encodes a frame as one SSE message.
 *
 * The JSON body carries `kind`, and the `event:` line names it too — the former
 * is what a client switches on, the latter is what a browser's EventSource
 * dispatches on. Redundant on purpose: a client that only understands one of
 * them is still correct.
 */
export function encodeStreamFrame(frame: StreamFrame): string {
  return `event: ${frame.kind}\ndata: ${JSON.stringify(frame)}\n\n`;
}

/** Pulls the JSON body back out of an SSE message, for a client or a test. */
export function decodeStreamFrame(message: string): StreamFrame | undefined {
  for (const line of message.split('\n')) {
    if (!line.startsWith('data: ')) {
      continue;
    }
    try {
      return JSON.parse(line.slice('data: '.length)) as StreamFrame;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
