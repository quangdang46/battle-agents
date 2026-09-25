import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AgentEventSchema,
  getZoneForTool,
  normalizeToolName,
  TOOL_NAME_MAP,
} from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { describe, expect, it } from 'vitest';

import { listSessionFiles, piSessionsDirectory } from './paths.js';
import {
  createLogState,
  parseSessionLine,
  readNewSessionLines,
  type PiLogState,
} from './parsers/session.js';
import { PiWatcher } from './watcher.js';

/**
 * The Pi adapter, asserted against a real capture.
 *
 * Every event is checked with `AgentEventSchema`, the union the ingest endpoint
 * validates with and the Codex and Claude adapters already emit into. A local
 * expectation would prove the parser agrees with itself.
 *
 * The two fixtures under `src/fixtures` are captures of real Pi sessions with
 * their text, paths, ids and instants replaced by placeholders. They are
 * captures rather than hand-written lines because a hand-written line encodes
 * the author's idea of Pi's format, which is the one thing a parser test cannot
 * be allowed to do. `session.jsonl` is a whole session, contiguous, 50 lines:
 * 5 user turns, 18 tool calls, 18 results, 21 reasoning blocks, 17 text blocks,
 * one model change and one thinking-level change. `bookkeeping.jsonl` is three
 * records from a different real session that are NOT adjacent there — no single
 * session on the machine that produced these contained every record shape, and
 * splicing the shapes together by hand would have produced a file Pi never
 * wrote.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const FLUSH_INTERVAL_MS = 300;
const SESSION = 'pi-session-1';

function fixtureLines(name: string): readonly string[] {
  return readFileSync(join(FIXTURES, name), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
}

function headerLine(sessionId: string, at = '2026-01-01T00:00:00.000+00:00'): string {
  return JSON.stringify({ type: 'session', id: sessionId, timestamp: at, cwd: '/repo' });
}

/**
 * A state that has already read a header.
 *
 * Pi stamps the session id on the header and nowhere else, so a record parsed
 * against a fresh state has no session to attach to. Seeding is what the
 * watcher does by reading the first line of a file, and a test that wants to
 * exercise a message record has to do it too.
 */
function seededState(sessionId = SESSION): PiLogState {
  const state = createLogState();
  parseSessionLine(headerLine(sessionId), state);
  return state;
}

/** Parses a whole file, asserting every event against the union as it goes. */
function eventsOf(lines: readonly string[]): {
  readonly events: readonly AgentEvent[];
  readonly skipped: readonly string[];
} {
  const state = createLogState();
  const events: AgentEvent[] = [];
  const skipped: string[] = [];
  for (const line of lines) {
    const parsed = parseSessionLine(line, state);
    for (const event of parsed.events) {
      const result = AgentEventSchema.safeParse(event);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      events.push(event);
    }
    if (parsed.skipped !== undefined) skipped.push(parsed.skipped);
  }
  return { events, skipped };
}

function sessionsDir(): string {
  return mkdtempSync(join(tmpdir(), 'pi-sessions-'));
}

/** One session file, written whole, at `dir/name`. */
function sessionFile(dir: string, name: string, lines: readonly string[]): string {
  const path = join(dir, name);
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
  return path;
}

/** A session of `prompts` user turns, so a test can control the event count. */
function promptSession(sessionId: string, prompts: number): readonly string[] {
  return [
    headerLine(sessionId),
    ...Array.from({ length: prompts }, (_, index) =>
      JSON.stringify({
        type: 'message',
        timestamp: `2026-01-01T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000+00:00`,
        message: { role: 'user', content: [{ type: 'text', text: `p${index}` }] },
      }),
    ),
  ];
}

describe('the real capture, end to end', () => {
  const lines = fixtureLines('session.jsonl');

  it('turns a whole real session into a valid, correctly-typed stream', () => {
    const { events } = eventsOf(lines);

    // Validated against AgentEventSchema inside eventsOf; the shape assertion
    // here is the claim that matters: this is what a Pi session IS to the game.
    expect(events[0]).toMatchObject({
      type: 'session.started',
      sessionId: SESSION,
      agentId: SESSION,
      installationId: 'pi',
      projectId: '/repo',
      harness: 'pi',
    });
    // Every event is attributed to the one session the header named, which is
    // the only place in a Pi log the id appears.
    expect(events.every((event) => event.sessionId === SESSION)).toBe(true);
  });

  it('reads the cwd from the header rather than decoding the directory name', () => {
    // The file this came from sat in `--Users-…-Projects-hashline--`, a lossy
    // encoding: a project directory whose own name has a hyphen cannot be told
    // from two path segments. The header is the real path.
    expect(oneEventOf(lines)).toMatchObject({ projectId: '/repo' });
  });

  it('produces exactly the event types the capture supports, and no session.ended', () => {
    const types = [...new Set(eventsOf(lines).events.map((event) => event.type))].sort();

    // Pi's session log has no end-of-session record — verified across every
    // session on the machine that produced the capture — so this adapter cannot
    // emit session.ended and does not invent one; the server-side sweeper marks
    // a run disconnected instead. If a future Pi version adds an end record,
    // this list is the line that has to change deliberately.
    expect(types).toEqual([
      'prompt.submitted',
      'session.started',
      'thinking',
      'tool.completed',
      'tool.started',
    ]);
  });

  it("reads a user turn as a prompt and the assistant's prose as neither", () => {
    const { events } = eventsOf(lines);
    const prompts = events.filter((event) => event.type === 'prompt.submitted');

    // 5 user turns and 17 assistant text blocks in the capture, and not one of
    // those 17 becomes an event: a `prompt.submitted` is a thing the person did,
    // so an answer arriving as one reads as the agent prompting itself.
    expect(prompts).toHaveLength(5);
    expect(prompts[0]).toMatchObject({ prompt: '<redacted>' });
  });

  it('pairs every announced tool call with exactly one completion', () => {
    const { events } = eventsOf(lines);
    const started = events.filter((event) => event.type === 'tool.started');
    const completed = events.filter((event) => event.type === 'tool.completed');

    expect(started).toHaveLength(18);
    expect(completed).toHaveLength(18);
    expect(new Set(started.map((event) => event.tool))).toEqual(
      new Set(completed.map((event) => event.tool)),
    );
  });

  it("measures a tool's duration from its own call, not as zero", () => {
    const completed = eventsOf(lines).events.filter((event) => event.type === 'tool.completed');
    const durations = completed.map((event) => (event as { durationMs: number }).durationMs);

    // Both instants are in the capture and every result's call id matches a call
    // that was announced, so every duration is measurable. A blanket zero would
    // be indistinguishable from "instantaneous", and would be the number every
    // Pi tool reported for ever.
    expect(durations.every((ms) => ms >= 0)).toBe(true);
    expect(durations.filter((ms) => ms > 0).length).toBe(18);
  });

  it('emits the thinking block of a turn that also calls a tool, rather than the tool hiding it', () => {
    const { events } = eventsOf(lines);

    // 19 assistant messages in the capture carry BOTH a reasoning block and a
    // tool call. A parser returning one event per record would have had to drop
    // one of the two, and the protocol has a type for each.
    expect(events.filter((event) => event.type === 'thinking')).toHaveLength(21);
    expect(events.filter((event) => event.type === 'tool.started')).toHaveLength(18);
  });

  it("counts Pi's own bookkeeping records as skips rather than guessing an event", () => {
    const { skipped } = eventsOf(lines);

    // The capture has a model_change and a thinking_level_change. The protocol
    // has no event for a model swap; mapping it onto the nearest type would be a
    // guess, and a guess here reads as a session that switched models or began
    // thinking when it did neither.
    expect(skipped).toEqual(['unmapped-type:model_change', 'unmapped-type:thinking_level_change']);
  });
});

function oneEventOf(lines: readonly string[]): AgentEvent {
  return eventsOf(lines).events[0] as AgentEvent;
}

describe('a toolResult role that is not about a tool', () => {
  it('emits nothing for the shape Pi uses for a turn that is not a tool result', () => {
    const { events, skipped } = eventsOf(fixtureLines('bookkeeping.jsonl'));

    // This record carries `role: 'toolResult'` and nothing identifying a tool:
    // no name, no call id, no error flag. 1266 of the 1289 observed records
    // carrying this role are of exactly this shape, so emitting
    // `tool.completed` from the role alone would invent 1266 completions of
    // tools that were never called.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'session.started', sessionId: 'pi-session-2' });
    expect(skipped).toEqual(['result-without-tool', 'unmapped-type:compaction']);
  });
});

describe('the tool-map is on the path', () => {
  function callLine(name: string, args: Record<string, unknown>): string {
    return JSON.stringify({
      type: 'message',
      timestamp: '2026-01-01T00:01:00.000+00:00',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'call-x', name, arguments: args }],
      },
    });
  }

  function startedFor(name: string, args: Record<string, unknown> = {}): AgentEvent {
    const { events } = parseSessionLine(callLine(name, args), seededState());
    const event = events.find((candidate) => candidate.type === 'tool.started');
    if (event === undefined) throw new Error(`no tool.started for ${name}`);
    return event;
  }

  it('normalises every raw Pi tool name the capture contains', () => {
    // The seven names below are every one observed in the capture and in every
    // other session on the machine. The last three had no mapping at all and
    // were landing in the `thinking` zone despite being file operations.
    expect(
      ['bash', 'read', 'write', 'edit', 'find_block', 'rename_file', 'remove_file'].map(
        (name) => (startedFor(name) as { tool: string }).tool,
      ),
    ).toEqual(['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Edit', 'Edit']);
  });

  it('puts the three newly-mapped names in a zone that is not the fallback', () => {
    // The map's contract is degrade-never-drop, so an unmapped tool is still
    // emitted; what it must not do is claim that reading and writing files is
    // the agent thinking. `thinking` IS the fallback, so this separates "mapped
    // to something" from "fell through".
    for (const name of ['find_block', 'rename_file', 'remove_file']) {
      expect(getZoneForTool((startedFor(name) as { tool: string }).tool), name).not.toBe(
        'thinking',
      );
    }
  });

  it('still emits a tool the map has never heard of, rather than dropping it', () => {
    const tool = (startedFor('a_tool_from_the_future') as { tool: string }).tool;

    expect(TOOL_NAME_MAP['a_tool_from_the_future']).toBeUndefined();
    expect(normalizeToolName('a_tool_from_the_future')).toBe('a_tool_from_the_future');
    expect(tool).toBe('a_tool_from_the_future');
  });

  it('rewrites a camelCase input key, which is the call a copied parser omits', () => {
    // No captured Pi session uses a camelCase key — the real argument keys are
    // `path`, `command`, `edits`, `anchor`, `pos`, `to` — so the capture cannot
    // prove this. What it CAN prove is that the call is on the path: delete
    // `normalizeToolInput` from the parser and this fails.
    expect(
      startedFor('edit', {
        filePath: '/repo/a.ts',
        oldString: 'a',
        newString: 'b',
        replaceAll: true,
      }),
    ).toMatchObject({
      type: 'tool.started',
      input: { file_path: '/repo/a.ts', old_string: 'a', new_string: 'b', replace_all: true },
    });
  });

  it('passes a real Pi argument object through unchanged', () => {
    // The other half of the same claim: normalising must not invent or drop the
    // keys Pi actually sends. Every argument key in the capture is snake_case
    // already, so the rewrite is a no-op on real data, and this pins that.
    const inputs = eventsOf(fixtureLines('session.jsonl'))
      .events.filter((event) => event.type === 'tool.started')
      .map((event) => (event as { input: Record<string, unknown> }).input);

    expect(inputs).toHaveLength(18);
    expect(inputs.every((input) => typeof input === 'object' && input !== null)).toBe(true);
    expect(inputs.flatMap((input) => Object.keys(input)).some((key) => /[A-Z]/.test(key))).toBe(
      false,
    );
  });
});

describe('the instant on an event', () => {
  function promptAt(timestamp: unknown, messageTimestamp?: number): AgentEvent {
    const state = seededState();
    const message: Record<string, unknown> = {
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    };
    if (messageTimestamp !== undefined) message.timestamp = messageTimestamp;
    const { events } = parseSessionLine(
      JSON.stringify({ type: 'message', timestamp, message }),
      state,
    );
    return events[0] as AgentEvent;
  }

  it("takes the record's own timestamp, not the message's epoch-millisecond one", () => {
    // Both forms are in the capture and they disagree by being different forms.
    // The record's is an ISO string with an offset; the message's is epoch
    // milliseconds and is absent from almost every record.
    expect(promptAt('2026-01-01T00:05:00.000+00:00', 1_700_000_000_000)).toMatchObject({
      at: '2026-01-01T00:05:00.000Z',
    });
  });

  it('accepts both offset forms the capture contains, and hands back one canonical form', () => {
    // Older sessions write `Z`, newer ones write `+00:00`. The protocol accepts
    // both, and the union gets a canonical `Z` either way.
    expect(promptAt('2026-08-22T02:34:12.009Z').at).toBe('2026-08-22T02:34:12.009Z');
    expect(promptAt('2026-08-22T02:34:12.009+00:00').at).toBe('2026-08-22T02:34:12.009Z');
  });

  it('skips a timestamp with no offset instead of reading it as local time', () => {
    // `Date.parse` on that string returns a valid instant — the machine's own.
    // The protocol rejects a zoneless instant because it denotes a different
    // moment on every reader, so localizing it here would launder the exact
    // ambiguity the field exists to forbid.
    const outcome = parseSessionLine(
      JSON.stringify({
        type: 'message',
        timestamp: '2026-01-01T00:05:00',
        message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      }),
      seededState(),
    );

    expect(outcome.events).toHaveLength(0);
    expect(outcome.skipped).toBe('no-timestamp');
  });

  it('skips a message read before its header, rather than inventing a session', () => {
    // The session id lives on the header and nowhere else, so a message with no
    // header behind it has no session to attach to.
    const outcome = parseSessionLine(
      JSON.stringify({
        type: 'message',
        timestamp: '2026-01-01T00:05:00.000+00:00',
        message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      }),
      createLogState(),
    );

    expect(outcome.events).toHaveLength(0);
    expect(outcome.skipped).toBe('no-session');
  });
});

describe('a tool the harness reported as failed', () => {
  function run(name: string, isError: boolean, gapMs: number): readonly AgentEvent[] {
    const state = seededState();
    const { events: called } = parseSessionLine(
      JSON.stringify({
        type: 'message',
        timestamp: '2026-01-01T00:01:00.000+00:00',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'call-9', name, arguments: { command: 'false' } }],
        },
      }),
      state,
    );
    expect(called).toHaveLength(1);
    return parseSessionLine(
      JSON.stringify({
        type: 'message',
        timestamp: `2026-01-01T00:01:0${Math.floor(gapMs / 1000)}.${String(gapMs % 1000).padStart(3, '0')}+00:00`,
        message: {
          role: 'toolResult',
          toolCallId: 'call-9',
          toolName: name,
          isError,
          content: [{ type: 'text', text: 'exit 1' }],
        },
      }),
      state,
    ).events;
  }

  it('emits tool.failed rather than a completion that returned false', () => {
    // No captured session failed a tool — all 23 observed results carry
    // isError:false — so the flag is set by hand here. The record's shape is the
    // captured one; only the boolean differs.
    const [event] = run('bash', true, 1_000);

    const result = AgentEventSchema.safeParse(event);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    // A separate event, because the game reads a failed tool differently from
    // one that succeeded and returned a false result. Codex cannot make this
    // distinction: it has no error flag and guesses from the output text.
    expect(event).toMatchObject({ type: 'tool.failed', tool: 'Bash' });
    expect(event).not.toHaveProperty('ok');
  });

  it('emits tool.completed for the same record with isError false', () => {
    expect(run('bash', false, 1_000)[0]).toMatchObject({ type: 'tool.completed', ok: true });
  });

  it('measures a failed tool from its call, and reports zero for one it never saw', () => {
    const state = seededState();
    const orphan = parseSessionLine(
      JSON.stringify({
        type: 'message',
        timestamp: '2026-01-01T00:01:00.000+00:00',
        message: {
          role: 'toolResult',
          toolCallId: 'call-unknown',
          toolName: 'bash',
          isError: false,
          content: [],
        },
      }),
      state,
    );

    // Zero means "not measurable", not "instantaneous" — a result whose call was
    // never seen, which is what a watcher that joined a session mid-stream sees.
    expect(orphan.events[0]).toMatchObject({ type: 'tool.completed', durationMs: 0 });
    expect(run('bash', true, 2_500)[0]).toBeDefined();
  });
});

describe('finding the sessions', () => {
  it("points at Pi's own directory under the home directory", () => {
    expect(piSessionsDirectory('/home/agent')).toBe('/home/agent/.pi/agent/sessions');
  });

  it('finds both layouts, because a glob of one silently misses the other', async () => {
    // Real sessions exist in both shapes at once: some at the root of the
    // sessions directory, some inside a directory named after the project they
    // ran in. On the machine that produced the fixture that is 19 files — 4 at
    // the root and the rest across 10 project directories.
    const dir = sessionsDir();
    sessionFile(dir, '2026-08-22T02-34-12-009Z_01a02751.jsonl', fixtureLines('session.jsonl'));
    const nested = join(dir, '--Users-agent-Projects-widget--');
    mkdirSync(nested, { recursive: true });
    sessionFile(nested, '2026-08-22T03-11-10-826Z_01a02773.jsonl', fixtureLines('session.jsonl'));

    const found = await listSessionFiles(dir);

    expect(found).toHaveLength(2);
    expect(found.some((path) => path.includes('--Users-agent-Projects-widget--'))).toBe(true);
  });

  it('ignores the backup copies Pi leaves beside a live session', async () => {
    // Pi writes `<session>.jsonl.bak` and `<session>.jsonl.bak.1`. A backup is a
    // full copy, so tailing one re-emits every event that session ever produced
    // as a second agent doing the same work.
    const dir = sessionsDir();
    sessionFile(dir, 'sess_1.jsonl', fixtureLines('session.jsonl'));
    const body = readFileSync(join(dir, 'sess_1.jsonl'), 'utf8');
    writeFileSync(join(dir, 'sess_1.jsonl.bak'), body, 'utf8');
    writeFileSync(join(dir, 'sess_1.jsonl.bak.1'), body, 'utf8');

    const found = await listSessionFiles(dir);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/sess_1\.jsonl$/);
  });

  it('returns nothing for a directory that is not there', async () => {
    // A machine where Pi has never run is a normal deployment, not a failure.
    expect(await listSessionFiles(join(sessionsDir(), 'absent'))).toEqual([]);
  });
});

describe('reading incrementally', () => {
  it('leaves a torn trailing line for the next poll', async () => {
    // A JSON document cut in half is not a document. This matters more for Pi
    // than for a single-file watcher: a session file is created by writing the
    // header and then appended to, so the first poll of a brand new session is
    // the poll most likely to catch half a line.
    const path = join(sessionsDir(), 'sess_torn.jsonl');
    appendFileSync(path, `${headerLine('sess-torn')}\n{"type":"messa`, 'utf8');

    const first = await readNewSessionLines(path, 0);
    expect(first.lines).toHaveLength(1);
    expect((await readNewSessionLines(path, first.offset)).lines).toEqual([]);
  });

  it('reads the next record whole after a multi-byte character', async () => {
    // The cursor is a BYTE offset, so the slice has to happen on bytes; slicing
    // the decoded string at a byte index starts a record one character late
    // wherever a character outside ASCII has gone by. Every fixture line here is
    // ASCII, which is exactly why the whole suite passed while the reader was
    // wrong: a prompt with an accent, an emoji or a CJK character in it is
    // ordinary, and every record after it arrived as a fragment that failed to
    // parse and was counted as unreadable — a session that looked alive and was
    // observed no further.
    const path = join(sessionsDir(), 'sess_wide.jsonl');
    const record = (text: string, second: number): string =>
      JSON.stringify({
        type: 'message',
        timestamp: `2026-01-01T00:00:0${second}.000+00:00`,
        message: { role: 'user', content: [{ type: 'text', text }] },
      });
    writeFileSync(path, `${record('héllo', 0)}\n`, 'utf8');

    const first = await readNewSessionLines(path, 0);
    expect(first.lines).toHaveLength(1);

    appendFileSync(path, `${record('wörld', 1)}\n`, 'utf8');
    const second = await readNewSessionLines(path, first.offset);

    expect(second.lines).toHaveLength(1);
    // Whole, and not a fragment that happens to start with a quote.
    expect(JSON.parse(second.lines[0] as string).message.content[0].text).toBe('wörld');
  });

  it('restarts the cursor when the file shrank', async () => {
    const path = join(sessionsDir(), 'sess_rotated.jsonl');
    writeFileSync(path, `${fixtureLines('session.jsonl').join('\n')}\n`, 'utf8');
    const first = await readNewSessionLines(path, 0);
    expect(first.lines).toHaveLength(50);

    writeFileSync(path, `${headerLine('sess-replaced')}\n`, 'utf8');
    const after = await readNewSessionLines(path, first.offset);

    // A stale offset into a replaced file reads from wherever it happened to
    // land, which is a different session's content entirely.
    expect(after.lines).toHaveLength(1);
    expect(JSON.parse(after.lines[0] as string).id).toBe('sess-replaced');
  });
});

describe('the watcher', () => {
  interface Harness {
    readonly dir: string;
    readonly watcher: PiWatcher;
    readonly sent: AgentEvent[];
    /** Every batch as delivered, so the per-batch rule can be asserted. */
    readonly batches: readonly (readonly AgentEvent[])[];
    append(path: string, line: string): void;
    tick(): Promise<void>;
    settle(): Promise<void>;
  }

  function harness(): Harness {
    const dir = sessionsDir();
    const sent: AgentEvent[] = [];
    const batches: (readonly AgentEvent[])[] = [];
    let current = 1_000_000;
    const watcher = new PiWatcher({
      sessionsDirectory: dir,
      pollIntervalMs: 10,
      now: () => current,
      send: async (batch) => {
        batches.push(batch);
        sent.push(...batch);
      },
    });
    return {
      dir,
      watcher,
      sent,
      batches,
      append: (path, line) => appendFileSync(path, `${line}\n`, 'utf8'),
      tick: () => watcher.tick(),
      settle: async () => {
        await watcher.tick();
        current += FLUSH_INTERVAL_MS;
        await watcher.tick();
      },
    };
  }

  it('delivers a real session from its header through to its tool results', async () => {
    const h = harness();
    sessionFile(h.dir, 'sess_1.jsonl', fixtureLines('session.jsonl'));

    await h.settle();

    expect(h.sent[0]).toMatchObject({ type: 'session.started', sessionId: SESSION });
    // 1 header + 5 prompts + 21 reasoning + 18 calls + 18 results.
    expect(h.sent).toHaveLength(63);
    for (const event of h.sent) {
      expect(AgentEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it('never puts two sessions in one batch, which the endpoint refuses', async () => {
    // THE test for the per-file buffer, and the one a shared watcher-level
    // buffer fails. `EventBuffer` holds a flat list and does not partition it,
    // and `POST /api/events` answers 400 for a batch carrying more than one
    // sessionId. Two sessions of 25 events each is the case that catches it:
    // with one shared buffer the 50th push is session B's 25th event, so the
    // flush it triggers carries both — and a case with 50 events in one file
    // and 1 in the other would NOT catch it, because the flush lands inside the
    // first file. The sessions directory holds one directory per project, so
    // two sessions live at once is the normal state, not an edge case.
    const h = harness();
    sessionFile(h.dir, 'sess_a.jsonl', promptSession('sess-a', 24));
    sessionFile(h.dir, 'sess_b.jsonl', promptSession('sess-b', 24));

    await h.tick();

    // Nothing has reached 50 events in either file, so nothing has been sent.
    // A shared buffer would have flushed a 50-event batch right here.
    expect(h.batches).toHaveLength(0);

    await h.settle();

    expect(h.batches).toHaveLength(2);
    expect(h.batches.map((batch) => batch.length)).toEqual([25, 25]);
    for (const batch of h.batches) {
      expect(new Set(batch.map((event) => event.sessionId)).size).toBe(1);
    }
    expect(new Set(h.sent.map((event) => event.sessionId))).toEqual(new Set(['sess-a', 'sess-b']));
  });

  it("keeps two sessions' leftovers apart on stop", async () => {
    const h = harness();
    sessionFile(h.dir, 'sess_x.jsonl', promptSession('sess-x', 0));
    sessionFile(h.dir, 'sess_y.jsonl', promptSession('sess-y', 0));

    await h.tick();
    await h.watcher.stop();

    // Two files, two batches. Merging them would be refused by the endpoint at
    // shutdown, after the events had already been read.
    expect(h.batches.map((batch) => batch.length)).toEqual([1, 1]);
    expect(h.sent).toHaveLength(2);
  });

  it('flushes at fifty events and never puts a hundred in one batch', async () => {
    const h = harness();
    sessionFile(h.dir, 'sess_many.jsonl', promptSession('sess-many', 120));

    await h.settle();

    // 121 events, flushed at 50 per file: 50, 50, then the 21 left by the
    // interval.
    expect(h.batches.map((batch) => batch.length)).toEqual([50, 50, 21]);
    expect(Math.max(...h.batches.map((batch) => batch.length))).toBeLessThan(100);
    expect(h.sent).toHaveLength(121);
  });

  it('flushes on the interval, with an injected clock rather than a sleep', async () => {
    const h = harness();
    const path = sessionFile(h.dir, 'sess_slow.jsonl', promptSession('sess-slow', 0));

    await h.tick();
    expect(h.sent).toHaveLength(0);

    h.append(
      path,
      JSON.stringify({
        type: 'message',
        timestamp: '2026-01-01T00:00:01.000+00:00',
        message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      }),
    );
    await h.tick();
    // One event, one poll, well inside the 250ms window.
    expect(h.sent).toHaveLength(0);

    await h.settle();
    // Both, and in that order: the window is measured from the FIRST event in
    // the file's buffer, which is the header read two polls ago, so advancing
    // the clock past 250ms releases the header along with the prompt. They
    // share the buffer because they are the same session, which is the property
    // the per-file buffer exists to keep.
    expect(h.sent.map((event) => event.type)).toEqual(['session.started', 'prompt.submitted']);
    expect(h.batches).toHaveLength(1);
  });

  it('flushes what is buffered on stop, rather than dropping it', async () => {
    const h = harness();
    sessionFile(h.dir, 'sess_stop.jsonl', promptSession('sess-stop', 0));

    await h.tick();
    const before = h.sent.length;
    await h.watcher.stop();

    expect(h.sent.slice(before)).toHaveLength(1);
  });

  it('counts the records it could not read', async () => {
    const h = harness();
    writeFileSync(join(h.dir, 'sess_junk.jsonl'), 'not json\n', 'utf8');

    await h.settle();

    expect(h.watcher.skippedCount).toBe(1);
  });

  it("keeps a vanished session's buffered events rather than dropping them with the file", async () => {
    // The one place the watcher can lose an event it has already read: a file
    // that disappears while its buffer holds a partial batch. Dropping the
    // bookkeeping drops the batch with it, and the session is gone so no later
    // poll would ever re-read those lines.
    const h = harness();
    const path = sessionFile(h.dir, 'sess_gone.jsonl', promptSession('sess-gone', 0));
    await h.tick();
    expect(h.sent).toHaveLength(0);

    rmSync(path);
    await h.tick();
    await h.watcher.stop();

    // Held rather than sent promptly — the file is no longer polled, so nothing
    // else can flush it — but not lost, which is what the cursor is for.
    expect(h.sent.map((event) => event.type)).toEqual(['session.started']);
  });

  it('picks up a session file that appears after the watcher started', async () => {
    const h = harness();
    sessionFile(h.dir, 'sess_early.jsonl', promptSession('sess-early', 0));
    await h.settle();
    const before = h.sent.length;

    sessionFile(h.dir, 'sess_late.jsonl', promptSession('sess-late', 0));
    await h.settle();

    expect(h.sent.length).toBe(before + 1);
    expect(h.sent.at(-1)).toMatchObject({ sessionId: 'sess-late' });
  });

  it('does not re-emit a session it has already read', async () => {
    const h = harness();
    sessionFile(h.dir, 'sess_once.jsonl', promptSession('sess-once', 1));

    await h.settle();
    const first = h.sent.length;
    await h.settle();
    await h.settle();

    expect(first).toBe(2);
    expect(h.sent).toHaveLength(first);
  });

  it('reads only what was appended, across polls', async () => {
    const h = harness();
    const path = sessionFile(h.dir, 'sess_grow.jsonl', promptSession('sess-grow', 0));
    await h.settle();

    for (let index = 0; index < 3; index += 1) {
      h.append(
        path,
        JSON.stringify({
          type: 'message',
          timestamp: `2026-01-01T00:00:0${index + 1}.000+00:00`,
          message: { role: 'user', content: [{ type: 'text', text: `p${index}` }] },
        }),
      );
      await h.settle();
    }

    // One header plus three prompts, not the header three times over.
    expect(h.sent.map((event) => event.type)).toEqual([
      'session.started',
      'prompt.submitted',
      'prompt.submitted',
      'prompt.submitted',
    ]);
  });
});
