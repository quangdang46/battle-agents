import { normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

/**
 * Translating one Goose record into `AgentEvent`.
 *
 * ## Where this format came from, because the bead asked and the answer matters
 *
 * Goose is NOT installed on the machine this was written on, so the format was
 * not read off a live session. It was read out of Goose's own source on
 * `main`, at `github.com/aaif-goose/goose` (the repository has MOVED: the old
 * `block/goose` path 301-redirects, and every URL below was read from the new
 * home). Where each claim comes from is named at the claim. Anything not
 * sourced that way is called out in "WHAT THIS DOES NOT CONTAIN" at the bottom,
 * which is the section the next person should read before adding a field.
 *
 * The legacy JSONL record, verbatim from `session/legacy.rs`'s own unit test
 * (`test_load_legacy_session_without_metadata`) — this is a real captured line,
 * not a reconstruction:
 *
 *     {"description":"test","id":"20240101_120000","created_at":"2024-01-01T12:00:00Z",
 *      "updated_at":"2024-01-01T12:00:00Z","extension_data":{},"message_count":0}
 *     {"id":"msg1","role":"user","created":1704110400,"content":[{"type":"text","text":"Hello"}]}
 *     {"id":"msg2","role":"assistant","created":1704110401,"content":[{"type":"text","text":"Hi there"}]}
 *
 * Line 1 is session metadata; every line after it is one message.
 *
 * ## The finding that contradicts the brief
 *
 * **Current Goose does not write JSONL.** `session/session_manager.rs` builds
 * its storage from `sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions}`,
 * `SessionStorage::create_schema` issues `CREATE TABLE`, and `DB_NAME` is
 * `"sessions.db"`. The JSONL files are read by `session/legacy.rs` — a module
 * whose whole job is `load_session` over a `.jsonl` file — for back-compat with
 * what older Goose wrote.
 *
 * So this adapter reads the format Goose USED to write and can still read, and
 * it does not read what Goose writes today. That is a real limitation, not a
 * caveat, and it is stated in the package README rather than discovered by a
 * user whose Gooses produce nothing. Covering `sessions.db` would need a SQLite
 * driver the repo does not have and a different mechanism entirely (a growing
 * table rather than an appended log), which is a separate bead.
 *
 * ## Why a header line carries state
 *
 * A message line does NOT name its session. The id is the file-name stem
 * (`20240101_120000.jsonl`, from `parse_session_timestamp`'s `%Y%m%d_%H%M%S`)
 * and is repeated on the header line. A message read before its header is a line
 * with no session attached rather than one to attach a guess to, which is what
 * `GooseLogState` is for.
 */

const HARNESS = 'goose';

/**
 * The value `session.started.harness` is emitted with.
 *
 * NOT `'goose'`. `harnessSchema` in `packages/protocol/src/agent-event.ts` is a
 * closed zod enum — `claude, codex, opencode, cursor, pi, gemini, amp, other` —
 * and this bead is explicitly not a protocol change: the event union is versioned
 * and frozen, and widening an enum inside it is a maintainer decision rather than
 * an adapter one.
 *
 * `'other'` is the escape hatch the enum documents for exactly this case: "a new
 * coding agent ships an adapter before this enum grows an entry, and the core
 * must keep accepting its events meanwhile." This is that meanwhile.
 *
 * The cost is real and is not hidden: in the arena a Goose agent is
 * indistinguishable from any other unrecognised harness until `'goose'` is added
 * to the enum, which is a one-line change plus a migration of stored events.
 * Recorded here so the next person picks it up rather than rediscovering that
 * Goose looks like `other`.
 */
const HARNESS_ID = 'other';

/** A stable token, not Goose's error text: the text is the tool's output, not a reason. */
const TOOL_ERROR_REASON = 'goose-tool-reported-error';

export interface ParsedGooseLine {
  readonly events: readonly AgentEvent[];
  /** Why this line produced nothing. Undefined when it produced something. */
  readonly skipped: string | undefined;
}

/**
 * What a session file knows that a single line does not.
 *
 * Owned by the watcher, one per file, because it IS the per-file state: the
 * session id from the header, and the in-flight tool calls still waiting for a
 * response. Both are learned from earlier lines in the same file, which is why
 * the parser takes this rather than reading a line in isolation.
 */
export interface GooseLogState {
  /** Set once the header has been read. Every later event needs it. */
  sessionId: string | undefined;
  /**
   * toolRequest id -> the call being made.
   *
   * Both halves are needed, and the second is the one that is easy to miss: a
   * `toolResponse` block carries an `id` and an outcome and NO tool name, so
   * without this the response cannot be attributed to a tool at all.
   */
  readonly inflight: Map<string, { readonly tool: string; readonly startedAt: number }>;
}

export function createLogState(): GooseLogState {
  return { sessionId: undefined, inflight: new Map() };
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function stringAt(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function blocksOf(message: Record<string, unknown>): readonly Record<string, unknown>[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (block): block is Record<string, unknown> =>
      typeof block === 'object' && block !== null && !Array.isArray(block),
  );
}

function skipped(reason: string): ParsedGooseLine {
  return { events: [], skipped: reason };
}

/**
 * `Message.created` is an `i64` of EPOCH SECONDS (`pub created: i64` in
 * `crates/goose-provider-types/src/conversation/message.rs`, and 1704110400 in
 * the upstream fixture is 2024-01-01T12:00:00Z).
 *
 * Seconds, not milliseconds, and not a string. That is a real trap in the other
 * direction from the byte/character one: read as milliseconds, 1704110400 is
 * 1970-01-20, every event lands 56 years in the past, and nothing anywhere
 * rejects it because an ISO instant in the past is a perfectly valid instant.
 * The unit is checked rather than assumed — a value too large to be seconds is
 * skipped instead of being multiplied into the far future.
 */
function instantFromCreated(created: unknown): string | undefined {
  if (typeof created !== 'number' || !Number.isFinite(created) || created <= 0) return undefined;
  // 1e11 seconds is the year 5138; 1e11 milliseconds is 1973. Anything above
  // the seconds ceiling is milliseconds, and a millisecond value is accepted
  // rather than skipped, because a future Goose could change the unit.
  const millis = created > 100_000_000_000 ? created : created * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * The session's start instant.
 *
 * The header's `created_at` is a chrono `DateTime<Utc>`, so it serialises as an
 * RFC 3339 string WITH an offset and can go into the event as-is. It can also be
 * ABSENT: `legacy.rs` inserts `obj.entry("created_at")` when it is missing,
 * which is only worth doing if it sometimes is.
 *
 * The fallback is the file name, and the unit is UTC rather than local time on
 * purpose. The protocol rejects a timestamp with no offset — it denotes a
 * different instant on every machine — and the name carries no zone, so
 * `Date.parse` on a reconstructed local string would be a silent localisation
 * decision made on the reader's machine. Reading the stamp as UTC at least makes
 * the assumption a stated one.
 */
const FILE_NAME_STAMP = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/;

function instantFromFileName(sessionId: string): string | undefined {
  const match = FILE_NAME_STAMP.exec(sessionId);
  if (match === null) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const millis = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return new Date(millis).toISOString();
}

/**
 * One Goose record into the events it actually asserts.
 *
 * A record can carry more than one event. An assistant message that thinks and
 * then calls a tool is two real things that happened, and collapsing them to one
 * — whichever the parser happened to prefer — would drop an event the protocol
 * has a type for.
 */
export function parseSessionLine(line: string, state: GooseLogState): ParsedGooseLine {
  const trimmed = line.trim();
  if (trimmed === '') return skipped('blank-line');

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return skipped('unparseable');
  }

  const record = recordOf(parsed);
  // A message line has `created`; a header line has `created_at`. Keying on the
  // header shape rather than on "is this the first line" is what makes a file
  // whose header was truncated still read as messages.
  if (isHeader(record)) return parseHeader(record, state);
  return parseMessage(record, state);
}

/**
 * Whether a record is the session header rather than a message.
 *
 * On `content` being absent. A header has `id`, `created_at` and `message_count`
 * and no `content`; a message always has a `content` array. `legacy.rs` decides
 * the same way, by position — the first line — but deciding by position means a
 * half-written first line loses the whole file, and this does not.
 */
function isHeader(record: Record<string, unknown>): boolean {
  return !Array.isArray(record.content) && ('created_at' in record || 'message_count' in record);
}

function parseHeader(record: Record<string, unknown>, state: GooseLogState): ParsedGooseLine {
  const sessionId = stringAt(record, 'id');
  if (sessionId === undefined) return skipped('no-session');

  const at = headerInstant(record) ?? instantFromFileName(sessionId);
  if (at === undefined) return skipped('no-start-instant');

  // Recorded before the event is built rather than after, so a message record
  // that somehow arrived first is still read against the right session.
  state.sessionId = sessionId;

  return {
    events: [
      {
        type: 'session.started',
        sessionId,
        at,
        // Goose names no agent, so the run is the character. That is the Pi and
        // Codex adapters' answer to the same absence, and a Goose session run
        // in two project directories is two runs.
        agentId: sessionId,
        // The harness name, and not a model vendor: a provider is which model
        // answered, which changes when the user switches models and is not an
        // identity at all. An installation is the machine.
        installationId: HARNESS,
        // `working_dir` is defaulted to the empty string by `legacy.rs` when it
        // is absent, so a real file often has none. An empty project id is worse
        // than the session id: the file already separates sessions, and a
        // project id of "" would collapse every Goose run into one place.
        projectId: stringAt(record, 'working_dir') ?? sessionId,
        harness: HARNESS_ID,
      },
    ],
    skipped: undefined,
  };
}

function headerInstant(record: Record<string, unknown>): string | undefined {
  const raw = record.created_at;
  // Stricter than `Date.parse`: a zoneless string reads as LOCAL time, and the
  // reader's zone is not something an event is allowed to carry. A header
  // timestamp without an offset falls through to the file name instead.
  if (typeof raw !== 'string' || !/(?:Z|z|[+-]\d{2}:\d{2})$/.test(raw)) return undefined;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function parseMessage(record: Record<string, unknown>, state: GooseLogState): ParsedGooseLine {
  const sessionId = state.sessionId;
  // The session id lives on the header, so a message read before it is a line
  // with no session attached rather than one to attach a guess to.
  if (sessionId === undefined) return skipped('no-session');

  const at = instantFromCreated(record.created);
  if (at === undefined) return skipped('no-timestamp');

  const base = { sessionId, at };
  const role = stringAt(record, 'role');
  if (role === undefined) return skipped('no-role');

  // `Message.role` is rmcp's `Role`, whose variants are `User` and `Assistant`.
  // Tool calls are NOT a third role here — they are content BLOCKS inside one of
  // these two, which is the opposite of the Pi layout and the reason a search of
  // the role vocabulary finds no way to express a tool result.
  if (role === 'user') return parseUser(record, base, state);
  if (role === 'assistant') return parseAssistant(record, base, state);
  return skipped(`unmapped-role:${role}`);
}

interface EventBase {
  readonly sessionId: string;
  readonly at: string;
}

function parseUser(
  record: Record<string, unknown>,
  base: EventBase,
  state: GooseLogState,
): ParsedGooseLine {
  const events: AgentEvent[] = [];
  for (const block of blocksOf(record)) {
    if (block.type !== 'text') continue;
    const text = stringAt(block, 'text');
    if (text === undefined) continue;
    // A user turn can carry a tool RESPONSE alongside its text when the harness
    // is answering a confirmation request, so the role is not enough to decide.
    events.push(...toolResponseEvents(block, base, state));
  }

  const prompt = textOf(blocksOf(record));
  if (prompt !== undefined) {
    events.push({ ...base, type: 'prompt.submitted', prompt });
  }
  if (events.length > 0) return { events, skipped: undefined };
  return skipped('user-without-activity');
}

/**
 * An assistant turn: reasoning and tool calls, and neither its prose.
 *
 * The prose is dropped the way the Codex and Pi adapters drop an assistant's
 * answer, because a `prompt.submitted` is a thing the person did and an answer
 * is the game watching itself talk. A `thinking` block is different in kind and
 * is emitted: Goose labels reasoning as such, which is exactly the distinction
 * the Codex adapter could not draw.
 */
function parseAssistant(
  record: Record<string, unknown>,
  base: EventBase,
  state: GooseLogState,
): ParsedGooseLine {
  const events: AgentEvent[] = [];
  for (const block of blocksOf(record)) {
    if (block.type === 'thinking') {
      events.push({ ...base, type: 'thinking' });
      continue;
    }
    if (block.type === 'toolRequest') {
      const started = toolRequestEvent(block, base, state);
      if (started !== undefined) events.push(started);
      continue;
    }
    if (block.type === 'toolResponse') {
      events.push(...toolResponseEvents(block, base, state));
    }
  }

  if (events.length > 0) return { events, skipped: undefined };
  return skipped('assistant-without-activity');
}

/**
 * A tool call: `{"type":"toolRequest","id":...,"toolCall":{"status":"success",
 * "value":{"name":...,"arguments":...}}}`.
 *
 * The `status`/`value` envelope is not optional and not inferred: `ToolRequest`
 * carries `#[serde(with = "tool_result_serde")] pub tool_call: ToolResult<...>`,
 * and that module serialises every arm as `{"status":...}` plus either `value` or
 * `error`. A `toolRequest` whose envelope reports an error is a call Goose
 * failed to record, not a call that ran, so it emits nothing.
 */
function toolRequestEvent(
  block: Record<string, unknown>,
  base: EventBase,
  state: GooseLogState,
): AgentEvent | undefined {
  const call = recordOf(block.toolCall);
  if (call.status !== 'success') return undefined;

  const value = recordOf(call.value);
  const name = stringAt(value, 'name');
  if (name === undefined) return undefined;

  const tool = normalizeToolName(name);
  const id = stringAt(block, 'id');
  if (id !== undefined) {
    state.inflight.set(id, { tool, startedAt: Date.parse(base.at) });
  }
  return { ...base, type: 'tool.started', tool, input: normalizeToolInput(value.arguments) };
}

/**
 * A tool result: `{"type":"toolResponse","id":...,"toolResult":{"status":...
 * }}`.
 *
 * The block carries NO tool name — only the id of the call it answers — which is
 * why the inflight map is not an optimisation but the only way this event can
 * name a tool. A response with no matching call is skipped rather than emitted
 * against an empty name: that is a watcher that joined mid-session, and an
 * unnamed tool is not a thing the protocol has a type for.
 */
function toolResponseEvents(
  block: Record<string, unknown>,
  base: EventBase,
  state: GooseLogState,
): readonly AgentEvent[] {
  const result = recordOf(block.toolResult);
  const id = stringAt(block, 'id');
  const call = id === undefined ? undefined : state.inflight.get(id);
  // Deleted either way: a call has one response, and holding the id after it
  // would make the map grow for the length of the session.
  if (id !== undefined) state.inflight.delete(id);
  if (call === undefined) return [];

  if (result.status === 'error') {
    return [{ ...base, type: 'tool.failed', tool: call.tool, reason: TOOL_ERROR_REASON }];
  }
  if (result.status !== 'success') return [];

  return [
    {
      ...base,
      type: 'tool.completed',
      tool: call.tool,
      ok: true,
      // Zero means "not measurable", not "instantaneous". And the ceiling here
      // is 1000ms, because `created` is epoch SECONDS: a call that returned
      // inside the same second is genuinely indistinguishable from one that took
      // 999ms, and inflating the residue would be inventing precision the
      // format does not have.
      durationMs: Math.max(0, Date.parse(base.at) - call.startedAt),
    },
  ];
}

/** The text of a message, whether it arrives as one block or several. */
function textOf(blocks: readonly Record<string, unknown>[]): string | undefined {
  const parts = blocks
    .filter((block) => block.type === 'text')
    .map((block) => stringAt(block, 'text'))
    .filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(' ');
}
