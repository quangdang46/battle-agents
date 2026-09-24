import { AgentEventSchema, PROTOCOL_VERSION } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

/**
 * Batching for the telemetry plane, and the batch parser that guards the door.
 *
 * The three numbers here — how long to wait, how much to send, and how much the
 * server will take — are CONFIGURATION, not constants. They are the plan's
 * starting values (section 7.2: adapters buffer 250ms / up to 50 events, server
 * rejects >100), and the 100x20 events/s load test is the thing that will reveal
 * whether they are the right ones. A number that cannot move without a code
 * change is a number that cannot be tuned from evidence, so every one of them is
 * read from the environment here and nowhere hardcoded into a decision.
 *
 * Why the server refuses an oversized batch instead of truncating it: a client
 * that ignores `Retry-After` and retries immediately turns a backpressure signal
 * into a self-inflicted stampede, and a silently truncated batch is a batch the
 * agent believes it sent and the log does not have. Both failure modes are worse
 * than an honest "slow down", which is what 413 + `Retry-After` says.
 */

/** The three batching limits plus the backoff the refusal advertises. */
export interface BatchLimits {
  /** How long the client waits for more events before flushing. */
  readonly flushIntervalMs: number;
  /** How many events the client puts in one batch before flushing early. */
  readonly maxBatchEvents: number;
  /** Above this the server refuses the batch outright (413 + Retry-After). */
  readonly maxRejectEvents: number;
  /** The `Retry-After` a refused batch advertises, in whole seconds. */
  readonly retryAfterSeconds: number;
}

/**
 * The plan's starting values, as the fallback when the environment is silent.
 *
 * These are DEFAULTS, applied only when an env var is absent. They are the
 * floor a fresh install runs on, not a ceiling baked into the request path: the
 * values actually used come from `readBatchLimits`, and a caller can hold a
 * different `BatchLimits` in memory without touching these.
 */
export const DEFAULT_BATCH_LIMITS: BatchLimits = {
  flushIntervalMs: 250,
  maxBatchEvents: 50,
  maxRejectEvents: 100,
  retryAfterSeconds: 1,
};

// Not NodeJS.ProcessEnv: Next.js augments that type to REQUIRE NODE_ENV, so every
// caller and test would have to supply a variable this reader does not use. The
// handful of names it actually reads is the honest signature. Same reasoning as
// readAuthEnvironment in auth/server.ts.
type Env = Readonly<Record<string, string | undefined>>;

const FLUSH_MS = 'EVENT_BATCH_FLUSH_MS';
const MAX_EVENTS = 'EVENT_BATCH_MAX_EVENTS';
const REJECT_EVENTS = 'EVENT_BATCH_REJECT_EVENTS';
const RETRY_AFTER = 'EVENT_BATCH_RETRY_AFTER_SECONDS';

/**
 * Reads the batching limits from the environment, or explains what is wrong.
 *
 * Throws on a present-but-invalid value rather than falling back. A limit that
 * silently reverts to its default when somebody typos the env var is a limit
 * that looks configured and is not, and the mistake would only surface later as
 * an unexplained behaviour under load. Because the gateway builds its limits
 * once at composition time, this fails at startup, where it is visible, rather
 * than per-request, where it is not.
 */
export function readBatchLimits(env: Env): BatchLimits {
  const limits: BatchLimits = {
    flushIntervalMs: positiveInteger(env[FLUSH_MS], DEFAULT_BATCH_LIMITS.flushIntervalMs, FLUSH_MS),
    maxBatchEvents: positiveInteger(
      env[MAX_EVENTS],
      DEFAULT_BATCH_LIMITS.maxBatchEvents,
      MAX_EVENTS,
    ),
    maxRejectEvents: positiveInteger(
      env[REJECT_EVENTS],
      DEFAULT_BATCH_LIMITS.maxRejectEvents,
      REJECT_EVENTS,
    ),
    retryAfterSeconds: positiveInteger(
      env[RETRY_AFTER],
      DEFAULT_BATCH_LIMITS.retryAfterSeconds,
      RETRY_AFTER,
    ),
  };

  // The client's flush size must fit under the server's refusal threshold, or a
  // well-behaved client builds a batch the server rejects — a configuration
  // where obeying the rules is punished. This is a property of the two numbers,
  // so it is checked wherever the two are read together.
  if (limits.maxRejectEvents < limits.maxBatchEvents) {
    throw new Error(
      `${REJECT_EVENTS} (${limits.maxRejectEvents}) must be at least ${MAX_EVENTS} ` +
        `(${limits.maxBatchEvents}); a client that flushes at its own limit would ` +
        'otherwise be refused a batch it was told to build.',
    );
  }
  return limits;
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number, received ${JSON.stringify(raw)}`);
  }
  return value;
}

// ── batch parsing ────────────────────────────────────────────────────────────

const PROTOCOL_VERSION_FIELD = 'protocolVersion';
const EVENTS_FIELD = 'events';

export interface ParsedBatch {
  readonly ok: true;
  readonly events: readonly AgentEvent[];
  readonly protocolVersion: string;
}

export type BatchParse =
  | ParsedBatch
  | {
      readonly ok: false;
      readonly kind: 'protocol-mismatch';
      readonly expected: string;
      readonly received: string;
    }
  | { readonly ok: false; readonly kind: 'invalid'; readonly message: string };

/**
 * Validates the SHAPE of a batch: is it an object, is the protocol version one
 * this server speaks, and does every event satisfy the protocol schema.
 *
 * Deliberately does NOT do the size gate. The size gate is the route's job and
 * runs before it ever calls this, because refusing a flood is a property of the
 * HTTP edge (it must happen before authentication, and in constant time), not of
 * the parser. Keeping the two apart is what makes the ordering auditable: the
 * route reads top-to-bottom as "size, then auth, then this", and a flood can
 * never reach a per-event zod validation no matter how the parser is called.
 *
 * Because the gate is a separate, exported step (`checkBatchSize`), a caller that
 * forgot to run it would still be correct here for a normally-sized batch — the
 * responsibility for bounding the array before it gets here belongs to the edge.
 */
export function parseEventBatch(body: unknown): BatchParse {
  if (!isRecord(body)) {
    return { ok: false, kind: 'invalid', message: 'body must be an object' };
  }

  // Exact match, not a semver range. The protocol is 0.x and pre-1.0, where a
  // minor bump is a breaking change, and both ends of this wire are built and
  // versioned together — so a mismatch is a client speaking a protocol this
  // server does not implement, and the honest answer is to name both versions
  // rather than guess at compatibility.
  const received = body[PROTOCOL_VERSION_FIELD];
  if (received !== PROTOCOL_VERSION) {
    return {
      ok: false,
      kind: 'protocol-mismatch',
      expected: PROTOCOL_VERSION,
      received: typeof received === 'string' ? received : String(received),
    };
  }

  // The event list itself is validated by the protocol package's own zod
  // schema, so this route cannot drift from what the adapters emit or accept a
  // shape the schema no longer describes.
  const events = AgentEventSchema.array().safeParse(body[EVENTS_FIELD]);
  if (!events.success) {
    return { ok: false, kind: 'invalid', message: describeIssues(events.error.issues) };
  }
  return { ok: true, events: events.data, protocolVersion: PROTOCOL_VERSION };
}

/**
 * The constant-time size gate, shared by the route and the parser.
 *
 * Returns the `too-large` verdict only. It touches the raw body's `events`
 * length and nothing else — it does not parse, does not allocate per event, and
 * does not care whether the events are valid, because a flood is refused for
 * being too large regardless of what is in it.
 */
export function checkBatchSize(
  body: unknown,
  limits: BatchLimits,
): { readonly ok: false; readonly kind: 'too-large'; readonly limit: number } | undefined {
  if (isRecord(body)) {
    const events = body[EVENTS_FIELD];
    if (Array.isArray(events) && events.length > limits.maxRejectEvents) {
      return { ok: false, kind: 'too-large', limit: limits.maxRejectEvents };
    }
  }
  return undefined;
}

function describeIssues(issues: readonly { path: PropertyKey[]; message: string }[]): string {
  const first = issues[0];
  if (first === undefined) {
    return 'batch is not a valid list of AgentEvents';
  }
  const at = first.path.length > 0 ? ` at ${first.path.join('.')}` : '';
  return `${first.message}${at}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ── client-side buffer ───────────────────────────────────────────────────────

export interface EventBufferOptions {
  /** Injectable so a test can advance time without sleeping. */
  readonly now?: () => number;
}

/**
 * The adapter-side buffer: accumulates events and hands back a batch.
 *
 * Pure by construction. It has no timer of its own; the caller drives it by
 * calling `flushIfDue()` on whatever cadence it already has (a real adapter
 * uses a 250ms interval), and `push()` returns a batch by itself the moment the
 * buffer reaches `maxBatchEvents`. That split keeps the timing decision in the
 * caller and the batching decision here, and it means the unit tests can prove
 * the 250ms boundary by moving an injected clock rather than by waiting.
 */
export class EventBuffer {
  readonly #limits: BatchLimits;
  readonly #now: () => number;
  #events: AgentEvent[] = [];
  #firstBufferedAt: number | undefined;

  constructor(limits: BatchLimits, options: EventBufferOptions = {}) {
    this.#limits = limits;
    this.#now = options.now ?? (() => Date.now());
  }

  /** Adds an event, returning a batch if this push filled the buffer. */
  push(event: AgentEvent): readonly AgentEvent[] | undefined {
    if (this.#events.length === 0) {
      this.#firstBufferedAt = this.#now();
    }
    this.#events.push(event);
    return this.#events.length >= this.#limits.maxBatchEvents ? this.flush() : undefined;
  }

  /** Returns a batch if the flush interval has elapsed since the first event. */
  flushIfDue(): readonly AgentEvent[] | undefined {
    if (this.#events.length === 0 || this.#firstBufferedAt === undefined) {
      return undefined;
    }
    return this.#now() - this.#firstBufferedAt >= this.#limits.flushIntervalMs
      ? this.flush()
      : undefined;
  }

  /** Returns whatever is buffered, empty or not, and resets the window. */
  flush(): readonly AgentEvent[] {
    const batch = this.#events;
    this.#events = [];
    this.#firstBufferedAt = undefined;
    return batch;
  }

  /** How many events are waiting. */
  get size(): number {
    return this.#events.length;
  }
}
