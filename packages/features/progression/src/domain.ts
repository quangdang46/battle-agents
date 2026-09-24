import type { BehaviourSignal, Build } from './rules.js';

/**
 * What a character has earned, and what it is becoming.
 *
 * The record is owned by this feature and the agent row carries a copy of the
 * counters for cheap sorting. Two places holding the same number is a thing to
 * be careful about, and the alternative — reading every agent's history to draw
 * a leaderboard — is worse; this is a projection, and the rule for which one
 * wins is that a derived counter never survives a rebuild.
 */
export interface AgentProgress {
  readonly agentId: string;
  readonly xp: number;
  readonly level: number;
  readonly build: Build;
  /**
   * The individual outcomes, kept so a reclassification is a re-read rather than
   * a guess, and so a mis-awarded one self-corrects on the next award.
   */
  readonly history: readonly BehaviourSignal[];
  readonly updatedAt: string;
}

export interface NewProgress {
  readonly agentId: string;
}

/** The event this feature emits when a character crosses a level. */
export const AGENT_LEVEL_UP = 'agent.level_up';

export interface AgentLevelUpPayload {
  readonly agentId: string;
  readonly level: number;
  readonly previousLevel: number;
  readonly xp: number;
}
