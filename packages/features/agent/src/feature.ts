import { defineAction } from '@battle-agents/core';
import type { CommandHandler, GameEvent, GameFeature, RuntimeContext } from '@battle-agents/core';

import {
  agentInputRejected,
  DESCRIBE_AGENTS_SHAPE,
  describeRejection,
  isDescribeAgentsInput,
  isEndSessionInput,
  isHeartbeatSessionInput,
  isReadAgentInput,
  READ_AGENT_SHAPE,
  SESSION_ACTION_SHAPE,
  toHarness,
  whyAgentNameIsRejected,
  whyDescribeAgentsIsRejected,
  whyEndSessionIsRejected,
  whyHeartbeatSessionIsRejected,
  whyReadAgentIsRejected,
  type AgentId,
  type Harness,
  type UserId,
} from './domain.js';
import {
  AGENT_NAME_TAKEN,
  isAgentStorageFailure,
  type AgentRepository,
  type StoredAgent,
} from './repository.js';
import type { SessionRepository } from './hello.js';
import { SESSION_END_REASONS, type SessionEndReason } from './session.js';

export const AGENT_REGISTERED = 'agent.registered';
export const AGENT_REGISTRATION_REJECTED = 'agent.registration_rejected';

/**
 * What this feature offers other features.
 *
 * Nothing may look up a character by id alone: a capability that hands out an
 * agent without an owner invites the exact bug the repository interface is
 * shaped to prevent.
 */
export const AGENT_READ = 'agent.read';
export const AGENT_DESCRIBE = 'agent.describe';

/** The two operations a run needs while it is going, and only while storage is wired. */
export const SESSION_HEARTBEAT = 'session.heartbeat';
export const SESSION_END = 'session.end';

export interface RegisterAgentPayload {
  readonly ownerId: UserId;
  readonly name: string;
  readonly harness: Harness;
}

export interface AgentRegisteredPayload {
  readonly agentId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly harness: Harness;
}

export interface AgentRegistrationRejectedPayload {
  readonly ownerId: string;
  readonly name: string;
  readonly reason: string;
}

/** One character, as a caller is allowed to see it. */
export interface AgentSummary {
  readonly id: string;
  readonly name: string;
  readonly harness: Harness;
  readonly presence: string;
  readonly level: number;
}

/**
 * The agent feature: who the characters are, and who may act as them.
 *
 * It owns nothing else. XP, reputation, presence and session lifecycle belong
 * to other features that react to `agent.registered`, which is the whole reason
 * features are not allowed to import one another — the reaction is the contract.
 */
export function agentFeature(dependencies: {
  readonly repository: AgentRepository;
  /**
   * Session storage. Optional, so a host that only registers characters can run
   * without wiring storage it does not use: the session actions are then absent
   * rather than registered and throwing. `discover` reports the difference, and
   * a required dependency would force every caller to provide it.
   */
  readonly sessionRepository?: SessionRepository;
}): GameFeature {
  const { repository, sessionRepository } = dependencies;

  const registerAgent: CommandHandler<RegisterAgentPayload> = {
    type: 'agent.register',
    async handle(command, context) {
      const { ownerId, name, harness } = command.payload;
      const nameRejection = whyAgentNameIsRejected(name);
      if (nameRejection !== undefined) {
        return [rejection(context, ownerId, name, describeRejection(nameRejection))];
      }

      try {
        const created = await repository.create(
          { ownerId, name: name.trim(), harness },
          context.now(),
        );
        return [
          {
            type: AGENT_REGISTERED,
            occurredAt: context.now(),
            actorId: ownerId,
            payload: {
              agentId: created.id,
              ownerId,
              name: created.name,
              harness: toHarness(created.harness),
            } satisfies AgentRegisteredPayload,
          },
        ];
      } catch (error) {
        // Only the one expected failure becomes a rejection. Anything else is a
        // real fault and propagates: reporting a dropped connection as "that
        // name is taken" would send the caller off to rename a character that
        // was never the problem.
        if (isAgentStorageFailure(error, AGENT_NAME_TAKEN)) {
          return [rejection(context, ownerId, name, 'name-taken')];
        }
        throw error;
      }
    },
  };

  return {
    id: 'agent',
    commands: [registerAgent],
    persistedEvents: [AGENT_REGISTERED, AGENT_REGISTRATION_REJECTED],
    capabilities: [
      { name: AGENT_READ, description: 'Look up one of the callers own characters.' },
      { name: AGENT_DESCRIBE, description: 'List the characters the caller owns.' },
    ],
    actionDefs: [
      ...(sessionRepository === undefined ? [] : sessionActions(sessionRepository)),
      // Both take `unknown` and are guarded. The annotation they used to carry
      // was never checked: `act()` hands the payload through as a generic, so
      // `act('agent.describe', {})` compiled clean and answered with an empty
      // list, which is the same answer a brand-new user gets — and
      // `act('agent.read', { agentId })` asked for a character with no owner at
      // all, which is the one lookup this feature exists to refuse.
      defineAction({
        id: AGENT_DESCRIBE,
        permissions: [AGENT_DESCRIBE],
        run: async (input: unknown) => {
          if (!isDescribeAgentsInput(input)) {
            throw agentInputRejected(
              AGENT_DESCRIBE,
              whyDescribeAgentsIsRejected(input) ?? { reason: 'not-an-object' },
              DESCRIBE_AGENTS_SHAPE,
            );
          }
          return describeFor(repository, input.ownerId);
        },
      }),
      defineAction({
        id: AGENT_READ,
        permissions: [AGENT_READ],
        run: async (input: unknown) => {
          if (!isReadAgentInput(input)) {
            throw agentInputRejected(
              AGENT_READ,
              whyReadAgentIsRejected(input) ?? { reason: 'not-an-object' },
              READ_AGENT_SHAPE,
            );
          }
          return describeFor(repository, input.ownerId, input.agentId);
        },
      }),
    ],
  };
}

async function describeFor(
  repository: AgentRepository,
  ownerId: UserId,
  agentId?: AgentId,
): Promise<readonly AgentSummary[]> {
  const agents =
    agentId === undefined
      ? await repository.listForOwner(ownerId)
      : [await repository.requireOwned(ownerId, agentId)];
  return agents.map(toSummary);
}

function toSummary(agent: StoredAgent): AgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    harness: toHarness(agent.harness),
    presence: agent.presence,
    level: agent.level,
  };
}

function rejection(
  context: RuntimeContext,
  ownerId: UserId,
  name: string,
  reason: string,
): GameEvent {
  return {
    type: AGENT_REGISTRATION_REJECTED,
    occurredAt: context.now(),
    actorId: ownerId,
    payload: { ownerId, name, reason } satisfies AgentRegistrationRejectedPayload,
  };
}

/**
 * The actions a running session needs, or none at all.
 *
 * Returning an empty list rather than actions that throw keeps `discover` honest:
 * a host with no session storage has no session operations, and saying so is
 * what lets a caller find that out without triggering a failure.
 */
function sessionActions(sessionRepository: SessionRepository) {
  return [
    defineAction({
      id: SESSION_HEARTBEAT,
      permissions: [SESSION_HEARTBEAT],
      run: async (input: unknown, context) => {
        if (!isHeartbeatSessionInput(input)) {
          throw agentInputRejected(
            SESSION_HEARTBEAT,
            whyHeartbeatSessionIsRejected(input) ?? { reason: 'not-an-object' },
            SESSION_ACTION_SHAPE,
          );
        }
        const status = await sessionRepository.heartbeat(input.sessionId, context.now());
        if (status === undefined) {
          throw new Error(`session ${input.sessionId} is not running`);
        }
        return { sessionId: input.sessionId, status };
      },
    }),
    defineAction({
      id: SESSION_END,
      permissions: [SESSION_END],
      run: async (input: unknown, context) => {
        if (!isEndSessionInput(input)) {
          throw agentInputRejected(
            SESSION_END,
            whyEndSessionIsRejected(input) ?? { reason: 'not-an-object' },
            SESSION_ACTION_SHAPE,
          );
        }
        const reason = toEndReason(input.reason);
        const status = await sessionRepository.end(input.sessionId, reason, context.now());
        if (status === undefined) {
          throw new Error(`session ${input.sessionId} is not running`);
        }
        return { sessionId: input.sessionId, status, reason };
      },
    }),
  ];
}

/**
 * An ending a session row can hold.
 *
 * Unrecognised input becomes 'crashed' rather than being passed through: a
 * caller inventing a reason would otherwise write a value no reader of this
 * codebase knows how to interpret, and the column is an enum precisely so that
 * cannot happen quietly.
 */
function toEndReason(reason: string | undefined): SessionEndReason {
  return SESSION_END_REASONS.includes(reason as SessionEndReason)
    ? (reason as SessionEndReason)
    : 'crashed';
}
