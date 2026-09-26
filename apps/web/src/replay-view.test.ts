import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ActivityEntry, ActivityLog, ScopedTimelineQuery } from '@battle-agents/activity';

import { loadPublicReplay, readBattleTimeline } from './replay-view.js';

/**
 * How a battle's timeline is assembled, and that the assembly is the log's job.
 *
 * The merge in `readBattleTimeline` is the part with the most room to be wrong:
 * two reads, an overlap, and an order that has to be the log's. Each of those
 * has a test here that fails when the behaviour is removed, and the overlap one
 * has a row that satisfies BOTH reads — a `battle.joined` carries the battle tag
 * and a session — because an overlap nobody modelled is an overlap nobody fixed.
 */

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

function entry(
  sequence: number,
  type: string,
  payload: Record<string, unknown>,
  sessionId: string | null = null,
): ActivityEntry {
  return {
    sequence,
    type,
    actorId: 'battle',
    sessionId,
    causationId: null,
    payload,
    occurredAt: '2026-01-01T00:00:00.000Z',
  };
}

/** A log that answers from a fixed table and records what it was asked. */
class RecordedLog implements ActivityLog {
  readonly asked: ScopedTimelineQuery[] = [];

  constructor(private readonly rows: readonly ActivityEntry[]) {}

  async trail(): Promise<readonly ActivityEntry[]> {
    return [];
  }
  async recent(): Promise<readonly ActivityEntry[]> {
    return [];
  }
  async scopedTimeline(query: ScopedTimelineQuery): Promise<readonly ActivityEntry[]> {
    this.asked.push(query);
    return this.rows.filter((row) => {
      if (query.tagged !== undefined && row.payload[query.tagged.key] === query.tagged.value)
        return true;
      return (query.sessionIds ?? []).includes(row.sessionId ?? '');
    });
  }
}

const TIMELINE: readonly ActivityEntry[] = [
  entry(1, 'battle.created', { battleId: 'b-1', mode: 'speed', participants: [ALICE] }),
  // Satisfies BOTH reads: the payload carries the battle tag and the row
  // carries a session. A concatenation would render this instant twice.
  entry(2, 'battle.joined', { battleId: 'b-1', participants: [ALICE, BOB] }, BOB),
  entry(3, 'session.started', { harness: 'codex' }, BOB),
  entry(4, 'test.passed', { suite: 'unit', count: 9 }, BOB),
  entry(5, 'test.passed', { suite: 'other', count: 1 }, '33333333-3333-4333-8333-333333333333'),
  entry(6, 'battle.finished', {
    battleId: 'b-1',
    mode: 'speed',
    outcome: 'won',
    reason: 'outscored',
    winnerSessionIds: [BOB],
  }),
];

describe('assembling a battle timeline from the log', () => {
  it('reads the battle tag first and its fighters’ rows second', async () => {
    const log = new RecordedLog(TIMELINE);
    await readBattleTimeline(log, 'b-1');
    expect(log.asked[0]).toEqual({ tagged: { key: 'battleId', value: 'b-1' } });
    // The roster comes from the rows the first read returned, not from a table.
    expect([...(log.asked[1]?.sessionIds ?? [])].sort()).toEqual([ALICE, BOB]);
  });

  it('renders a row that satisfies both reads exactly once', async () => {
    const merged = await readBattleTimeline(new RecordedLog(TIMELINE), 'b-1');
    expect(merged.map((row) => row.sequence)).toEqual([1, 2, 3, 4, 6]);
  });

  it('orders by the log’s own sequence rather than by which read found it', async () => {
    const merged = await readBattleTimeline(new RecordedLog(TIMELINE), 'b-1');
    const sequences = merged.map((row) => row.sequence);
    expect([...sequences].sort((left, right) => left - right)).toEqual(sequences);
  });

  it('leaves out a session that took no part in this battle', async () => {
    // Sequence 5 belongs to a different run. A timeline that grew every session
    // on the server would put another battle's tests on this page.
    const merged = await readBattleTimeline(new RecordedLog(TIMELINE), 'b-1');
    expect(merged.some((row) => row.sequence === 5)).toBe(false);
  });

  it('asks once when the battle has no fighters in its rows', async () => {
    const log = new RecordedLog([entry(1, 'battle.created', { battleId: 'b-1', mode: 'speed' })]);
    await readBattleTimeline(log, 'b-1');
    expect(log.asked).toHaveLength(1);
  });
});

describe('the logged-out boundary, as a shape rather than a promise', () => {
  const repoRoot = resolve(import.meta.dirname, '../../..');

  it('loads a replay with nothing but the id in the link', () => {
    // No Request, no session, no credential — so there is no branch where an
    // auth check could be forgotten, and nothing for a later change to remove.
    expect(loadPublicReplay).toHaveLength(1);
  });

  it('reads no credential anywhere in the replay read model or its routes', () => {
    // The DoD is "a logged-out viewer sees the timeline", and the way that is
    // normally faked is by deleting an auth check. This fails if any of the three
    // files grows one — which is the point: the property is checked, not asserted.
    //
    // COMMENTS ARE STRIPPED, because this file's own prose says "authenticated
    // viewer" and a scanner that reads prose reports the decision it is
    // documenting as the violation it is guarding against. The technique is the
    // one tests/unit/feature-package-isolation.test.ts and scaffold.test.ts use.
    // String literals are NOT stripped: `'Authorization'` as a header name is
    // code, and it is exactly what a credential read would look like.
    const files = [
      join(repoRoot, 'apps/web/src/replay-view.ts'),
      join(repoRoot, 'apps/web/app/replay/[replayId]/page.tsx'),
      join(repoRoot, 'apps/web/app/replay/[replayId]/og/route.tsx'),
    ];
    for (const file of files) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(code, `${file} must not reach for a credential`).not.toMatch(
        /auth\/server|getSession|readAuthEnvironment|Authorization|authenticate|\bauth\(/,
      );
    }
  });
});

/** Block and line comments replaced by a space, so a heading cannot merge into
 *  the code after it. Same technique, same reason, as the two tests above. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
