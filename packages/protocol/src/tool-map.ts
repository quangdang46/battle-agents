/**
 * Tool normalization: many CLIs, one vocabulary.
 *
 * Ported from agent-move, `packages/shared/src/constants/tools.ts` at commit
 * `85d377110721`, which the plan (section 28.1 item 2) classifies as a
 * copy-with-attribution rather than a rewrite: it is the best-documented example
 * of normalizing several coding CLIs into a single vocabulary, and the port is
 * meant to be recognisable as the same code so the next agent can diff it
 * against upstream.
 *
 * `THIRD-PARTY-NOTICES.md` records the source, the SHA and the licence.
 * agent-move ships no LICENSE file; its package.json declares MIT and nothing
 * else grants terms, and tools.ts carries no copyright header, so there is no
 * header here to keep. The attribution obligation is the notices entry.
 *
 * Three deliberate departures from upstream, each of which would otherwise be a
 * silent divergence:
 *
 * 1. `TOOL_NAME_MAP` is exported here. Upstream keeps it module-private and
 *    reaches it only through `normalizeToolName`. Ours is exported because an
 *    adapter registering a new harness's names needs to read what is already
 *    taken rather than inferring it by probing the function, and so a test can
 *    assert against the map rather than against a call that hides it. This
 *    comment used to name a shared adapter contract suite as the reason, and
 *    that suite does not exist; the reasons above are the ones that hold.
 * 2. `TOOL_ICONS` is not ported. It is emoji presentation and belongs to the
 *    game client; the protocol package has no business choosing how a tool is
 *    drawn.
 * 3. The zone set carries three game zones the upstream map does not have
 *    (bounty-board, battle-arena, guild-hall), because the game client maps
 *    tools onto our world and upstream's zones describe a different world.
 *
 * The entry counts are smaller than the plan implies, not the ~50 quoted
 * upstream, and they grow as harnesses ship new tools, so the counts are not a
 * contract. What is a contract is the behaviour for an unknown tool:
 * `getZoneForTool` returns a zone rather than dropping the event, because an
 * unmapped tool is still real activity and a gap in this table must not break
 * the pipeline.
 */

export type ZoneId =
  | 'files'
  | 'terminal'
  | 'search'
  | 'web'
  | 'thinking'
  | 'messaging'
  | 'tasks'
  | 'spawn'
  | 'idle'
  // Added for the game world; see the header.
  | 'bounty-board'
  | 'battle-arena'
  | 'guild-hall';

/** Canonical tool names that modify files. */
export const FILE_WRITE_TOOLS: ReadonlySet<string> = new Set(['Edit', 'Write', 'NotebookEdit']);

/** Canonical tool names that read or search files. */
export const FILE_READ_TOOLS: ReadonlySet<string> = new Set(['Read', 'Glob', 'Grep']);

/** Maps canonical tool names to activity zones. */
export const TOOL_ZONE_MAP: Readonly<Record<string, ZoneId>> = {
  // Files
  Read: 'files',
  Write: 'files',
  Edit: 'files',
  Patch: 'files',
  Glob: 'files',
  NotebookEdit: 'files',

  // Terminal
  Bash: 'terminal',

  // Search
  Grep: 'search',
  WebSearch: 'search',

  // Web
  WebFetch: 'web',
  mcp__chrome_devtools__navigate_page: 'web',
  mcp__chrome_devtools__click: 'web',
  mcp__chrome_devtools__fill: 'web',
  mcp__chrome_devtools__take_screenshot: 'web',
  mcp__chrome_devtools__take_snapshot: 'web',
  mcp__chrome_devtools__evaluate_script: 'web',

  // Thinking
  EnterPlanMode: 'thinking',
  ExitPlanMode: 'thinking',
  AskUserQuestion: 'thinking',

  // Messaging
  SendMessage: 'messaging',

  // Tasks
  TaskCreate: 'tasks',
  TaskUpdate: 'tasks',
  TaskList: 'tasks',
  TaskGet: 'tasks',
  TodoRead: 'tasks',
  TodoWrite: 'tasks',

  // Spawn
  Agent: 'spawn',
  TeamCreate: 'spawn',
  TeamDelete: 'spawn',

  // Cursor. Two of these are zone-only and have no canonical name, which is the
  // split the two maps exist for: `Await` waits on a background command without
  // running one, and `CallMcpTool` wraps a third-party MCP tool whose real name
  // is only known once the call is made. Both are zoned by what they DO, and
  // neither is renamed to a name it is not.
  Await: 'terminal',
  CallMcpTool: 'web',
};

/**
 * The zone a tool belongs to.
 *
 * Every `mcp__` tool routes to `web` whatever its suffix, because a third-party
 * MCP server is browsing something and there is no general way to know which
 * zone it belongs to. An unknown tool falls back to `thinking` rather than
 * returning nothing: the event still happened, and the UI showing it in the
 * wrong place beats a pipeline that drops activity it does not recognise.
 */
export function getZoneForTool(toolName: string): ZoneId {
  if (toolName.startsWith('mcp__')) return 'web';
  return TOOL_ZONE_MAP[toolName] ?? 'thinking';
}

/**
 * Agent-specific tool name to the canonical PascalCase name.
 *
 * Exported where upstream keeps it private; see the header.
 */
export const TOOL_NAME_MAP: Readonly<Record<string, string>> = {
  // OpenCode / pi lowercase
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  patch: 'Patch',
  glob: 'Glob',
  bash: 'Bash',
  grep: 'Grep',
  websearch: 'WebSearch',
  webfetch: 'WebFetch',
  todoread: 'TodoRead',
  todowrite: 'TodoWrite',

  // OpenCode's own names for the same activities, counted across the 1153 tool
  // calls in the database on this machine on 2026-09-26 (OpenCode 1.18.21).
  // `shell` alone is 433 of them — the single most common tool it runs, and
  // unmapped it would
  // land in the thinking zone instead of the terminal, which is the exact
  // failure the header above describes as "correct and unreadable". `execute` is
  // 114 calls carrying `{code}`, a code runner, and the `js_repl: 'Bash'` entry
  // below is the precedent for putting one in the terminal zone. `subagent` and
  // `question` are 13 and 2 calls and are named for what they do.
  shell: 'Bash',
  execute: 'Bash',
  subagent: 'Agent',
  question: 'AskUserQuestion',

  // pi-specific
  'edit-diff': 'Patch',
  find: 'Glob',
  ls: 'Bash',
  truncate: 'Write',
  // `find_block` searches file CONTENT for a block, where `find` above globs a
  // path, so the two are different activities and land in different zones.
  find_block: 'Grep',
  rename_file: 'Edit',
  remove_file: 'Edit',

  // Codex CLI
  shell_command: 'Bash',
  exec_command: 'Bash',
  read_file: 'Read',
  apply_patch: 'Patch',
  list_dir: 'Bash',
  grep_files: 'Grep',
  web_search: 'WebSearch',
  js_repl: 'Bash',
  js_repl_reset: 'Bash',
  spawn_agent: 'Agent',
  send_input: 'Agent',
  wait: 'Agent',
  close_agent: 'Agent',
  resume_agent: 'Agent',
  spawn_agents_on_csv: 'Agent',
  report_agent_job_result: 'Agent',
  request_user_input: 'AskUserQuestion',
  request_permissions: 'AskUserQuestion',
  update_plan: 'TodoWrite',
  view_image: 'Read',
  image_generation: 'Write',
  write_stdin: 'Bash',
  search_apps: 'WebSearch',

  // Cursor agent transcripts: the complete set of tool names across 4,013
  // tool_use blocks in the 159 transcripts on the machine this map was extended
  // from. Shell, Ls, Task and AskQuestion are the ones needing a canonical
  // name; Read, Grep, Glob, Edit, TodoWrite and WebFetch are already canonical
  // and so need no entry.
  Shell: 'Bash',
  Ls: 'Bash',
  // Cursor's Task is a subagent dispatch, which is what Codex calls spawn_agent.
  Task: 'Agent',
  AskQuestion: 'AskUserQuestion',

  // Gemini CLI 0.46.0, read out of the installed bundle's `Name` fields rather
  // than from memory. `read_file`, `glob` and `web_search` already appear above
  // and are deliberately not repeated. `save_memory` and `list_mcp_resource_
  // todos` are not in this build, so they are absent here too — a name nobody
  // has observed should not be in a shared table on the strength of a
  // recollection.
  read_many_files: 'Read',
  replace: 'Edit',
  write_file: 'Write',
  run_shell_command: 'Bash',
  search_file_content: 'Grep',
  web_fetch: 'WebFetch',
  google_web_search: 'WebSearch',
  list_directory: 'Bash',
  list_mcp_resources: 'Read',
  list_background_processes: 'Bash',
  read_background_output: 'Read',

  // Aider 0.86.2, read out of the PyPI sdist rather than from an installed copy,
  // because Aider is not on the machine this map was extended from. These are
  // NOT the names Aider sends to a model — see the entry above it for why that
  // is the case. They are the names the Aider adapter gives to the activities
  // Aider writes into its transcript, so that the harness's vocabulary lives in
  // this one table rather than in a map inside the adapter.
  //
  // Only the two activities the adapter emits as tool events are here. Its two
  // write activities (`Applied edit to <path>` and `Creating empty file
  // <path>`) are deliberately absent: the adapter emits those as `file.write`,
  // which is a member of the protocol union carrying the path, so it never
  // produces those names and a table entry nothing emits is an entry that rots.
  // `commit` is a git commit and lands in the terminal zone because that is what
  // it is — a subprocess — and inventing a canonical name for one harness's
  // vocabulary would grow a shared table to suit a single entry.
  run_command: 'Bash',
  commit: 'Bash',

  // Goose. Two entries only, and that is deliberate: the developer extension
  // registers exactly five tools — `write`, `edit`, `shell`, `tree`,
  // `read_image`, asserted as a set in its own unit test
  // (`developer_tools_are_flat` in
  // crates/goose/src/agents/platform_extensions/developer/mod.rs) — and three of
  // them already appear above. `write`, `edit` and `shell` are the OpenCode/pi
  // lowercase block, and `shell: 'Bash'` was already there for the same reason
  // it is here: unmapped, the single most common tool an agent runs would land
  // in `thinking` instead of `terminal`.
  //
  // `tree` walks the file tree with `ignore::WalkBuilder` and takes a path and a
  // depth, so it is structural discovery of paths rather than reading one, which
  // is what `Glob` names and what the `files` zone is for. It is deliberately
  // NOT `Bash`, which is what the `list_dir` entry above maps to: `list_dir`
  // is one directory, this is a bounded walk of a tree.
  //
  // NOT HERE, ON PURPOSE: Goose's MCP tool names may carry an
  // `<extension>__<tool>` qualifier. `ToolNameParts { extension_name, tool_name }`
  // in goose-provider-types/src/conversation/message.rs is a struct built for
  // splitting one, and the field is an `Option`, so some names qualify and some
  // do not — but the construction site was not located, and the separator was
  // not confirmed. A name nobody has observed does not belong in this table; the
  // header above says so and the reason it says so is exactly this situation.
  // If a real session turns out to write `developer__shell`, the fix is to add
  // the qualified spellings here, NOT to change the separator in the adapter.
  tree: 'Glob',
  read_image: 'Read',
};

/**
 * Normalize a harness-specific tool name to the canonical form.
 *
 * A name that is not in the map is returned unchanged. That is deliberate: a
 * harness shipping a new tool must still be observable, and the zone fallback
 * above gives it somewhere to appear. Returning a placeholder instead would
 * make an unmapped tool indistinguishable from a mapped one.
 */
export function normalizeToolName(name: string): string {
  return TOOL_NAME_MAP[name] ?? name;
}

const CAMEL_TO_SNAKE: Readonly<Record<string, string>> = {
  filePath: 'file_path',
  oldString: 'old_string',
  newString: 'new_string',
  replaceAll: 'replace_all',
};

/**
 * Normalize a harness's tool input keys to snake_case.
 *
 * This is the reason a downstream consumer can read one input shape regardless
 * of which CLI produced it. Omitting it is the most likely way a copied version
 * of this file turns out to be subtly wrong: the name and zone maps look
 * complete without it, and every consumer then silently reads camelCase keys
 * that no parser rewrote.
 *
 * Only the four keys that differ between harnesses are renamed. Everything
 * else is passed through untouched, so a harness adding a new input field does
 * not need a change here to keep working.
 */
export function normalizeToolInput(input: unknown): Record<string, unknown> {
  // A tool with no arguments is normal, not malformed: `Bash` frequently posts
  // no input, and `tool_input` is optional in the protocol. The signature said
  // Record and the body believed it, so `key in undefined` threw
  // "Cannot use 'in' operator" from inside the helper every adapter calls —
  // and it threw on the common case, not a rare one. `unknown` in the
  // signature is what forces the next caller to think about it.
  if (typeof input !== 'object' || input === null) {
    return {};
  }
  const record = input as Record<string, unknown>;
  const present = Object.keys(CAMEL_TO_SNAKE).filter((key) => key in record);
  if (present.length === 0) return { ...record };

  const normalized: Record<string, unknown> = { ...record };
  for (const key of present) {
    const snake = CAMEL_TO_SNAKE[key] as string;
    normalized[snake] = record[key];
    delete normalized[key];
  }
  return normalized;
}
