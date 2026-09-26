export {
  AGENT_LEVEL_UP,
  isProgressionAwardsInput,
  isProgressionGateInput,
  isProgressionReadInput,
  progressionInputRejected,
  whyProgressionAwardsIsRejected,
  whyProgressionGateIsRejected,
  whyProgressionReadIsRejected,
} from './domain.js';
export type {
  AgentLevelUpPayload,
  AgentProgress,
  NewProgress,
  ProgressionAgentInput,
  ProgressionAwardsInput,
  ProgressionGateInput,
  ProgressionRejection,
} from './domain.js';
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
export type { ProgressionRepository } from './repository.js';
export {
  awardSkill,
  BUILDS,
  classifyBuild,
  DEFAULT_BUILD,
  DEFAULT_BUILD_WEIGHTS,
  describeSkills,
  EMPTY_SKILLS,
  explainBuild,
  isOutcomeType,
  LEVEL_GATES,
  levelForXp,
  meetsGate,
  MIN_LEVEL,
  OUTCOMES,
  OUTCOME_TYPES,
  outcomeFor,
  qualifies,
  SKILLS,
  skillsEvidencedByOutcomes,
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
  Skill,
  SkillProgress,
  Skills,
  Specialist,
} from './rules.js';
export { PROGRESSION_ACTION_IDS } from './manifest.js';
export type { ProgressionActionId, ProgressionActionTypes } from './manifest.js';
