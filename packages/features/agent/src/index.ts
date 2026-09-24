export {
  AGENT_DESCRIBE,
  AGENT_READ,
  AGENT_REGISTERED,
  AGENT_REGISTRATION_REJECTED,
  agentFeature,
} from './feature.js';
export type {
  AgentRegisteredPayload,
  AgentRegistrationRejectedPayload,
  AgentSummary,
  RegisterAgentPayload,
} from './feature.js';
export { authenticate, AuthenticationError, readBearerToken } from './auth.js';
export type {
  AuthFailure,
  AuthenticatedCaller,
  AuthOptions,
  CredentialRecord,
  CredentialStore,
} from './auth.js';
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
  describeRejection,
  MAX_AGENT_NAME_LENGTH,
  MIN_AGENT_NAME_LENGTH,
  RESERVED_AGENT_NAMES,
  whyAgentNameIsRejected,
} from './domain.js';
export type {
  AgentId,
  AgentNameRejection,
  AgentIdentity,
  AgentPresence,
  Harness,
  Installation,
  InstallationId,
  NewAgent,
  ProjectId,
  SessionId,
  UserId,
} from './domain.js';
export { AGENT_NAME_TAKEN, AGENT_NOT_OWNED, isAgentStorageFailure } from './repository.js';
export type {
  AgentRepository,
  AgentStorageFailure,
  NewStoredAgent,
  StoredAgent,
  StoredInstallation,
} from './repository.js';
