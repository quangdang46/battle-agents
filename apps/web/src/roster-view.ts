import {
  agentStats,
  agents,
  and,
  battleParticipants,
  bounties,
  eq,
  quests,
  sessions,
  sql,
} from '@battle-agents/db';
import type { Database } from '@battle-agents/db';
import type { RegisteredActionId } from '@battle-agents/protocol';

import { elapsedLabel } from './labels.js';
import { sharedApi } from './routes.js';
import { sharedRuntime } from './shared-runtime.js';

/**
 * The agent roster and the agent card, as two read models over one set of facts.
 *
 * ## The offline character is the whole point of this file
 *
 * Plan §8 and §3.2 both say the agent list shows online AND offline characters
 * with a last-seen value, and DESIGN.md restates it: "a dead session must never
 * make a character vanish". That is a property of the READ, and it is a
 * property that is easy to state and easy to lose — a roster built by joining
 * the character table against the live sessions and dropping the misses is the
 * obvious implementation, and it produces a board where everyone who went home
 * disappeared. So the roster is built from `agents` — every character, always —
 * and each one is then ANNOTATED with whatever its newest session says. Nobody
 * is ever removed for being quiet.
 *
 * The two assertions that a snapshot of the online case cannot make both live
 * in `tests/integration/web-ui-surface.test.ts`, against a real database: a
 * character whose session ENDED, and a character whose session is `active` but
 * whose heartbeat is older than the window. The second is the one a
 * `WHERE status = 'active'` filter gets wrong, because the row looks alive.
 *
 * ## Why the heartbeat window is declared here
 *
 * `packages/features/agent` owns `DEFAULT_HEARTBEAT_TIMEOUT_MS` (five minutes)
 * and `isHeartbeatStale`, and this file may not import either: the feature is
 * removable and `scripts/removal-test.sh` deletes it, its `apps/web` dependency
 * and its tsconfig path before it typechecks the tree. The number is therefore
 * declared here, and it is a second copy — the same coupling
 * `packages/protocol/src/session-limits.ts` exists to prevent, which is exactly
 * why that file exists: it holds the ONE number two removable features need.
 *
 * The fix is one export in protocol and a re-export from the agent feature, and
 * it is NOT this bead's: both live in removable packages and the removal test
 * is what makes the import illegal here.
 *
 * So this is a second copy and nothing keeps it equal. An earlier version of
 * this comment claimed a test asserted the two values matched, which was a claim
 * about a test that did not exist — and the test cannot exist here, because
 * asserting it would mean importing the agent feature into a unit test, which is
 * the coupling the removal test forbids. The honest form is the number being
 * visible in both files, which it now is: `DEFAULT_HEARTBEAT_TIMEOUT_MS` in
 * `packages/features/agent/src/session.ts`, and the constant above.
 */
const HEARTBEAT_WINDOW_MS = 5 * 60_000;

/** The listing, written out rather than imported. See `bounty-routes.ts`. */
const PROGRESSION_READ = 'progression.read' satisfies RegisteredActionId;

/** A status a spectator sees. Two, not five: the plan's example is binary. */
export type Presence = 'online' | 'offline';

/** One character, as the roster lists it. */
export interface RosterEntry {
  readonly id: string;
  readonly name: string;
  readonly harness: string;
  readonly level: number;
  readonly xp: number;
  readonly build: string;
  readonly presence: Presence;
  /** ISO, or null for a character that has never had a session. */
  readonly lastSeenAt: string | null;
  readonly lastSeenLabel: string;
  readonly sessionId: string | null;
  readonly sessionStatus: string | null;
  /**
   * The quest behind the bounty this character holds, when it holds one.
   *
   * `quests` has no assignee column, so "which quest is this character on" is
   * not a question the schema answers on its own. The one thing it does record
   * is a claim: a bounty with a `claimed_agent_id` and no completion is work in
   * flight, and that bounty names the quest it came from. So this is the quest
   * the character is demonstrably on, and it is null when they are on none —
   * which is a different answer from a title this read made up.
   */
  readonly currentQuest: string | null;
}

/** One character, as the card shows it. */
export interface AgentCard extends RosterEntry {
  readonly skills: readonly SkillBar[];
  /** False when the character has no progression record at all. */
  readonly hasProgress: boolean;
  readonly battlesWon: number;
  readonly battlesLost: number;
  readonly testsPassed: number;
  readonly pullRequestsMerged: number;
}

export interface SkillBar {
  readonly skill: string;
  readonly level: number;
  readonly xp: number;
}

/**
 * Every character, annotated.
 *
 * Ordered by level and then by name, so the board reads as a leaderboard without
 * inventing a score. There is no score: the progression feature deliberately
 * refuses a combined figure, and a page that added one back would be the second
 * answer to a question the feature answers by declining.
 */
export async function loadRoster(
  now: string = new Date().toISOString(),
): Promise<readonly RosterEntry[]> {
  const database = (await sharedRuntime()).database;
  const characters = await listCharacters(database);
  const sessionsByAgent = await latestSessionPerAgent(database);
  const questsByAgent = await heldQuestPerAgent(database);
  const api = await sharedApi();

  const entries = await Promise.all(
    characters.map(async (character) => {
      const progress = await readProgression(api, character.id);
      return toRosterEntry(
        character,
        sessionsByAgent.get(character.id),
        questsByAgent.get(character.id),
        progress,
        now,
      );
    }),
  );
  return entries.sort(
    (left, right) => right.level - left.level || left.name.localeCompare(right.name),
  );
}

/** One character, or undefined for an id no character answers to. */
export async function loadAgentCard(
  agentId: string,
  now: string = new Date().toISOString(),
): Promise<AgentCard | undefined> {
  const database = (await sharedRuntime()).database;
  const characters = await listCharacters(database);
  const character = characters.find((entry) => entry.id === agentId);
  if (character === undefined) return undefined;

  const sessionsByAgent = await latestSessionPerAgent(database);
  const questsByAgent = await heldQuestPerAgent(database);
  const progress = await readProgression(await sharedApi(), agentId);
  const entry = toRosterEntry(
    character,
    sessionsByAgent.get(agentId),
    questsByAgent.get(agentId),
    progress,
    now,
  );
  const stats = await battleRecordFor(database, agentId);
  return {
    ...entry,
    skills: progress.skills,
    hasProgress: progress.exists,
    battlesWon: stats.battlesWon,
    battlesLost: stats.battlesLost,
    testsPassed: stats.testsPassed,
    pullRequestsMerged: stats.prsMerged,
  };
}

/* ───────────────────────── the facts, read once each ───────────────────────── */

/** What the character table knows before any session is attached. */
export interface CharacterRow {
  readonly id: string;
  readonly name: string;
  readonly harness: string;
}

/** The newest session for a character, as the roster needs to see it. */
export interface SessionSummary {
  readonly id: string;
  readonly status: string;
  /** The last instant there is evidence the run was alive. */
  readonly lastSeenAt: string;
  readonly endedAt: string | null;
}

async function listCharacters(database: Database): Promise<readonly CharacterRow[]> {
  return database
    .select({ id: agents.id, name: agents.name, harness: agents.harness })
    .from(agents)
    .orderBy(agents.name);
}

/**
 * One session per character: the one that was alive most recently.
 *
 * Ordered newest-first and then folded, rather than a `DISTINCT ON` or a lateral
 * join. The reason is the fold is a total function of the ordering, so a
 * character with fifty sessions and a character with one are answered by the
 * same code path; and the reason there is no LIMIT is the one that matters —
 * a limit would silently turn a busy character into "never reported", which is
 * the exact failure this file exists to prevent. The cost is a full read of the
 * sessions table, which is the thing to change first when the roster is big
 * enough for it to be the slow part.
 */
async function latestSessionPerAgent(database: Database): Promise<Map<string, SessionSummary>> {
  const rows = await database
    .select({
      id: sessions.id,
      agentId: sessions.agentId,
      status: sessions.status,
      lastHeartbeatAt: sessions.lastHeartbeatAt,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .orderBy(
      sql`coalesce(${sessions.lastHeartbeatAt}, ${sessions.endedAt}, ${sessions.startedAt}) desc`,
    );

  const newest = new Map<string, SessionSummary>();
  for (const row of rows) {
    if (newest.has(row.agentId)) continue;
    // A session that has never reported a heartbeat is judged from when it
    // started, which is the same fallback the sweeper uses. Treating the absence
    // as "recent" would keep a run that died before its first report alive.
    const evidence = row.lastHeartbeatAt ?? row.startedAt;
    newest.set(row.agentId, {
      id: row.id,
      status: row.status,
      lastSeenAt: evidence.toISOString(),
      endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
    });
  }
  return newest;
}

/** The quest behind the bounty each character currently holds, when it holds one. */
async function heldQuestPerAgent(database: Database): Promise<Map<string, string>> {
  const rows = await database
    .select({ claimedAgentId: bounties.claimedAgentId, title: quests.title })
    .from(bounties)
    .innerJoin(quests, sql`${quests.id} = ${bounties.questId}`);

  const held = new Map<string, string>();
  for (const row of rows) {
    // First one wins, and the rows arrive in insertion order, so the answer is
    // the claim the character made first. A character holding two is holding a
    // bug, and the board says which one it sees rather than pretending there is
    // only ever one.
    if (row.claimedAgentId !== null && !held.has(row.claimedAgentId)) {
      held.set(row.claimedAgentId, row.title);
    }
  }
  return held;
}

/** The four counters the card shows, each read from the table that owns it. */
async function battleRecordFor(
  database: Database,
  agentId: string,
): Promise<{ battlesWon: number; battlesLost: number; testsPassed: number; prsMerged: number }> {
  const [stats] = await database
    .select({ testsPassed: agentStats.testsPassed, prsMerged: agentStats.prsMerged })
    .from(agentStats)
    .where(eq(agentStats.agentId, agentId))
    .limit(1);

  // A participant is a SESSION, never an agent, so every arena counter is a
  // join through `sessions` and not a column that happens to sit nearby. Getting
  // that wrong would credit a character's wins to every other character that ran
  // on the same machine.
  const [wins] = await database
    .select({ value: sql<number>`count(*)::int` })
    .from(battleParticipants)
    .innerJoin(sessions, eq(battleParticipants.sessionId, sessions.id))
    .where(and(eq(sessions.agentId, agentId), eq(battleParticipants.won, 1)));

  // A loss is a participant that was JUDGED and did not win. Unscored is not a
  // loss: it is a battle still running, and counting it as one would tell a
  // character it lost fights it is still fighting.
  const [losses] = await database
    .select({ value: sql<number>`count(*)::int` })
    .from(battleParticipants)
    .innerJoin(sessions, eq(battleParticipants.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.agentId, agentId),
        eq(battleParticipants.won, 0),
        sql`${battleParticipants.scoreJson} is not null`,
      ),
    );

  return {
    battlesWon: wins?.value ?? 0,
    battlesLost: losses?.value ?? 0,
    testsPassed: stats?.testsPassed ?? 0,
    prsMerged: stats?.prsMerged ?? 0,
  };
}

/* ───────────────────────── the progression command, checked ───────────────────────── */

interface ProgressionView {
  readonly level: number;
  readonly xp: number;
  readonly build: string;
  readonly exists: boolean;
  readonly skills: readonly SkillBar[];
}

/**
 * `progression.read`, narrowed and refused.
 *
 * The same reasoning as `readBountySummaries`: the response is `unknown`, the
 * feature that types it is removable, and a skill bar that renders `undefined`
 * is a card that lies about a character.
 *
 * Level and experience come through the command rather than off the `agents`
 * row, even though `DrizzleProgressionRepository.find` reads them from exactly
 * that row. The reason is not that the two disagree — they do not, and an
 * earlier version of this file claimed they might, which was wrong. The reason
 * is that the command is the read the CLI and the MCP tool make, so the board
 * agreeing with them is a fact about the surface rather than a coincidence
 * about a table.
 */
async function readProgression(
  api: Awaited<ReturnType<typeof sharedApi>>,
  agentId: string,
): Promise<ProgressionView> {
  const answer = await api.act(PROGRESSION_READ, { agentId });
  if (typeof answer !== 'object' || answer === null) {
    throw new UnreadableProgressionResponseError('top-level object');
  }
  const record = answer as Record<string, unknown>;
  return {
    level: numberField(record, 'level'),
    xp: numberField(record, 'xp'),
    build: stringField(record, 'build'),
    exists: record['exists'] === true,
    skills: readSkills(record['skills']),
  };
}

export class UnreadableProgressionResponseError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(
      `progression.read answered without a usable "${field}". An agent card that cannot read ` +
        'the sheet the game awards against would show a character who has done nothing, which ' +
        'is indistinguishable from a new player.',
    );
    this.name = 'UnreadableProgressionResponseError';
    this.field = field;
  }
}

function readSkills(value: unknown): readonly SkillBar[] {
  if (!Array.isArray(value)) throw new UnreadableProgressionResponseError('skills');
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new UnreadableProgressionResponseError(`skills[${String(index)}]`);
    }
    const record = entry as Record<string, unknown>;
    // Key and path are different strings: `skills[0].skill` is what a reader
    // needs to see, `skill` is what the object is keyed by. The first version
    // of this looked the path up as a key and every skill bar came back empty.
    const at = `skills[${String(index)}]`;
    return {
      skill: stringField(record, 'skill', `${at}.skill`),
      level: numberField(record, 'level', `${at}.level`),
      xp: numberField(record, 'xp', `${at}.xp`),
    };
  });
}

function stringField(record: Record<string, unknown>, key: string, path = key): string {
  const value = record[key];
  if (typeof value !== 'string') throw new UnreadableProgressionResponseError(path);
  return value;
}

function numberField(record: Record<string, unknown>, key: string, path = key): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UnreadableProgressionResponseError(path);
  }
  return value;
}

/* ───────────────────────── presence ───────────────────────── */

/**
 * Online means a run that is still reporting, not a run that has not been
 * closed.
 *
 * The distinction is the whole reason this is a function: `status = 'active'`
 * is what a row says, and a process killed between two heartbeats leaves that
 * row saying `active` for ever. A roster that trusted the column would show a
 * character who died this morning as busy this afternoon, which is the same
 * failure as hiding them — it is just a lie in the other direction.
 */
export function presenceOf(session: SessionSummary | undefined, now: string): Presence {
  if (session === undefined || session.status !== 'active') return 'offline';
  return Date.parse(now) - Date.parse(session.lastSeenAt) <= HEARTBEAT_WINDOW_MS
    ? 'online'
    : 'offline';
}

function toRosterEntry(
  character: CharacterRow,
  session: SessionSummary | undefined,
  currentQuest: string | undefined,
  progress: ProgressionView,
  now: string,
): RosterEntry {
  const lastSeenAt = session?.lastSeenAt ?? null;
  return {
    id: character.id,
    name: character.name,
    harness: character.harness,
    level: progress.level,
    xp: progress.xp,
    build: progress.build,
    presence: presenceOf(session, now),
    lastSeenAt,
    // A character with no session has never been seen, and "never" is a fact
    // this list can state. Rendering it as a duration would need a start instant
    // to measure from, and the character table's created_at is when a row was
    // written, which is not the same claim.
    lastSeenLabel: lastSeenAt === null ? 'never reported' : elapsedLabel(lastSeenAt, now),
    sessionId: session?.id ?? null,
    sessionStatus: session?.status ?? null,
    currentQuest: currentQuest ?? null,
  };
}
