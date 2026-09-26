import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

import { getZoneForTool, normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent, ZoneId } from '@battle-agents/protocol';

/**
 * The Aider chat transcript, and the only plane this adapter has.
 *
 * ## Which of Aider's files this reads, and why
 *
 * The bead this implements says Aider writes two files — a Markdown transcript
 * and "the structured record with role, content and timestamps" in
 * `~/.aider/conversations/` — and asks for a decision about which to read. Read
 * against aider-chat 0.86.2 (the PyPI sdist, Apache-2.0), the second of those
 * does not exist, and the decision is therefore not a preference. The complete
 * inventory of what Aider writes, and what each is for:
 *
 * | Where                                              | Written when            | Holds                                              |
 * | -------------------------------------------------- | ----------------------- | -------------------------------------------------- |
 * | `<project>/.aider.chat.history.md`                 | ALWAYS, on every run    | the Markdown transcript. **What this adapter reads.** |
 * | `<project>/.aider.input.history`                    | ALWAYS                  | the user's own typed lines, for readline history    |
 * | `--llm-history-file <path>` (default: none)        | only if the flag is set | `ROLE <iso>\n<content>` blocks of the LLM exchange |
 * | `--analytics-log <path>` (only if the flag is set) | only if the flag is set | JSON lines of lifecycle events, no tool calls       |
 * | `~/.aider/{analytics,installs}.json`, `caches/`    | ALWAYS                  | model metadata, opt-in state. No conversation.     |
 *
 * `aider/dump.py`, which the bead's phrase "conversation YAML" most likely points
 * at, is a `print()` debug helper. It writes no file.
 *
 * So the Markdown is not the lossy alternative to a structured record. It is the
 * only record Aider writes unless a user asks for another one, and the brief's
 * warning about it is right for a different reason than the one given: it is
 * lossy because **Aider does not make tool calls**. Every function-based coder
 * is commented out of `aider/coders/__init__.py` in 0.86.2, and the coders that
 * ship (`EditBlockCoder`, `UnifiedDiffCoder`, `PatchCoder`, `WholeFileCoder`)
 * parse fenced code blocks out of the model's prose. There is no tool call on
 * disk to drop, because none is ever made — the model asks for an edit in text
 * and Aider applies it itself.
 *
 * ## What the transcript does and does not contain
 *
 * Every line this parser matches is one Aider wrote through
 * `io.append_chat_history`, which prefixes tool output with `> ` and ends each
 * such line with two spaces and a newline (`aider/io.py:1117`). Those trailing
 * spaces are Markdown's line-break syntax and are stripped before matching.
 *
 * It contains, and this adapter reads:
 *
 *   `# aider chat started at 2026-09-26 15:45:00`  io.py:336  a run boundary, with a real clock reading
 *   `#### <text>`                                  io.py:774  what the user typed, one `#### ` per line
 *   `> Running <command>`                          base_coder.py:2472  a shell invocation, WITH its arguments
 *   `> Applied edit to <path>`                     base_coder.py:2334  a write that landed, with its path
 *   `> Creating empty file <path>`                 base_coder.py:461   a write that landed, with its path
 *   `> Committing <path> before applying edits.`   base_coder.py:2188  a git commit, with its path
 *
 * It does NOT contain, and no parser can recover these from it:
 *
 *   - Any timestamp except the run boundary. Every event but `session.started`
 *     is dated from the file's mtime, exactly as the Cursor adapter does, and
 *     for the same reason: the protocol requires an explicit `at`, and a
 *     transcript with none is a gap in the record rather than a reason to drop
 *     the session. It is a floor, not a measurement.
 *   - A session id. None is written, so it is derived from the path and the run
 *     boundary, in `watcher.ts`.
 *   - ANY RESULT for the shell command. `> Running npm test` records the
 *     invocation; the command's output goes to the terminal and reaches the file
 *     only if the user separately answers yes to "Add command output to the
 *     chat?". So this adapter emits `tool.started` for a run and no completion,
 *     and emitting one would assert an outcome the file does not contain. This
 *     is the same decision the Cursor adapter states about its own format.
 *   - The arguments of an edit. `Applied edit to src/x.ts` names the file and
 *     nothing about the change, so the write is a `file.write` carrying a path
 *     and no line counts.
 *   - Which tool produced an unrecognised `> ` line. Aider's tool output is free
 *     text, so most blockquote lines are a message rather than a call, and they
 *     are counted rather than turned into invented tool calls.
 *
 * ## The fixtures beside this parser are reconstructed, not captured
 *
 * Aider is not installed on the machine this adapter was written against and
 * `~/.aider` does not exist there, and Aider writes its transcript into a
 * project directory while adding `.aider*` to that project's `.gitignore`, so no
 * checkout holds a captured one either. The test fixtures are therefore built
 * from the writers named above rather than copied off a disk. Every line in them
 * is a line one of those functions produces; none of them is a guess about a
 * shape, and the parse of each is asserted in `watcher.test.ts`. What is NOT
 * claimed is byte-for-byte capture, and the first person to run Aider and diff a
 * fixture against a real transcript should believe the fixture over this comment
 * if they disagree.
 */

export interface TranscriptContext {
  /** Derived by the watcher from the path and the run boundary. */
  readonly sessionId: string;
  /** The transcript's mtime, as an ISO instant. See the header. */
  readonly at: string;
}

/** Set when a line opened a new Aider run, carrying the instant it recorded. */
export interface SessionMarker {
  /** The instant from the marker line, converted from Aider's naive local time. */
  readonly startedAt: string;
}

export interface ParsedTranscriptLine {
  readonly events: readonly AgentEvent[];
  /** Set when the line produced nothing, and why. Never both events and skipped. */
  readonly skipped: string | undefined;
  /** Set when the line was a run boundary, so the watcher can open a session. */
  readonly marker: SessionMarker | undefined;
  /**
   * The prompt still being accumulated, to be emitted when its block closes.
   *
   * Carried out of the parse rather than held in a module variable, because two
   * watchers on two projects must not share one half-typed prompt.
   */
  readonly pendingPrompt: string | undefined;
}

/**
 * Aider's own name for an activity, and the shape that identifies it.
 *
 * The name is AIDER-NATIVE ON PURPOSE and is what goes through the shared tool
 * map, so the harness's vocabulary lives in one table that every adapter reads
 * rather than in a per-adapter copy. `activityZone` below is the seam a new
 * activity plugs into, and its test is what keeps an unrecognised one degrading
 * to a default zone instead of being dropped.
 */
export interface AiderActivity {
  /** The name this adapter uses for the activity, before the shared map. */
  readonly tool: string;
  /** Matched against a `> ` line's text, after the quote and trailing spaces go. */
  readonly pattern: RegExp;
  /** Pulls the arguments out of the matched line. Absent when it names none. */
  readonly input?: (match: RegExpExecArray) => Record<string, unknown>;
}

/**
 * The activities that produce a tool event.
 *
 * Only two, and the absence of the other two is deliberate. A write is a
 * `file.write`, which is a member of the protocol union carrying the path — a
 * better fit than a `tool.started` whose input would be a bare path and whose
 * completion would need a duration the format does not record. So `apply_edit`
 * and `create_file` are NOT in the shared tool map: this adapter never emits
 * them as tool names, and a table entry no adapter emits is a table entry that
 * rots.
 */
export const AIDER_ACTIVITIES: readonly AiderActivity[] = [
  {
    tool: 'run_command',
    pattern: /^Running\s+(.+)$/,
    input: (match) => ({ command: match[1] as string }),
  },
  {
    tool: 'commit',
    pattern: /^Committing\s+(.+?)\s+before applying edits\.$/,
    input: (match) => ({ path: match[1] as string }),
  },
];

/** Lines that record a write that landed, and the path it landed on. */
const WRITE_PATTERNS: readonly RegExp[] = [
  /^Applied edit to\s+(.+)$/,
  /^Creating empty file\s+(.+)$/,
];

/**
 * Lines that record something happening to an edit without the edit happening.
 *
 * `Did not apply edit to X (--dry-run)` is Aider refusing to write a file, and
 * `Skipping edits to X` is Aider declining one. Neither is activity an agent
 * performed, so neither becomes an event; both are counted, because a line that
 * matched and produced nothing is a number somebody should be able to see.
 */
const NOT_APPLIED_PATTERNS: readonly RegExp[] = [
  /^Did not apply edit to\s+(.+?)\s+\(--dry-run\)$/,
  /^Skipping edits to\s+(.+)$/,
];

/** The run boundary Aider writes on every start, with its own clock reading. */
const CHAT_STARTED = /^#\s+aider chat started at\s+(\S+ \S+)$/;

/** A naive `YYYY-MM-DD HH:MM:SS` local timestamp, which is what Aider writes. */
const NAIVE_LOCAL = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/** The prefix a user prompt line carries; see `io.user_input`. */
const PROMPT_PREFIX = '#### ';

/** The prefix tool output carries; see `io.append_chat_history`. */
const TOOL_PREFIX = '> ';

/**
 * The text of a prompt line, or undefined when the line is not one.
 *
 * The text is NOT trimmed, and the leading whitespace in it is content:
 * `io.user_input` writes one `#### ` per line of what the user typed, and a
 * pasted stack trace arrives with its indentation intact. Trimming it produces a
 * prompt that reads correctly and has lost the shape of the thing being
 * reported. Only the trailing Markdown line break goes, and that is what
 * separates this from a bare `.trim()`.
 *
 * A line that is the prefix and nothing else is a blank line INSIDE a
 * multi-line prompt — `user_input` emits `#### ` followed by the two-space break
 * for an empty line of input — so it is an empty piece of the prompt rather than
 * the end of one. The `<blank>` marker is Aider's own, written for a wholly
 * empty input, and is deliberately not synthesised here: the file already says
 * it, and inventing it would put a word in a user's prompt they never typed.
 */
export function promptLineText(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('####')) return undefined;
  if (trimmed.length === 4) return '';
  // `####foo` is not a prompt line: the prefix is `#### ` WITH its space, so a
  // line whose fifth character is anything else is something else entirely — a
  // Markdown heading, most likely, which the model wrote into this file.
  if (trimmed[PROMPT_PREFIX.length - 1] !== ' ') return undefined;
  return trimmed.slice(PROMPT_PREFIX.length).replace(/[ \t]+$/, '');
}

/**
 * A prompt block's text, with the empty case replaced.
 *
 * `prompt` is a non-empty string in the protocol, and a block whose every line
 * was blank is a real turn — the user pressed enter on an empty line rather than
 * on an empty input, so the file says nothing at all. The replacement is
 * Aider's own marker for a turn with no text, so the stream does not invent a
 * word the user never typed. Exported because the watcher closes a block on a
 * run boundary as well as on the next line, and the two paths must not disagree
 * about what an empty prompt is called.
 */
export function promptText(pending: string): string {
  return pending === '' ? '<blank>' : pending;
}

/**
 * The zone an Aider activity belongs to, resolved through the SHARED map.
 *
 * Exported because it is the promise this adapter makes about a name the map has
 * never seen: `normalizeToolName` returns it unchanged and `getZoneForTool`
 * answers `thinking` rather than nothing, so the next Aider release that adds an
 * activity costs one row in `AIDER_ACTIVITIES` and one in the shared map, and
 * the event survives either way instead of being silently dropped.
 */
export function activityZone(activity: string): ZoneId {
  return getZoneForTool(normalizeToolName(activity));
}

/**
 * Aider's run boundary, as an ISO instant.
 *
 * Aider writes `strftime("%Y-%m-%d %H:%M:%S")` with NO zone designator, so the
 * reading is local wall-clock time. It is interpreted as local time, because
 * that is what it is, and the instant is therefore only as trustworthy as the
 * machine's own clock and zone — which the protocol requires anyway, since it
 * refuses an `at` without an explicit offset. Returns undefined rather than
 * guessing when the shape is not the one Aider writes.
 */
export function parseRunBoundary(stamp: string): string | undefined {
  const parts = NAIVE_LOCAL.exec(stamp);
  if (parts === null) return undefined;
  const [, year, month, day, hour, minute, second] = parts as unknown as string[];
  const at = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

/**
 * One transcript line into the events it yields.
 *
 * `ctx` is undefined for the lines that precede the first run boundary in a
 * file, and that is a statement about the FORMAT rather than a defensive check:
 * one transcript holds every run ever had in that project, the turns before the
 * first boundary belong to a run this watcher never saw open, and there is no
 * session id to attribute them to. They are counted, not emitted — with one
 * exception, which is that a boundary is still recognised there, because a
 * boundary is not a turn of the earlier run. It is the opening of the next one.
 *
 * `pendingPrompt` threads the half-read prompt block across calls, because a
 * prompt is several `#### ` lines and nothing in the file says where the block
 * ends except the next line not being one. A prompt is emitted when its block
 * closes, which in a live run is the moment the model starts answering. The last
 * prompt in a transcript is emitted when a following line closes it, and that is
 * stated here rather than discovered as a missing event in a replay.
 */
export function parseTranscriptLine(
  line: string,
  ctx: TranscriptContext | undefined,
  pendingPrompt?: string,
): ParsedTranscriptLine {
  // Aider ends every tool-output line with two spaces and a newline, and every
  // prompt line the same way. Both are Markdown's line-break syntax and neither
  // is content, so they go before anything is matched against them.
  const trimmed = line.trim();
  if (trimmed === '') {
    return result([], undefined, pendingPrompt);
  }

  const boundary = CHAT_STARTED.exec(trimmed);
  if (boundary !== null) {
    const startedAt = parseRunBoundary(boundary[1] as string);
    if (startedAt === undefined) {
      return result([], 'unparseable-run-boundary', pendingPrompt);
    }
    return result([], undefined, pendingPrompt, { startedAt });
  }

  const promptLine = promptLineText(trimmed);
  if (promptLine !== undefined) {
    return result(
      [],
      undefined,
      pendingPrompt === undefined ? promptLine : `${pendingPrompt}\n${promptLine}`,
    );
  }

  if (ctx === undefined) {
    // A turn of a run that opened before this watcher did, and which the file
    // names nowhere. There is no session to attach it to, so it is counted
    // rather than attributed to the run that is about to open — a replay that
    // showed the previous run's edits inside this one would be a fabrication,
    // and the count is how somebody notices a tail of the file is unread.
    return result([], 'before-first-run', undefined);
  }

  const base = { sessionId: ctx.sessionId, at: ctx.at };

  // Any other line that follows a prompt line closes that prompt block. This is
  // the only signal in the format that a prompt has ended, and it is checked
  // before the tool-output branch so a `> ` line after a prompt both emits the
  // prompt and is then considered on its own.
  const closed: AgentEvent[] =
    pendingPrompt === undefined
      ? []
      : [{ ...base, type: 'prompt.submitted', prompt: promptText(pendingPrompt) }];

  if (!trimmed.startsWith(TOOL_PREFIX)) {
    // The model's own prose. Aider writes it between the markers unadorned, and
    // "the model was thinking out loud" is not an event the protocol has room
    // for — the answer is not a tool call, and a stream that logged every
    // paragraph as activity would be unreadable rather than complete.
    return result(closed, 'model-prose', undefined);
  }

  const text = trimmed.slice(TOOL_PREFIX.length).trim();
  if (text === '') {
    return result(closed, 'blank-tool-output', undefined);
  }

  for (const notApplied of NOT_APPLIED_PATTERNS) {
    if (notApplied.test(text)) {
      return result(closed, 'edit-not-applied', undefined);
    }
  }

  for (const activity of AIDER_ACTIVITIES) {
    const match = activity.pattern.exec(text);
    if (match === null) continue;
    const tool = normalizeToolName(activity.tool);
    const input = activity.input === undefined ? undefined : activity.input(match);
    return result(
      [
        ...closed,
        {
          ...base,
          type: 'tool.started',
          tool,
          ...(input === undefined ? {} : { input: normalizeToolInput(input) }),
        },
      ],
      undefined,
      undefined,
    );
  }

  for (const write of WRITE_PATTERNS) {
    const match = write.exec(text);
    if (match === null) continue;
    return result([...closed, { ...base, type: 'file.write', path: match[1] as string }], undefined, undefined);
  }

  // Tool output that names no activity: aider's own status lines, a lint
  // command's output, a diff a `/diff` printed. Counted, never invented into a
  // tool call — see the header on what the format does not contain.
  return result(closed, 'unattributed-tool-output', undefined);
}

/**
 * The one shape every return above takes.
 *
 * `marker` is written on every path even when there is none, because a reader
 * that has to remember which of a dozen returns carries it is a reader that will
 * eventually get it wrong. The unit suite passes without this being visible —
 * nothing in a vitest run typechecks a return type — and `pnpm typecheck` is
 * what caught seven of the eight paths missing it.
 */
function result(
  events: readonly AgentEvent[],
  skipped: string | undefined,
  pendingPrompt: string | undefined,
  marker?: SessionMarker,
): ParsedTranscriptLine {
  return { events, skipped, marker, pendingPrompt };
}


/**
 * Reads a transcript from wherever Aider left off, with the file's mtime.
 *
 * The cursor is a BYTE OFFSET and it has to stay one. A transcript line is UTF-8
 * on disk and a byte is not a character: `sửa lỗi build 🚀` is 14 characters and
 * 20 bytes, and a Vietnamese or Japanese prompt is the ordinary case for this
 * harness rather than the exotic one. Read the file as a string, slice that
 * string at a byte count, and the second poll begins past the end of the line
 * before it — the events in between stop parsing and are counted as skips, so
 * the session loses history and every test still passes, because the fixtures
 * were all ASCII. The drift is always the same way round, because
 * `Buffer.byteLength` is never less than the character count, so the failure is
 * a silent drop rather than a duplicate.
 *
 * A trailing line with no newline is left for the next poll. A Markdown block
 * cut in half is not a block, and parsing half of one is how a tailer invents
 * events. A file that shrank — deleted, or replaced — restarts from zero rather
 * than reading from a stale offset into the middle of whatever occupies the path
 * now.
 */
export async function readNewTranscriptLines(
  path: string,
  offset: number,
): Promise<{
  readonly lines: readonly string[];
  readonly offset: number;
  readonly modified: string;
}> {
  let handle: FileHandle;
  try {
    handle = await open(path, 'r');
  } catch {
    return { lines: [], offset, modified: new Date(0).toISOString() };
  }
  try {
    // Sized and read through one handle, so a file replaced between the two
    // cannot report the size of one session and deliver the bytes of another.
    // The mtime comes from the same stat for the same reason: it is the only
    // instant an Aider line has, and pairing one session's size with another's
    // mtime would date the events to the wrong session.
    const stats = await handle.stat();
    const modified = stats.mtime.toISOString();
    if (stats.size < offset) {
      offset = 0;
    }
    if (stats.size === offset) {
      return { lines: [], offset, modified };
    }

    const fresh = Buffer.allocUnsafe(stats.size - offset);
    let filled = 0;
    while (filled < fresh.length) {
      const { bytesRead } = await handle.read(
        fresh,
        filled,
        fresh.length - filled,
        offset + filled,
      );
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    // A short read is not fatal, but the cursor must advance over what was
    // actually read: a buffer claiming bytes it never received would skip events.
    const text = fresh.toString('utf8', 0, filled);
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline === -1) {
      return { lines: [], offset, modified };
    }
    const complete = text.slice(0, lastNewline);
    return {
      lines: complete.split('\n'),
      offset: offset + Buffer.byteLength(complete, 'utf8') + 1,
      modified,
    };
  } finally {
    await handle.close();
  }
}
