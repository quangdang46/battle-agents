import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DatabaseSync } from 'node:sqlite';

import { normalizeToolInput, normalizeToolName } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

/**
 * The OpenCode session store, read out of the SQLite database OpenCode writes.
 *
 * Ported from agent-move, `packages/server/src/watcher/opencode/` at commit
 * `85d377110721`, with three departures the shape of the port forced.
 * `THIRD-PARTY-NOTICES.md` carries the attribution; the upstream files carry no
 * copyright header, so there is none here to keep.
 *
 * 1. TWO SCHEMA GENERATIONS. agent-move reads `session` / `message` / `part`.
 *    That is the shape its OpenCode wrote and the tables are still in the
 *    database, but the version on this machine (1.18.21) writes `session_v2` /
 *    `session_message` and has not touched the old pair since. Measured, not
 *    assumed: on 2026-09-26 the newest `session` row was 19 days old and the
 *    newest `session_v2` row was 5. A port that read only the old tables would
 *    be a watcher that silently sees nothing on a current install, and the
 *    silence would look exactly like an idle agent. So both are read and the live
 *    one is probed at open. They are not the same data model — v2 puts a whole
 *    assistant turn in one row with the tool calls inside a `content` array,
 *    where v1 gives every part its own row — so there are two readers and one
 *    normalisation step between them and the events, so the mapping table, which
 *    is where the reasons live, is written once.
 * 2. The loop is not here. agent-move's watcher owns chokidar, a 500ms WAL poll
 *    and two timer maps; the poll loop and the backoff belong to `watcher.ts`.
 * 3. better-sqlite3 is not the driver. See the constructor.
 *
 * THE READ-ONLY RULE IS A CORRECTNESS RULE. This database is being written by
 * the user's editor while we read it, so a read-write connection here is a way
 * to corrupt someone's session history, and a crash of ours has to leave it
 * intact. The handle is opened `mode=ro` AND `readOnly: true`: the URI is what
 * SQLite itself refuses a write through, the option is what the driver refuses
 * to open the file with, and carrying both costs one constructor argument
 * against a file we did not create. `sqlite.test.ts` asserts the write is
 * refused rather than trusting this paragraph.
 */

/**
 * The URI a read-only handle on a SQLite file is opened with.
 *
 * Exported because it is the whole of the read-only guarantee, and a guarantee
 * asserted in a comment is not one: the test opens a handle through this exact
 * function and checks that SQLite refuses the write, so a regression in the
 * arguments fails there rather than in somebody's session history.
 */
export function readOnlyDatabaseUri(path: string): URL {
  const uri = pathToFileURL(path);
  uri.searchParams.set('mode', 'ro');
  return uri;
}

/** The harness name the protocol union already carries. */
export const OPEN_CODE_HARNESS = 'opencode';

const DATABASE_FILE = 'opencode.db';

/**
 * Where OpenCode keeps its database.
 *
 * The first candidate is the XDG data path OpenCode uses on every platform
 * including Windows, which is why there is no `APPDATA` branch. The other two
 * are layouts earlier versions used, and each costs one `existsSync`. Returning
 * `undefined` rather than a path that is not there is the point: a watcher that
 * opens a database OpenCode has not created yet gets a readable error instead of
 * a file it created itself.
 */
export function openCodeDatabasePath(home: string = homedir()): string | undefined {
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    join(home, '.local', 'share', 'opencode', DATABASE_FILE),
    ...(localAppData === undefined || localAppData === ''
      ? []
      : [join(localAppData, 'opencode', DATABASE_FILE)]),
    join(home, '.opencode', DATABASE_FILE),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

/** Which generation of the schema this database is written in. */
export type OpenCodeSchema = 'v2' | 'v1';

export interface OpenCodeStoreOptions {
  /** Skips the probe. Only for a test that wants one generation specifically. */
  readonly schema?: OpenCodeSchema;
}

export interface OpenCodePollResult {
  readonly events: readonly AgentEvent[];
  /**
   * Rows past the watermarks this poll consumed, whether or not they produced an
   * event. This is the backoff's only input, and it is deliberately not
   * `events.length`: a poll that read forty rows of assistant prose and emitted
   * one `thinking` is a busy database, and one that read no rows is the idle
   * case the plan's WAL caution is about.
   */
  readonly rowsRead: number;
  /** Rows this adapter declined to turn into an event, keyed by why. */
  readonly skips: Readonly<Record<string, number>>;
}

/**
 * A position in an append-only table.
 *
 * The id is half the cursor because a timestamp alone is not one. OpenCode
 * stamps rows in milliseconds, so two parts written in the same millisecond
 * share a `time_created`, and a `WHERE time_created > ?` cursor steps over both
 * the instant it sees the first — the second is never read, and a tool call
 * silently vanishes from the stream. The pair is total, and `id` is a primary
 * key, so no two rows can tie on both halves.
 */
interface Cursor {
  readonly at: number;
  readonly id: string;
}

/** Before the first row, so the first poll reads everything. */
const CURSOR_HEAD: Cursor = { at: -1, id: '' };

/** A tool call, as either generation describes one. */
interface NormalisedTool {
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly ok: boolean;
  readonly reason: string | undefined;
}

/**
 * One row of either table, after the generation is stripped off it.
 *
 * `prompt` and `reasoning` are per-TURN rather than per-row because the union's
 * events for them are. A user turn is one prompt however many text parts it
 * spans, and a model step is one `thinking` however many reasoning blocks it
 * contains — 5569 reasoning elements across 1283 turns on this machine is four
 * per turn, and four `thinking` events per model step is a stream no client can
 * render. `step` is per-ROW because a step boundary really is one event each.
 */
type NormalisedPart =
  | { readonly kind: 'tool'; readonly callId: string; readonly tool: NormalisedTool }
  | { readonly kind: 'prompt'; readonly text: string }
  | { readonly kind: 'reasoning' }
  | { readonly kind: 'step' }
  | { readonly kind: 'assistant-text' }
  | { readonly kind: 'unmapped' };

interface SessionIdentity {
  readonly id: string;
  readonly directory: string;
  readonly parentId: string | undefined;
  readonly projectId: string;
  /** `time_archived`, when the harness has set it. It is the only real end signal. */
  readonly archivedAt: number | undefined;
}

type SqlRow = Record<string, unknown>;
type SqlStatement = ReturnType<DatabaseSync['prepare']>;

export class OpenCodeStore {
  readonly #db: DatabaseSync;
  readonly #schema: OpenCodeSchema;
  readonly #statements: {
    readonly sessions: SqlStatement;
    readonly sessionById: SqlStatement;
    readonly messages: SqlStatement;
    readonly messageById: SqlStatement;
    /** v1 only. Absent in v2, where a turn carries its parts inline. */
    readonly parts: SqlStatement | undefined;
    readonly updates: SqlStatement | undefined;
  };
  /** Sessions the database holds, whether or not they began while we watched. */
  readonly #knownSessions = new Map<string, SessionIdentity>();
  readonly #startedSessions = new Set<string>();
  readonly #endedSessions = new Set<string>();
  /** `messageId -> role`, so a part can tell a prompt from the agent talking. */
  readonly #roles = new Map<string, string>();
  /**
   * What has already been emitted, keyed per event rather than per row.
   *
   * This is what makes a tool call that spans four polls four rows and still two
   * events: the row is re-read every time its `time_updated` moves, and without
   * a set keyed on the CALL rather than the row the stream would carry a
   * duplicate per poll.
   */
  readonly #emitted = new Set<string>();
  readonly #skips: Record<string, number> = {};
  #sessionCursor: Cursor = CURSOR_HEAD;
  #messageCursor: Cursor = CURSOR_HEAD;
  #partCursor: Cursor = CURSOR_HEAD;
  #updateCursor: Cursor = CURSOR_HEAD;
  #closed = false;

  /**
   * Opens the user's database read-only and adopts its tail.
   *
   * `node:sqlite` rather than better-sqlite3, which is what the port used, and
   * that was not a free choice. better-sqlite3 is a native module and
   * `docs/research/agent-move.md` section 8 records it failing to COMPILE on
   * Node 26.3.0 — this machine's Node — while building fine on Node 22, which is
   * what CI runs. A dependency that installs only on the machine the gate does
   * not run on is the worst available split, and the built-in installs on both.
   * Verified unflagged on both: Node 26.3.0 here, and the `node:22-bookworm-slim`
   * image the pipeline runs (v22.23.2), where `require('node:sqlite')` returns
   * `DatabaseSync` with no flag. The tradeoff accepted is that `node:sqlite` is
   * still marked experimental and prints a warning on first use, and its
   * `readOnly` option is only documented from Node 22.12 — which is why the
   * `mode=ro` URI is what does the real work and the option is the second lock.
   */
  constructor(
    readonly path: string,
    options: OpenCodeStoreOptions = {},
  ) {
    this.#db = new DatabaseSync(readOnlyDatabaseUri(path), { readOnly: true });
    try {
      this.#schema = options.schema ?? detectSchema(this.#db);
      const sessionTable = this.#schema === 'v2' ? 'session_v2' : 'session';
      // In v2 the message table IS the part table: one row per turn, with the
      // turns parts inline. Both statements therefore point at it, and the only
      // difference between them is which column the cursor rides.
      const messageTable = this.#schema === 'v2' ? 'session_message' : 'message';
      const partTable = this.#schema === 'v2' ? 'session_message' : 'part';

      const sessionColumns =
        'id, directory, parent_id, project_id, time_created, time_updated, time_archived';
      // The two generations do not share a column list. v2 has no `part` table
      // and so no `message_id` — a turn IS its own message and its parts live
      // inside `data` — and it carries the turn's kind in a `type` column that
      // v1 has no equivalent of. Selecting v1's list against v2 fails at prepare
      // time, which is why the list is built rather than shared.
      const turnColumns =
        this.#schema === 'v2'
          ? 'id, session_id, type, time_created, time_updated, data'
          : 'id, session_id, time_created, time_updated, data';
      const partColumns = 'id, message_id, session_id, time_created, time_updated, data';

      this.#statements = {
        sessions: this.#db.prepare(
          `SELECT ${sessionColumns} FROM ${sessionTable}
            WHERE time_updated > ? OR (time_updated = ? AND id > ?)
            ORDER BY time_updated, id`,
        ),
        sessionById: this.#db.prepare(
          `SELECT ${sessionColumns} FROM ${sessionTable} WHERE id = ?`,
        ),
        messages: this.#db.prepare(
          `SELECT ${turnColumns} FROM ${messageTable}
            WHERE time_updated > ? OR (time_updated = ? AND id > ?)
            ORDER BY time_updated, id`,
        ),
        messageById: this.#db.prepare(
          `SELECT ${turnColumns} FROM ${messageTable} WHERE id = ?`,
        ),
        // v1 only. v2 has no part table, and preparing a statement nobody runs
        // against a schema it was not written for is a prepare-time failure
        // waiting for the next column OpenCode renames.
        parts:
          this.#schema === 'v1'
            ? this.#db.prepare(
                `SELECT ${partColumns} FROM ${partTable}
                  WHERE time_created > ? OR (time_created = ? AND id > ?)
                  ORDER BY time_created, id`,
              )
            : undefined,
        updates:
          this.#schema === 'v1'
            ? this.#db.prepare(
                `SELECT ${partColumns} FROM ${partTable}
                  WHERE time_updated > ? OR (time_updated = ? AND id > ?)
                  ORDER BY time_updated, id`,
              )
            : undefined,
      };

      // Every session the database holds, so a part belonging to one that began
      // before this watcher can still be attached to it. The rows are not
      // announced: history is not live activity.
      for (const row of this.#db.prepare(`SELECT ${sessionColumns} FROM ${sessionTable}`).all()) {
        const identity = sessionIdentity(row);
        if (identity !== undefined) this.#knownSessions.set(identity.id, identity);
      }
      // Adopt the tail rather than replaying it, the way `tail -f` does to a file
      // that existed before it started. The alternative — reporting three weeks
      // of finished sessions as live activity — is the mistake the codex parser
      // documented at length and refused.
      this.#messageCursor = latestCursor(this.#db, messageTable, 'time_updated');
      if (this.#schema === 'v1') {
        this.#partCursor = latestCursor(this.#db, partTable, 'time_created');
        this.#updateCursor = latestCursor(this.#db, partTable, 'time_updated');
      }
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }

  get schema(): OpenCodeSchema {
    return this.#schema;
  }

  /**
   * The SQLite handle, read-only.
   *
   * Exposed because the read-only rule is the correctness rule this adapter is
   * held to, and the ONLY way to observe it is to attempt a write through the
   * handle and be refused. Asserting that the constructor was passed `mode=ro`
   * tests the argument, not the guarantee — and that gate was measured: with
   * this reader changed to open read-write, every test in the suite still passed,
   * because a read-write connection that only SELECTs holds no write lock, does
   * not change a byte, and looks identical from outside. A guarantee nothing can
   * fail is not a guarantee.
   *
   * Safe to hand out for the reason the guarantee exists: SQLite refuses every
   * write through it, so a caller cannot do damage they could not already do to
   * their own file.
   */
  get handle(): DatabaseSync {
    return this.#db;
  }

  /** How many rows this adapter has read and declined to turn into an event. */
  get skippedCount(): number {
    return Object.values(this.#skips).reduce((total, count) => total + count, 0);
  }

  /**
   * The skip ledger, keyed by reason.
   *
   * A number somebody can watch rather than a log line: an OpenCode upgrade that
   * renames a part type adds a key here, and `archived-before-watch` climbing
   * means sessions are being archived between two polls.
   */
  get skipReasons(): Readonly<Record<string, number>> {
    return { ...this.#skips };
  }

  /** Whether the harness has archived a session, which is the one real end signal. */
  isArchived(sessionId: string): boolean {
    if (this.#endedSessions.has(sessionId)) return true;
    const row = this.#statements.sessionById.get(sessionId);
    return row === undefined ? false : (numberAt(row, 'time_archived') ?? 0) > 0;
  }

  /**
   * One poll: read what moved, translate it, advance the cursors.
   *
   * Sessions, then messages, then parts, because a part's parent message is what
   * says whether its text is the user's prompt or the assistant talking to
   * itself. Each cursor advances to the last row the statement returned before
   * the rows are translated, so a translation that throws costs one poll of rows
   * rather than replaying them forever.
   */
  poll(): OpenCodePollResult {
    if (this.#closed) throw new Error(`the OpenCode store at ${this.path} is closed`);
    const events: AgentEvent[] = [];
    const before = { ...this.#skips };
    let rowsRead = 0;

    const sessionRows = this.#statements.sessions.all(...cursorArgs(this.#sessionCursor));
    this.#sessionCursor = advance(this.#sessionCursor, sessionRows, 'time_updated');
    for (const row of sessionRows) {
      rowsRead += 1;
      this.#consumeSession(events, row);
    }

    if (this.#schema === 'v2') {
      // One table, one pass. In v2 a turn carries its own parts, and
      // `time_updated` is never behind `time_created` on a row, so reading the
      // message table on `time_updated` already covers discovery — a second pass
      // over the same rows would count them twice and buy nothing.
      const turnRows = this.#statements.messages.all(...cursorArgs(this.#messageCursor));
      this.#messageCursor = advance(this.#messageCursor, turnRows, 'time_updated');
      // No `#rememberRole` here. v1 is the only generation whose parts have to ask
      // which message they hang off, and the roles map exists to answer that; a
      // v2 turn names its own kind in a column, so writing it would parse a
      // potentially large assistant turn twice for nothing.
      for (const row of turnRows) {
        rowsRead += 1;
        this.#consumeTurn(events, row);
      }
      return { events, rowsRead, skips: delta(this.#skips, before) };
    }

    const messageRows = this.#statements.messages.all(...cursorArgs(this.#messageCursor));
    this.#messageCursor = advance(this.#messageCursor, messageRows, 'time_updated');
    for (const row of messageRows) {
      rowsRead += 1;
      this.#rememberRole(row);
    }

    // v1 splits the same data across two tables and two cursors, because a part's
    // `time_updated` moves as the tool progresses: discovery on `time_created` so
    // a part is FOUND once, and a second pass on `time_updated` so a status
    // change is SEEN once. They overlap deliberately, and the emitted-once set is
    // what makes a row returned by both still produce one event.
    const parts = this.#statements.parts;
    const updates = this.#statements.updates;
    if (parts !== undefined && updates !== undefined) {
      const partRows = parts.all(...cursorArgs(this.#partCursor));
      this.#partCursor = advance(this.#partCursor, partRows, 'time_created');
      for (const row of partRows) {
        rowsRead += 1;
        this.#consumePart(events, row);
      }
      const updateRows = updates.all(...cursorArgs(this.#updateCursor));
      this.#updateCursor = advance(this.#updateCursor, updateRows, 'time_updated');
      for (const row of updateRows) {
        rowsRead += 1;
        this.#consumePart(events, row);
      }
    }

    return { events, rowsRead, skips: delta(this.#skips, before) };
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#db.close();
  }

  // ── sessions ─────────────────────────────────────────────────────────────

  /**
   * A session row: announced once, ended once.
   *
   * A session is announced the first time it appears and never again, however
   * many times its row is re-read while it is being written to. The one other
   * event this loop produces is `session.ended`, and it comes from
   * `time_archived` — a real column, set when the user archives a session, and
   * the only end signal in the database. A session that began AND was archived
   * between two polls still gets both events, stamped from the row's own
   * timestamps, because a whole session disappearing is worse than two events
   * that arrive together.
   */
  #consumeSession(events: AgentEvent[], row: SqlRow): void {
    const identity = sessionIdentity(row);
    if (identity === undefined) {
      this.#skip('session-row');
      return;
    }
    this.#knownSessions.set(identity.id, identity);
    if (this.#startedSessions.has(identity.id)) {
      if (identity.archivedAt !== undefined) this.#endSession(events, identity, 'completed');
      return;
    }
    this.#announce(events, identity, numberAt(row, 'time_created') ?? numberAt(row, 'time_updated'));
  }

  /**
   * `session.started` for a session being watched for the first time, and the
   * subagent relationship it implies.
   */
  #announce(events: AgentEvent[], identity: SessionIdentity, at: number | undefined): void {
    this.#startedSessions.add(identity.id);
    // A session whose creation stamp is missing is stamped now rather than
    // dropped: the protocol requires an `at` on every event, and "when we first
    // saw it" is a true answer even if it is not the one the harness wrote.
    const atIso = new Date(at ?? Date.now()).toISOString();
    events.push({
      type: 'session.started',
      sessionId: identity.id,
      at: atIso,
      // OpenCode stamps no agent identity on a session. The protocol requires
      // one, and the session IS the character here, so the session is the agent
      // — the same fallback the codex parser takes for a missing `agent_id`.
      agentId: identity.id,
      // Namespaced per harness so two agents are never confused on one install.
      installationId: OPEN_CODE_HARNESS,
      projectId: identity.projectId,
      harness: OPEN_CODE_HARNESS,
    });

    // The relationship is one column, so this is a read rather than a guess. It
    // is emitted on the PARENT's stream, because a client watching one agent
    // needs to hear about a subagent on the stream it is already following; the
    // child's own `session.started` goes out on the child's.
    const parentId = identity.parentId;
    if (parentId !== undefined) {
      const parent = this.#knownSessions.get(parentId);
      if (parent !== undefined) {
        events.push({
          type: 'subagent.spawned',
          sessionId: parent.id,
          at: atIso,
          childSessionId: identity.id,
        });
      }
    }

    if (identity.archivedAt !== undefined) this.#endSession(events, identity, 'completed');
  }

  #endSession(
    events: AgentEvent[],
    identity: SessionIdentity,
    reason: 'completed' | 'abandoned',
  ): void {
    if (this.#endedSessions.has(identity.id)) return;
    this.#endedSessions.add(identity.id);
    const at = identity.archivedAt ?? Date.now();
    events.push({ type: 'session.ended', sessionId: identity.id, at: new Date(at).toISOString(), reason });
  }

  /**
   * Ends a session the database says nothing more about.
   *
   * The heuristic, and the one mapping in this file with no data behind it. The
   * database has no "the user quit" field, so silence is the only signal there
   * is; `reason` is `abandoned` rather than `completed` precisely because
   * nothing here knows why the session stopped. The watcher decides when the
   * silence is long enough, and it does not re-announce a session afterwards: a
   * stream that reads end-then-activity is a truthful record of a boundary we
   * guessed, where re-opening would be a second start that never happened.
   */
  endAbandoned(events: AgentEvent[], sessionId: string): void {
    const identity = this.#knownSessions.get(sessionId) ?? {
      id: sessionId,
      directory: '',
      parentId: undefined,
      projectId: sessionId,
      archivedAt: undefined,
    };
    this.#endSession(events, identity, 'abandoned');
  }

  /**
   * The session a row belongs to, looked up when it is not already known.
   *
   * A miss is a real case rather than a bug: a part written after we opened can
   * belong to a session whose own row predates our session cursor, since the
   * session table is read on its own watermark. Falling back to a synthetic
   * identity keeps the event in the stream — a session with a hole in it is
   * recoverable, a tool call with nowhere to attach is not — and the skip ledger
   * says it happened.
   */
  #ensureSession(events: AgentEvent[], sessionId: string): void {
    if (this.#startedSessions.has(sessionId)) return;
    const known = this.#knownSessions.get(sessionId);
    if (known !== undefined) {
      this.#announce(events, known, undefined);
      return;
    }
    const row = this.#statements.sessionById.get(sessionId);
    if (row !== undefined) {
      this.#consumeSession(events, row);
      return;
    }
    this.#skip('unknown-session');
    this.#announce(
      events,
      { id: sessionId, directory: '', parentId: undefined, projectId: sessionId, archivedAt: undefined },
      undefined,
    );
  }

  // ── messages ─────────────────────────────────────────────────────────────

  #rememberRole(row: SqlRow): void {
    const id = textAt(row, 'id');
    if (id === undefined) {
      this.#skip('message-without-id');
      return;
    }
    const data = parseJson(textAt(row, 'data'));
    if (data === undefined) {
      this.#skip('unparseable-message');
      return;
    }
    // v1 puts the role in the blob; v2 keeps it in the `type` column, for the
    // reason given in #consumeTurn.
    this.#roles.set(id, textAt(data, 'role') ?? textAt(row, 'type') ?? '');
  }

  /**
   * The role of a message we may not have read yet.
   *
   * A part can belong to a message written before this watcher opened, in which
   * case the message cursor never moves over it and its role was never
   * remembered. Without this lookup every part of a session already in progress
   * at start-up would be read as context rather than as a prompt.
   */
  #roleOf(messageId: string): string {
    const cached = this.#roles.get(messageId);
    if (cached !== undefined) return cached;
    const row = this.#statements.messageById.get(messageId);
    if (row === undefined) return '';
    this.#rememberRole(row);
    return this.#roles.get(messageId) ?? '';
  }

  // ── parts ────────────────────────────────────────────────────────────────

  /** A v1 part row. v2 never comes here — its turns carry their parts inline. */
  #consumePart(events: AgentEvent[], row: SqlRow): void {
    const sessionId = textAt(row, 'session_id');
    const rowId = textAt(row, 'id');
    if (sessionId === undefined || rowId === undefined) {
      this.#skip('part-without-identity');
      return;
    }
    const data = parseJson(textAt(row, 'data'));
    if (data === undefined) {
      this.#skip('unparseable-part');
      return;
    }
    this.#emit(
      events,
      sessionId,
      rowId,
      normaliseV1Part(row, rowId, data, this.#roleOf(textAt(row, 'message_id') ?? rowId)),
      numberAt(row, 'time_created') ?? 0,
    );
  }

  /**
   * A v2 turn: one row carrying a user prompt or a whole assistant step.
   *
   * `synthetic`, `model-switched` and `system` are counted and dropped. They are
   * OpenCode's own bookkeeping, they are not activity the game can render, and
   * counting them means a future version that promotes one to real content shows
   * up here as a key that stopped appearing.
   */
  #consumeTurn(events: AgentEvent[], row: SqlRow): void {
    const rowId = textAt(row, 'id');
    const sessionId = textAt(row, 'session_id');
    const data = parseJson(textAt(row, 'data'));
    if (rowId === undefined || sessionId === undefined || data === undefined) {
      this.#skip('turn-without-identity');
      return;
    }
    const createdAt = numberAt(row, 'time_created') ?? 0;
    // The turn's type is a COLUMN. Reading it out of the blob instead returns
    // nothing, because the blobs in the real database have no such key: a user
    // turn is `{agents, files, text, time}` and an assistant turn is
    // `{agent, content, cost, error, finish, model, snapshot, time, tokens}`. The
    // first version of this reader looked in the blob and classified every
    // single turn as `turn:<none>`.
    const type = textAt(row, 'type') ?? '<none>';
    if (type === 'user') {
      const text = textAt(data, 'text');
      if (text === undefined) {
        this.#skip('empty-prompt');
        return;
      }
      this.#emit(events, sessionId, rowId, { kind: 'prompt', text }, createdAt);
      return;
    }
    if (type !== 'assistant') {
      this.#skip(`turn:${type}`);
      return;
    }

    if (hasAt(data, 'error')) this.#skip('assistant-error');
    const content = contentOf(data);
    if (content.some((element) => textAt(element, 'type') === 'reasoning')) {
      this.#emit(events, sessionId, rowId, { kind: 'reasoning' }, createdAt);
    }
    if (content.some((element) => textAt(element, 'type') === 'text')) {
      this.#emit(events, sessionId, rowId, { kind: 'assistant-text' }, createdAt);
    }
    for (const [index, element] of content.entries()) {
      if (textAt(element, 'type') !== 'tool') continue;
      const tool = normaliseV2Tool(element);
      this.#emit(
        events,
        sessionId,
        `${rowId}:${index}`,
        // The element's own id is the call id, so the key is the CALL and not the
        // row. Index is the fallback for an element that somehow has no id.
        { kind: 'tool', callId: textAt(element, 'id') ?? `${rowId}:${index}:${tool.name}`, tool },
        numberAt(recordAt(element, 'time'), 'created') ?? createdAt,
      );
    }
  }

  /**
   * One normalised part into at most two events, once.
   *
   * `tool.started` and `tool.completed` are both emitted and neither is
   * invented. Read against the databases on this machine, 1070 of 1153 v2 tool
   * states are `completed` and 83 are `error`: no `pending` and no `running` is
   * ever written, so a poll reader only ever observes the terminal state. The
   * start is therefore stamped from the row's own creation instant, which
   * OpenCode wrote when it accepted the call — not synthesised at poll time, and
   * not a guess about when the call began running. The template requires both
   * types, and the honest way to meet that is to time the start from data.
   */
  #emit(
    events: AgentEvent[],
    sessionId: string,
    partKey: string,
    part: NormalisedPart,
    at: number,
  ): void {
    this.#ensureSession(events, sessionId);
    const atIso = new Date(at).toISOString();

    switch (part.kind) {
      case 'tool': {
        // Keyed on the CALL, never the row. A row is rewritten in place as a
        // tool progresses, so keying on it would hide the transition as well as
        // the duplicate.
        const tool = part.tool;
        const endKey = `tool-end:${part.callId}`;
        if (this.#emitted.has(endKey)) return;
        this.#emitted.add(`tool-start:${part.callId}`);
        events.push({
          type: 'tool.started',
          sessionId,
          at: atIso,
          tool: normalizeToolName(tool.name),
          input: normalizeToolInput(tool.input),
        });
        this.#emitted.add(endKey);
        if (!tool.ok) {
          events.push({
            type: 'tool.failed',
            sessionId,
            at: new Date(tool.endedAt).toISOString(),
            tool: normalizeToolName(tool.name),
            ...(tool.reason === undefined ? {} : { reason: tool.reason }),
          });
          return;
        }
        events.push({
          type: 'tool.completed',
          sessionId,
          at: new Date(tool.endedAt).toISOString(),
          tool: normalizeToolName(tool.name),
          ok: true,
          // Measured rather than floored: OpenCode stamps the row when it
          // accepted the call and again when the call returned, and the
          // difference is the call's real duration even when the call finished
          // between two polls, because both stamps are on the same row.
          durationMs: Math.max(0, tool.endedAt - tool.startedAt),
        });
        return;
      }
      case 'prompt': {
        if (this.#emitted.has(`prompt:${partKey}`)) return;
        this.#emitted.add(`prompt:${partKey}`);
        events.push({ type: 'prompt.submitted', sessionId, at: atIso, prompt: part.text });
        return;
      }
      case 'reasoning': {
        if (this.#emitted.has(`reasoning:${partKey}`)) return;
        this.#emitted.add(`reasoning:${partKey}`);
        // The union's `thinking` has no payload, so it is a zone transition and
        // not a token stream. One per model step is the right number; one per
        // reasoning block is not.
        events.push({ type: 'thinking', sessionId, at: atIso });
        return;
      }
      case 'step': {
        if (this.#emitted.has(`step:${partKey}`)) return;
        this.#emitted.add(`step:${partKey}`);
        // Both boundaries of a model step are liveness, and the union has one
        // liveness event, so both map to it. The watcher's idle timer is armed
        // by any event for the session, so a step boundary needs no side channel.
        events.push({ type: 'session.heartbeat', sessionId, at: atIso });
        return;
      }
      case 'assistant-text': {
        // The union has no event for an assistant's answer — `message.received`
        // is about a different agent — and the codex parser drops the same thing
        // for the same reason. Counted so the loss is a number and not a hole.
        // The count claims the key first, because a v1 row is read by both the
        // discovery pass and the update pass and one row is one skip.
        if (this.#emitted.has(`skip:${partKey}`)) return;
        this.#emitted.add(`skip:${partKey}`);
        this.#skip('assistant-text');
        return;
      }
      case 'unmapped': {
        if (this.#emitted.has(`skip:${partKey}`)) return;
        this.#emitted.add(`skip:${partKey}`);
        this.#skip('unmapped-part');
        return;
      }
    }
  }

  #skip(reason: string): void {
    this.#skips[reason] = (this.#skips[reason] ?? 0) + 1;
  }
}

// ── the v1 part table: one row per part ───────────────────────────────────

function normaliseV1Part(
  row: SqlRow,
  rowId: string,
  data: Record<string, unknown>,
  role: string,
): NormalisedPart {
  const createdAt = numberAt(row, 'time_created') ?? 0;
  const updatedAt = numberAt(row, 'time_updated') ?? createdAt;
  switch (textAt(data, 'type')) {
    case 'tool': {
      const state = recordAt(data, 'state');
      const status = textAt(state, 'status');
      // `completed` and `error` are the only two statuses v1 ever wrote either,
      // so anything else means the call has not come back. Reading an unknown
      // status as success would put a call that is still running into the log as
      // finished, which is the failure this mapping exists to avoid.
      return {
        kind: 'tool',
        callId: textAt(data, 'callID') ?? rowId,
        tool: {
          name: textAt(data, 'tool') ?? textAt(data, 'callID') ?? rowId,
          input: recordAt(state, 'input'),
          startedAt: createdAt,
          endedAt: updatedAt,
          ok: status !== 'error' && status !== 'pending' && status !== 'running',
          reason: status === 'error' ? errorText(state) : undefined,
        },
      };
    }
    case 'text': {
      const text = textAt(data, 'text');
      // A synthetic part is one OpenCode wrote for itself, so it is never the
      // user's prompt no matter which message it hangs off.
      if (data.synthetic !== true && role === 'user' && text !== undefined && text !== '') {
        return { kind: 'prompt', text };
      }
      return { kind: 'assistant-text' };
    }
    case 'reasoning':
      return { kind: 'reasoning' };
    case 'step-start':
    case 'step-finish':
      return { kind: 'step' };
    default:
      // `patch` lands here: it records files a call changed but names none of
      // them in a form this adapter can turn into a `file.write`, and inventing
      // one event per file inside it would be a guess. The count is the record.
      return { kind: 'unmapped' };
  }
}

function errorText(state: Record<string, unknown>): string | undefined {
  const error = state.error;
  if (typeof error === 'string') return error === '' ? undefined : error;
  return textAt(recordAt(error), 'message') ?? textAt(recordAt(error), 'name');
}

// ── the v2 turn table: one row per message ────────────────────────────────

function contentOf(data: Record<string, unknown>): readonly Record<string, unknown>[] {
  const content = data.content;
  if (!Array.isArray(content)) return [];
  return content.filter((element) => typeof element === 'object' && element !== null) as Record<
    string,
    unknown
  >[];
}

function normaliseV2Tool(element: Record<string, unknown>): NormalisedTool {
  const state = recordAt(element, 'state');
  const time = recordAt(element, 'time');
  const createdAt = numberAt(time, 'created') ?? 0;
  const status = textAt(state, 'status');
  return {
    name: textAt(element, 'name') ?? '',
    input: recordAt(state, 'input'),
    startedAt: createdAt,
    endedAt: numberAt(time, 'completed') ?? createdAt,
    ok: status !== 'error' && status !== 'pending' && status !== 'running',
    reason: status === 'error' ? errorText(state) : undefined,
  };
}

// ── SQLite plumbing ───────────────────────────────────────────────────────

/**
 * Which generation this database is written in.
 *
 * Probed, not configured, because an adapter that guesses wrong is silent: v1's
 * tables are still present in a v2 database, so reading them succeeds and returns
 * nothing at all. The presence of `session_v2` is the signal.
 */
function detectSchema(db: DatabaseSync): OpenCodeSchema {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'")
    .get();
  return row === undefined ? 'v1' : 'v2';
}

/**
 * Bindings for the `time > ? OR (time = ? AND id > ?)` every cursor statement
 * uses, so the id appears in the tie-break only and never in the first
 * comparison. One helper for one shape: two of them disagreed about arity once
 * and every poll threw.
 */
function cursorArgs(cursor: Cursor): [number, number, string] {
  return [cursor.at, cursor.at, cursor.id];
}

function latestCursor(db: DatabaseSync, table: string, timeColumn: string): Cursor {
  const row = db
    .prepare(
      `SELECT ${timeColumn} AS at, id FROM ${table} ORDER BY ${timeColumn} DESC, id DESC LIMIT 1`,
    )
    .get();
  const at = row === undefined ? undefined : numberAt(row, 'at');
  const id = row === undefined ? undefined : textAt(row, 'id');
  return at === undefined || id === undefined ? CURSOR_HEAD : { at, id };
}

/**
 * The cursor for the next poll: the last row this one returned.
 *
 * Moved from the statement's own last row rather than recomputed with a MAX, so
 * a table that shrinks — the harness pruning old sessions, say — cannot rewind
 * the cursor and replay history.
 */
function advance(current: Cursor, rows: readonly SqlRow[], timeColumn: string): Cursor {
  const last = rows[rows.length - 1];
  if (last === undefined) return current;
  const at = numberAt(last, timeColumn);
  const id = textAt(last, 'id');
  if (at === undefined || id === undefined) return current;
  if (at < current.at || (at === current.at && id <= current.id)) return current;
  return { at, id };
}

function sessionIdentity(row: SqlRow): SessionIdentity | undefined {
  const id = textAt(row, 'id');
  if (id === undefined) return undefined;
  const directory = textAt(row, 'directory');
  const projectId = textAt(row, 'project_id');
  const archivedAt = numberAt(row, 'time_archived');
  return {
    id,
    directory: directory ?? '',
    parentId: textAt(row, 'parent_id'),
    // A session's project is where it ran. `project_id` groups the sessions that
    // share a repository, which is what the game groups on, so it wins and the
    // directory is the fallback for a row that has none.
    projectId: projectId ?? directory ?? id,
    archivedAt: archivedAt === undefined || archivedAt <= 0 ? undefined : archivedAt,
  };
}

const EMPTY_RECORD: Record<string, unknown> = {};

/** A record, or the record at a key. A missing key is `{}`, never a throw. */
function recordAt(source: unknown, key?: string): Record<string, unknown> {
  if (typeof source !== 'object' || source === null) return EMPTY_RECORD;
  const record = source as Record<string, unknown>;
  return key === undefined ? record : recordAt(record[key]);
}

/** Whether a key is present with a real value, for "did the harness write this". */
function hasAt(source: unknown, key: string): boolean {
  const value = recordAt(source)[key];
  return value !== undefined && value !== null;
}

function textAt(source: unknown, key: string): string | undefined {
  const value = recordAt(source)[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function numberAt(source: unknown, key: string): number | undefined {
  const value = recordAt(source)[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // A SQLite INTEGER larger than 2^53 comes back as a bigint rather than
  // throwing, and a millisecond timestamp never will — but the column is
  // declared `integer`, not `integer`-with-a-range, so the branch is cheap.
  if (typeof value === 'bigint') return Number(value);
  return undefined;
}

function parseJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  try {
    return recordAt(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function delta(
  after: Readonly<Record<string, number>>,
  before: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const changed = Object.keys(after).filter((key) => (after[key] ?? 0) !== (before[key] ?? 0));
  if (changed.length === 0) return {};
  const diff: Record<string, number> = {};
  for (const key of changed) diff[key] = (after[key] ?? 0) - (before[key] ?? 0);
  return diff;
}
