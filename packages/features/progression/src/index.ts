export { AGENT_LEVEL_UP } from './domain.js';
export type { AgentLevelUpPayload, AgentProgress, NewProgress } from './domain.js';
export {
  PROGRESSION_AWARDS,
  PROGRESSION_GATE,
  PROGRESSION_READ,
  PROGRESSION_TIERS,
  progressionFeature,
  apply,
} from './feature.js';
export type {
  GateDecision,
  LevelGateView,
  ProgressionDependencies,
  ProgressionSummary,
} from './feature.js';
export { isNoSuchProgress, NO_SUCH_PROGRESS } from './repository.js';
export type { ProgressionRepository } from './repository.js';
export {
  BUILDS,
  classifyBuild,
  DEFAULT_BUILD,
  DEFAULT_BUILD_WEIGHTS,
  explainBuild,
  isOutcomeType,
  LEVEL_GATES,
  levelForXp,
  meetsGate,
  OUTCOMES,
  OUTCOME_TYPES,
  outcomeFor,
  qualifies,
  totalXpToReach,
  xpToAdvanceFrom,
} from './rules.js';
export type {
  BehaviourSignal,
  Build,
  BuildClassification,
  BuildWeights,
  LevelGate,
  Outcome,
  OutcomeCondition,
  OutcomeType,
  Specialist,
} from './rules.js';
export { PROGRESSION_ACTION_IDS } from './manifest.js';
export type { ProgressionActionId, ProgressionActionTypes } from './manifest.js';
