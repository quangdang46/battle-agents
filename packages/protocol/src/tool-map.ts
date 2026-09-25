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
 *    reaches it only through `normalizeToolName`. Ours is exported because the
 *    adapter contract suite asserts against the map directly rather than
 *    inferring its contents by probing the function, and because an adapter
 *    registering a new harness name needs to read what is already taken.
 * 2. `TOOL_ICONS` is not ported. It is emoji presentation and belongs to the
 *    game client; the protocol package has no business choosing how a tool is
 *    drawn.
 * 3. The zone set carries three game zones the upstream map does not have
 *    (bounty-board, battle-arena, guild-hall), because the game client maps
 *    tools onto our world and upstream's zones describe a different world.
 *
 * The entry counts are smaller than the plan implies — 38 name mappings and 29
 * zone mappings, not the ~50 quoted upstream. Both grow as harnesses ship new
 * tools, so the counts are not a contract. What is a contract is the behaviour
 * for an unknown tool: `getZoneForTool` returns a zone rather than dropping the
 * event, because an unmapped tool is still real activity and a gap in this
 * table must not break the pipeline.
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

  // pi-specific
  'edit-diff': 'Patch',
  find: 'Glob',
  ls: 'Bash',
  truncate: 'Write',

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
export function normalizeToolInput(
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const present = Object.keys(CAMEL_TO_SNAKE).filter((key) => key in input);
  if (present.length === 0) return { ...input };

  const normalized: Record<string, unknown> = { ...input };
  for (const key of present) {
    const snake = CAMEL_TO_SNAKE[key] as string;
    normalized[snake] = input[key];
    delete normalized[key];
  }
  return normalized;
}
