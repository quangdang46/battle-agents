/**
 * The 100 agents x 20 events/s load harness (plan section 7.2, section 17.2 gate).
 *
 * This is the measurement the batching numbers are FOR. 100 agents at 20 ev/s is
 * 2000 events/s, and the plan is explicit that Neon must never see 2000 writes/s:
 * the point of the batching limits and the persistence filter is that the number
 * that reaches the database is a small fraction of the number that crosses the
 * wire. So the harness reports all three numbers separately — generated,
 * accepted, rows written — and the gap between the last two is the whole thesis.
 *
 * It drives the real ingest handler in-process rather than a real HTTP server.
 * That is not a shortcut around the measurement: the handler is a pure function
 * over its dependencies precisely so this scenario can be replayed deterministically
 * and cheaply, thousands of times, without a socket in the way. What it cannot
 * tell you is anything about the network or a real browser; it is a gate on the
 * telemetry plane's arithmetic, not on the deployment.
 *
 * Run it: `pnpm load:events` (defaults: 100 agents, 20 ev/s each, 5 seconds).
 * Override with env: LOAD_AGENTS, LOAD_EVENTS_PER_SECOND, LOAD_SECONDS,
 * LOAD_MAX_SUBSCRIBERS (how many SSE subscribers to attach and drain).
 *
 * ## It gates, and on which numbers
 *
 * The three numbers above are a printout. A load test that reports and exits 0
 * is the "a gate nobody runs is a comment" failure with a performance harness
 * attached, which is how this one sat for a while: implemented, referenced by
 * `pnpm load:events`, and wired into no gate. It is a stage of `pnpm test:m4`
 * now, which is what §17.2 asks for ("a pre-M4 gate, not M0") and what §40
 * repeats.
 *
 * The thresholds are in scripts/load-thresholds.ts, with the arithmetic that
 * chose them, and the stage asserts two things this file cannot assert about
 * itself: that the defaults are the ones in that module, and that each gate goes
 * red when the measurement cannot meet it. `tests/m4/load-threshold.test.ts`
 * runs this harness for real, twice, with the thresholds set so it must fail.
 */

import { writeFileSync } from 'node:fs';

import { createInMemoryEventBus, InMemoryStateStore, createRuntime } from '@battle-agents/core';
import type { GameEvent } from '@battle-agents/core';
import { PROTOCOL_VERSION } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { EventBuffer, readBatchLimits } from '../apps/web/src/event-batch.js';
import { createEventRoutes, type EventCaller } from '../apps/web/src/event-routes.js';
import { EventStreamHub, type GameSnapshot } from '../apps/web/src/event-stream.js';
import type { HttpRequest, HttpResponse } from '../apps/web/src/routes.js';
import { thresholdBreaches, thresholdsFromEnv } from './load-thresholds.js';

// ── configuration, all from env with the plan's defaults ─────────────────────

const AGENTS = positiveInt(process.env['LOAD_AGENTS'], 100);
const EVENTS_PER_SECOND = positiveInt(process.env['LOAD_EVENTS_PER_SECOND'], 20);
const SECONDS = positiveInt(process.env['LOAD_SECONDS'], 5);
const SUBSCRIBERS = nonNegativeInt(process.env['LOAD_MAX_SUBSCRIBERS'], 4);

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `load-test setting must be a positive whole number, got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function nonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `load-test setting must be a non-negative whole number, got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

// The same configuration the server would read, so a tuning pass on the env vars
// moves the harness and the server together.
const limits = readBatchLimits(process.env);

// The gates, not the scenario. See scripts/load-thresholds.ts for why the ratio
// and the rate are two separate numbers with two separate jobs.
const thresholds = thresholdsFromEnv(process.env);

// ── the telemetry plane, in memory ──────────────────────────────────────────

const bus = createInMemoryEventBus();
const store = new InMemoryStateStore();
const runtime = createRuntime({ extensions: [], store, bus, now: () => new Date().toISOString() });
const hub = new EventStreamHub({
  bus,
  snapshot: (): GameSnapshot => ({ protocolVersion: PROTOCOL_VERSION, liveSessionIds: [] }),
});

const handle = createEventRoutes({
  limits,
  authenticate: async (): Promise<EventCaller> => ({ installationId: 'load-test-installation' }),
  resolveSession: async (sessionId) => ({
    id: sessionId,
    agentId: `agent-${sessionId}`,
    status: 'active',
  }),
  emit: (event: GameEvent) => runtime.emit(event),
  hub,
});

function headers(): HttpRequest['headers'] {
  return new Map([['authorization', 'Bearer load-test']]) as unknown as HttpRequest['headers'];
}

async function post(events: readonly AgentEvent[]): Promise<HttpResponse> {
  return handle({
    method: 'POST',
    url: 'https://agentbattle.test/api/events',
    headers: headers(),
    body: { protocolVersion: PROTOCOL_VERSION, events },
  });
}

// ── subscribers: the realtime side, drained so nothing is closed for lag ──────

interface Counted {
  deltas: number;
  fullStates: number;
}

const counters: Counted[] = Array.from({ length: SUBSCRIBERS }, () => ({
  deltas: 0,
  fullStates: 0,
}));
const subscribers = counters.map((counted) => {
  const subscriber = // 'operator' on purpose. The load harness measures the fan-out the game's
    // own activity view depends on, and that view is entitled to every event. A
    // public subscriber would legitimately receive only the classified subset, so
    // running the harness against one would report a throughput problem that is
    // actually the classification doing its job.
    hub.subscribe('operator');
  void (async () => {
    for (;;) {
      const frame = await subscriber.pull();
      if (frame === undefined) {
        return;
      }
      if (frame.kind === 'full_state') {
        counted.fullStates += 1;
      } else {
        counted.deltas += 1;
      }
    }
  })();
  return subscriber;
});

// ── the run ─────────────────────────────────────────────────────────────────

/** A realistic mix: mostly transient chatter, with a few key events. */
function eventFor(agentIndex: number, sequence: number): AgentEvent {
  const sessionId = `session-${agentIndex}`;
  const at = new Date().toISOString();
  if (sequence % 20 === 0) {
    // A key event every 20 per agent, the kind the policy is meant to keep.
    return { type: 'test.passed', sessionId, at, suite: 'unit' };
  }
  switch (sequence % 4) {
    case 0:
      return { type: 'tool.started', sessionId, at, tool: 'Read' };
    case 1:
      return { type: 'tool.completed', sessionId, at, tool: 'Read', ok: true, durationMs: 5 };
    case 2:
      return { type: 'thinking', sessionId, at };
    default:
      return { type: 'file.read', sessionId, at, path: 'src/index.ts' };
  }
}

async function main(): Promise<void> {
  const buffers = Array.from(
    { length: AGENTS },
    () => new EventBuffer(limits, { now: () => Date.now() }),
  );

  let generated = 0;
  let accepted = 0;
  let refused = 0;
  let batches = 0;
  let largestBatch = 0;
  const errors: string[] = [];
  const start = performance.now();

  async function send(batchEvents: readonly AgentEvent[]): Promise<void> {
    batches += 1;
    largestBatch = Math.max(largestBatch, batchEvents.length);
    const response = await post(batchEvents);
    if (response.status === 200) {
      accepted += (response.body as { accepted: number }).accepted;
    } else if (response.status === 413) {
      refused += batchEvents.length;
    } else if (errors.length < 5) {
      errors.push(`${response.status} ${JSON.stringify(response.body)}`);
    }
  }

  // One tick per 250ms of SIMULATED agent time, matching the flush interval:
  // each agent generates its per-tick quota, and the buffer decides whether this
  // is a batch now or later. The scenario is replayed as fast as the process can
  // push it, so the wall-clock below is the achieved throughput, not the
  // simulated duration the ticks represent.
  const ticks = Math.ceil((SECONDS * 1000) / limits.flushIntervalMs);
  const eventsPerTick = Math.max(
    1,
    Math.round((EVENTS_PER_SECOND * limits.flushIntervalMs) / 1000),
  );

  for (let tick = 0; tick < ticks; tick += 1) {
    for (const [agentIndex, buffer] of buffers.entries()) {
      for (let n = 0; n < eventsPerTick; n += 1) {
        generated += 1;
        const ready = buffer.push(eventFor(agentIndex, tick * eventsPerTick + n));
        if (ready !== undefined) {
          await send(ready);
        }
      }
      // Whatever the buffer is holding goes now too: this is the interval flush.
      const due = buffer.flushIfDue() ?? buffer.flush();
      if (due.length > 0) {
        await send(due);
      }
    }
  }

  // Let the subscriber drain loops catch up on the final fan-out.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const elapsedSeconds = (performance.now() - start) / 1000;
  const rows = store.recorded().length;
  const deltas = counters.reduce((sum, counted) => sum + counted.deltas, 0);

  // Built as data, printed at the end, and optionally written to a file — because
  // the CI job uploads this report as the gate's evidence and a workflow that
  // copies a file nothing writes is a comment with a `cp` in it.
  const report = [
    '── event ingest load test ──────────────────────────────────────────',
    `  agents                 ${AGENTS} x ${EVENTS_PER_SECOND} ev/s for ${SECONDS}s simulated (${ticks} ticks of ${limits.flushIntervalMs}ms)`,
    `  replayed in            ${elapsedSeconds.toFixed(2)}s wall clock`,
    `  limits                 flush ${limits.flushIntervalMs}ms / batch ${limits.maxBatchEvents} / reject >${limits.maxRejectEvents} / retry-after ${limits.retryAfterSeconds}s`,
    `  events generated       ${generated}`,
    `  events accepted        ${accepted}`,
    `  events refused (413)   ${refused}`,
    `  batches sent           ${batches} (largest ${largestBatch})`,
    `  rows written           ${rows}  (${((rows / Math.max(1, generated)) * 100).toFixed(1)}% of generated)`,
    `  deltas delivered       ${deltas}  (${subscribers.length} subscriber(s))`,
    `  throughput             ${Math.round(generated / Math.max(elapsedSeconds, 0.001))} ev/s generated, ${Math.round(accepted / Math.max(elapsedSeconds, 0.001))} ev/s accepted`,
    // The gates, printed. A threshold that only exists in a source file cannot be
    // read off a run, so a green run cannot be told apart from a run whose
    // thresholds had been loosened by an environment variable — which is the hole
    // `thresholdsFromEnv` opens on purpose.
    // tests/m4/load-threshold.test.ts reads these two numbers back and asserts
    // they are the published defaults.
    `  thresholds             rows <= ${thresholds.maxRowRatioPercent}% of generated, generated >= ${thresholds.minGeneratedEventsPerSecond} ev/s`,
    '───────────────────────────────────────────────────────────────────',
  ];
  for (const line of report) console.log(line);

  const reportPath = process.env['LOAD_REPORT'];
  if (reportPath !== undefined && reportPath !== '') {
    writeFileSync(reportPath, `${report.join('\n')}\n`);
  }

  // The two claims this harness exists to make falsifiable, as process exit codes
  // so it can be a gate and not just a printout.
  let failed = false;
  if (errors.length > 0) {
    console.error(
      `  FAIL: ${errors.length} batch(es) were neither accepted nor refused: ${errors[0]}`,
    );
    failed = true;
  }
  if (accepted + refused !== generated) {
    console.error(
      `  FAIL: generated ${generated} but accepted ${accepted} + refused ${refused} = ${accepted + refused}`,
    );
    failed = true;
  }
  if (deltas < accepted) {
    console.error(
      `  FAIL: ${accepted} events were accepted but only ${deltas} deltas were delivered`,
    );
    failed = true;
  }
  if (rows >= generated) {
    console.error(
      `  FAIL: every event became a row (${rows}/${generated}); the persistence filter is not filtering`,
    );
    failed = true;
  }

  // The §7.2 pass criterion, as a number with a rationale rather than a
  // structural inequality. The check above is a different claim — the filter is
  // not filtering AT ALL — and it stays a separate line so a future retune of
  // the ratio ceiling cannot quietly delete the catastrophic-failure message.
  for (const breach of thresholdBreaches({ generated, rows, elapsedSeconds }, thresholds)) {
    console.error(`  ${breach.message}`);
    failed = true;
  }

  if (!failed) {
    console.log('  OK: transient events reached subscribers without reaching the store.');
  }

  hub.close();
  process.exitCode = failed ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
