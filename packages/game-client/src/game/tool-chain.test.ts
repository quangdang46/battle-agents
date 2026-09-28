import { describe, expect, it } from 'vitest';

import { foldToolChain, type ToolEventLike } from './tool-chain.js';

/**
 * The fold, tested against the two failures it exists to reveal.
 *
 * `foldToolChain` is the only way anyone outside the harness process can see
 * that an agent is in a loop, so a fold that quietly loses an edge is worse
 * than no fold: it reports a calm agent.
 */

function started(agentId: string, tool: string): ToolEventLike {
  return { type: 'tool.started', occurredAt: '2026-01-01T00:00:00.000Z', payload: { agentId, tool } };
}

function finished(agentId: string, tool: string, durationMs?: number): ToolEventLike {
  return {
    type: 'tool.completed',
    occurredAt: '2026-01-01T00:00:01.000Z',
    payload: durationMs === undefined ? { agentId, tool } : { agentId, tool, durationMs },
  };
}

describe('foldToolChain', () => {
  it('counts what each tool was used for', () => {
    const data = foldToolChain([
      started('a1', 'Read'),
      started('a1', 'Edit'),
      started('a1', 'Read'),
      started('a1', 'Bash'),
    ]);

    expect(data.toolCounts).toEqual({ Read: 2, Edit: 1, Bash: 1 });
    expect(data.tools).toEqual(['Bash', 'Edit', 'Read']);
  });

  it('records the ORDER, which is the whole point', () => {
    // The order is what distinguishes an agent that reads before it edits from
    // one that does not, and a per-tool count cannot express either.
    const data = foldToolChain([started('a1', 'Read'), started('a1', 'Edit')]);

    expect(data.transitions).toEqual([{ from: 'Read', to: 'Edit', count: 1 }]);
  });

  it('separates the agents, so one busy agent does not flatten the other', () => {
    const data = foldToolChain([
      started('a1', 'Read'),
      started('a1', 'Edit'),
      // A second agent, between them in time. Its first tool opens no edge --
      // an edge needs a previous tool, and borrowing the other agent's would be
      // a transition that never happened.
      started('a2', 'Bash'),
      started('a2', 'Grep'),
    ]);

    // Equal counts, so the tiebreak is alphabetical on `from`: Bash before
    // Read. The order is asserted because it is the property the last test in
    // this file exists to protect.
    expect(data.transitions).toEqual([
      { from: 'Bash', to: 'Grep', count: 1 },
      { from: 'Read', to: 'Edit', count: 1 },
    ]);
  });

  it('collapses a retry storm into one edge rather than counting the retries', () => {
    // Five reads in a row is a struggling agent, not five transitions. Counting
    // them makes a retry look like progress, which is the one thing this number
    // must not do.
    const data = foldToolChain([
      started('a1', 'Read'),
      started('a1', 'Read'),
      started('a1', 'Read'),
      started('a1', 'Read'),
      started('a1', 'Read'),
    ]);

    expect(data.transitions).toEqual([]);
    expect(data.toolCounts).toEqual({ Read: 5 });
  });

  it('surfaces the loop it is here to surface', () => {
    // Read, Edit, Read, Edit, Read: a thrash. The panel is only worth building
    // if this shape is visible in it.
    const data = foldToolChain([
      started('a1', 'Read'),
      started('a1', 'Edit'),
      started('a1', 'Read'),
      started('a1', 'Edit'),
      started('a1', 'Read'),
    ]);

    expect(data.transitions).toEqual([
      { from: 'Edit', to: 'Read', count: 2 },
      { from: 'Read', to: 'Edit', count: 2 },
    ]);
  });

  it('counts failures as failures and still counts the attempt as a move', () => {
    // A tool that failed still moved the agent. Recording the failure only in
    // toolFailures and dropping the transition would make a struggling agent
    // look like one that never tried.
    const data = foldToolChain([
      started('a1', 'Read'),
      started('a1', 'Bash'),
      { type: 'tool.failed', occurredAt: '2026-01-01T00:00:02.000Z', payload: { agentId: 'a1', tool: 'Bash' } },
      started('a1', 'Edit'),
    ]);

    expect(data.toolFailures).toEqual({ Bash: 1 });
    expect(data.toolSuccesses).toEqual({});
    expect(data.transitions).toEqual([
      { from: 'Bash', to: 'Edit', count: 1 },
      { from: 'Read', to: 'Bash', count: 1 },
    ]);
  });

  it('averages duration over the calls that reported one, not over all of them', () => {
    // The reference documents this: "only for tools with timing data". Dividing
    // by every call when half carry no timing produces a number that describes
    // nothing, which is worse than reporting none.
    const data = foldToolChain([
      started('a1', 'Bash'),
      finished('a1', 'Bash', 100),
      started('a1', 'Bash'),
      finished('a1', 'Bash', 300),
      started('a1', 'Bash'),
      finished('a1', 'Bash'),
    ]);

    expect(data.toolAvgDuration).toEqual({ Bash: 200 });
    expect(data.toolCounts).toEqual({ Bash: 3 });
  });

  it('renders the same order for the same log, every time', () => {
    // Map iteration order is stable within a run and not across them, so an
    // unsorted fold produces a panel that reshuffles on reload -- the same
    // defect terrain-map.ts rules out for the world.
    const events = [
      started('a1', 'Grep'),
      started('a1', 'Read'),
      started('a2', 'Bash'),
      started('a2', 'Read'),
    ];

    expect(foldToolChain(events)).toEqual(foldToolChain(events));
  });

  it('ignores events that are not about a tool', () => {
    const data = foldToolChain([
      { type: 'session.started', occurredAt: '2026-01-01T00:00:00.000Z', payload: { agentId: 'a1' } },
      // No tool name: a tool.started with nothing named is not a tool call, and
      // guessing at it would put a nameless node in the graph.
      { type: 'tool.started', occurredAt: '2026-01-01T00:00:00.000Z', payload: { agentId: 'a1' } },
    ]);

    expect(data).toEqual({
      transitions: [],
      tools: [],
      toolCounts: {},
      toolSuccesses: {},
      toolFailures: {},
      toolAvgDuration: {},
    });
  });
});
