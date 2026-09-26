/**
 * `@battle-agents/animation` — a minimal skeletal runtime, and nothing else.
 *
 * Plan section 25 puts the spike behind one file: "engine emits Pose, renderer
 * consumes". This barrel is the whole of it, and its shape is the argument the
 * bead asks for:
 *
 * - **`pose.ts` is the seam.** It imports nothing, so anything downstream of it
 *   cannot reach the solver. `render.ts` depends on it and on nothing else.
 * - **`evaluate.ts` is the pipeline** — FK, then IK, then skinning, then region
 *   transform — and it is the only module that imports `ik.ts`.
 *
 * ## What this barrel deliberately does NOT export
 *
 * **`ik.ts` is not re-exported**, and the asymmetry with the four stages beside
 * it is the point. A consumer may legitimately re-run forward kinematics, or
 * skinning, or the region transform: those are pure functions of data the
 * consumer already has, so calling one twice produces the same answer and the
 * shared-core property survives it. The solver is different — re-running it is
 * exactly the divergence the split exists to prevent, and a barrel that handed
 * it out would put the coupling back through the front door with a nicer
 * signature. The stage's TYPE is exported (a caller can read a diagnostic) and
 * its functions are not.
 *
 * `tests/unit/animation-core-boundaries.test.ts` reads this file's own import
 * list and fails if `ik.ts` ever appears in it.
 * - **`agent-state.ts` is the game vocabulary**: the five states, the five
 *   animations, and a refusal rather than a default for anything else.
 * - **`feature.ts` is the runtime surface**: one capability, one action.
 *
 * ## What is deliberately absent
 *
 * No editor, no keyframe authoring, no undo, no revision counter, no
 * serializer, no physics, no scheduler, no WebGL, and no knowledge of what a
 * texture is. The bead's own scope warning is the reference implementation's
 * scope warning: the study repository behind this spike is impressive and is
 * also a full authoring product with checkpoints and observation tooling, and
 * building that here serves no milestone in this plan. The runtime half is the
 * half a game client needs.
 *
 * ## The rule this package must never break
 *
 * **`packages/core`, `packages/cli` and `packages/mcp-server` are frozen, and a
 * game client must not import this package.** `packages/game-client`'s own
 * architecture test forbids the import deliberately, because the removal test
 * moves each feature directory aside and re-typechecks. A future change that
 * wants a pose in the client has to go through the Application API like every
 * other surface, and that is the change's own decision to make and defend.
 */

/* ── the seam ── */

export {
  CHANNEL_PROPERTIES,
  UnknownAnimationError,
  UnknownIkConstraintError,
  poseSnapshot,
  SNAPSHOT_RESOLUTION,
} from './pose.js';
export type {
  Affine,
  ChannelProperty,
  LocalFrame,
  Point,
  Pose,
  PoseRequest,
  PoseSnapshot,
  PosedBone,
  PosedMesh,
  PosedRegion,
} from './pose.js';

/* ── the pipeline ── */

export { evaluate, evaluatePose } from './evaluate.js';
export type { Evaluation } from './evaluate.js';
export { forwardKinematics, childIndexOf, worldAngle } from './fk.js';
export type { WorldFrame, WorldFrames } from './fk.js';
export {
  hasAnimation,
  animationIds,
  restLocals,
  sampleKeysAt,
  sampleLocals,
  sampleTime,
} from './sampling.js';
export type { IkDiagnostic, TwoBoneSolution } from './ik.js';
export { bindWorldOf, invertAffine, rigidBinding, skinMesh } from './skinning.js';
export { poseRegion, regionCorners, regionMatrix, regionSize } from './regions.js';

/* ── the arithmetic ── */

export {
  IDENTITY,
  affine,
  affineCorners,
  affineToLocalFrame,
  applyPoint,
  applyPoints,
  composeAffine,
  localFrameToAffine,
  point,
  pointsEqual,
} from './geometry.js';

/* ── the data model ── */

export {
  InvalidSkeletonError,
  REST_FRAME,
  UnknownBoneError,
  animationsOf,
  attachmentsOf,
  bonesOf,
  childrenOf,
  ikOf,
  slotsOf,
  validateSkeleton,
} from './skeleton.js';
export type {
  Animation,
  Attachment,
  Bone,
  Channel,
  Id,
  IkConstraint,
  Keyframe,
  MeshAttachment,
  MeshBinding,
  RegionAttachment,
  Skeleton,
  Slot,
} from './skeleton.js';

/* ── drawing, which solves nothing ── */

export { drawCount, drawList } from './render.js';
export type { Bounds, DrawCommand, DrawList, MeshDraw, RegionDraw } from './render.js';

/* ── the game vocabulary ── */

export {
  AGENT_STATES,
  AGENT_STATE_ANIMATION,
  ANIMATION_NAMES,
  UnknownAgentStateError,
  animationForState,
  isAgentState,
  poseRequestForState,
} from './agent-state.js';
export type { AgentState, AnimationName } from './agent-state.js';

/* ── the runtime surface ── */

export { ANIMATION_POSE, animationFeature } from './feature.js';
export type { AnimationDependencies, AnimationPoseResult } from './feature.js';
export { ANIMATION_POSE_SHAPE, animationInputRejected, isAnimationPoseInput } from './input.js';
export type { AnimationPoseInput } from './input.js';
export { ANIMATION_ACTION_IDS } from './manifest.js';
export type { AnimationActionId, AnimationActionTypes } from './manifest.js';

/* ── a named rig to try ── */

export { AGENT_16, AGENT_16_ID } from './fixtures/agent-rig.js';
