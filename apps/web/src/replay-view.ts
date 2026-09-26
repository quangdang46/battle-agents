import { buildPublicReplay, replayShareMetadata } from '@battle-agents/activity';
import type { ActivityEntry, ActivityLog, PublicReplay } from '@battle-agents/activity';
import { DrizzleActivityLog, DrizzleBattleRepository } from '@battle-agents/db';
import type { Database } from '@battle-agents/db';

import { sharedRuntime } from './shared-runtime.js';

/**
 * The public replay page's read model.
 *
 * ## There is no session parameter, and that is the logged-out DoD
 *
 * `ba-battle-replay-yjb`'s criterion is that a link shared with somebody who is
 * not logged in shows the full timeline, and the naive way to reach it is to
 * delete the auth check on an authenticated endpoint. This function has no
 * `Request`, no session and no credential to check, so a viewer who is nobody
 * reaches the same projection an authenticated viewer does. There is nothing to
 * remove later, because there is nothing there.
 *
 * ## The battle row is a locator, not a source
 *
 * One read of `battles` happens, and all it is asked is whether a battle exists
 * behind this link and what its internal id is. Everything a viewer sees is
 * built from the event log. The distinction is load-bearing rather than tidy: a
 * replay assembled from the bounty row, the battle row and the progression rows
 * duplicates truth the log already holds, and the copy drifts. A drifted copy
 * of a permanent public artefact is worse than no replay, because nothing about
 * it looks wrong. `replay-view.test.ts` pins the property by feeding the
 * projection a battles row that contradicts the log and asserting the beats do
 * not move.
 *
 * ## No feature imports a sibling
 *
 * The battle store comes from the battle feature's port and the log from the
 * activity feature's port, and neither package knows the other exists. Both
 * ports are checked against their implementations HERE rather than in either
 * package, because this is the only layer allowed to see a feature and
 * infrastructure at once.
 */

/** The payload key a feature stamps its own rows with. A caller's choice, not
 *  this package's vocabulary: the log knows a row can carry a tag, and which tag
 *  a battle uses is the battle feature's decision. */
const BATTLE_SCOPE_KEY = 'battleId';

export interface ReplayPage {
  /** Undefined when no battle answers to this link, which the page renders as a
   *  404. Not an empty replay: an id that matches nothing is a missing page, and
   *  a page that claims to be an expired replay for an id that never existed
   *  would be inventing a story about a battle it cannot see. */
  readonly replay: PublicReplay | undefined;
}

/**
 * What the assembly needs, named as the two capabilities it uses.
 *
 * Structural rather than the two concrete classes, so a caller can hand in a
 * store and a log without this module deciding which package they came from.
 */
export interface ReplaySources {
  /** Answers "is there a battle behind this handle", and nothing else. */
  readonly battles: {
    findByReplayId(replayId: string): Promise<{ readonly id: string } | undefined>;
  };
  readonly log: ActivityLog;
}

export async function loadPublicReplay(replayId: string): Promise<ReplayPage> {
  const { database } = await sharedRuntime();
  return assemblePublicReplay(
    { battles: battleStoreFor(database), log: activityLogFor(database) },
    replayId,
  );
}

/**
 * The whole public read, over injected sources.
 *
 * Split out from `loadPublicReplay` so the integration suite can drive the REAL
 * path — the locator, both log reads, the merge, the projection — against a
 * real database. The first version of that test called `readBattleTimeline` and
 * `buildPublicReplay` directly, which made its central claim ("the battles row
 * does not change the replay") true by construction: neither of those two
 * functions can see a battles row, so the test asserted a property of a path it
 * was not exercising, and a regression that moved the read into this assembly
 * would have left it green.
 */
export async function assemblePublicReplay(
  sources: ReplaySources,
  replayId: string,
): Promise<ReplayPage> {
  const battle = await sources.battles.findByReplayId(replayId);
  if (battle === undefined) return { replay: undefined };

  const entries = await readBattleTimeline(sources.log, battle.id);
  return { replay: buildPublicReplay({ replayId, entries }) };
}

export async function loadReplayShareMetadata(
  replayId: string,
  origin: string,
): Promise<ReturnType<typeof replayShareMetadata> | undefined> {
  const { replay } = await loadPublicReplay(replayId);
  return replay === undefined ? undefined : replayShareMetadata(replay, origin);
}

export type { PublicReplay } from '@battle-agents/activity';

/**
 * The heading and the standfirst, for a page that has no origin.
 *
 * The route tree may not import a feature — `no-route-handler-game-logic` in
 * architecture-rules.cjs is a pipeline stage, and it is right: a route that
 * reached into a feature would be the second place that knows a capability
 * exists. So the page takes these through this module, which is the one layer
 * allowed to see both. What crosses is already the projection, so the copy
 * cannot carry anything the allow-list refused.
 */
export function replayHeadline(replay: PublicReplay): {
  readonly title: string;
  readonly description: string;
} {
  const share = replayShareMetadata(replay, '');
  return { title: share.title, description: share.description };
}

/** The same copy with an absolute URL, for `og:url` and the canonical link. */
export function replayShare(
  replay: PublicReplay,
  origin: string,
): ReturnType<typeof replayShareMetadata> {
  return replayShareMetadata(replay, origin);
}

/**
 * Both halves of a battle's timeline, both from the log.
 *
 * Two reads, and the order matters. The first is the rows the battle stamped
 * with its own id, which is where the participant list lives: `battle.created`
 * and `battle.joined` both carry `participants`, and the last one to be written
 * is the roster. The second is the rows those participants' own runs produced,
 * which carry a session and no battle — a test run has no idea which battle it
 * is part of, and nothing in the ingest could tell it.
 *
 * LEARNING THE ROSTER FROM THE LOG is the point. `battle_participants` holds the
 * same list, is indexed for it, and would be one query instead of two. Reading
 * it would mean the roster a shared replay shows is the roster the table
 * currently says, which is a different question from "who was in this battle",
 * and the two are free to disagree — a participant row added by a migration, a
 * seed fixture, a retry. The brief names this as the first shortcut to avoid
 * and it is right: a replay that reads the table is a second account of the same
 * events.
 */
export async function readBattleTimeline(
  log: ActivityLog,
  battleId: string,
): Promise<readonly ActivityEntry[]> {
  const tagged = await log.scopedTimeline({ tagged: { key: BATTLE_SCOPE_KEY, value: battleId } });

  const sessions = new Set<string>();
  for (const entry of tagged) {
    if (entry.sessionId !== null && entry.sessionId.length > 0) sessions.add(entry.sessionId);
    for (const sessionId of stringArray(entry.payload['participants'])) sessions.add(sessionId);
  }
  if (sessions.size === 0) return tagged;

  const bySession = await log.scopedTimeline({ sessionIds: [...sessions] });

  // A row can satisfy both reads — `battle.joined` carries the battle tag AND a
  // session — so the merge is by sequence rather than a concatenation. A
  // duplicated beat is a viewer watching the same instant twice, and the
  // sequence is the log's own answer to which row is which.
  const merged = new Map<number, ActivityEntry>();
  for (const entry of [...tagged, ...bySession]) merged.set(entry.sequence, entry);
  return [...merged.values()].sort((left, right) => left.sequence - right.sequence);
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

/**
 * The activity port, checked where both sides are in scope.
 *
 * A return type rather than an assertion function, so the check is a compile
 * error and there is no runtime claim to keep honest.
 */
function activityLogFor(database: Database): ActivityLog {
  return new DrizzleActivityLog(database);
}

/**
 * The battle store, as the CONCRETE adapter and not as `BattleRepository` — and
 * the reason is scripts/removal-test.sh, not taste.
 *
 * That script deletes a feature by MOVING `packages/features/<name>` aside and
 * stripping its dependency from `apps/web/package.json` and the root tsconfig
 * before running the typecheck. Any file under `apps/web/src` that imports a
 * removable feature therefore cannot resolve after the strip, and the removal
 * test fails for a feature that is in fact perfectly removable. `composition.ts`
 * is the one exception, and only because the strip rewrites it. The first draft
 * of this file imported `BattleRepository` here and did exactly that.
 *
 * The conformance is NOT lost by typing this as the adapter: `battleFeature` in
 * the composition root takes a `BattleRepository`, and the line that hands it
 * `dependencies.battleStore` is a compile-time check of the same port against
 * the same class — including `findByReplayId`, which this bead added to both
 * sides. Restoring the import here would duplicate that check at the cost of
 * breaking a gate, which is the wrong trade in both directions.
 */
function battleStoreFor(database: Database): DrizzleBattleRepository {
  return new DrizzleBattleRepository(database);
}
