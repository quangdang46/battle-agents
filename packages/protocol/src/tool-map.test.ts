import { describe, expect, it } from 'vitest';

import {
  FILE_READ_TOOLS,
  FILE_WRITE_TOOLS,
  getZoneForTool,
  normalizeToolInput,
  normalizeToolName,
  TOOL_NAME_MAP,
  TOOL_ZONE_MAP,
  type ZoneId,
} from './tool-map.js';

/**
 * The port from agent-move, checked rather than trusted.
 *
 * A copied map is the easiest kind of code to get quietly wrong: it compiles,
 * it looks complete, and a missing entry only shows up when a harness emits a
 * tool nobody anticipated. These assert the behaviour the rest of the pipeline
 * depends on, including the two fallbacks that keep an unmapped tool from
 * breaking the stream.
 */

describe('normalizeToolName', () => {
  it('maps the harness-specific names the adapters actually emit', () => {
    expect(normalizeToolName('shell_command')).toBe('Bash');
    expect(normalizeToolName('read_file')).toBe('Read');
    expect(normalizeToolName('apply_patch')).toBe('Patch');
    expect(normalizeToolName('edit-diff')).toBe('Patch');
    expect(normalizeToolName('find')).toBe('Glob');
    expect(normalizeToolName('update_plan')).toBe('TodoWrite');
    expect(normalizeToolName('websearch')).toBe('WebSearch');
  });

  it('leaves a canonical name alone', () => {
    expect(normalizeToolName('Read')).toBe('Read');
    expect(normalizeToolName('Bash')).toBe('Bash');
  });

  it('returns an unknown name unchanged rather than dropping it', () => {
    // A harness shipping a new tool must still be observable. Returning a
    // placeholder would make an unmapped tool look mapped, and the zone
    // fallback would then send it somewhere arbitrary on purpose.
    expect(normalizeToolName('some_future_tool')).toBe('some_future_tool');
  });

  it('never maps a name to itself, so a typo is visible', () => {
    const identity = Object.entries(TOOL_NAME_MAP).filter(([from, to]) => from === to);
    expect(identity).toEqual([]);
  });
});

describe('getZoneForTool', () => {
  it('routes a canonical tool to its zone', () => {
    expect(getZoneForTool('Read')).toBe('files');
    expect(getZoneForTool('Bash')).toBe('terminal');
    expect(getZoneForTool('Grep')).toBe('search');
    expect(getZoneForTool('Agent')).toBe('spawn');
  });

  it('routes every mcp__ tool to web whatever its suffix', () => {
    // A third-party MCP server is browsing something, and there is no general
    // way to know which zone it belongs to. The prefix is the only signal.
    expect(getZoneForTool('mcp__anything_at_all')).toBe('web');
    expect(getZoneForTool('mcp__my_server__delete_everything')).toBe('web');
  });

  it('falls back to thinking for an unknown tool instead of returning nothing', () => {
    // The whole point: an unmapped tool is real activity, and a gap in this
    // table must not break the pipeline.
    expect(getZoneForTool('a_tool_nobody_mapped')).toBe('thinking');
  });

  it('has a zone for every value its own map declares', () => {
    const zones = new Set<string>(Object.values(TOOL_ZONE_MAP));
    for (const zone of zones) {
      expect(getZoneForTool('Read')).toBeDefined();
      expect(typeof zone).toBe('string');
    }
    // Every zone the map names is one the type admits, which is the property
    // that breaks if someone adds a zone string without widening ZoneId.
    const known: ReadonlySet<ZoneId> = new Set([
      'files',
      'terminal',
      'search',
      'web',
      'thinking',
      'messaging',
      'tasks',
      'spawn',
      'idle',
      'bounty-board',
      'battle-arena',
      'guild-hall',
    ]);
    for (const zone of zones) expect(known.has(zone as ZoneId)).toBe(true);
  });
});

describe('normalizeToolInput', () => {
  it('rewrites the four camelCase keys the harnesses disagree on', () => {
    expect(normalizeToolInput({ filePath: '/a/b.ts' })).toEqual({ file_path: '/a/b.ts' });
    expect(normalizeToolInput({ oldString: 'a', newString: 'b', replaceAll: true })).toEqual({
      old_string: 'a',
      new_string: 'b',
      replace_all: true,
    });
  });

  it('passes an input it has nothing to rewrite through unchanged', () => {
    const input = { command: 'ls', description: 'list' };
    expect(normalizeToolInput(input)).toEqual(input);
  });

  it('does not mutate its input', () => {
    const input = { filePath: '/a/b.ts' };
    normalizeToolInput(input);
    expect(input).toEqual({ filePath: '/a/b.ts' });
  });

  it('leaves an unknown key alone rather than inventing a snake_case form', () => {
    // A harness adding an input field must keep working without a change here.
    expect(normalizeToolInput({ someNewField: 1 })).toEqual({ someNewField: 1 });
  });
});

describe('the tool sets', () => {
  it('classifies write and read tools without overlap', () => {
    expect(FILE_WRITE_TOOLS.has('Write')).toBe(true);
    expect(FILE_READ_TOOLS.has('Read')).toBe(true);
    for (const tool of FILE_WRITE_TOOLS) expect(FILE_READ_TOOLS.has(tool)).toBe(false);
  });

  it('only names tools the zone map also knows', () => {
    for (const tool of [...FILE_WRITE_TOOLS, ...FILE_READ_TOOLS]) {
      expect(TOOL_ZONE_MAP[tool]).toBeDefined();
    }
  });
});

describe('normalizeToolInput on an input that is not an object', () => {
  // `tool_input` is optional in the protocol and `Bash` frequently posts none,
  // so this is the common case rather than a corner. The signature used to say
  // Record and the body believed it, and every adapter that called the helper
  // with an absent input got "Cannot use 'in' operator to search in undefined"
  // from inside it.
  it('treats an absent or non-object input as an empty one', () => {
    for (const input of [undefined, null, 'a string', 42, true]) {
      expect(normalizeToolInput(input)).toEqual({});
    }
  });

  it('still normalises a real object', () => {
    expect(normalizeToolInput({ filePath: 'a.ts', other: 1 })).toEqual({ file_path: 'a.ts', other: 1 });
  });
});
