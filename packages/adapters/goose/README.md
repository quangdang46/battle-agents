# @battle-agents/goose

The Goose adapter. Watches Goose's JSONL session logs and turns each record into
an `AgentEvent` against the frozen protocol union.

## Read this before adding a field

**Goose was not installed on the machine this was written on.** Nothing here was
read off a live session. The record format was established by reading Goose's own
source, and two findings contradict the brief this adapter was built from:

1. **Current Goose writes SQLite, not JSONL.** `session/session_manager.rs` builds
   its storage on `sqlx::sqlite`, `SessionStorage::create_schema` issues
   `CREATE TABLE`, and `DB_NAME` is `"sessions.db"`. The JSONL files are read by
   `session/legacy.rs` — a module whose whole job is `load_session` over a
   `.jsonl` file — for back-compat with what older Goose wrote. **This adapter
   reads the format Goose used to write, not what it writes today.** A user
   running a current Goose will see this adapter produce nothing, and
   `skippedCount` is the number that tells them why.

   (The repository has also moved: `block/goose` 301-redirects, and everything
   below was read from `github.com/aaif-goose/goose`.)

2. **The data directory is not `~/.local/share/goose/sessions` on macOS.**
   `config/paths.rs` resolves it through the `etcetera` crate and its own comment
   spells out the result: `~/Library/Application Support/Block/goose/`.
   `GOOSE_PATH_ROOT`, if set, bypasses `etcetera` entirely. So `paths.ts`
   searches a LIST of candidate roots rather than asserting one, and
   `sessionsDirectory` on the watcher lets a caller state the truth directly.

## What the format is

From `Message` in `crates/goose-provider-types/src/conversation/message.rs`, and
from a real captured line in `session/legacy.rs`'s own unit test:

```json
{"description":"…","id":"20240101_120000","created_at":"2024-01-01T12:00:00Z","extension_data":{},"message_count":0}
{"id":"msg1","role":"user","created":1704110400,"content":[{"type":"text","text":"Hello"}]}
```

Line 1 is session metadata; every line after it is a message.

- `role` is rmcp's `Role` — `user` and `assistant`. **Tool calls are not a third
  role.** They are content *blocks*, which is the opposite of the Pi layout and
  the reason a search of the role vocabulary finds no way to express a result.
- `content` blocks are `#[serde(tag = "type", rename_all = "camelCase")]`, so
  `type` is one of: `text`, `image`, `document`, `toolRequest`, `toolResponse`,
  `toolConfirmationRequest`, `actionRequired`, `thinking`, `redactedThinking`,
  `systemNotification`, `error`.
- A tool call is `{"type":"toolRequest","id":…,"toolCall":{"status":"success",
  "value":{"name":…,"arguments":…}}}`, and a result is
  `{"type":"toolResponse","id":…,"toolResult":{"status":"success"|"error",…}}`.
  Both carry a mandatory `status` envelope.

## What this format does NOT contain

Written down because that is what stops the next person inventing a field.

- **No session id on a message line.** It is the file-name stem
  (`%Y%m%d_%H%M%S`, from `parse_session_timestamp`) and it is repeated on the
  header. A message read before its header is a counted skip, not a guess.
- **No `working_dir` in practice.** `legacy.rs` defaults it to `""` when absent,
  which is only worth doing if it sometimes is. `projectId` falls back to the
  session id, because `""` would collapse every Goose run into one place.
- **No tool name on a result.** A `toolResponse` carries an `id` and an outcome
  and nothing else, so the in-flight map is the only way that event can name a
  tool. This is the field most likely to be "fixed" by inventing.
- **No sub-second timing.** `created` is an `i64` of epoch **seconds**. The
  measurable range of `durationMs` is therefore 1000ms, and a call that returned
  in the same second is indistinguishable from one that took 999ms.
- **No model or provider name** on the header or on a message.
- **No tool arguments on a result** — join by `id` to the request.
- **The extension→tool name qualifier is unverified.** `ToolNameParts
  { extension_name, tool_name }` is a struct built for splitting a name, and its
  `extension_name` is an `Option`, so some names qualify and some do not — but
  the construction site was not located and the separator was not confirmed. So
  no `developer__shell`-style names are in the tool map, on the rule the map's
  own header states: a name nobody has observed does not belong in a shared
  table. If a real session turns out to write the qualified form, the fix is to
  add the qualified spellings to `packages/protocol/src/tool-map.ts`, not to
  change the adapter.

## The byte cursor

`reader.ts` owns it, and the order is the whole point: **slice the bytes, then
decode.** Decoding first and slicing the decoded string at a byte offset reads
too far in — every character outside ASCII is one code unit but two or more
bytes, so the two indices drift by one per such character already passed, and
each poll starts its next record that many characters late. The records arrive
as fragments, fail to parse, and get counted as unreadable while the session
still looks alive. Pi measured 33 of 750 records silently corrupted this way.
`reader.test.ts` pins both directions, and the negative control
(`would drift if the cursor advanced by character count`) is the one to read
first.

## What is not here

- **`harness: 'goose'`.** `harnessSchema` is a closed enum in
  `packages/protocol` and this bead is not a protocol change. The enum's own
  comment names the escape hatch for exactly this case — "a new coding agent
  ships an adapter before this enum grows an entry" — so the adapter emits
  `'other'`. **The cost is real**: a Goose agent is indistinguishable from any
  other unrecognised harness until `'goose'` is added to the enum. That is a
  one-line change plus a migration of stored events, and it belongs to whoever
  owns the protocol.
- **SQLite.** Covering `sessions.db` needs a SQLite driver the repo does not
  have, and a different mechanism — a growing table rather than an appended log.
  Separate bead.
- **A tool table.** Tool names go through `normalizeToolName` from
  `@battle-agents/protocol`. The only entries added for Goose are `tree` and
  `read_image`; `write`, `edit` and `shell` were already there.
