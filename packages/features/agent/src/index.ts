export {
  AGENT_DESCRIBE,
  AGENT_READ,
  AGENT_REGISTERED,
  AGENT_REGISTRATION_REJECTED,
  agentFeature,
  SESSION_END,
  SESSION_HEARTBEAT,
} from './feature.js';
export type {
  AgentRegisteredPayload,
  AgentRegistrationRejectedPayload,
  AgentSummary,
  RegisterAgentPayload,
  // A battle reads `sessionId` off the ending's payload to pause the battles that
  // run was in, and progression reads the recovery to pay §10.2's death rule.
  // Both are consumers of these two shapes, so both are exported.
  SessionEndedPayload,
  SessionRecoveredPayload,
} from './feature.js';
// Verifying a bearer token against a credential is infrastructure and lives in
// @battle-agents/db, so the transport can ask whether a request is
// authenticated without importing a game concept. These four are the MODEL:
// what a credential is, and the port the store must satisfy.
export type { CredentialRecord } from './auth.js';
export {
  CREDENTIAL_TOKEN_BYTES,
  DEFAULT_TOKEN_LIFETIME_MS,
  hashToken,
  isCredentialUsable,
  issueCredential,
  tokenMatches,
} from './credential.js';
export type { CredentialRejection, IssuedCredential } from './credential.js';
export { hello, sweepStaleSessions, UnknownAgentError } from './hello.js';
// Exported so the battle feature can be given the SAME number rather than a
// second copy of it. Two constants that both mean "how long may a participant be
// away" is two answers to one question, and they would drift silently. The
// battle package deliberately takes this as a required parameter rather than
// defaulting it, precisely so the wiring is visible at the composition root.
export { DEFAULT_RESUME_GRACE_MS } from './session.js';
export type {
  HelloOptions,
  HelloRequest,
  HelloResult,
  ResumableSession,
  SessionRepository,
  SweepRepository,
  SweepResult,
} from './hello.js';
export {
  agentInputRejected,
  describeRejection,
  isDescribeAgentsInput,
  isEndSessionInput,
  isHeartbeatSessionInput,
  isReadAgentInput,
  MAX_AGENT_NAME_LENGTH,
  MIN_AGENT_NAME_LENGTH,
  RESERVED_AGENT_NAMES,
  whyAgentNameIsRejected,
  whyDescribeAgentsIsRejected,
  whyEndSessionIsRejected,
  whyHeartbeatSessionIsRejected,
  whyReadAgentIsRejected,
} from './domain.js';
export type {
  AgentId,
  AgentInputRejection,
  AgentNameRejection,
  AgentIdentity,
  AgentPresence,
  DescribeAgentsInput,
  EndSessionInput,
  Harness,
  HeartbeatSessionInput,
  Installation,
  InstallationId,
  NewAgent,
  ProjectId,
  ReadAgentInput,
  SessionId,
  UserId,
} from './domain.js';
export { AGENT_ACTION_IDS } from './manifest.js';
export type { AgentActionId, AgentActionTypes } from './manifest.js';
export { AGENT_NAME_TAKEN, AGENT_NOT_OWNED, isAgentStorageFailure } from './repository.js';
export type {
  AgentRepository,
  AgentStorageFailure,
  NewStoredAgent,
  StoredAgent,
  StoredInstallation,
} from './repository.js';
