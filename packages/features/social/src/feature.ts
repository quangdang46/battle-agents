import { defineAction } from '@battle-agents/core';
import type { ActionDef, GameFeature, RuntimeContext } from '@battle-agents/core';

import {
  DELIVERED_MESSAGE,
  GUILD_BROADCAST,
  GUILD_CAN_TALK_TO,
  MESSAGE_SENT,
  METRIC_UNITS,
  POKE_SENT,
  type CanTalkToQuery,
  type DeliveredMessage,
  type Message,
  type MessageSentPayload,
  type PokeNotice,
} from './domain.js';
import type { SocialRepository } from './repository.js';
import {
  addressProblem,
  attributionFor,
  boardLimit,
  bodyProblem,
  metricOrDefault,
  normaliseBody,
  publicProfileOf,
  rankBoard,
  readAgentIdInput,
  readBroadcastInput,
  readDecision,
  readSendInput,
} from './rules.js';

/** What a caller may be granted, one capability per thing they may do. */
export const SOCIAL_MESSAGE = 'social.message';
export const SOCIAL_READ = 'social.read';
export const SOCIAL_PROFILE = 'social.profile';
export const SOCIAL_LEADERBOARD = 'social.leaderboard';
export const SOCIAL_POKE = 'social.poke';

/**
 * Messaging, profiles and leaderboards.
 *
 * ── The one thing this feature is careful about ────────────────────────────
 *
 * A message body is text another agent wrote. The dangerous capability the plan
 * asks for is delivering a message into a live agent's context, and the way that
 * goes wrong is an agent that cannot tell "my operator said this" from "somebody
 * in another guild said this" once both are in the same window. So:
 *
 *   Nothing in a body is dispatched. There is no code path from a body to
 *   `dispatch`, to `runAction`, or to a command of any kind. The runtime's
 *   command path is the only path to a mutation and a message body never
 *   reaches it — not filtered out of it, simply never on it.
 *
 *   The wake carries no body. `social.poke` publishes ids, so a woken agent has
 *   to call `social.inbox` and read the message as a tool result it can reason
 *   about. A wake that pasted the text would have handed the injection the
 *   context it was aiming for.
 *
 *   Every delivery is attributed. A delivered message is a tagged envelope
 *   carrying `fromAgentId` and a rendered attribution line, so the reader is
 *   told who wrote it rather than inferring it.
 *
 *   Being allowed to message somebody is not being trusted. The ACL decides
 *   WHO may reach WHOM; it says nothing about what the text may do, because a
 *   guild member permitted to write to you can still carry an injection. The
 *   two are separate and the second is structural, not a filter.
 *
 * ── The authorization boundary this does NOT settle ───────────────────────
 *
 * `GUILD_CAN_TALK_TO` is declared in `requires` and the feature refuses to
 * send anything while it is missing. That is the fail-closed half, and it is
 * the only safe default available: the alternative — treating an absent ACL as
 * an open channel — is exactly the mistake the brief names.
 *
 * What it does NOT do is decide the principal. `RuntimeContext` deliberately
 * carries none, and `ActionDef.permissions` is documented in core as a
 * declaration nothing enforces, so a `fromAgentId` reaching this feature is a
 * CLAIM. The ACL is asked whether the claimed sender may reach the claimed
 * recipient, and that is weaker than "the ACL decides who may DM whom" — it
 * authorizes an assertion. Closing it needs a transport that passes an
 * authenticated principal to the API, which is a frozen-contract question and
 * not this feature's to answer.
 *
 * The capability name is the port, and it is not neutral:
 * `guild.messaging.authorize` says authorization is expected to be a property
 * of guild membership. Whoever answers the question still has to decide what a
 * principal IS.
 *
 * ── What is deliberately missing ──────────────────────────────────────────
 *
 * No durable delivery path. The only bus in this repository is in-process, so a
 * poke published on one serverless instance cannot reach an agent connected to
 * another. The poke is therefore a same-process wake, and cross-instance
 * delivery is a durable read path the plan does not price. The inbox is
 * durable, so the MESSAGE survives; only the WAKE does not.
 *
 * No database constraint on the DM-or-broadcast shape. `addressProblem` checks
 * every write that goes through here, and a write that does not is unchecked —
 * a follow-up migration, not a decision this feature is entitled to make while
 * other work shares the tree. Note that such a migration could only assert
 * "not both set": `to_agent_id` is declared `onDelete: 'set null'`, so a
 * deleted recipient makes a DM look exactly like a row with no address.
 */
export function socialFeature(dependencies: {
  readonly repository: SocialRepository;
}): GameFeature {
  const { repository } = dependencies;

  return {
    id: 'social',
    requires: [GUILD_CAN_TALK_TO],
    persistedEvents: [MESSAGE_SENT, GUILD_BROADCAST],
    capabilities: [
      { name: SOCIAL_MESSAGE, description: 'Send a direct message or a guild broadcast.' },
      { name: SOCIAL_READ, description: "Read an agent's inbox." },
      { name: SOCIAL_PROFILE, description: "Read a character's public profile." },
      { name: SOCIAL_LEADERBOARD, description: 'Read a leaderboard.' },
      { name: SOCIAL_POKE, description: 'Wake an agent that has mail waiting.' },
    ],
    actionDefs: [
      describeAction({
        id: 'social.send',
        permissions: [SOCIAL_MESSAGE],
        description: 'Send a direct message to another agent, if the ACL permits it.',
        run: (input: unknown, context: RuntimeContext): Promise<DeliveredMessage> =>
          send(repository, input, context),
      }),
      describeAction({
        id: 'social.broadcast',
        permissions: [SOCIAL_MESSAGE],
        description: 'Send one message to every member of a guild, if the ACL permits it.',
        run: (input: unknown, context: RuntimeContext): Promise<DeliveredMessage> =>
          broadcast(repository, input, context),
      }),
      describeAction({
        id: 'social.inbox',
        permissions: [SOCIAL_READ],
        description: 'Everything waiting for one agent, newest first.',
        run: (input: unknown): Promise<readonly DeliveredMessage[]> => inbox(repository, input),
      }),
      describeAction({
        id: 'social.profile',
        permissions: [SOCIAL_PROFILE],
        description: "A character's public profile. Excludes anything private.",
        run: (input: unknown) => profile(repository, input),
      }),
      describeAction({
        id: 'social.leaderboard',
        permissions: [SOCIAL_LEADERBOARD],
        description: 'A ranked board of agents, by level, xp, win rate or reputation.',
        run: (input: unknown) => leaderboard(repository, input),
      }),
      describeAction({
        id: 'social.poke',
        permissions: [SOCIAL_POKE],
        description: 'Wake an agent that has mail waiting. Carries no message text.',
        run: (
          input: unknown,
          context: RuntimeContext,
        ): Promise<PokeNotice & { readonly woke: boolean }> => poke(repository, input, context),
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
 * failure AGENTS.md names. So the description is attached here instead.
 *
 * What that costs is the authoring-time check on a misspelled id, because the
 * field is no longer part of the object handed to the helper. The registry still
 * rejects a bad id at install time, so every test that installs this feature
 * would fail, and feature.test.ts compares the registered ids against the
 * manifest by hand. The check is later rather than immediate, not absent.
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

/* ───────────────────────────── writing ───────────────────────────── */

async function send(
  repository: SocialRepository,
  input: unknown,
  context: RuntimeContext,
): Promise<DeliveredMessage> {
  const parsed = readSendInput(input, 'social.send');
  if (!parsed.ok) {
    throw new Error(parsed.reason);
  }
  const { fromAgentId, toAgentId, body } = parsed.value;

  const shape = addressProblem(toAgentId, null);
  if (shape !== undefined) {
    throw new Error(`social.send: ${shape}`);
  }
  const content = bodyProblem(body);
  if (content !== undefined) {
    throw new Error(`social.send: ${content}`);
  }

  const stored = await deliver(
    repository,
    context,
    { fromAgentId, toAgentId, guildId: null, body: normaliseBody(body) },
    'social.send',
  );
  await context.runtime.emit(messageEvent(context, MESSAGE_SENT, stored, fromAgentId));
  return toDelivery(stored);
}

async function broadcast(
  repository: SocialRepository,
  input: unknown,
  context: RuntimeContext,
): Promise<DeliveredMessage> {
  const parsed = readBroadcastInput(input, 'social.broadcast');
  if (!parsed.ok) {
    throw new Error(parsed.reason);
  }
  const { fromAgentId, guildId, body } = parsed.value;

  const shape = addressProblem(null, guildId);
  if (shape !== undefined) {
    throw new Error(`social.broadcast: ${shape}`);
  }
  const content = bodyProblem(body);
  if (content !== undefined) {
    throw new Error(`social.broadcast: ${content}`);
  }

  const stored = await deliver(
    repository,
    context,
    { fromAgentId, toAgentId: null, guildId, body: normaliseBody(body) },
    'social.broadcast',
  );
  await context.runtime.emit(messageEvent(context, GUILD_BROADCAST, stored, fromAgentId));
  return toDelivery(stored);
}

/**
 * Asks the ACL, then writes.
 *
 * The order is the security property: nothing is stored before a decision, so a
 * refusal cannot leave a half-delivered message behind, and a throw from the
 * ACL leaves no trace at all rather than a message the caller believes failed.
 */
async function deliver(
  repository: SocialRepository,
  context: RuntimeContext,
  draft: {
    readonly fromAgentId: string;
    readonly toAgentId: string | null;
    readonly guildId: string | null;
    readonly body: string;
  },
  actionId: string,
): Promise<Message> {
  await authorise(
    context,
    { fromAgentId: draft.fromAgentId, toAgentId: draft.toAgentId, guildId: draft.guildId },
    actionId,
  );
  return repository.append({ ...draft, createdAt: context.now() });
}

/**
 * The ACL, called through the registry.
 *
 * Two checks before the call, both denying. A capability with no action behind
 * it is a host that advertised something it cannot answer, and treating the
 * absence of an answer as permission is the one interpretation that cannot be
 * defended. So the message is refused with a message that says which capability
 * is missing, which is the difference between a diagnosable refusal and a
 * feature that looks broken.
 *
 * A throw from the provider is allowed to propagate. Turning a broken ACL into
 * "allowed" because the error was inconvenient is the same failure with an
 * extra step, and a caller seeing the provider's own error is better placed
 * than one seeing a message nobody checked.
 */
async function authorise(
  context: RuntimeContext,
  query: CanTalkToQuery,
  actionId: string,
): Promise<void> {
  if (!context.runtime.capabilities().includes(GUILD_CAN_TALK_TO)) {
    throw new Error(
      `${actionId} refused: no feature provides the "${GUILD_CAN_TALK_TO}" capability, so there is ` +
        'no answer to whether this sender may reach this recipient. Messaging fails closed rather ' +
        'than treating an absent authorization service as an open channel. Nothing was sent.',
    );
  }
  if (!context.runtime.actions().includes(GUILD_CAN_TALK_TO)) {
    throw new Error(
      `${actionId} refused: "${GUILD_CAN_TALK_TO}" is advertised as a capability but no such action ` +
        'is registered, so the decision cannot be asked for. Nothing was sent.',
    );
  }

  const answer = readDecision(
    await context.runtime.runAction<CanTalkToQuery, unknown>(GUILD_CAN_TALK_TO, query),
  );
  if (!answer.allowed) {
    throw new Error(`${actionId} refused: ${answer.reason}. Nothing was sent.`);
  }
}

/* ───────────────────────────── reading ───────────────────────────── */

async function inbox(
  repository: SocialRepository,
  input: unknown,
): Promise<readonly DeliveredMessage[]> {
  const parsed = readAgentIdInput(input, 'social.inbox');
  if (!parsed.ok) {
    throw new Error(parsed.reason);
  }
  const found = await repository.inbox(parsed.value.agentId, INBOX_LIMIT);
  return found.map(toDelivery);
}

async function profile(repository: SocialRepository, input: unknown) {
  const parsed = readAgentIdInput(input, 'social.profile');
  if (!parsed.ok) {
    throw new Error(parsed.reason);
  }
  const record = await repository.profile(parsed.value.agentId);
  if (record === undefined) {
    throw Object.assign(new Error(`no agent ${parsed.value.agentId}`), {
      code: 'no-such-agent',
    });
  }
  return publicProfileOf(record);
}

async function leaderboard(repository: SocialRepository, input: unknown) {
  const fields = (typeof input === 'object' && input !== null ? input : {}) as {
    readonly metric?: unknown;
    readonly limit?: unknown;
  };
  const metric = metricOrDefault(fields.metric);
  const limit = boardLimit(fields.limit);
  // Asked for twice the limit so the feature's own tiebreak has room to work
  // before the board is cut, and so `rankBoard` is what decides the order.
  const candidates = await repository.board({ metric, limit: limit * 2 });
  return { metric, unit: METRIC_UNITS[metric], entries: rankBoard(candidates, metric, limit) };
}

/* ───────────────────────────── waking ───────────────────────────── */

/** The most messages one inbox read returns. */
const INBOX_LIMIT = 50;

/**
 * Wakes an agent that has mail, without telling it what the mail says.
 *
 * The payload is three ids. There is no body field to include and no path that
 * would add one, which is what makes this safe to wire to whatever eventually
 * carries a wake across a process boundary: the thing that travels is a
 * pointer, and reading through it is the woken agent's own decision.
 */
async function poke(
  repository: SocialRepository,
  input: unknown,
  context: RuntimeContext,
): Promise<PokeNotice & { readonly woke: boolean }> {
  const parsed = readAgentIdInput(input, 'social.poke');
  if (!parsed.ok) {
    throw new Error(parsed.reason);
  }
  const agentId = parsed.value.agentId;

  const [head] = await repository.inbox(agentId, 1);
  if (head === undefined) {
    return { agentId, messageId: '', fromAgentId: '', woke: false };
  }
  await context.runtime.emit({
    type: POKE_SENT,
    occurredAt: context.now(),
    actorId: head.fromAgentId,
    payload: { agentId, messageId: head.id, fromAgentId: head.fromAgentId } satisfies PokeNotice,
  });
  return { agentId, messageId: head.id, fromAgentId: head.fromAgentId, woke: true };
}

/* ───────────────────────────── shaping ───────────────────────────── */

function toDelivery(message: Message): DeliveredMessage {
  return {
    kind: DELIVERED_MESSAGE,
    id: message.id,
    fromAgentId: message.fromAgentId,
    toAgentId: message.toAgentId,
    guildId: message.guildId,
    body: message.body,
    createdAt: message.createdAt,
    attribution: attributionFor(message),
  };
}

/**
 * The event a write publishes.
 *
 * Carries the body's LENGTH and not the body. The message is already durable in
 * its own table under `messageId`, so the event log is a trail of what happened
 * rather than a second copy of what was said — and a second copy would be a
 * second place for untrusted text to sit where something downstream might read
 * it as text rather than as history.
 */
function messageEvent(context: RuntimeContext, type: string, message: Message, actorId: string) {
  return {
    type,
    occurredAt: context.now(),
    actorId,
    payload: {
      messageId: message.id,
      fromAgentId: message.fromAgentId,
      toAgentId: message.toAgentId,
      guildId: message.guildId,
      bodyLength: message.body.length,
    } satisfies MessageSentPayload,
  };
}
