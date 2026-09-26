export * from './agent-event.js';
export * from './event-buffer.js';
export * from './ingest.js';
export * from './tool-map.js';
export * from './session-limits.js';
export { PROTOCOL_VERSION, protocolVersionSchema } from './version.js';

// The extension contract version, which is not the protocol version. Barrelled
// separately from the `export *` lines above because importing it without the
// distinction in mind is how a reader ends up treating an AgentEvent batch and
// a GameFeature package as one versioned thing. The comment in the file says so;
// this is here so the intent survives someone reading only the barrel.
export {
  assertExtensionContract,
  assertExtensionContracts,
  EXTENSION_CONTRACT_VERSION,
  ExtensionContractMismatch,
  isExtensionContractCompatible,
} from './extension-contract.js';
export type { ExtensionContract } from './extension-contract.js';

export type {
  AgentActionId,
  BountyActionId,
  ProgressionActionId,
  QuestActionId,
  RegisteredActionId,
  ReputationActionId,
} from './generated/action-ids.js';
export { isRegisteredActionId, REGISTERED_ACTION_IDS } from './generated/action-ids.js';
