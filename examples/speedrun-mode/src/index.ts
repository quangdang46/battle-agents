/**
 * `speedrun-mode` — an out-of-tree battle-agents game feature.
 *
 * The barrel is the whole public surface of this package, and the test that
 * guards it asserts that the feature's every import of a platform package
 * resolves through a barrel rather than an internal path. If a name a
 * contributor needs is missing here, the gap is in the public surface and is
 * worth reporting; it is not a reason to reach past the barrel.
 */
export { SPEEDRUN_EXTENSION_CONTRACT, speedrunMode } from './feature.js';
export { readRuns, SPEEDRUN_FEATURE_ID } from './state.js';
export type { SpeedrunRun } from './state.js';
