import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AgentEventSchema } from '@battle-agents/protocol';
import type { AgentEvent } from '@battle-agents/protocol';

import { createLogState, parseSessionLine, type GooseLogState } from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string[] =>
  readFileSync(join(here, 'fixtures', name), 'utf8')
    .split('\n')
    .filter((line) => line !== '');

function runAll(lines: readonly string[]): {
  readonly events: readonly AgentEvent[];
  readonly skipped: readonly string[];
  readonly state: GooseLogState;
} {
  const state = createLogState();
  const events: AgentEvent[] = [];
  const skipped: string[] = [];
  for (const line of lines) {
    const result = parseSessionLine(line, state);
    if (result.skipped !== undefined) skipped.push(result.skipped);
    events.push(...result.events);
  }
  return { events, skipped, state };
}

describe('parseSessionLine', () => {
  it('emits a session.started from the header and nothing else from it', () => {
    const { events, skipped } = runAll([fixture('legacy-session.jsonl')[0] as string]);

    expect(skipped).toEqual([]);
    expect(events).toHaveLength(1);
    const started = events[0] as AgentEvent;
    expect(started.type).toBe('session.started');
    expect(started).toMatchObject({
      sessionId: '20260926_104500',
      agentId: '20260926_104500',
      installationId: 'goose',
      projectId: '/Users/example/project',
      at: '2026-09-26T10:45:00.000Z',
    });
  });

  /**
   * `Message.created` is epoch SECONDS, read out of Goose's `pub created: i64`
   * and cross-checked against the upstream fixture where 1704110400 is
   * 2024-01-01T12:00:00Z. Read as milliseconds it would be 1970 and nothing
   * would reject it.
   */
  it('reads created as epoch seconds, not milliseconds', () => {
    const state = createLogState();
    parseSessionLine(fixture('headerless.jsonl')[0] as string, state);

    // 1704110400 is the value in Goose's own upstream fixture, where it is
    // 2024-01-01T12:00:00Z. Read as milliseconds it is 1970-01-20, and nothing
    // anywhere would reject that because an old ISO instant is a valid instant.
    const result = parseSessionLine(
      '{"id":"x","role":"user","created":1704110400,"content":[{"type":"text","text":"hi"}]}',
      state,
    );

    expect(result.skipped).toBeUndefined();
    expect((result.events[0] as AgentEvent).at).toBe('2024-01-01T12:00:00.000Z');
  });

  it('normalises the tool name through the shared map and the input through the shared normaliser', () => {
    const { events } = runAll(fixture('legacy-session.jsonl'));

    const started = events.find((e) => e.type === 'tool.started');
    // `shell` is the developer extension's own name; `Bash` is what the zone
    // map and the game client key on. Unmapped it would land in `thinking`,
    // which is the "correct and unreadable" failure the map's header describes.
    expect(started).toMatchObject({ type: 'tool.started', tool: 'Bash' });
  });

  it('pairs a toolResponse back to its request by id, because the block carries no name', () => {
    const { events } = runAll(fixture('legacy-session.jsonl'));

    const completed = events.find((e) => e.type === 'tool.completed');
    expect(completed).toMatchObject({ type: 'tool.completed', tool: 'Bash', ok: true });
  });

  it('reports a duration the format can actually support, and no more', () => {
    const { events } = runAll(fixture('legacy-session.jsonl'));

    // t1 starts at 1789118702 and answers at 1789118704: two seconds, because
    // `created` is epoch seconds. The whole measurable range of this format is
    // 1000ms, and the test is asserting that ceiling rather than a lucky value.
    const completed = events.find((e) => e.type === 'tool.completed');
    expect(completed).toMatchObject({ durationMs: 2000 });
  });

  it('emits tool.failed for an errored toolResult rather than a completed with ok:false', () => {
    const { events } = runAll(fixture('legacy-session.jsonl'));

    const failed = events.find((e) => e.type === 'tool.failed');
    expect(failed).toMatchObject({ type: 'tool.failed', tool: 'Read' });
  });

  it('emits nothing for a toolRequest whose envelope reports an error', () => {
    // t3 in the fixture: `{"status":"error"}` on the CALL. A call Goose failed
    // to record is not a call that ran, and emitting tool.started for it would
    // assert an activity the log does not contain.
    const { events } = runAll(fixture('legacy-session.jsonl'));
    const started = events.filter((e) => e.type === 'tool.started');
    expect(started).toHaveLength(2);
  });

  it('emits prompt.submitted for user text and nothing for assistant prose', () => {
    const { events } = runAll([...(fixture('headerless.jsonl') as string[])]);

    const prompts = events.filter((e) => e.type === 'prompt.submitted');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({ prompt: 'no working_dir on this one' });
    // The assistant's text-only turn is an answer, not a thing the person did.
    expect(events.some((e) => e.type === 'tool.started')).toBe(false);
  });

  it('emits thinking for a reasoning block, which Pi and Codex cannot distinguish', () => {
    const { events } = runAll(fixture('legacy-session.jsonl'));
    expect(events.some((e) => e.type === 'thinking')).toBe(true);
  });

  it('falls back to the session id for projectId when working_dir is absent', () => {
    const { events } = runAll(fixture('headerless.jsonl'));
    // `legacy.rs` defaults working_dir to "", so a header without one is
    // normal. An empty project id would collapse every Goose run into one place.
    expect(events[0]).toMatchObject({ projectId: '20260926_110000' });
  });

  it('refuses a message read before its header rather than inventing a session', () => {
    const state = createLogState();
    const result = parseSessionLine(
      '{"id":"m1","role":"user","created":1704110400,"content":[{"type":"text","text":"hi"}]}',
      state,
    );
    expect(result.events).toEqual([]);
    expect(result.skipped).toBe('no-session');
  });

  it('counts a line it does not understand instead of guessing at it', () => {
    expect(parseSessionLine('not json', createLogState()).skipped).toBe('unparseable');
    expect(parseSessionLine('   ', createLogState()).skipped).toBe('blank-line');
    expect(
      parseSessionLine('{"id":"m","role":"narrator","created":1,"content":[]}', createLogState())
        .skipped,
    ).toBe('no-session');
  });

  it('drops an orphaned toolResponse rather than naming a tool it cannot identify', () => {
    const state = createLogState();
    parseSessionLine(fixture('headerless.jsonl')[0] as string, state);
    const result = parseSessionLine(
      '{"id":"m9","role":"assistant","created":1789120801,"content":[{"type":"toolResponse","id":"never-seen","toolResult":{"status":"success","value":{}}}]}',
      state,
    );
    expect(result.events).toEqual([]);
    expect(result.skipped).toBe('assistant-without-activity');
  });

  /**
   * Every event this parser can produce, run through the real frozen schema.
   *
   * The contract suite checks the TYPE NAME appears in the union. This checks
   * the values validate — an event with a missing required field is refused at
   * the door with a 400, and a name-only check would not catch it.
   */
  it('produces events that the frozen AgentEvent schema accepts', () => {
    const { events } = runAll(fixture('legacy-session.jsonl'));
    const { events: more } = runAll(fixture('headerless.jsonl'));

    expect(events.length + more.length).toBeGreaterThan(0);
    for (const event of [...events, ...more]) {
      const result = AgentEventSchema.safeParse(event);
      expect(
        result.success,
        `${event.type} failed validation: ${JSON.stringify(result.error?.issues)}`,
      ).toBe(true);
    }
  });

  it('emits a non-ASCII prompt intact rather than mangled', () => {
    const { events } = runAll(fixture('legacy-session.jsonl'));
    const last = events.filter((e) => e.type === 'prompt.submitted').at(-1);
    expect(last).toMatchObject({ prompt: '日本語のテストとالعربية و русский — すべて壊れないこと' });
  });
});
