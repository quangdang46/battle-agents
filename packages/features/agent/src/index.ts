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

/**
 * The action ids this feature registers. NOT its commands: `agent.register` is a
 * command, reached through dispatch rather than act, and a manifest that listed
 * it would hand generated types an id `act()` rejects. The guard below caught
 * exactly that on its first run.
 *
 * A type, not a runtime value: the registry erases the shapes when it stores an
 * action, so nothing at runtime can recover them. Declaring the ids here is what
 * lets a build step union every feature's, which is the only way `act()` can
 * reject a misspelled id at compile time.
 *
 * The payloads are `unknown` and that is a known gap, stated rather than
 * hidden: they need each action to declare its return type, which the features
 * do not do yet. Until then this makes the id half real and the shape half
 * honest about being absent. MCP's `act` tool still cannot declare a truthful
 * outputSchema for the same reason.
 */
export interface AgentActionTypes {
  'agent.describe': { input: unknown; output: unknown };
  'agent.read': { input: unknown; output: unknown };
  'session.end': { input: unknown; output: unknown };
  'session.heartbeat': { input: unknown; output: unknown };
}
