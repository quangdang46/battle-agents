import { appendFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  agents,
  authenticate,
  DrizzleCredentialStore,
  DrizzleSessionRepository,
  hashToken,
  installations,
  users,
} from '@battle-agents/db';
import { ClaudeHookNormalizer, ClaudeWatcher } from '@battle-agents/claude';
import { CodexWatcher } from '@battle-agents/codex';
import { getZoneForTool, PROTOCOL_VERSION } from '@battle-agents/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeSharedEventGateway, createEventGateway } from '../../apps/web/src/event-gateway.js';
import type { EventGateway } from '../../apps/web/src/event-gateway.js';
import { closeSharedRuntime, sharedRuntime } from '../../apps/web/src/shared-runtime.js';
import { decodeStreamFrame } from '../../apps/web/src/event-stream.js';
import type { StreamFrame } from '../../apps/web/src/event-stream.js';
import type { HttpRequest, HttpResponse } from '../../apps/web/src/routes.js';

/**
 * The M1 definition of done, exercised: two different harnesses live at once.
 *
 * Every adapter bead proves its own stream, and none of them can fail the way
 * this file fails. The failure this one is built for is two harnesses WORKING
 * and the plane still treating them as one kind of thing — a shared outgoing
 * batch, a collision on identity, or a branch somewhere in the middle that is
 * right for exactly one of them. Section 2.2's claim is that the telemetry
 * plane is not a wrapper around Claude Code's extension points, and only a
 * concurrent run is evidence of that.
 *
 * THE TWO SIDES ARE DELIBERATELY ASYMMETRIC, because the harnesses are. Claude
 * is driven through BOTH of its planes, the hook normalizer and the JSONL tail,
 * because the hook plane is the one that exists. Codex is driven through its
 * rollout and nothing else, because it has no hook surface to drive. A test that
 * made the two look alike would be proving a fact about its own fixtures rather
 * than about the plane.
 *
 * NOTHING HERE IS DOUBLED. The watchers are the real watchers parsing the line
 * shapes the harnesses actually write; the transport is the real
 * `POST /api/events` with its real credential check and its real
 * one-session-per-batch rule; the events reach the stream through the real
 * runtime, the real bus and the real hub. A fake anywhere in that chain is
 * precisely the shortcut this bead exists to rule out.
 *
 * WHICH VIEW PROVES WHAT, because the two are not interchangeable and a reader
 * has to be able to tell which one a claim rests on:
 *
 *   - The PUBLIC view is what `GET /api/events/stream` serves, and that route is
 *     the only SSE surface the app mounts — `streamEvents` in event-routes.ts
 *     subscribes with 'public' and nothing in the tree subscribes otherwise.
 *     `toPublicEvent` publishes whole only the five lifecycle events and reduces
 *     three more, so the public view carries `session.started` from BOTH
 *     harnesses — tellable apart by `harness` and by the server-derived
 *     `actorId` — and drops every transient event. Measured rather than assumed:
 *     the test that names the drop is the one that would go red if the
 *     classification changed.
 *   - The OPERATOR view is the same hub with the transient events left in, and
 *     it is what proves interleaving, attribution and cross-harness normalization
 *     equivalence. It is reached by subscribing to the gateway's own hub, which
 *     is the object the SSE route subscribes to — same broadcast, same
 *     classification seam, not a parallel path.
 *
 * So this file proves a spectator sees both harnesses on the public surface, and
 * it proves the interleaved, attributable, identically-normalized stream on the
 * operator view. It does not claim a spectator can watch a tool call, because on
 * the current classification that is not what the public surface does.
 *
 * A KNOWN ASYMMETRY, left visible rather than asserted away: for the same shell
 * command Claude's HOOK plane reports a `command.run` and Codex reports none.
 * `deriveOutcomeEvents` is documented as hook-plane-only because a rollout
 * writes a call and its result as separate lines and pairing them needs state
 * held across both — which is true, and is why this is a capability gap rather
 * than a normalization bug. What IS the same across both is the call: the
 * canonical tool name, the zone, and the `tool.started` / `tool.completed`
 * members of the one union. That is what the equivalence assertions below check,
 * and they check the two against EACH OTHER rather than each against itself.
 */

const NOW = '2026-09-26T10:00:00.000Z';
/** The window both adapters buffer on. Stepping past it is how a batch leaves. */
const FLUSH_INTERVAL_MS = 250;
const ORIGIN = 'https://agentbattle.test';

/** The names the two harnesses use for the same thing, before normalization. */
const CLAUDE_TOOL_NAME = 'Bash';
const CODEX_TOOL_NAME = 'shell_command';

/**
 * One harness's whole world: who it is, what credential it holds, and where it
 * writes. The file is part of the identity under test rather than a fixture
 * detail — each watcher only ever reads its OWN harness's directory, and both
 * run in discovery mode, so a file landing in the wrong one fails the test
 * rather than being arranged away.
 */
interface Harness {
  readonly harness: 'claude' | 'codex';
  readonly token: string;
  readonly installationId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly logPath: string;
}

interface Delta {
  readonly type: string;
  readonly actorId: string;
  readonly payload: Record<string, unknown>;
}

let gateway: EventGateway;
let handle: (request: HttpRequest) => Promise<HttpResponse>;
let workspace = '';
let byHarness: ReadonlyMap<'claude' | 'codex', Harness>;
let claudeRoot = '';
let codexRoot = '';

/** Every batch either watcher sent, and the status the server answered. */
const wire: {
  readonly sessionId: string;
  readonly types: readonly string[];
  readonly status: number;
}[] = [];

let publicFrames: readonly StreamFrame[] = [];
let operatorFrames: readonly StreamFrame[] = [];

/**
 * The clock both watchers and their buffers read.
 *
 * Injected rather than slept through, because the 250ms flush is part of what is
 * under test — a test that waited on real time would pass whether or not the
 * batching were right, and would be slow in the way that hides it. Stepping it
 * forward is the boundary `event-buffer.ts` says it is written to be tested by.
 */
let clockMs = 1_700_000_000_000;

function harness(name: 'claude' | 'codex'): Harness {
  const found = byHarness.get(name);
  if (found === undefined) throw new Error(`no ${name} harness was prepared`);
  return found;
}

function deltas(frames: readonly StreamFrame[]): Delta[] {
  return frames.flatMap((frame) => {
    if (frame.kind !== 'delta') return [];
    return [
      {
        type: frame.event.type,
        actorId: frame.event.actorId,
        payload: frame.event.payload as unknown as Record<string, unknown>,
      },
    ];
  });
}

/** Who an event belongs to, read off the event rather than out of the test's map. */
function attributedTo(entry: Delta): 'claude' | 'codex' | `unknown:${string}` {
  if (entry.actorId === harness('claude').agentId) return 'claude';
  if (entry.actorId === harness('codex').agentId) return 'codex';
  return `unknown:${entry.actorId}`;
}

/** Lengths of the maximal same-attribution runs, in order. */
function runsOf(values: readonly string[]): number[] {
  const lengths: number[] = [];
  let current = 0;
  let previous: string | undefined;
  for (const value of values) {
    if (previous !== undefined && value === previous) {
      current += 1;
      continue;
    }
    if (previous !== undefined) lengths.push(current);
    current = 1;
    previous = value;
  }
  if (previous !== undefined) lengths.push(current);
  return lengths;
}

async function postBatch(token: string, body: unknown): Promise<HttpResponse> {
  return handle({
    method: 'POST',
    url: `${ORIGIN}/api/events`,
    headers: { get: (name) => (name === 'authorization' ? `Bearer ${token}` : null) },
    body,
  });
}

/**
 * A watcher that posts through the real route, with that harness's own bearer.
 *
 * The throw on a non-200 is here so a refusal cannot pass unnoticed, and the
 * measured limit of what it buys is worth stating: a sender that merged both
 * harnesses' events into one array would NOT trip it, because the scenario runs
 * the two watchers in sequence and the array is emptied after every post. The
 * one-session-per-batch rule is therefore asserted directly below rather than
 * left to this function, and it was verified by deleting the server-side check —
 * the mixed-batch assertion is what went red, not this.
 */
function senderFor(name: 'claude' | 'codex') {
  const self = harness(name);
  return async (batch: readonly unknown[]): Promise<void> => {
    const first = batch[0] as { readonly sessionId?: unknown } | undefined;
    const types = batch.map((event) => (event as { readonly type: string }).type);
    const response = await postBatch(self.token, {
      protocolVersion: PROTOCOL_VERSION,
      events: batch,
    });
    wire.push({ sessionId: String(first?.sessionId ?? '<none>'), types, status: response.status });
    if (response.status !== 200) {
      throw new Error(
        `${name} batch [${types.join(', ')}] was refused ${response.status}: ${JSON.stringify(response.body)}`,
      );
    }
  };
}

async function openStream(): Promise<readonly StreamFrame[]> {
  const response = await handle({
    method: 'GET',
    url: `${ORIGIN}/api/events/stream`,
    headers: { get: () => null },
  });
  if (response.status !== 200) throw new Error(`the stream route answered ${response.status}`);
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const frames: StreamFrame[] = [];
  const decoder = new TextDecoder();
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        const frame = decodeStreamFrame(decoder.decode(value));
        if (frame !== undefined) frames.push(frame);
      }
    } catch {
      /* a cancelled reader is how this stream ends, not a failure of the test */
    }
  })();
  return frames;
}

/** The same hub the route above subscribes to, with the operator classification. */
function openOperatorStream(): readonly StreamFrame[] {
  const frames: StreamFrame[] = [];
  const subscriber = gateway.hub.subscribe('operator');
  void (async () => {
    for (;;) {
      const frame = await subscriber.pull();
      if (frame === undefined) return;
      frames.push(frame);
    }
  })();
  return frames;
}

async function waitUntil(what: string, satisfied: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!satisfied()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function appendTo(name: 'claude' | 'codex', line: unknown): Promise<void> {
  await appendFile(harness(name).logPath, `${JSON.stringify(line)}\n`, 'utf8');
}

beforeAll(async () => {
  const { database } = await sharedRuntime();

  gateway = await createEventGateway({
    database,
    // The authenticator the Next.js adapter supplies. Left to its own fallback
    // the gateway REFUSES every request by design, which would make this a test
    // about an absent credential rather than about two harnesses.
    authenticate: async (request) => {
      const caller = await authenticate(
        { store: new DrizzleCredentialStore(database), now: new Date().toISOString() },
        request as { headers: { get(name: string): string | null }; url: string },
      );
      return { installationId: caller.installationId };
    },
  });
  handle = gateway.handle as typeof handle;

  workspace = await mkdtemp(join(tmpdir(), 'two-harnesses-'));
  claudeRoot = join(workspace, 'claude-projects');
  codexRoot = join(workspace, 'codex-sessions');
  // The layouts the real harnesses write rather than the convenient ones: a
  // Claude project directory holding `<session>.jsonl`, and a Codex date tree
  // holding `rollout-*.jsonl`.
  await mkdir(join(claudeRoot, 'battle-agents'), { recursive: true });
  await mkdir(join(codexRoot, '2026', '09', '26'), { recursive: true });

  const githubId = `${randomUUID()}-two-harness-owner`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  const ownerId = owner?.id ?? '';

  const [installation] = await database
    .insert(installations)
    .values({ userId: ownerId, installationKey: `${randomUUID()}-two-harness` })
    .returning({ id: installations.id });
  const installationId = installation?.id ?? '';

  const store = new DrizzleCredentialStore(database);
  const sessions = new DrizzleSessionRepository(database);
  const prepared: Harness[] = [];

  for (const name of ['claude', 'codex'] as const) {
    // Two agents, not one shared character. "Distinguishable agents" is a claim
    // about identity, and the only thing that can carry it is a durable agent
    // row that outlives the run — two harnesses and one character would let the
    // DoD pass for a reason that has nothing to do with identity.
    const [agent] = await database
      .insert(agents)
      .values({ userId: ownerId, name: `${name}-two-harness`, harness: name })
      .returning({ id: agents.id });
    const agentId = agent?.id ?? '';

    // Built through the concrete Drizzle repository rather than through
    // `session.create`, so the fixture does not depend on which features happen
    // to be mounted. How a session comes to exist is
    // `session-create-to-ingest.test.ts`'s subject; what is under test here is
    // the ingest and fan-out plane, and this file names no feature at all.
    const created = await sessions.createSession({
      agentId,
      installationId,
      projectId: null,
      now: NOW,
    });

    // A separate bearer per harness. One shared token would make "independently
    // authenticated" true by construction instead of by evidence.
    const token = `${randomUUID()}-token-${name}`;
    await store.insert({
      id: randomUUID(),
      tokenHash: hashToken(token),
      installationId,
      agentId,
      scopes: ['events:write'],
      expiresAt: null,
    });

    prepared.push({
      harness: name,
      token,
      installationId,
      agentId,
      sessionId: created.id,
      logPath:
        name === 'claude'
          ? join(claudeRoot, 'battle-agents', `${created.id}.jsonl`)
          : join(codexRoot, '2026', '09', '26', 'rollout-2026-09-26T10-00-00.jsonl'),
    });
  }

  for (const entry of prepared) await appendFile(entry.logPath, '', 'utf8');
  byHarness = new Map(prepared.map((entry) => [entry.harness, entry]));

  await runBothHarnesses();
}, 30_000);

/**
 * One concurrent run of the two watchers, which is the whole scenario.
 *
 * In `beforeAll` rather than per-test so the tests are four separate CLAIMS
 * about one observed run rather than four runs that might differ. Each of them
 * still fails on its own: none of them asserts "the test passed".
 */
async function runBothHarnesses(): Promise<void> {
  const publicStream = await openStream();
  const operatorStream = openOperatorStream();
  const normalizer = new ClaudeHookNormalizer();

  const claude = new ClaudeWatcher({
    send: senderFor('claude'),
    transcriptsRoot: claudeRoot,
    // Long enough that no wall-clock poll can race the explicit ticks below, so
    // every batch in `wire` was placed by a step this file chose.
    pollIntervalMs: 60_000,
    now: () => clockMs,
  });
  const codex = new CodexWatcher({
    send: senderFor('codex'),
    sessionsRoot: codexRoot,
    pollIntervalMs: 60_000,
    now: () => clockMs,
  });

  /** One step of simulated time, past the flush window, then a poll from both. */
  const settle = async (): Promise<void> => {
    clockMs += FLUSH_INTERVAL_MS;
    await claude.tick();
    await codex.tick();
  };

  const pushHook = async (
    payload: Record<string, unknown>,
    tool: string | undefined,
  ): Promise<void> => {
    const normalized = normalizer.normalize(payload, {
      agentId: harness('claude').agentId,
      installationId: harness('claude').installationId,
      projectId: 'battle-agents',
      at: NOW,
    });
    await claude.recordHookEvent({
      sessionId: harness('claude').sessionId,
      tool,
      events: normalized.events,
    });
  };

  try {
    await claude.start();
    await codex.start();

    // 1 — Claude announces itself, through the only plane that has a
    // session-start hook at all.
    await pushHook(
      { session_id: harness('claude').sessionId, hook_event_name: 'SessionStart' },
      undefined,
    );
    await settle();

    // 2 — Codex announces itself, from a rollout line, because that is the whole
    // of its surface.
    await appendTo('codex', {
      timestamp: '2026-09-26T10:00:01.000Z',
      type: 'session_meta',
      payload: {
        id: harness('codex').sessionId,
        installation_id: harness('codex').installationId,
        agent_id: harness('codex').agentId,
        cwd: '/repo/battle-agents',
      },
    });
    await settle();

    // 3 and 4 — THE SAME LOGICAL ACTION through both harnesses. `Bash` and
    // `shell_command` are different strings at the edge and must not be
    // different things afterwards. Comparing them to each other is the whole
    // point: each adapter's own suite only ever compared it to itself, which is
    // exactly how a divergence survives.
    await pushHook(
      {
        session_id: harness('claude').sessionId,
        hook_event_name: 'PreToolUse',
        tool_name: CLAUDE_TOOL_NAME,
        tool_input: { command: 'pnpm test:unit' },
      },
      CLAUDE_TOOL_NAME,
    );
    await settle();

    await appendTo('codex', {
      timestamp: '2026-09-26T10:00:02.000Z',
      type: 'response_item',
      session_id: harness('codex').sessionId,
      payload: {
        type: 'function_call',
        name: CODEX_TOOL_NAME,
        arguments: '{"command":["bash","-lc","pnpm test:unit"]}',
      },
    });
    await settle();

    // 5 and 6 — the same action completing. Claude's hook carries the result in
    // the same payload as the call; Codex writes it as a later line, and the two
    // reaching the stream is the plane refusing to care which.
    await pushHook(
      {
        session_id: harness('claude').sessionId,
        hook_event_name: 'PostToolUse',
        tool_name: CLAUDE_TOOL_NAME,
        tool_input: { command: 'pnpm test:unit' },
        tool_response: { content: 'Exit code 0', is_error: false },
      },
      CLAUDE_TOOL_NAME,
    );
    await settle();

    await appendTo('codex', {
      timestamp: '2026-09-26T10:00:03.000Z',
      type: 'response_item',
      session_id: harness('codex').sessionId,
      payload: { type: 'function_call_output', name: CODEX_TOOL_NAME, output: 'ok' },
    });
    await settle();

    // 7 — one action Claude's hooks never saw, so the JSONL tail has to catch
    // it. Without this the file's claim would be about the hook plane alone, and
    // the tail is the half that has to work when the agent crashes.
    await appendTo('claude', {
      uuid: randomUUID(),
      sessionId: harness('claude').sessionId,
      timestamp: '2026-09-26T10:00:04.000Z',
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'README.md' } }],
      },
    });
    await settle();

    // Published for the assertions, not waited on here. The scenario ends when
    // the last batch is on the wire; the two readers are still draining, and
    // every test below waits for the frames ITS OWN claim is about. Waiting in
    // here instead would turn a broken harness into a beforeAll hook failure
    // with every test reported as skipped — the gate goes red either way, but
    // then nothing says WHICH claim went.
    publicFrames = publicStream;
    operatorFrames = operatorStream;
  } finally {
    await claude.stop();
    await codex.stop();
  }
}

/** Both harnesses present, waited for by whichever claim needs them. */
async function waitForBothHarnesses(): Promise<void> {
  await waitUntil('both harnesses to reach the operator stream', () => {
    const seen = new Set(deltas(operatorFrames).map(attributedTo));
    return seen.has('claude') && seen.has('codex');
  });
}

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
  await closeSharedEventGateway();
  await closeSharedRuntime();
});

describe('two harnesses on one live surface', () => {
  it('carries both of them to the PUBLIC stream, tellable apart without trusting the client', async () => {
    await waitForBothHarnesses();
    await waitUntil('both harnesses to reach the public stream', () => {
      const seen = new Set(deltas(publicFrames).map((entry) => entry.payload.harness));
      return seen.has('claude') && seen.has('codex');
    });
    const seen = deltas(publicFrames);

    // The DoD in the form a spectator meets it. Both harnesses, one stream, no
    // harness-specific path — this is the app's only SSE route, so there is
    // nothing else it could have been.
    expect(new Set(seen.map((entry) => entry.payload.harness))).toEqual(
      new Set(['claude', 'codex']),
    );

    // Attributable by the agent the SERVER resolved from the session row. Not by
    // the process, not by the file, not by the payload — those are the three
    // that collide the moment a second harness starts.
    expect(new Set(seen.map((entry) => entry.actorId))).toEqual(
      new Set([harness('claude').agentId, harness('codex').agentId]),
    );
  });

  it('carries no transient work to the PUBLIC stream, and that is measured rather than assumed', async () => {
    await waitForBothHarnesses();
    const seen = deltas(publicFrames);

    // What `toPublicEvent` does, asserted so the claim in this file's header is
    // a fact a reader can check rather than a belief. A test that only asserted
    // "both harnesses appear here" would pass whether the public view carried
    // everything or almost nothing, and the header comment would be untested
    // prose. This goes red the moment the classification changes, in either
    // direction, which is the point of pinning it.
    expect(seen.every((entry) => entry.type === 'session.started')).toBe(true);
    expect(seen.some((entry) => entry.type === 'tool.started')).toBe(false);
    expect(seen.some((entry) => entry.type === 'command.run')).toBe(false);

    // The operator view is where the work is, so the two views are not the same
    // claim. If this ever fails, the public surface grew and the header is stale.
    expect(deltas(operatorFrames).some((entry) => entry.type === 'tool.started')).toBe(true);
  });

  it('interleaves the two on one stream, and separates them by durable identity', async () => {
    await waitForBothHarnesses();
    const attribution = deltas(operatorFrames).map(attributedTo);

    // Nothing belongs to nobody. An event whose actorId is neither agent would
    // mean identity was resolved somewhere other than the session row, and every
    // attribution below would then be a coincidence rather than a fact.
    expect(attribution.filter((who) => who.startsWith('unknown'))).toEqual([]);

    // Interleaved means NOT two contiguous blocks, one per harness. A runtime
    // that buffered one harness's whole run and flushed it after the other's
    // satisfies every other assertion in this file, and this is the one that
    // does not let it.
    const runs = runsOf(attribution);
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...runs)).toBeLessThan(attribution.length / 2);
  });

  it('reads the tail as well as the hooks, so a harness that never cooperated is still visible', async () => {
    await waitUntil('the JSONL tail to report the Read', () => {
      return deltas(operatorFrames).some((entry) => entry.type === 'file.read');
    });
    // The `Read` call was written only to the transcript, never announced by a
    // hook. If the JSONL plane were not running this would be empty, and the
    // file's "hook-driven plus a net" claim would be half-proved.
    const fromTail = deltas(operatorFrames).find(
      (entry) => entry.type === 'file.read' && entry.actorId === harness('claude').agentId,
    );
    expect(fromTail?.payload).toMatchObject({ path: 'README.md' });
  });

  it('normalizes the same logical action to the same thing through both harnesses', async () => {
    await waitForBothHarnesses();
    await waitUntil('both harnesses to report the command completing', () => {
      const seen = deltas(operatorFrames);
      return (
        seen.some((entry) => attributedTo(entry) === 'claude' && entry.type === 'tool.completed') &&
        seen.some((entry) => attributedTo(entry) === 'codex' && entry.type === 'tool.completed')
      );
    });
    const seen = deltas(operatorFrames);
    const toolStart = (who: 'claude' | 'codex') =>
      seen.find((entry) => attributedTo(entry) === who && entry.type === 'tool.started');
    const toolDone = (who: 'claude' | 'codex') =>
      seen.find((entry) => attributedTo(entry) === who && entry.type === 'tool.completed');

    const claudeStart = toolStart('claude');
    const codexStart = toolStart('codex');
    expect(claudeStart?.payload.tool).toBe('Bash');
    expect(codexStart?.payload.tool).toBe('Bash');
    expect(toolDone('claude')?.payload.tool).toBe('Bash');
    expect(toolDone('codex')?.payload.tool).toBe('Bash');

    // Why the shared tool-map is load-bearing rather than tidy. Zoned by the
    // name each harness actually sends, the same action lands in two different
    // places and the world renders the two agents doing different things. After
    // normalization they are one thing, in one zone, on one union.
    expect(getZoneForTool(CLAUDE_TOOL_NAME)).toBe('terminal');
    expect(getZoneForTool(CODEX_TOOL_NAME)).not.toBe(getZoneForTool(CLAUDE_TOOL_NAME));
    expect(getZoneForTool(String(codexStart?.payload.tool))).toBe(
      getZoneForTool(String(claudeStart?.payload.tool)),
    );
  });

  it('keeps the two outgoing batches separate, and refuses a mixed one', async () => {
    await waitForBothHarnesses();
    // One session per batch is a rule the server enforces with a 400 and the
    // sender throws on, so a shared outgoing buffer fails this file rather than
    // quietly passing it. Asserted directly as well, because a rule that is only
    // ever met is not a rule that is checked.
    // Every batch that left either watcher named exactly one session. Stated
    // rather than left to the 200s: the sender throws on a refusal, so a mixed
    // batch would already have failed the scenario, and this records the fact
    // for a reader who wants to see it rather than infer it.
    expect(wire.every((entry) => entry.status === 200)).toBe(true);
    expect(wire.every((entry) => entry.sessionId !== '<none>')).toBe(true);
    expect(
      wire.filter((entry) => entry.sessionId === harness('claude').sessionId).length,
    ).toBeGreaterThan(0);
    expect(
      wire.filter((entry) => entry.sessionId === harness('codex').sessionId).length,
    ).toBeGreaterThan(0);

    const mixed = await postBatch(harness('claude').token, {
      protocolVersion: PROTOCOL_VERSION,
      events: [
        { type: 'session.heartbeat', sessionId: harness('claude').sessionId, at: NOW },
        { type: 'session.heartbeat', sessionId: harness('codex').sessionId, at: NOW },
      ],
    });
    expect(mixed.status).toBe(400);
    expect(mixed.body).toMatchObject({
      error: 'a batch must carry events for exactly one session',
    });
  });

  it('takes identity from the session row, not from what a client claims', async () => {
    // Subscribed BEFORE the post, not after. `hub.subscribe` takes its snapshot
    // and joins the broadcast set in one step, so a subscriber opened once the
    // event has gone would wait forever for it — a failure that looks exactly
    // like the plane having dropped the event, which is the confusion this test
    // exists to rule out.
    const operator = openOperatorStream();

    // A client asserting its own identity is the one thing an installation
    // token exists to prevent, so the assertion is made the other way round: the
    // payload lies about which agent it is, and the platform's own attribution
    // still lands on the session's real agent.
    const impostor = randomUUID();
    const lying = await postBatch(harness('codex').token, {
      protocolVersion: PROTOCOL_VERSION,
      events: [
        {
          type: 'session.started',
          sessionId: harness('codex').sessionId,
          at: NOW,
          agentId: impostor,
          installationId: harness('codex').installationId,
          projectId: 'battle-agents',
          harness: 'codex',
        },
      ],
    });
    expect(lying.status).toBe(200);

    await waitUntil('the forged session.started to reach the hub', () => {
      return deltas(operator).some(
        (entry) => entry.type === 'session.started' && entry.payload.agentId === impostor,
      );
    });

    const forged = deltas(operator).find(
      (entry) => entry.type === 'session.started' && entry.payload.agentId === impostor,
    );
    // The event is accepted — the shape is valid — and it is attributed to the
    // character the session belongs to. The claimed id travels as inert payload.
    expect(forged?.actorId).toBe(harness('codex').agentId);
    expect(forged?.actorId).not.toBe(impostor);
  });

  it('warns on a protocol version mismatch instead of corrupting the stream', async () => {
    const operator = openOperatorStream();
    const before = deltas(operator).length;

    const mismatched = await postBatch(harness('claude').token, {
      protocolVersion: '9.9.9',
      events: [{ type: 'session.heartbeat', sessionId: harness('claude').sessionId, at: NOW }],
    });
    expect(mismatched.status).toBe(400);
    expect(mismatched.body).toMatchObject({
      error: 'protocol version mismatch',
      expectedProtocol: PROTOCOL_VERSION,
      receivedProtocol: '9.9.9',
    });

    // "Warns rather than corrupts" is only a claim if nothing from the refused
    // batch got through AND the stream keeps working afterwards. The first half
    // is checked by letting the clock run rather than by a `waitUntil` that is
    // satisfied before the assertion has had a chance to be false.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(deltas(operator).length).toBe(before);

    const after = await postBatch(harness('claude').token, {
      protocolVersion: PROTOCOL_VERSION,
      events: [{ type: 'session.heartbeat', sessionId: harness('claude').sessionId, at: NOW }],
    });
    expect(after.status).toBe(200);
    await waitUntil('the next good batch to reach the hub', () => {
      return deltas(operator).length > before;
    });
  });
});
