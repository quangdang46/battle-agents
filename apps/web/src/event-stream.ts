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
export class StreamSubscriber {
  readonly #queue: StreamFrame[] = [];
  readonly #maxLag: number;
  readonly #onClose: () => void;
  #closed = false;
  #waiter: (() => void) | undefined;

  constructor(maxLag: number, onClose: () => void) {
    this.#maxLag = maxLag;
    this.#onClose = onClose;
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
  subscribe(): StreamSubscriber {
    let subscriber: StreamSubscriber;
    const forget = (): void => {
      this.#subscribers.delete(subscriber);
    };
    subscriber = new StreamSubscriber(this.#maxLag, forget);
    subscriber.offer({ kind: 'full_state', state: this.#snapshot() });
    this.#subscribers.add(subscriber);
    return subscriber;
  }

  /** Fans one event out to every subscriber as a delta. */
  broadcast(event: GameEvent): void {
    // Copied: offer can close a subscriber, which deletes it from the set
    // mid-iteration.
    for (const subscriber of [...this.#subscribers]) {
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
