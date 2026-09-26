import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AgentEventSchema, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { afterEach, describe, expect, it } from 'vitest';

import { listTranscriptFiles } from './paths.js';
import {
  activityZone,
  parseTranscriptLine,
  promptLineText,
  readNewTranscriptLines,
} from './parsers/transcript.js';
import { AiderWatcher } from './watcher.js';

/**
 * The Aider adapter, tested against the grammar its writer produces.
 *
 * THE FIXTURES ARE RECONSTRUCTED, NOT CAPTURED, and that is the most important
 * thing to know about this file. Aider is not installed on the machine these
 * tests were written on, `~/.aider` does not exist there, and Aider writes its
 * transcript into a project directory while adding `.aider*` to that project's
 * `.gitignore` — so there is no captured transcript anywhere to copy, and the
 * fixtures below are built from the functions in aider-chat 0.86.2 that write
 * each line. Every one of them is a line one of those functions produces; the
 * parsing of each is asserted here. What is NOT claimed is byte-for-byte
 * capture, and the first person to run Aider should believe a real transcript
 * over these fixtures if the two disagree.
 *
 * Every event is asserted against `AgentEventSchema` — the same union the server
 * validates with — rather than against a local expectation, for the reason the
 * Cursor suite gives.
 *
 * The four facts that make Aider its own problem are each asserted below: the
 * transcript lives in the PROJECT and not in `~/.aider`, no line carries a
 * timestamp except the run boundary, no line carries a session id, and no tool
 * RESULT is written at all. A test that did not assert them would pass just as
 * happily against a parser that invented all four.
 */

const TRANSCRIPT_NAME = '.aider.chat.history.md';
const AT = '2026-08-12T15:38:00.000Z';
const FLUSH_INTERVAL_MS = 300;
const SESSION = 'sess-1';
const CTX = { sessionId: SESSION, at: AT };

const temporaries: string[] = [];

afterEach(() => {
  for (const path of temporaries.splice(0)) rmSync(path, { recursive: true, force: true });
});

function scratch(): string {
  const path = mkdtempSync(join(tmpdir(), 'aider-transcript-'));
  temporaries.push(path);
  return path;
}

/** Asserts against the schema the server validates with, not a local copy. */
function parsed(line: string, ctx = CTX, pending?: string): readonly AgentEvent[] {
  const result = parseTranscriptLine(line, ctx, pending);
  // A real assertion, not a tautology: the first version of this read
  // `expect(result.events).toEqual(result.skipped === undefined ? result.events : [])`,
  // which compares a value with itself on one branch and can never fail. A line
  // that is counted as skipped must carry no event, or the skip count and the
  // stream disagree about what happened.
  if (result.skipped !== undefined) {
    expect(result.events, 'a skipped line must not also produce events').toEqual([]);
  }
  for (const event of result.events) {
    const outcome = AgentEventSchema.safeParse(event);
    expect(outcome.success, JSON.stringify(outcome.error?.issues)).toBe(true);
  }
  return result.events;
}

// ---------------------------------------------------------------------------
// The line grammar, as `io.append_chat_history` writes it.
//
// `append_chat_history` ends every linebreak line with TWO SPACES AND A
// NEWLINE — Markdown's own line-break syntax (`aider/io.py:1117`). The helpers
// below emit that, because a parser written against tidy fixtures would never
// learn to strip it and would then match nothing at all against a real
// transcript.
// ---------------------------------------------------------------------------

/** `# aider chat started at <stamp>`, written by `io.__init__`. */
function boundary(stamp: string): string {
  return `# aider chat started at ${stamp}`;
}

/** A tool-output line: quoted, and ending in Markdown's two-space break. */
function tool(text: string): string {
  return `> ${text}  `;
}

/** A prompt line: `io.user_input` writes one `#### ` per input line. */
function prompt(text: string): string {
  return `#### ${text}  `;
}

const START = boundary('2026-08-12 15:38:00');

/**
 * A whole transcript, as the four functions above produce it.
 *
 * Between the prompt and the model's answer there is a BLANK LINE, because
 * `ai_output` writes a leading newline (`aider/io.py:795`). The prose is not an
 * event and is included so the parser is exercised against the majority of a real
 * transcript, which is exactly that.
 */
function transcript(): string {
  return [
    '',
    boundary('2026-08-12 15:38:00'),
    '',
    prompt('add a retry to the uploader'),
    '',
    'I will add the retry and then run the tests.',
    '',
    tool('Applied edit to src/upload.ts'),
    tool('Running npm test'),
    tool('Added 12 lines of output to the chat.'),
    '',
  ].join('\n');
}

/** An instant built from local wall-clock parts, independently of the parser. */
function localInstant(year: number, month: number, day: number, hour: number, minute: number): string {
  return new Date(year, month - 1, day, hour, minute, 0).toISOString();
}

/**
 * A clock that advances past the flush interval on every reading of it, so one
 * poll both reads the file and reaches the flush the read opened.
 */
function advancing(): () => number {
  let current = 1_000_000;
  return () => {
    current += FLUSH_INTERVAL_MS;
    return current;
  };
}

/**
 * Asserts a whole batch against the union the server validates with.
 *
 * Applied to what the WATCHER emits, not only to what the parser returns from a
 * line. The session envelope is assembled by the watcher and never passes
 * through a single parser call, so a wrong `harness` or a missing `agentId`
 * there is invisible to a parser-only check — and this adapter is where a new
 * field on `session.started` would be got wrong.
 */
function assertValid(events: readonly AgentEvent[]): void {
  for (const event of events) {
    const outcome = AgentEventSchema.safeParse(event);
    expect(outcome.success, JSON.stringify(outcome.error?.issues)).toBe(true);
  }
}

/** A watcher over a pinned transcript, with a clock it controls. */
function pinned(path: string) {
  const sent: AgentEvent[] = [];
  const batches: AgentEvent[][] = [];
  const watcher = new AiderWatcher({
    send: async (batch) => {
      assertValid(batch);
      batches.push([...batch]);
      sent.push(...batch);
    },
    now: advancing(),
    transcriptPath: path,
  });
  return { watcher, sent, batches };
}

function transcriptIn(root: string, contents = transcript(), name = TRANSCRIPT_NAME): string {
  mkdirSync(root, { recursive: true });
  const path = join(root, name);
  writeFileSync(path, contents, 'utf8');
  return path;
}

// ---------------------------------------------------------------------------

describe('the session envelope', () => {
  it('reads a run boundary as session.started, at the instant Aider recorded', async () => {
    const path = transcriptIn(scratch());
    const { watcher, sent } = pinned(path);
    await watcher.tick();

    const started = sent.find((event) => event.type === 'session.started');
    expect(started).toBeDefined();
    // Aider writes LOCAL wall-clock time with no zone designator, and it is read
    // as local time. Built here from the parts independently of the parser, so
    // this fails if the stamp is ever parsed as UTC instead. It cannot fail on a
    // runner whose zone IS UTC, where the two readings coincide — that hole is
    // real and is why the parse is documented rather than asserted twice.
    expect(started?.at).toBe(localInstant(2026, 8, 12, 15, 38));
  });

  it('takes the session id from the path and the boundary, because no line carries one', async () => {
    const path = transcriptIn(scratch());
    const { watcher, sent } = pinned(path);
    await watcher.tick();

    const started = sent.find((event) => event.type === 'session.started');
    expect(started?.sessionId).toBe(`${path}#${localInstant(2026, 8, 12, 15, 38)}`);
    // The session is its own agent: Aider records no identity, and inventing one
    // would put two runs in a log that cannot tell them apart.
    expect(started?.type === 'session.started' && started.agentId).toBe(started?.sessionId);
    expect(started?.type === 'session.started' && started.installationId).toBe('aider');
  });

  it('declares the harness as `other`, the escape hatch the protocol provides', async () => {
    const path = transcriptIn(scratch());
    const { watcher, sent } = pinned(path);
    await watcher.tick();

    // `harness` is a frozen enum and Aider is not in it. The enum's own comment
    // says a new coding agent ships an adapter before it grows an entry, so
    // `other` is the designed path. Asserted so a later widening of the union
    // that quietly skips this adapter is visible.
    const started = sent.find((event) => event.type === 'session.started');
    expect(started?.type === 'session.started' && started.harness).toBe('other');
  });

  it('emits session.started exactly once across many polls', async () => {
    const path = transcriptIn(scratch());
    const { watcher, sent } = pinned(path);
    await watcher.tick();
    await watcher.tick();
    await watcher.tick();

    expect(sent.filter((event) => event.type === 'session.started')).toHaveLength(1);
  });

  it('ends the open session when a later run begins, and ends it BEFORE the next starts', async () => {
    const path = transcriptIn(scratch());
    const { watcher, sent } = pinned(path);
    await watcher.tick();
    appendFileSync(
      path,
      ['\n', boundary('2026-08-12 16:02:11'), '\n', prompt('now the docs'), '\n', tool('Running pnpm build'), ''].join(
        '\n',
      ),
      'utf8',
    );
    await watcher.tick();

    const lifecycle = sent.filter(
      (event) => event.type === 'session.started' || event.type === 'session.ended',
    );
    expect(lifecycle.map((event) => event.type)).toEqual([
      'session.started',
      'session.ended',
      'session.started',
    ]);
    const ended = lifecycle[1];
    // `abandoned`, not `completed`: nothing in the format says the earlier run
    // finished its work. A run that stopped without saying why is what
    // `abandoned` is for.
    expect(ended?.type === 'session.ended' && ended.reason).toBe('abandoned');
    const first = lifecycle[0];
    const last = lifecycle[2];
    // The end belongs to the run that was open, and the new start is a
    // DIFFERENT session, which is the only way two runs in one file stay
    // distinguishable.
    expect(ended?.sessionId).toBe(first?.sessionId);
    expect(last?.sessionId).not.toBe(first?.sessionId);
  });

  it('emits no session.ended for a run still in progress, because nothing ended it', async () => {
    const path = transcriptIn(scratch());
    const { watcher, sent } = pinned(path);
    await watcher.tick();
    await watcher.stop();

    // Stated as a test rather than left as a documented gap: a session that goes
    // quiet has not been observed to end, and inventing an end would put a
    // completion in the record that the file never wrote.
    expect(sent.filter((event) => event.type === 'session.ended')).toHaveLength(0);
  });
});

describe('what the agent did', () => {
  it('reads a prompt as prompt.submitted, once the following line closes it', () => {
    const first = parseTranscriptLine(prompt('add a retry'), CTX);
    expect(first.events).toEqual([]);
    expect(first.pendingPrompt).toBe('add a retry');

    const second = parseTranscriptLine('I will add the retry.', CTX, first.pendingPrompt);
    expect(second.events).toEqual([
      { type: 'prompt.submitted', sessionId: SESSION, at: AT, prompt: 'add a retry' },
    ]);
    expect(second.skipped).toBe('model-prose');
  });

  it('joins a multi-line prompt into ONE event rather than one per line', () => {
    // `io.user_input` writes one `#### ` per input line. A parser that emitted
    // per line would turn a pasted stack trace into a dozen prompts, and a replay
    // would show the user having said the same thing a dozen times.
    let pending: string | undefined;
    for (const line of [prompt('here is the stack'), prompt('  File "x.py", line 1'), prompt('  File "y.py", line 2')]) {
      pending = parseTranscriptLine(line, CTX, pending).pendingPrompt;
    }
    const closed = parseTranscriptLine(tool('Applied edit to a.py'), CTX, pending);
    expect(closed.events).toEqual([
      {
        type: 'prompt.submitted',
        sessionId: SESSION,
        at: AT,
        prompt: 'here is the stack\n  File "x.py", line 1\n  File "y.py", line 2',
      },
      { type: 'file.write', sessionId: SESSION, at: AT, path: 'a.py' },
    ]);
  });

  it('strips the two trailing spaces Aider writes, without which nothing matches', () => {
    // Proved by breaking it: the same line without the Markdown line break still
    // parses, which is why the assertion has to be about the real bytes.
    expect(tool('Applied edit to src/a.ts').endsWith('  ')).toBe(true);
    const events = parsed(tool('Applied edit to src/a.ts'));
    expect(events).toEqual([{ type: 'file.write', sessionId: SESSION, at: AT, path: 'src/a.ts' }]);
  });

  it('reads an applied edit as file.write, because that is what the line says happened', () => {
    expect(parsed(tool('Applied edit to src/upload.ts'))).toEqual([
      { type: 'file.write', sessionId: SESSION, at: AT, path: 'src/upload.ts' },
    ]);
  });

  it('reads an empty file creation as a write too', () => {
    expect(parsed(tool('Creating empty file src/placeholder.ts'))).toEqual([
      { type: 'file.write', sessionId: SESSION, at: AT, path: 'src/placeholder.ts' },
    ]);
  });

  it('reads a shell invocation as tool.started, with the command it names', () => {
    expect(parsed(tool('Running npm test'))).toEqual([
      {
        type: 'tool.started',
        sessionId: SESSION,
        at: AT,
        tool: 'Bash',
        input: { command: 'npm test' },
      },
    ]);
  });

  it('normalises the tool name through the shared map rather than emitting a raw one', () => {
    // The event carries the CANONICAL name. An adapter that skipped this
    // produces a stream that is correct and unreadable, because every harness
    // name becomes its own thing in the activity log and the zone map.
    const events = parsed(tool('Running npm test'));
    const started = events[0];
    expect(started?.type === 'tool.started' && started.tool).toBe(
      normalizeToolName('run_command'),
    );
    expect(started?.type === 'tool.started' && started.tool).not.toBe('run_command');
  });

  it('reads the safety commit Aider makes before editing as a tool event', () => {
    expect(parsed(tool('Committing src/upload.ts before applying edits.'))).toEqual([
      {
        type: 'tool.started',
        sessionId: SESSION,
        at: AT,
        tool: 'Bash',
        input: { path: 'src/upload.ts' },
      },
    ]);
  });

  it('emits no tool.completed, because a transcript records no tool result', async () => {
    // Aider routes a command's output to the terminal; it reaches the transcript
    // only if the user separately answers yes to "Add command output to the
    // chat?". So the transcript holds the invocation and never the outcome, and
    // a completion emitted here would assert a result the file does not contain.
    // This is the same gap the Cursor adapter states about its own format.
    const path = transcriptIn(scratch());
    const { watcher, sent } = pinned(path);
    await watcher.tick();
    expect(sent.filter((event) => event.type === 'tool.completed')).toHaveLength(0);
  });

  it('counts a line whose edit was NOT applied, rather than inventing a write', async () => {
    // `--dry-run` means Aider declined to write the file. Turning that into a
    // `file.write` would put a change in the record that never happened.
    const dryRun = parseTranscriptLine(tool('Did not apply edit to src/a.ts (--dry-run)'), CTX);
    expect(dryRun.events).toEqual([]);
    expect(dryRun.skipped).toBe('edit-not-applied');

    const path = transcriptIn(
      scratch(),
      ['', START, '', prompt('go'), '', tool('Did not apply edit to src/a.ts (--dry-run)'), ''].join('\n'),
    );
    const { watcher, sent } = pinned(path);
    await watcher.tick();
    expect(sent.filter((event) => event.type === 'file.write')).toHaveLength(0);
    expect(watcher.skippedCount).toBeGreaterThan(0);
  });

  it('counts unattributed tool output instead of turning it into invented tool calls', async () => {
    // The majority of a real transcript is this: status lines, lint output, a
    // diff a `/diff` printed. Aider's tool output is free text with no tool name,
    // so counting is the honest answer and a number somebody can see.
    const prose = parseTranscriptLine(tool('Added 12 lines of output to the chat.'), CTX);
    expect(prose.events).toEqual([]);
    expect(prose.skipped).toBe('unattributed-tool-output');
  });

  it('counts the model prose rather than logging every paragraph as activity', () => {
    expect(parseTranscriptLine('I will add the retry and then run the tests.', CTX).skipped).toBe(
      'model-prose',
    );
  });

  it('dates every event but the boundary from the file mtime, because no line carries a timestamp', () => {
    // The same floor the Cursor adapter uses. A transcript with no timestamps is
    // a gap in the record rather than a reason to drop the session, and this is
    // what the file can honestly supply.
    const events = parsed(tool('Applied edit to src/a.ts'));
    expect(events.every((event) => event.at === AT)).toBe(true);
  });

  it('keeps a non-ASCII prompt intact, which is the ordinary case for this harness', async () => {
    // Multi-byte user text is not an exotic case for Aider; it is what the
    // transcript holds most of the time. The reader is asserted on it below too.
    const text = 'Cập nhật README tiếng Việt 🇻🇳';
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(text.length);

    const path = transcriptIn(
      scratch(),
      ['', START, '', prompt(text), '', tool('Applied edit to README.md'), ''].join('\n'),
    );
    const { watcher, sent } = pinned(path);
    await watcher.tick();

    const submitted = sent.find((event) => event.type === 'prompt.submitted');
    expect(submitted?.type === 'prompt.submitted' && submitted.prompt).toBe(text);
  });

  it('keeps a blank prompt as a real turn, because Aider writes one', () => {
    // `io.user_input` writes a blank line of input as the prefix and the
    // Markdown break and nothing else, so the block accumulates to an EMPTY
    // string — and `prompt` is a non-empty string in the protocol, so emitting
    // it raw would fail validation on a turn the user really did take. The
    // replacement is Aider's own marker for a turn with no text.
    const blank = prompt('');
    expect(blank).toBe('####   ');
    const first = parseTranscriptLine(blank, CTX);
    expect(first.pendingPrompt).toBe('');
    const closed = parseTranscriptLine('ok', CTX, first.pendingPrompt);
    expect(closed.events[0]).toEqual({
      type: 'prompt.submitted',
      sessionId: SESSION,
      at: AT,
      prompt: '<blank>',
    });
  });

  it('keeps the indentation of a pasted block, which is content and not decoration', () => {
    // Trimming a continuation line's leading whitespace produces a prompt that
    // reads correctly and has lost the shape of the thing being reported. The
    // first version of this parser trimmed it.
    const first = parseTranscriptLine(prompt('Traceback:'), CTX);
    const second = parseTranscriptLine(prompt('  File "a.py", line 1'), CTX, first.pendingPrompt);
    expect(second.pendingPrompt).toBe('Traceback:\n  File "a.py", line 1');
  });

  it('does not mistake a Markdown heading the model wrote for a prompt line', () => {
    // Aider writes model prose into the same file unadorned, and prose can
    // contain a heading. The prefix is `#### ` WITH its space, so a heading with
    // no space after the hashes is something else.
    expect(promptLineText('#### a prompt')).toBe('a prompt');
    expect(promptLineText('####Heading the model wrote')).toBeUndefined();
    expect(promptLineText('## a smaller heading')).toBeUndefined();
  });
});

describe('an unmapped activity degrades to a zone rather than being dropped', () => {
  it('keeps a name the shared map has never seen, and zones it as thinking', () => {
    // The promise this adapter makes about the next Aider release. A name the
    // map does not know is returned unchanged and zoned `thinking` rather than
    // dropped, so a new activity costs a row in the shared map and costs the
    // stream nothing.
    expect(normalizeToolName('an_activity_aider_has_not_shipped')).toBe(
      'an_activity_aider_has_not_shipped',
    );
    expect(activityZone('an_activity_aider_has_not_shipped')).toBe('thinking');
  });

  it('zones the activities it does know through the same shared map', () => {
    expect(activityZone('run_command')).toBe('terminal');
    expect(activityZone('commit')).toBe('terminal');
  });
});

describe('reading incrementally', () => {
  it('holds a torn tail for the next poll instead of parsing half a line', async () => {
    const dir = scratch();
    const path = transcriptIn(dir, '');
    const first = await readNewTranscriptLines(path, 0);
    expect(first.lines).toEqual([]);

    // A line with no trailing newline is a line Aider has not finished writing.
    appendFileSync(path, '# aider chat started at 2026-08-12 15:38:0', 'utf8');
    const torn = await readNewTranscriptLines(path, 0);
    expect(torn.lines).toEqual([]);
    expect(torn.offset).toBe(0);

    appendFileSync(path, '0\n#### go\n', 'utf8');
    const whole = await readNewTranscriptLines(path, torn.offset);
    expect(whole.lines).toEqual(['# aider chat started at 2026-08-12 15:38:00', '#### go']);
  });

  it('advances the cursor over a non-ASCII line by bytes, not by characters', async () => {
    // The bug two shipped adapters had. A byte is not a character: this line is
    // longer in bytes than in characters, so a cursor advanced by character
    // count lands mid-line and the NEXT poll begins inside it. Every event in
    // between then fails to parse, is counted as a skip, and the session quietly
    // loses history — while a suite whose fixtures are all ASCII stays green.
    const dir = scratch();
    const path = transcriptIn(dir, '');
    const line = prompt('Cập nhật README tiếng Việt 🇻🇳');
    const bytes = Buffer.byteLength(`${line}\n`, 'utf8');
    expect(bytes).toBeGreaterThan(line.length + 1);

    writeFileSync(path, `${line}\n`, 'utf8');
    const first = await readNewTranscriptLines(path, 0);
    expect(first.lines).toEqual([line]);
    expect(first.offset).toBe(bytes);

    // The next poll starts exactly at the byte after the newline, and the line it
    // reads is whole.
    appendFileSync(path, `${tool('Applied edit to README.md')}\n`, 'utf8');
    const second = await readNewTranscriptLines(path, first.offset);
    expect(second.lines).toEqual([tool('Applied edit to README.md')]);
  });

  it('hands the next poll exactly the bytes after the last newline, and no fragment', async () => {
    const dir = scratch();
    const path = transcriptIn(dir, `${prompt('one')}\n${prompt('two')}\npar`);
    const first = await readNewTranscriptLines(path, 0);
    expect(first.lines).toEqual([prompt('one'), prompt('two')]);
    expect(first.offset).toBe(Buffer.byteLength(`${prompt('one')}\n${prompt('two')}\n`, 'utf8'));
  });

  it('restarts from zero when the file is replaced by a shorter one', async () => {
    // Aider's own `/clear` does NOT truncate the transcript — it empties the
    // in-memory message list and appends a line — so a shrink means the file was
    // deleted and replaced, and reading from a stale offset would start in the
    // middle of whatever occupies the path now.
    const dir = scratch();
    const long = transcriptIn(dir, `${transcript()}${transcript()}`);
    const first = await readNewTranscriptLines(long, 0);
    expect(first.lines.length).toBeGreaterThan(0);

    writeFileSync(long, 'short\n', 'utf8');
    const second = await readNewTranscriptLines(long, first.offset);
    expect(second.lines).toEqual(['short']);
  });

  it('reads a file that is gone as no news, rather than failing the poll', async () => {
    const result = await readNewTranscriptLines(join(scratch(), 'absent.md'), 0);
    expect(result.lines).toEqual([]);
    expect(result.offset).toBe(0);
  });

  it('returns no lines and the offset unchanged for a file that has not grown', async () => {
    const path = transcriptIn(scratch());
    const first = await readNewTranscriptLines(path, 0);
    const second = await readNewTranscriptLines(path, first.offset);
    expect(second.lines).toEqual([]);
    expect(second.offset).toBe(first.offset);
  });

  it('reports the mtime it read with, since that is the only instant available', async () => {
    const path = transcriptIn(scratch());
    const result = await readNewTranscriptLines(path, 0);
    expect(result.modified).toBe(new Date(result.modified).toISOString());
  });
});

describe('discovery', () => {
  it('finds the transcript by name inside a project', async () => {
    const root = scratch();
    const path = transcriptIn(root);
    const found = await listTranscriptFiles(root);
    expect(found.map((file) => file.path)).toEqual([path]);
    // The project is the directory holding the file, which is the only project
    // identity Aider records anywhere.
    expect(found[0]?.projectId).toBe(root);
  });

  it('ignores a file that is not the transcript, rather than reading it as one', async () => {
    const root = scratch();
    transcriptIn(root, 'not a transcript', 'NOTES.md');
    expect(await listTranscriptFiles(root)).toEqual([]);
  });

  it('adopts a transcript that already existed at its end, and a new one from zero', async () => {
    // A transcript that existed before the watcher started is a run that is
    // already over. Adopting it at its end is what `tail -f` does, and the
    // alternative — replaying months of finished runs as live activity — is
    // worse than losing the opening turns of the run in progress.
    const root = scratch();
    transcriptIn(join(root, 'old'), transcript());
    // The directory path, not the pinned one: a pinned watcher reads from the
    // start, and this test is about what the FIRST LISTING does.
    const sent: AgentEvent[] = [];
    const directory = new AiderWatcher({
      send: async (batch) => {
        assertValid(batch);
        sent.push(...batch);
      },
      now: advancing(),
      projectsRoot: root,
    });
    await directory.tick();
    expect(sent.filter((event) => event.type === 'session.started')).toHaveLength(0);

    const fresh = transcriptIn(join(root, 'new'), transcript());
    await directory.tick();
    expect(sent.filter((event) => event.type === 'session.started')).toHaveLength(1);
    expect(sent[0]?.sessionId).toContain(fresh);
  });
});

describe('batching', () => {
  it('holds a poll back until the flush interval, rather than sending one event per request', async () => {
    const path = transcriptIn(scratch());
    const { watcher, batches } = pinned(path);
    await watcher.tick();
    // One batch, not one per event: the read opened a batch of five events and
    // the flush interval is what closes it.
    expect(batches).toHaveLength(1);
    expect(batches[0]?.length).toBeGreaterThan(1);
  });

  it('never puts two sessions in one batch', async () => {
    // The buffer splits on a session change so an ingest endpoint never has to
    // untangle two agents' activity out of one payload.
    const path = transcriptIn(scratch());
    const { watcher, batches } = pinned(path);
    await watcher.tick();
    appendFileSync(path, `\n${boundary('2026-08-12 16:02:11')}\n${prompt('again')}\n`, 'utf8');
    await watcher.tick();

    for (const batch of batches) {
      expect(new Set(batch.map((event) => event.sessionId)).size).toBe(1);
    }
  });

  it('keeps a batch under the size the endpoint refuses', async () => {
    const path = transcriptIn(scratch());
    const many = ['', START, ''];
    for (let i = 0; i < 200; i += 1) many.push(tool(`Running task-${i}`));
    writeFileSync(path, `${many.join('\n')}\n`, 'utf8');

    const { watcher, batches } = pinned(path);
    await watcher.tick();
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(50);
  });

  it('flushes what is buffered on stop, and awaits it', async () => {
    // A void stop would make this flush fire-and-forget, and the run would end
    // with events delivered after the runtime has torn down.
    const path = transcriptIn(scratch());
    const { watcher, sent } = pinned(path);
    await watcher.start();
    await watcher.stop();
    expect(sent.length).toBeGreaterThan(0);
  });

  it('counts a refused batch instead of dying on it', async () => {
    // A watcher whose poll dies on the first refused POST is a stream that stops
    // and looks like an idle agent. The reporter needs to see that it stopped.
    const path = transcriptIn(scratch());
    const sent: AgentEvent[] = [];
    const watcher = new AiderWatcher({
      send: async (batch) => {
        sent.push(...batch);
        throw new Error('401 unauthorized');
      },
      now: advancing(),
      transcriptPath: path,
    });
    await watcher.tick();
    expect(watcher.failedBatchCount).toBeGreaterThan(0);
    expect(watcher.lastFailure).toBe('401 unauthorized');
  });
});
