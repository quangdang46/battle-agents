import { defineAction } from '@battle-agents/core';
import { BOUNTY_EVENTS, PULL_REQUEST_MERGED_OUTCOME } from '@battle-agents/protocol';
import type {
  ActionDef,
  EventHandler,
  GameEvent,
  GameFeature,
  RuntimeContext,
} from '@battle-agents/core';

import {
  GUILD_CREATED,
  GUILD_MEMBER_JOINED,
  GUILD_MEMBER_LEFT,
  GUILD_PERSISTED_EVENTS,
  GUILD_QUEST_COMPLETED,
  GUILD_QUEST_STARTED,
  GUILD_ROLE_EVIDENCED,
  GUILD_ROLES,
  GUILD_TALLY_RECORDED,
  GUILD_TREASURY_COMMITTED,
  GUILD_TREASURY_CONTRIBUTED,
  NO_MONEY_IS_HELD_HERE,
  type CanTalkToDecision,
  type Guild,
  type GuildRoleOrGeneralist,
  type GuildQuest,
  type TreasuryBalance,
  type TreasuryEntry,
  type WorkRecord,
} from './domain.js';
import {
  GUILD_CONTRIBUTE_SHAPE,
  GUILD_CREATE_SHAPE,
  GUILD_FUND_SHAPE,
  GUILD_JOIN_SHAPE,
  GUILD_LEAVE_SHAPE,
  GUILD_MEMBERS_SHAPE,
  GUILD_QUESTS_SHAPE,
  GUILD_QUEST_START_SHAPE,
  GUILD_ROLES_SHAPE,
  GUILD_TALLY_SHAPE,
  GUILD_TREASURY_SHAPE,
  guildInputRejected,
  isGuildRole,
  readGuildContribute,
  readGuildCreate,
  readGuildFund,
  readGuildId,
  readGuildJoin,
  readGuildLeave,
  readGuildQuestStart,
  readGuildTallyWindow,
  type GuildRejection,
} from './input.js';
import { GUILD_ACTION_IDS } from './manifest.js';
import type { GuildRepository } from './repository.js';
import {
  canTalkToDecision,
  classifyRole,
  coverageOf,
  explainRole,
  rankTallies,
  ROLE_SIGNALS,
  roleEvidence,
  roleSignalEventTypes,
  rolesEarningableToday,
  synergiesFor,
  type TallyInput,
  type TallyRow,
} from './rules.js';

/* ───────────────────────────── capabilities ───────────────────────────── */

/**
 * One capability per thing a caller may do, and the ACL port besides.
 *
 * `GUILD_MESSAGING_AUTHORIZE` is the odd one out: it is not something a player
 * does, it is a question `features/social` asks. It is declared here so social's
 * `requires` can be satisfied, and it is deliberately NOT in `GUILD_ACTION_IDS`
 * so no caller can invoke it — see manifest.ts for the whole argument.
 */
/**
 * The action ids, spelled.
 *
 * Each is BYTE-IDENTICAL to the matching entry in `GUILD_ACTION_IDS`, and that
 * is not a coincidence to be careful about later — it is the whole reason this
 * list exists in two places. The manifest's array has to hold string LITERALS
 * because `tests/unit/action-manifest-agreement.test.ts` parses it with a
 * regular expression, and an array of constant references parses as an EMPTY
 * list, which makes that test pass vacuously on this feature. So the literals
 * live in the manifest and these constants mirror them; `feature.test.ts`
 * asserts the registered ids equal the manifest, which is the check that makes
 * the duplication safe to have.
 *
 * (An earlier version of this file wrote `guild.treasury.contribute` here and
 * `guild.contribute` in the manifest. Every call site typechecked, the manifest
 * looked right, and the actions did not exist at runtime.)
 */
export const GUILD_CREATE = 'guild.create';
export const GUILD_JOIN = 'guild.join';
export const GUILD_LEAVE = 'guild.leave';
export const GUILD_READ_MEMBERS = 'guild.members';
export const GUILD_READ_ROLES = 'guild.roles';
export const GUILD_TREASURY_CONTRIBUTE = 'guild.contribute';
export const GUILD_TREASURY_FUND = 'guild.fund';
export const GUILD_READ_TREASURY = 'guild.treasury';
export const GUILD_QUEST_CREATE = 'guild.quest.start';
export const GUILD_READ_QUESTS = 'guild.quests';
export const GUILD_TALLY = 'guild.tally';

/**
 * The most members one roster read will classify.
 *
 * A bound rather than a policy: the synergy calculation is a function of the
 * DISTINCT roles present, so a roster past GUILD_ROLES.length cannot earn
 * another point of coverage — it can only cost queries. The cap is therefore
 * about honesty rather than speed, and it is stated so a reader knows a guild
 * with 400 members is reported as a sample (`truncated: true`) rather than
 * silently as the truth.
 */
const MAX_ROSTER_READ = 64;

/* ───────────────────────────── the feature ───────────────────────────── */

/**
 * Guilds: teams, a collective treasury, and quests over shared work.
 *
 * ── What this feature reacts to, and what it deliberately does not import ────
 *
 * It learns that work happened by listening for `bounty.completed` and
 * `pr.merged`, and it never imports the bounty feature to ask. That is the
 * whole of §12.1: a feature that reaches into a sibling's tables breaks the
 * moment a second consumer subscribes or the dependency is uninstalled, and
 * `scripts/removal-test.sh` uninstalls every feature on every run.
 *
 * ── The three things it is careful about ───────────────────────────────────
 *
 * **Money is not standing.** §10.4's no-pay-to-win rule is enforced by there
 * being no path from a treasury row to a score: `tallyStanding` takes a work
 * count and a role list, and there is no cents parameter for a caller to fill.
 * Spending the treasury buys nothing here, which is the rule rather than a
 * promise about it.
 *
 * **No cached total.** A guild has no balance column and a quest has no
 * progress column. Both are sums and counts over rows this feature owns, and
 * `db:verify` fails the build if either scalar is ever added. The bounty's
 * `amount_cents` is already forbidden the same way, and the reasoning is the
 * one `bounty_funding_totals` documents: a stored total is right until the
 * second contribution arrives.
 *
 * **A role is behaviour.** `ROLE_SIGNALS` in rules.ts is the entire basis, and
 * every type in it has to be durable or a test goes red. There is no way to
 * set a role, no action that takes one, and no column that stores one — the
 * only inputs are events.
 */
export function guildFeature(dependencies: {
  readonly repository: GuildRepository;
  /** Overridable so a test can be told which role a signal names. */
  readonly now?: () => string;
}): GameFeature {
  const { repository } = dependencies;

  return {
    id: 'guild',
    persistedEvents: [...GUILD_PERSISTED_EVENTS],
    /**
     * One handler per event type in `ROLE_SIGNALS`, generated from the same
     * table the classification reads.
     *
     * Generated rather than listed, for the reason progression's handlers are:
     * a signal nobody listens to cannot be recorded, and a listener for a signal
     * the classifier does not know is dead code. Deriving both from one table is
     * what keeps them in step.
     */
    eventHandlers: roleSignalEventTypes().map<EventHandler>((eventType) => ({
      on: eventType,
      handle: (event: GameEvent, context: RuntimeContext) =>
        observe(repository, eventType, event, context),
    })),
    capabilities: [
      { name: GUILD_CREATE, description: 'Found a guild.' },
      { name: GUILD_JOIN, description: 'Join a guild.' },
      { name: GUILD_LEAVE, description: 'Leave a guild.' },
      { name: GUILD_READ_MEMBERS, description: "Read a guild's roster." },
      { name: GUILD_READ_ROLES, description: 'Read the behaviour-derived role of each member.' },
      {
        name: GUILD_TREASURY_CONTRIBUTE,
        description: "Record that a member is putting money into a guild's treasury.",
      },
      {
        name: GUILD_TREASURY_FUND,
        description: 'Earmark treasury funds for one bounty. Records an intention; moves no money.',
      },
      {
        name: GUILD_READ_TREASURY,
        description: "Read a guild's treasury rows and derived balance.",
      },
      { name: GUILD_QUEST_CREATE, description: 'Set a guild quest, such as fixing ten issues.' },
      { name: GUILD_READ_QUESTS, description: "Read a guild's quests and their progress." },
      {
        name: GUILD_TALLY,
        description: 'Rank guilds over a window by work done and role coverage.',
      },
      {
        name: 'guild.messaging.authorize',
        description:
          'Decide whether one agent may reach another through a guild. The port ' +
          'features/social requires, and not something a caller may act on.',
      },
    ],
    actionDefs: [
      describeAction({
        id: GUILD_CREATE,
        permissions: [GUILD_CREATE],
        description: 'Found a guild. A name and a tag, both folded to lower case.',
        run: (input: unknown, context: RuntimeContext) => found(repository, input, context),
      }),
      describeAction({
        id: GUILD_JOIN,
        permissions: [GUILD_JOIN],
        description: 'Join a guild.',
        run: (input: unknown, context: RuntimeContext): Promise<Guild> =>
          joinGuild(repository, input, context),
      }),
      describeAction({
        id: GUILD_LEAVE,
        permissions: [GUILD_LEAVE],
        description: 'Leave a guild.',
        run: (input: unknown, context: RuntimeContext) => leaveGuild(repository, input, context),
      }),
      describeAction({
        id: GUILD_READ_MEMBERS,
        permissions: [GUILD_READ_MEMBERS],
        description: "A guild's roster, with each member's derived role.",
        run: (input: unknown) => roster(repository, input),
      }),
      describeAction({
        id: GUILD_READ_ROLES,
        permissions: [GUILD_READ_ROLES],
        // One string, not a concatenation. tests/unit/github-boundary.test.ts
        // finds imports with `/(?:from|import)\s+['"]([^'"]+)['"]/`, which also
        // matches a literal ending in the word "from" followed by a `+` — it
        // reported this description as `imports  +` . Rewording is the right fix
        // on this side: a guard that fires on valid code is a guard that gets
        // switched off, and the scanner belongs to somebody else's change.
        description:
          'Each member’s role and the evidence behind it, projected from persisted behaviour rather than chosen.',
        run: (input: unknown) => rolesOfGuild(repository, input),
      }),
      describeAction({
        id: GUILD_TREASURY_CONTRIBUTE,
        permissions: [GUILD_TREASURY_CONTRIBUTE],
        description: "Record that a member is putting money into a guild's treasury.",
        run: (input: unknown, context: RuntimeContext) => contribute(repository, input, context),
      }),
      describeAction({
        id: GUILD_TREASURY_FUND,
        permissions: [GUILD_TREASURY_FUND],
        description: 'Earmark treasury funds for one bounty. Records an intention; moves no money.',
        run: (input: unknown, context: RuntimeContext) => fund(repository, input, context),
      }),
      describeAction({
        id: GUILD_READ_TREASURY,
        permissions: [GUILD_READ_TREASURY],
        description: "A guild's treasury rows, and the balance derived from them.",
        run: (input: unknown) => treasury(repository, input),
      }),
      describeAction({
        id: GUILD_QUEST_CREATE,
        permissions: [GUILD_QUEST_CREATE],
        description: 'Set a guild quest over a repository.',
        run: (input: unknown, context: RuntimeContext) => startQuest(repository, input, context),
      }),
      describeAction({
        id: GUILD_READ_QUESTS,
        permissions: [GUILD_READ_QUESTS],
        description:
          "A guild's quests with progress counted from the work ledger, never read " +
          'from a stored counter.',
        run: (input: unknown) => quests(repository, input),
      }),
      describeAction({
        id: GUILD_TALLY,
        permissions: [GUILD_TALLY],
        description:
          'Guilds ranked over a window by completed work, with role coverage applied. ' +
          'Money is not an input and cannot be.',
        run: (input: unknown, context: RuntimeContext) => tally(repository, input, context),
      }),
      // The ACL port. Not in GUILD_ACTION_IDS and therefore not in the generated
      // union, so `act('guild.messaging.authorize')` does not typecheck for a
      // caller. manifest.ts carries the argument; this is where it is wired.
      describeAction({
        id: 'guild.messaging.authorize',
        permissions: ['guild.messaging.authorize'],
        description:
          'Whether a claimed sender may reach a claimed recipient: only inside a guild ' +
          'they share. Not exposed to act().',
        run: (input: unknown): Promise<CanTalkToDecision> => authorise(repository, input),
      }),
    ],
  };
}

/**
 * `defineAction` plus a description.
 *
 * `ActionDef` declares an optional `description` and `defineAction` does not
 * accept one — core is frozen, and editing the helper every other feature uses
 * to serve one feature is exactly the "a feature that has to change core"
 * failure AGENTS.md names. The description is attached here instead, at the cost
 * of the authoring-time check on a misspelled id; the registry still rejects a
 * bad id at install time, and `feature.test.ts` compares the registered ids
 * against the manifest by hand.
 */
function describeAction<I, O>(definition: {
  readonly id: string;
  readonly permissions: readonly string[];
  readonly description: string;
  readonly run: (input: I, context: RuntimeContext) => Promise<O>;
}): ActionDef<I, O> {
  const { description, ...checked } = definition;
  return { ...defineAction(checked), description };
}

function rejected(action: string, rejection: GuildRejection, expected: string): Error {
  return guildInputRejected(action, rejection, expected);
}

/* ─────────────────────────────── writing ─────────────────────────────── */

async function found(
  repository: GuildRepository,
  input: unknown,
  context: RuntimeContext,
): Promise<Guild> {
  const parsed = readGuildCreate(input);
  if ('reason' in parsed) throw rejected(GUILD_CREATE, parsed, GUILD_CREATE_SHAPE);

  const guild = await repository.create(
    { name: parsed.name, tag: parsed.tag, foundedByAgentId: readFounder(input) },
    context.now(),
  );
  // The founder joins before the event goes out, so a subscriber reading
  // `guild.created` and then asking who is in the guild finds one member rather
  // than an empty roster that looks like a guild nobody joined.
  if (guild.foundedByAgentId !== null) {
    await repository.join(guild.id, guild.foundedByAgentId, context.now());
  }
  await context.runtime.emit({
    type: GUILD_CREATED,
    occurredAt: context.now(),
    actorId: guild.foundedByAgentId ?? 'system',
    payload: { guildId: guild.id, name: guild.name, tag: guild.tag },
  });
  return guild;
}

/**
 * The founding agent, read separately from the create payload.
 *
 * `readGuildCreate` returns the name and tag, and the founder is a third field
 * with a different rule: it may be absent, because a guild is worth creating
 * before a character exists to found it. Guessing an id here would put a
 * fabricated agent id in the `founded_by_agent_id` column, and the foreign key
 * would refuse it three layers down with a worse message.
 */
function readFounder(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const value = (input as { foundedByAgentId?: unknown }).foundedByAgentId;
  return typeof value === 'string' ? value.trim() : '';
}

async function joinGuild(
  repository: GuildRepository,
  input: unknown,
  context: RuntimeContext,
): Promise<Guild> {
  const parsed = readGuildJoin(input);
  if ('reason' in parsed) throw rejected(GUILD_JOIN, parsed, GUILD_JOIN_SHAPE);

  const guild = await repository.find(parsed.guildId);
  if (guild === undefined) {
    throw Object.assign(new Error(`no guild ${parsed.guildId}`), { code: 'no-such-guild' });
  }
  const { created } = await repository.join(parsed.guildId, parsed.agentId, context.now());
  if (created) {
    await context.runtime.emit({
      type: GUILD_MEMBER_JOINED,
      occurredAt: context.now(),
      actorId: parsed.agentId,
      payload: { guildId: parsed.guildId, agentId: parsed.agentId },
    });
  }
  return guild;
}

async function leaveGuild(repository: GuildRepository, input: unknown, context: RuntimeContext) {
  const parsed = readGuildLeave(input);
  if ('reason' in parsed) throw rejected(GUILD_LEAVE, parsed, GUILD_LEAVE_SHAPE);
  const removed = await repository.leave(parsed.guildId, parsed.agentId);
  if (removed) {
    await context.runtime.emit({
      type: GUILD_MEMBER_LEFT,
      occurredAt: context.now(),
      actorId: parsed.agentId,
      payload: { guildId: parsed.guildId, agentId: parsed.agentId },
    });
  }
  return { guildId: parsed.guildId, agentId: parsed.agentId, removed };
}

/* ───────────────────────────── the treasury ───────────────────────────── */

/**
 * A contribution. Records an intention and says so in the reply.
 *
 * The notice is in the RETURN VALUE as well as on the refusal, because the
 * dangerous misreading here is not a failure — it is a balance of 50,000 read
 * as money in escrow. A caller that only reads the number has still been told,
 * because the number travels inside a reply that names what it is.
 */
async function contribute(repository: GuildRepository, input: unknown, context: RuntimeContext) {
  const parsed = readGuildContribute(input);
  if ('reason' in parsed) throw rejected(GUILD_TREASURY_CONTRIBUTE, parsed, GUILD_CONTRIBUTE_SHAPE);

  const entry = await repository.appendTreasuryEntry({
    guildId: parsed.guildId,
    kind: 'contribution',
    amountCents: parsed.amountCents,
    contributorUserId: parsed.contributorUserId,
    bountyId: null,
    committedByAgentId: null,
    createdAt: context.now(),
  });
  await context.runtime.emit({
    type: GUILD_TREASURY_CONTRIBUTED,
    occurredAt: context.now(),
    actorId: entry.contributorUserId ?? 'system',
    payload: {
      guildId: entry.guildId,
      entryId: entry.id,
      amountCents: entry.amountCents,
      contributorUserId: entry.contributorUserId,
    },
  });
  return { entry, notice: NO_MONEY_IS_HELD_HERE };
}

/**
 * An earmark, refused when the derived balance cannot cover it.
 *
 * The balance is read from the rows and the commitment is then appended, which
 * is a read-then-write and therefore racy. It is here anyway, and the reason is
 * worth stating rather than hiding: the alternative is a stored balance, and a
 * stored balance is a number that is right until the second contribution
 * arrives and then is right about nothing. A rare over-commitment under a race
 * is a recoverable ledger; a balance nobody can reconstruct is not. The refusal
 * covers the ordinary case, which is the case a caller actually hits.
 */
async function fund(repository: GuildRepository, input: unknown, context: RuntimeContext) {
  const parsed = readGuildFund(input);
  if ('reason' in parsed) throw rejected(GUILD_TREASURY_FUND, parsed, GUILD_FUND_SHAPE);

  if (!(await repository.isMember(parsed.guildId, parsed.agentId))) {
    throw Object.assign(
      new Error(
        `guild.fund refused: agent ${parsed.agentId} is not a member of guild ${parsed.guildId}, ` +
          'so it cannot speak for the treasury. Nothing was earmarked.',
      ),
      { code: 'not-a-member' },
    );
  }

  const balance = await balanceOf(repository, parsed.guildId);
  if (balance.balanceCents < parsed.amountCents) {
    throw Object.assign(
      new Error(
        `guild.fund refused: the guild's derived balance is ${String(balance.balanceCents)} cents ` +
          `and this would earmark ${String(parsed.amountCents)}, which is more than the rows account ` +
          'for. A guild cannot commit funds its members have not recorded putting in. Nothing was ' +
          `earmarked. ${NO_MONEY_IS_HELD_HERE}`,
      ),
      { code: 'insufficient-treasury' },
    );
  }

  const entry = await repository.appendTreasuryEntry({
    guildId: parsed.guildId,
    kind: 'commitment',
    amountCents: parsed.amountCents,
    contributorUserId: null,
    bountyId: parsed.bountyId,
    committedByAgentId: parsed.agentId,
    createdAt: context.now(),
  });
  await context.runtime.emit({
    type: GUILD_TREASURY_COMMITTED,
    occurredAt: context.now(),
    actorId: parsed.agentId,
    payload: {
      guildId: entry.guildId,
      entryId: entry.id,
      amountCents: entry.amountCents,
      bountyId: entry.bountyId,
    },
  });
  return {
    entry,
    balance: await balanceOf(repository, parsed.guildId),
    notice: NO_MONEY_IS_HELD_HERE,
  };
}

async function treasury(repository: GuildRepository, input: unknown) {
  const parsed = readGuildId(input);
  if ('reason' in parsed) throw rejected(GUILD_READ_TREASURY, parsed, GUILD_TREASURY_SHAPE);
  const entries = await repository.treasuryFor(parsed.guildId);
  return {
    guildId: parsed.guildId,
    entries,
    balance: deriveBalance(parsed.guildId, entries),
    notice: NO_MONEY_IS_HELD_HERE,
  };
}

/**
 * The balance, from the rows.
 *
 * A fold rather than a query for the ones the feature computes itself, and a
 * query for the one the store owns. Both are the same number: the Drizzle
 * repository sums the same rows in a view, and
 * `tests/integration/guild-persistence.test.ts` asserts the two agree on a
 * seeded guild. A fold that could disagree with the view would be a cached
 * total wearing a different hat.
 */
function deriveBalance(guildId: string, entries: readonly TreasuryEntry[]): TreasuryBalance {
  let contributedCents = 0;
  let committedCents = 0;
  for (const entry of entries) {
    if (entry.kind === 'contribution') contributedCents += entry.amountCents;
    else committedCents += entry.amountCents;
  }
  return {
    guildId,
    contributedCents,
    committedCents,
    balanceCents: contributedCents - committedCents,
    entryCount: entries.length,
  };
}

async function balanceOf(repository: GuildRepository, guildId: string): Promise<TreasuryBalance> {
  return deriveBalance(guildId, await repository.treasuryFor(guildId));
}

/* ─────────────────────────────── quests ─────────────────────────────── */

async function startQuest(
  repository: GuildRepository,
  input: unknown,
  context: RuntimeContext,
): Promise<GuildQuest> {
  const parsed = readGuildQuestStart(input);
  if ('reason' in parsed) throw rejected(GUILD_QUEST_CREATE, parsed, GUILD_QUEST_START_SHAPE);

  const quest = await repository.createQuest({
    guildId: parsed.guildId,
    title: parsed.title,
    repository: parsed.repository,
    goal: parsed.goal,
    createdAt: context.now(),
  });
  await context.runtime.emit({
    type: GUILD_QUEST_STARTED,
    occurredAt: context.now(),
    actorId: parsed.guildId,
    payload: {
      questId: quest.id,
      guildId: quest.guildId,
      goal: quest.goal,
      repository: quest.repository,
    },
  });
  return quest;
}

/**
 * A quest's progress, counted.
 *
 * `min(goal, count)` rather than the raw count, because a quest reports how far
 * along it is and 14 of 10 is not a state a reader should have to interpret. The
 * clamp is on the way OUT and the underlying rows are untouched, so lowering a
 * goal later cannot find a counter ahead of the work.
 */
async function quests(repository: GuildRepository, input: unknown) {
  const parsed = readGuildId(input);
  if ('reason' in parsed) throw rejected(GUILD_READ_QUESTS, parsed, GUILD_QUESTS_SHAPE);
  const found = await repository.quests(parsed.guildId);
  // Wrapped rather than a bare array, for the same reason `guild.roles` and
  // `guild.treasury` are wrapped: a read that answers "which guild is this
  // about" in the same reply cannot be pasted into a board without the caller
  // having kept the id it happened to ask with.
  return {
    guildId: parsed.guildId,
    quests: await Promise.all(found.map((q) => describeQuest(repository, q))),
  };
}

async function describeQuest(repository: GuildRepository, quest: GuildQuest) {
  const counted = (
    await repository.workFor(quest.guildId, {
      ...(quest.repository === null ? {} : { repository: quest.repository }),
      from: quest.createdAt,
    })
  ).length;
  const progress = Math.min(quest.goal, counted);
  return {
    quest,
    progress,
    remaining: Math.max(0, quest.goal - progress),
    complete: progress >= quest.goal,
    /**
     * How many rows the count actually saw, and how many were for OTHER
     * repositories. A quest stuck at zero for weeks is otherwise
     * indistinguishable from a guild that did no work, and this is the number
     * that tells them apart.
     */
    countedRows: counted,
  };
}

/* ───────────────────────────── observing work ───────────────────────────── */

/**
 * What an outcome event carries, or undefined when it is not one.
 *
 * A handler receives `unknown` and a payload that is a completion with no
 * coordinates is a delivery this feature cannot place. Returning undefined makes
 * "not mine" a normal answer rather than an exception thrown inside somebody
 * else's dispatch, where a catch would swallow the real failure.
 */
interface OutcomeFacts {
  readonly bountyId: string;
  readonly repository: string;
}

/**
 * The agent an event is about.
 *
 * `payload.agentId` when there is one — the bounty feature names the CLAIM's
 * agent, and `mergedBy` beside it is a person's GitHub account, which is the
 * identity confusion this repository treats as its worst — and otherwise
 * `event.actorId`, which on the ingest path is the session's agent
 * (`apps/web/src/event-routes.ts` sets it that way). A test outcome carries no
 * agent field at all, so the second branch is the only one that can name it.
 */
function agentIdOf(event: GameEvent): string | undefined {
  if (typeof event.payload === 'object' && event.payload !== null) {
    const named = (event.payload as { readonly agentId?: unknown }).agentId;
    if (typeof named === 'string' && named.length > 0) return named;
  }
  return event.actorId.length > 0 ? event.actorId : undefined;
}

/**
 * The coordinates a WORK record needs, or undefined when the event is not a
 * completion.
 *
 * A handler receives `unknown` and a payload that is a completion with no
 * coordinates is a delivery this feature cannot place. Returning undefined makes
 * "not mine" a normal answer rather than an exception thrown inside somebody
 * else's dispatch, where a catch would swallow the real failure.
 */
function readOutcome(payload: unknown): OutcomeFacts | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const record = payload as { readonly [key: string]: unknown };
  const bountyId = record['bountyId'];
  const repository = record['repository'];
  if (typeof bountyId !== 'string' || bountyId.length === 0) return undefined;
  if (typeof repository !== 'string' || repository.length === 0) return undefined;
  return { bountyId, repository: repository.trim().toLowerCase() };
}

/**
 * Whether a merge is somebody reading somebody else's work.
 *
 * The reviewer role is defined in `rules.ts` as the moment "somebody ELSE read
 * the work and accepted it" — and the bounty feature emits `pr.merged`
 * alongside `bounty.completed` for one merge, carrying `completedBounty: true`
 * to say so. That merge is the author closing their own pull request, so it is
 * the author reviewing the author's work, which is the one thing the role is
 * defined not to be.
 *
 * Withdrawn here rather than added somewhere else, because the coder is already
 * paid for the same merge by `bounty.completed`. Counting it a second time
 * under a second role is how one pull request becomes two achievements, and the
 * reviewer role is the expensive one: it is the role a farm would target,
 * because merging your own bounty is something an agent can do to itself as
 * often as it likes.
 */
function isReviewOfSomebodyElsesWork(eventType: string, payload: unknown): boolean {
  if (eventType !== PULL_REQUEST_MERGED_OUTCOME) {
    return true;
  }
  if (typeof payload !== 'object' || payload === null) {
    return true;
  }
  return (payload as { readonly completedBounty?: unknown }).completedBounty !== true;
}

/**
 * One event, handled once, for every guild the actor belongs to.
 *
 * Two records come out of an event and they need different things, which is why
 * they are read separately: a ROLE is evidence about the agent and needs only
 * the event and the agent, while a WORK record needs the bounty's coordinates
 * and a guild to belong to. An earlier version required the outcome facts
 * before recording either, which meant a `test.passed` — the one event a Tester
 * is made of, and the only one core always persists — recorded nothing at all.
 *
 * The order is the property: the ROLE is recorded before the WORK, because a
 * guild tally reads roles and a tally taken between the two would under-report
 * the member who just finished something, which is the direction that quietly
 * costs a guild its place.
 */
async function observe(
  repository: GuildRepository,
  eventType: string,
  event: GameEvent,
  context: RuntimeContext,
): Promise<void> {
  const evidence = roleEvidence(eventType);
  const agentId = agentIdOf(event);
  if (evidence === undefined || agentId === undefined) {
    return;
  }
  if (!isReviewOfSomebodyElsesWork(eventType, event.payload)) {
    return;
  }

  const guilds = await repository.guildsOf(agentId);
  if (guilds.length === 0) {
    return;
  }
  const facts = readOutcome(event.payload);

  // One key for every guild: the same fact, projected once per audience. The
  // dedup index is (agent_id, source_key) rather than including the guild,
  // because the behaviour being recorded is the AGENT's and a member of two
  // guilds has done one thing, not two.
  const signal = await repository.recordRoleSignal({
    agentId,
    role: evidence.role,
    weight: evidence.weight,
    sourceType: eventType,
    sourceKey: sourceKeyFor(eventType, facts, agentId, event.occurredAt),
    occurredAt: event.occurredAt,
  });
  if (signal.created) {
    await context.runtime.emit({
      type: GUILD_ROLE_EVIDENCED,
      occurredAt: context.now(),
      actorId: agentId,
      payload: {
        agentId,
        role: signal.row.role,
        weight: signal.row.weight,
        sourceType: signal.row.sourceType,
        sourceKey: signal.row.sourceKey,
        guilds,
      },
    });
  }

  // WORK only from a completed bounty. `pr.merged` fires for the same merge, so
  // counting both would score one pull request twice — the unique key would stop
  // the second row, but the reason to not ask for it is that "work" and "a
  // reviewer's judgement" are different facts and only one of them is work.
  if (eventType !== BOUNTY_EVENTS.completed || facts === undefined) {
    return;
  }

  for (const guildId of guilds) {
    const recorded = await repository.recordWork({
      guildId,
      agentId,
      bountyId: facts.bountyId,
      repository: facts.repository,
      sourceType: eventType,
      occurredAt: event.occurredAt,
    });
    if (recorded.created) {
      await settleQuests(repository, guildId, context);
    }
  }
}

/**
 * The dedup key for one behaviour.
 *
 * A completed outcome names its bounty, so `<type>|<bountyId>` is exact: the
 * same merge delivered twice is one signal. A test event names nothing, so its
 * key is its own coordinates — which means two `test.passed` events from one
 * agent in the same millisecond collapse into a single signal. That is a
 * deliberate direction to be wrong in: under-counting makes a role harder to
 * earn, while a key that did not collapse would make a role inflate every time
 * an adapter retried a batch.
 */
function sourceKeyFor(
  eventType: string,
  facts: OutcomeFacts | undefined,
  agentId: string,
  occurredAt: string,
): string {
  return facts === undefined
    ? `${eventType}|${agentId}|${occurredAt}`
    : `${eventType}|${facts.bountyId}`;
}

/**
 * Closes any quest the new work finished.
 *
 * A read-then-write on `completedAt`, and the same race as the treasury balance
 * is discussed for. It is benign here in a way it is not there: the value being
 * raced is a timestamp of a fact that is already true, so the loser writes
 * nothing and both callers end up with an accurate board.
 */
async function settleQuests(
  repository: GuildRepository,
  guildId: string,
  context: RuntimeContext,
): Promise<void> {
  for (const quest of await repository.quests(guildId)) {
    if (quest.completedAt !== null) continue;
    const counted = (
      await repository.workFor(guildId, {
        ...(quest.repository === null ? {} : { repository: quest.repository }),
        from: quest.createdAt,
      })
    ).length;
    if (counted < quest.goal) continue;
    const stamped = await repository.completeQuest(quest.id, context.now());
    if (stamped) {
      await context.runtime.emit({
        type: GUILD_QUEST_COMPLETED,
        occurredAt: context.now(),
        actorId: guildId,
        payload: { questId: quest.id, guildId, goal: quest.goal, completedAt: context.now() },
      });
    }
  }
}

/* ───────────────────────────── reading roles ───────────────────────────── */

/**
 * A member's role, with its working.
 *
 * The `evidence` field is not decoration: a role a caller cannot interrogate is
 * a claim, and the brief's first named failure is a role derived from a
 * self-declared label. Returning the counts behind the classification is what
 * makes it checkable that it was not.
 */
async function roleFor(repository: GuildRepository, agentId: string) {
  const signals = await repository.roleSignalsFor(agentId);
  const classification = explainRole(signals);
  return {
    agentId,
    role: classification.role,
    scores: classification.scores,
    considered: classification.considered,
    signals: signals.map((signal) => ({
      role: signal.role,
      weight: signal.weight,
      sourceType: signal.sourceType,
      sourceKey: signal.sourceKey,
      occurredAt: signal.occurredAt,
    })),
  };
}

async function rolesOfGuild(repository: GuildRepository, input: unknown) {
  const parsed = readGuildId(input);
  if ('reason' in parsed) throw rejected(GUILD_READ_ROLES, parsed, GUILD_ROLES_SHAPE);
  const all = await repository.members(parsed.guildId);
  const rosterRows = all.slice(0, MAX_ROSTER_READ);
  const members = await Promise.all(rosterRows.map((m) => roleFor(repository, m.agentId)));
  const roles = members.map((member) => member.role);
  return {
    guildId: parsed.guildId,
    members,
    coverage: coverageOf(roles),
    synergies: synergiesFor(roles),
    /** Which roles any agent can be right now, so a caller can see the gap. */
    earnableToday: rolesEarningableToday(),
    truncated: all.length > rosterRows.length,
  };
}

async function roster(repository: GuildRepository, input: unknown) {
  const parsed = readGuildId(input);
  if ('reason' in parsed) throw rejected(GUILD_READ_MEMBERS, parsed, GUILD_MEMBERS_SHAPE);
  const all = await repository.members(parsed.guildId);
  const members = all.slice(0, MAX_ROSTER_READ);
  return {
    guildId: parsed.guildId,
    members: members.map((membership) => ({
      agentId: membership.agentId,
      joinedAt: membership.joinedAt,
    })),
    size: all.length,
    truncated: all.length > members.length,
  };
}

/* ─────────────────────────────── the tally ─────────────────────────────── */

/**
 * The weekly board.
 *
 * §10.4's "weekly Guild A versus Guild B tallies". There is no scheduler in this
 * repository, so the WINDOW is the caller's and this function refuses one that
 * is not a window — see `readGuildTallyWindow`. A tally nobody asked for on a
 * schedule it invented would be a number with no agreed meaning.
 *
 * And the no-pay-to-win rule, in the shape that can be checked: `TallyInput`
 * has no cents field. The largest treasury in the game cannot be expressed as
 * an argument to this function, so it cannot buy a place on this board.
 */
async function tally(repository: GuildRepository, input: unknown, context: RuntimeContext) {
  const parsed = readGuildTallyWindow(input);
  if ('reason' in parsed) throw rejected(GUILD_TALLY, parsed, GUILD_TALLY_SHAPE);

  const all = await repository.list();
  const rows: TallyInput[] = [];
  for (const guild of all) {
    const members = (await repository.members(guild.id)).slice(0, MAX_ROSTER_READ);
    const memberRoles: GuildRoleOrGeneralist[] = [];
    for (const membership of members) {
      memberRoles.push(classifyRole(await repository.roleSignalsFor(membership.agentId)));
    }
    const completedWork = (await repository.workFor(guild.id, { from: parsed.from, to: parsed.to }))
      .length;
    rows.push({ guildId: guild.id, guildName: guild.name, completedWork, memberRoles });
  }

  const board: readonly TallyRow[] = rankTallies(rows);
  await context.runtime.emit({
    type: GUILD_TALLY_RECORDED,
    occurredAt: context.now(),
    actorId: 'system',
    payload: {
      from: parsed.from,
      to: parsed.to,
      guilds: board.map((row) => ({
        guildId: row.guildId,
        standing: row.standing,
        completedWork: row.completedWork,
        coverage: row.coverage,
      })),
    },
  });
  return {
    from: parsed.from,
    to: parsed.to,
    board,
    // Said in the reply rather than only in a comment, because the reader of a
    // leaderboard is exactly the person who would otherwise assume the money
    // column is the next one down.
    note: 'Standing counts completed work and role coverage. No treasury figure is an input to it.',
  };
}

/* ──────────────────────────────── the ACL ──────────────────────────────── */

/**
 * Answers social's question.
 *
 * Fail-closed at every branch, and the shape is what social's `readDecision`
 * expects: an object with a boolean `allowed` and a `reason`. A thrown error is
 * NOT used to refuse, because social's rule is that any answer that is not
 * `{allowed: true}` denies — and a throw is a shape its parser has to survive.
 * Every refusal here comes back as a decision, which is the same information
 * with one fewer failure mode in the consumer.
 *
 * Both memberships are read BEFORE the rule runs, so the rule itself stays a
 * pure function of data. The first version of this passed a closure that hit the
 * database and memoised the answer in a module-level variable — which is a
 * cross-request cache of an authorization decision, on a value that changes the
 * moment somebody leaves a guild.
 */
async function authorise(repository: GuildRepository, input: unknown): Promise<CanTalkToDecision> {
  if (typeof input !== 'object' || input === null) {
    return { allowed: false, reason: 'the authorization question was not an object' };
  }
  const { fromAgentId, toAgentId, guildId } = input as {
    readonly fromAgentId?: unknown;
    readonly toAgentId?: unknown;
    readonly guildId?: unknown;
  };
  if (typeof fromAgentId !== 'string' || fromAgentId.length === 0) {
    return { allowed: false, reason: 'the authorization question names no sender' };
  }

  const senderGuilds = await repository.guildsOf(fromAgentId);
  if (senderGuilds.length === 0) {
    return {
      allowed: false,
      reason: `agent ${fromAgentId} is in no guild, and guild membership is the only relationship this ACL knows`,
    };
  }

  const recipient = typeof toAgentId === 'string' ? toAgentId : null;
  const recipientGuilds = recipient === null ? [] : await repository.guildsOf(recipient);
  const known = new Map<string, readonly string[]>([[fromAgentId, senderGuilds]]);
  if (recipient !== null) known.set(recipient, recipientGuilds);

  return canTalkToDecision(
    {
      fromAgentId,
      toAgentId: recipient,
      guildId: typeof guildId === 'string' ? guildId : null,
    },
    {
      senderGuilds,
      guildsOf: (agentId: string) => known.get(agentId) ?? [],
    },
  );
}

/* ───────────────────────────── re-exports ───────────────────────────── */

/**
 * The manifest's ids, for a test that compares them against what registered.
 *
 * Also the one place a test can reach `ROLE_SIGNALS` from outside, which is how
 * the durability gate reads the table this feature classifies from.
 */
export { GUILD_ACTION_IDS, ROLE_SIGNALS, roleSignalEventTypes, rolesEarningableToday };

/** The work ledger's row shape, re-exported so a caller can name it. */
export type { WorkRecord };

/**
 * Rejects an unknown role loudly, for a caller constructing a signal outside
 * this module. Exported rather than inlined because the storage layer's CHECK
 * refuses an unknown role, and a caller that finds out here gets a sentence
 * instead of a constraint violation.
 */
export function assertGuildRole(value: unknown): asserts value is (typeof GUILD_ROLES)[number] {
  if (!isGuildRole(value)) {
    throw new Error(
      `"${String(value)}" is not a guild role; this build knows ${GUILD_ROLES.join(', ')}`,
    );
  }
}
