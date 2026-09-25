import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AgentEventSchema, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { afterEach, describe, expect, it } from 'vitest';

import { listTranscriptFiles } from './paths.js';
import { parseTranscriptLine, readNewTranscriptLines } from './parsers/transcript.js';
import { CursorWatcher } from './watcher.js';

/**
 * The Cursor adapter, tested against the format that is on disk.
 *
 * Every fixture below is a record shape read out of a real transcript, and every
 * event is asserted against `AgentEventSchema` — the same union the server
 * validates with — rather than against a local expectation. If this adapter and
 * the Codex one both produce members of one union, the union is the contract and
 * not a wrapper around one CLI's extension points.
 *
 * The three facts that make Cursor its own problem are each asserted here: no
 * record carries a timestamp, no record carries the session id, and no tool
 * result is written at all. A test that did not assert them would pass just as
 * happily against a parser that invented all three.
 */

const SESSION = '994f4828-606a-4409-9c31-6b94cdb59a77';
const SECOND_SESSION = '11111111-2222-3333-4444-555555555555';
const SLUG = 'Users-tranquangdang21-Projects-next-code';
const AT = '2026-08-12T15:38:00.000Z';
const FLUSH_INTERVAL_MS = 300;
const CTX = { sessionId: SESSION, at: AT };

const temporaries: string[] = [];

afterEach(() => {
  for (const path of temporaries.splice(0)) rmSync(path, { recursive: true, force: true });
});

function scratch(): string {
  const path = mkdtempSync(join(tmpdir(), 'cursor-transcript-'));
  temporaries.push(path);
  return path;
}

/** Asserts against the schema the server validates with, not a local copy. */
function parsed(line: string, ctx = CTX): readonly AgentEvent[] {
  const { events, skipped } = parseTranscriptLine(line, ctx);
  if (skipped !== undefined) {
    expect(events, 'a skipped line must not also produce events').toEqual([]);
    return events;
  }
  for (const event of events) {
    const result = AgentEventSchema.safeParse(event);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  }
  return events;
}

/** The three record shapes, verbatim from the transcripts surveyed. */
function userLine(text: string): string {
  return JSON.stringify({ role: 'user', message: { content: [{ type: 'text', text }] } });
}

function assistantLine(blocks: readonly unknown[]): string {
  return JSON.stringify({ role: 'assistant', message: { content: blocks } });
}

function toolUse(name: string, input: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'tool_use', name, input };
}

function turnEnded(status: string, error?: string): string {
  return JSON.stringify({ type: 'turn_ended', status, ...(error === undefined ? {} : { error }) });
}

/** `<projectsRoot>/<slug>/agent-transcripts/<uuid>/<uuid>.jsonl`, as Cursor writes it. */
function transcriptIn(root: string, contents = '', session = SESSION): string {
  const dir = join(root, SLUG, 'agent-transcripts', session);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${session}.jsonl`);
  writeFileSync(path, contents, 'utf8');
  return path;
}

/**
 * A clock that advances past the flush interval on every reading of it.
 *
 * Every watcher in this file gets one of these, so a poll both reads the file
 * and reaches the flush the read opened. A frozen clock is a separate test
 * below, because "a poll does not deliver until the interval elapses" is a
 * property worth asserting rather than assuming.
 */
function advancing(): () => number {
  let current = 1_000_000;
  return () => {
    current += FLUSH_INTERVAL_MS;
    return current;
  };
}

/**
 * A watcher over a pinned transcript, with a clock it controls.
 *
 * The clock ADVANCES on every reading of it, so one poll reads the file and
 * then reaches the flush the read opened. A frozen clock is the other half of
 * this and is exercised on its own below, because "a poll does not deliver
 * until the interval elapses" is a property worth asserting rather than
 * assuming.
 */
function pinned(path: string) {
  const sent: AgentEvent[] = [];
  const batches: AgentEvent[][] = [];
  const watcher = new CursorWatcher({
    send: async (batch) => {
      batches.push([...batch]);
      sent.push(...batch);
    },
    transcriptPath: path,
    pollIntervalMs: 10,
    now: advancing(),
  });
  return { watcher, sent, batches, append: (line: string) => appendFileSync(path, line, 'utf8') };
}

describe('the session envelope', () => {
  it('synthesises session.started from the path, because no record names one', async () => {
    const root = scratch();
    const path = transcriptIn(root);
    const { watcher, sent } = pinned(path);

    await watcher.tick();

    expect(sent[0]).toMatchObject({
      type: 'session.started',
      sessionId: SESSION,
      harness: 'cursor',
      installationId: 'cursor',
    });
  });

  it('emits session.started exactly once across many polls', async () => {
    const root = scratch();
    const path = transcriptIn(root, `${assistantLine([toolUse('Read')])}\n`);
    const { watcher, sent, append } = pinned(path);

    await watcher.tick();
    append(`${assistantLine([toolUse('Glob')])}\n`);
    await watcher.tick();
    append(`${assistantLine([toolUse('Grep')])}\n`);
    await watcher.tick();

    expect(sent.filter((event) => event.type === 'session.started')).toHaveLength(1);
  });

  it('takes the project slug from the path rather than the transcript', async () => {
    const root = scratch();
    transcriptIn(root);
    const sent: AgentEvent[] = [];
    const watcher = new CursorWatcher({
      send: async (batch) => {
        sent.push(...batch);
      },
      projectsRoot: root,
      now: advancing(),
    });

    await watcher.tick();

    expect(sent[0]).toMatchObject({ type: 'session.started', projectId: SLUG });
  });
});

describe('what the agent did', () => {
  it('reads a user turn as prompt.submitted', () => {
    const [event] = parsed(userLine('fix the build'));

    expect(event).toMatchObject({ type: 'prompt.submitted', prompt: 'fix the build' });
  });

  it('reads every tool call in a parallel turn, not just the first', () => {
    // The records surveyed carry up to several tool_use blocks in one assistant
    // record. A parser returning one event per line drops all but the first,
    // and nothing about that failure looks like a failure downstream.
    const events = parsed(
      assistantLine([toolUse('Read', { filePath: 'a.ts' }), toolUse('Grep', { query: 'x' })]),
    );

    expect(events.map((event) => event.type)).toEqual(['tool.started', 'tool.started']);
    expect(events[0]).toMatchObject({ tool: 'Read' });
    expect(events[1]).toMatchObject({ tool: 'Grep' });
  });

  it('normalises the tool name through the shared map', () => {
    // `Shell` and `Ls` are Cursor's names for a terminal; unmapped they would
    // each become their own activity in a log that is supposed to have one
    // vocabulary.
    const events = parsed(assistantLine([toolUse('Shell', { command: 'ls -la' })]));

    expect(events[0]).toMatchObject({
      type: 'tool.started',
      tool: normalizeToolName('Shell'),
      input: { command: 'ls -la' },
    });
  });

  it('normalises the input keys too, which is the easier half to forget', () => {
    const [event] = parsed(assistantLine([toolUse('Edit', { filePath: 'a.ts', oldString: 'a' })]));

    expect(event).toMatchObject({ input: { file_path: 'a.ts', old_string: 'a' } });
  });

  it('reads a turn end as session.ended, mapping each status by meaning', () => {
    expect(parsed(turnEnded('success'))[0]).toMatchObject({ reason: 'completed' });
    expect(parsed(turnEnded('aborted'))[0]).toMatchObject({ reason: 'abandoned' });
    expect(parsed(turnEnded('error', 'provider 503'))[0]).toMatchObject({ reason: 'crashed' });
  });

  it('emits no tool.completed, because a transcript records no tool result', () => {
    // Asserted as a negative on purpose. The template lists tool.completed as
    // required, and emitting one here would mean asserting an outcome the file
    // does not contain.
    const events = parsed(assistantLine([toolUse('Read', { filePath: 'a.ts' })]));

    expect(events.map((event) => event.type)).not.toContain('tool.completed');
  });

  it('counts an assistant turn that is only prose, rather than dropping it silently', () => {
    const outcome = parseTranscriptLine(assistantLine([{ type: 'text', text: 'done' }]), CTX);

    expect(outcome.events).toEqual([]);
    expect(outcome.skipped).toBe('no-tool-calls');
  });

  it('dates events from the file mtime, because no record carries a timestamp', () => {
    // The alternative — dropping every record — makes the adapter emit nothing
    // at all, so the mtime is used and named for what it is. It is passed
    // through verbatim, so the shape it arrives in is the reader's, not the
    // parser's reformatting of it.
    const [event] = parsed(userLine('hi'));

    expect(event).toMatchObject({ at: AT });
  });
});

describe('reading incrementally', () => {
  it('holds a torn tail for the next poll instead of parsing half a record', async () => {
    const root = scratch();
    const path = transcriptIn(root);
    const { watcher, sent, append } = pinned(path);

    // A complete record, then half of the next one. The half is not a record.
    append(`${userLine('first')}\n`);
    append(userLine('seco').slice(0, 20));
    await watcher.tick();
    const afterFirst = sent.filter((event) => event.type === 'prompt.submitted');

    // The rest of the line arrives, and now the record is whole.
    append(`${userLine('second').slice(20)}\n`);
    await watcher.tick();
    const afterSecond = sent.filter((event) => event.type === 'prompt.submitted');

    expect(afterFirst).toHaveLength(1);
    expect(afterSecond).toHaveLength(2);
  });

  it('advances the cursor over a non-ASCII line by bytes, not by characters', async () => {
    // `sửa lỗi build 🚀` is 14 characters and 20 bytes, so the line is 6 bytes
    // longer than it is characters. A reader that counts characters and calls
    // the result a byte offset lands 6 bytes back into the line it just read,
    // and the next poll re-reads its tail as a fragment — which splits on the
    // newline and still yields the line after it, so a test that only counts
    // prompts does not notice. Asserting the count of DROPPED records is what
    // notices, and it is asserted here and in the reader test below.
    const root = scratch();
    const path = transcriptIn(root);
    const { watcher, sent, append } = pinned(path);

    append(`${userLine('sửa lỗi build 🚀')}\n`);
    await watcher.tick();
    append(`${userLine('plain ascii after')}\n`);
    await watcher.tick();

    const prompts = sent.filter((event) => event.type === 'prompt.submitted');
    expect(prompts.map((event) => (event as { prompt?: string }).prompt)).toEqual([
      'sửa lỗi build 🚀',
      'plain ascii after',
    ]);
    // Nothing was re-read and nothing was skipped, which is the claim a
    // character cursor breaks.
    expect(watcher.skippedCount).toBe(0);
  });

  it('hands the next poll exactly the bytes after the last newline, and no fragment', async () => {
    // The reader-level version of the same claim, so it fails on the cursor
    // rather than on anything the watcher does with what it is given. This line
    // is 87 bytes and 81 characters, and the difference is the whole test.
    const root = scratch();
    const path = transcriptIn(root);
    const first = `${userLine('sửa lỗi build 🚀')}\n`;
    const second = `${userLine('plain ascii after')}\n`;
    writeFileSync(path, first, 'utf8');

    const one = await readNewTranscriptLines(path, 0);
    expect(one.lines).toEqual([userLine('sửa lỗi build 🚀')]);
    expect(one.offset).toBe(Buffer.byteLength(first, 'utf8'));

    writeFileSync(path, first + second, 'utf8');
    const two = await readNewTranscriptLines(path, one.offset);
    expect(two.lines).toEqual([userLine('plain ascii after')]);
  });

  it('restarts from zero when the file is replaced by a shorter one', async () => {
    const root = scratch();
    const path = transcriptIn(root);
    const { watcher, sent, append } = pinned(path);

    append(`${userLine('a'.repeat(500))}\n`);
    await watcher.tick();
    // Replaced in place by something shorter, which is what a rotation is.
    writeFileSync(path, `${userLine('after rotation')}\n`, 'utf8');
    await watcher.tick();

    const prompts = sent.filter((event) => event.type === 'prompt.submitted');
    expect(prompts).toHaveLength(2);
  });

  it('reads a file that is gone as no news, rather than failing the poll', async () => {
    const root = scratch();
    const path = transcriptIn(root);
    const { watcher } = pinned(path);

    await watcher.tick();
    rmSync(path, { force: true });

    await expect(watcher.tick()).resolves.toBeUndefined();
  });
});

describe('discovery', () => {
  it('finds transcripts under a project slug and names the session from the file', async () => {
    const root = scratch();
    const path = transcriptIn(root, `${userLine('hi')}\n`);

    const found = await listTranscriptFiles(root);

    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe(path);
    expect(found[0]?.sessionId).toBe(SESSION);
    expect(found[0]?.projectId).toBe(SLUG);
  });

  it('ignores a uuid-named jsonl that is not a transcript', async () => {
    // Some other record under the project directory, with a name that would
    // otherwise satisfy the uuid test.
    const root = scratch();
    mkdirSync(join(root, SLUG, 'state'), { recursive: true });
    writeFileSync(join(root, SLUG, 'state', `${SESSION}.jsonl`), '{}', 'utf8');

    expect(await listTranscriptFiles(root)).toEqual([]);
  });

  it('adopts a transcript that already existed at its end, and a new one from zero', async () => {
    const root = scratch();
    transcriptIn(root, `${userLine('already over')}\n`);
    const sent: AgentEvent[] = [];
    const watcher = new CursorWatcher({
      send: async (batch) => {
        sent.push(...batch);
      },
      projectsRoot: root,
      now: advancing(),
    });

    await watcher.tick();
    // The first listing is a snapshot of sessions that were already over, and
    // replaying them as live activity is worse than losing their opening turns.
    expect(sent.filter((event) => event.type === 'prompt.submitted')).toEqual([]);

    // A session that starts now is entirely news.
    transcriptIn(root, `${userLine('live')}\n`, SECOND_SESSION);
    await watcher.tick();
    const prompts = sent.filter((event) => event.type === 'prompt.submitted');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({ prompt: 'live' });
  });
});

describe('batching', () => {
  it('holds a poll back until the flush interval, rather than sending one event per request', async () => {
    const root = scratch();
    const path = transcriptIn(root);
    const sent: AgentEvent[] = [];
    let current = 1_000_000;
    const watcher = new CursorWatcher({
      send: async (batch) => {
        sent.push(...batch);
      },
      transcriptPath: path,
      now: () => current,
    });

    appendFileSync(path, `${userLine('one')}\n`);
    // The poll that reads the record opens a window. Nothing is due yet, and a
    // watcher that flushed on the first push would defeat the batching the
    // endpoint asks for.
    await watcher.tick();
    expect(sent).toEqual([]);

    current += 250;
    await watcher.tick();
    expect(sent.map((event) => event.type)).toEqual(['session.started', 'prompt.submitted']);
  });

  it('never puts two sessions in one batch', async () => {
    // The ingest endpoint refuses a mixed batch with a 400 naming the offending
    // id, so this is the property that decides whether the events arrive at
    // all.
    const root = scratch();
    transcriptIn(root, `${userLine('a')}\n`);
    transcriptIn(root, `${userLine('b')}\n`, SECOND_SESSION);
    const sent: AgentEvent[] = [];
    const batches: AgentEvent[][] = [];
    const watcher = new CursorWatcher({
      send: async (batch) => {
        batches.push([...batch]);
        sent.push(...batch);
      },
      projectsRoot: root,
      now: advancing(),
    });

    await watcher.tick();

    expect(sent.length).toBeGreaterThan(0);
    for (const batch of batches) {
      expect(new Set(batch.map((event) => event.sessionId)).size).toBe(1);
    }
  });

  it('keeps a batch under the size the endpoint refuses', async () => {
    const root = scratch();
    const path = transcriptIn(root);
    const batches: AgentEvent[][] = [];
    const watcher = new CursorWatcher({
      send: async (batch) => {
        batches.push([...batch]);
      },
      transcriptPath: path,
      now: advancing(),
    });

    for (let index = 0; index < 120; index += 1) {
      appendFileSync(path, `${assistantLine([toolUse('Read', { filePath: `f${index}.ts` })])}\n`);
    }
    await watcher.tick();

    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(50);
    }
    expect(batches.length).toBeGreaterThan(1);
  });

  it('flushes what is buffered on stop, and awaits it', async () => {
    const root = scratch();
    const path = transcriptIn(root);
    // A frozen clock, so the poll that reads the record leaves it buffered. A
    // shutdown is exactly the case where a partial batch still belongs in the
    // record, and this is the only way to have one to assert on.
    const sent: AgentEvent[] = [];
    const watcher = new CursorWatcher({
      send: async (batch) => {
        sent.push(...batch);
      },
      transcriptPath: path,
      now: () => 0,
    });

    appendFileSync(path, `${userLine('last words')}\n`);
    await watcher.tick();
    expect(sent).toEqual([]);

    await watcher.stop();

    expect(sent.map((event) => event.type)).toEqual(['session.started', 'prompt.submitted']);
  });

  it('counts a refused batch instead of dying on it', async () => {
    const root = scratch();
    const path = transcriptIn(root);
    const watcher = new CursorWatcher({
      send: async () => {
        throw new Error('401 unauthorized');
      },
      transcriptPath: path,
      now: advancing(),
    });

    appendFileSync(path, `${userLine('goes nowhere')}\n`);
    await watcher.tick();

    expect(watcher.failedBatchCount).toBe(1);
    expect(watcher.lastFailure).toContain('401');
  });
});

describe('the reader on its own', () => {
  it('reports the mtime it read with, since that is the only instant available', async () => {
    const root = scratch();
    const path = transcriptIn(root, `${userLine('hi')}\n`);

    const first = await readNewTranscriptLines(path, 0);

    expect(first.lines).toHaveLength(1);
    expect(Number.isNaN(Date.parse(first.modified))).toBe(false);
  });

  it('returns no lines and the offset unchanged for a file that has not grown', async () => {
    const root = scratch();
    const path = transcriptIn(root, `${userLine('hi')}\n`);
    const first = await readNewTranscriptLines(path, 0);

    const second = await readNewTranscriptLines(path, first.offset);

    expect(second.lines).toEqual([]);
    expect(second.offset).toBe(first.offset);
  });
});
