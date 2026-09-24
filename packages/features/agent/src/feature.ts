import { defineAction } from '@battle-agents/core';
import type { CommandHandler, GameEvent, GameFeature, RuntimeContext } from '@battle-agents/core';

import {
  describeRejection,
  toHarness,
  whyAgentNameIsRejected,
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
export function agentFeature(dependencies: { readonly repository: AgentRepository }): GameFeature {
  const { repository } = dependencies;

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
      defineAction({
        id: 'agent.describe',
        permissions: [AGENT_DESCRIBE],
        run: (input: { ownerId: UserId }) => describeFor(repository, input.ownerId),
      }),
      defineAction({
        id: 'agent.read',
        permissions: [AGENT_READ],
        run: (input: { ownerId: UserId; agentId: AgentId }) =>
          describeFor(repository, input.ownerId, input.agentId),
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
