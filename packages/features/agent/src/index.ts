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
