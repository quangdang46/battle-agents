/**
 * The feature as the runtime sees it: one capability, one action.
 *
 * ## Why there are no event handlers here
 *
 * Plan section 24 describes this feature as subscribing to every visual event
 * and projecting GameState to AnimationState to Pose frames. That is the shape
 * it grows into, and it is deliberately not what this file is, because the
 * storage half of it would have nothing reading it: a pose persisted against an
 * agent id is only useful to a consumer that fetches it by that id, and no
 * consumer exists in this repository yet — `packages/game-client` builds its
 * world from the event stream directly, and it is forbidden from importing a
 * feature (`packages/game-client/src/game/architecture.test.ts`).
 *
 * Writing the subscription now would mean shipping a handler that writes state
 * nothing reads, which is the shape this repository calls a claim rather than a
 * behaviour: every gate green, and a feature that looks integrated.
 *
 * What ships instead is the part that HAS a reader. The action poses a named rig
 * and returns a finished pose, so the evaluator, the state map and the pose
 * snapshot are reachable through the Application API today, and the event
 * subscription is an addition to this file rather than a rewrite of it.
 *
 * ## What this feature is not allowed to do
 *
 * Decide anything about the game. It maps a state to the name of a pose and
 * evaluates a rig. It has no repository, no persistence and no command, because
 * an animation is a pure function of a rig and a moment — a store of poses would
 * be a cache of a function, and the function is already cheap and already
 * deterministic.
 */

import { defineAction } from '@battle-agents/core';
import type { ActionDef, Capability, GameFeature, RuntimeContext } from '@battle-agents/core';

import { evaluate } from './evaluate.js';
import { ANIMATION_POSE_SHAPE, animationInputRejected, isAnimationPoseInput } from './input.js';
import { UnknownAnimationError, UnknownIkConstraintError, poseSnapshot } from './pose.js';
import type { PoseSnapshot } from './pose.js';
import { InvalidSkeletonError } from './skeleton.js';
import type { Skeleton } from './skeleton.js';

/**
 * The action id, the permission it requires, and the capability that offers it.
 *
 * One constant for all three, which is not a shortcut: this package has exactly
 * one operation, so three names for it would be three things to keep in step and
 * a way for the permission to drift from the id it guards.
 */
export const ANIMATION_POSE = 'animation.pose';

export interface AnimationDependencies {
  /**
   * The rigs this feature can pose, keyed at evaluation time by `skeleton.id`.
   *
   * Required and explicit rather than defaulted to an empty list. A feature
   * installed with no rigs answers "no such skeleton" to everything, which reads
   * as a working installation with an empty catalogue rather than as a
   * misconfigured one — the same reason the composition root makes every
   * repository required.
   */
  readonly skeletons: readonly Skeleton[];
}

/** A pose, in the JSON-safe form. The shape a caller over a wire receives. */
export type AnimationPoseResult = PoseSnapshot;

function describeAction<I, O>(definition: {
  readonly id: string;
  readonly permissions: readonly string[];
  readonly description: string;
  run(input: I, context: RuntimeContext): Promise<O>;
}): ActionDef<I, O> {
  return defineAction(definition);
}

export function animationFeature(dependencies: AnimationDependencies): GameFeature {
  const byId = new Map(dependencies.skeletons.map((skeleton) => [skeleton.id, skeleton]));

  const pose: ActionDef<unknown, AnimationPoseResult> = describeAction({
    id: ANIMATION_POSE,
    permissions: [ANIMATION_POSE],
    description: ANIMATION_POSE_SHAPE,
    run: async (input: unknown): Promise<AnimationPoseResult> => {
      if (!isAnimationPoseInput(input)) {
        throw new Error(animationInputRejected(input));
      }
      const skeleton = byId.get(input.skeletonId);
      if (skeleton === undefined) {
        throw new Error(
          `no skeleton "${input.skeletonId}" is installed in this runtime. Known: ` +
            `${[...byId.keys()].join(', ') || '(none)'}.`,
        );
      }
      try {
        return poseSnapshot(evaluate(skeleton, input).pose);
      } catch (error) {
        // Re-thrown with the skeleton named, because `UnknownAnimationError`'s
        // own message says which rig but a caller that got the error from an
        // action call has usually lost which input produced it.
        if (
          error instanceof UnknownAnimationError ||
          error instanceof UnknownIkConstraintError ||
          error instanceof InvalidSkeletonError
        ) {
          throw error;
        }
        throw new Error(
          `posing "${input.skeletonId}" at ${input.atMs}ms failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  });

  const capabilities: readonly Capability[] = [
    {
      name: ANIMATION_POSE,
      description:
        'Evaluate a named rig at a moment and receive finished geometry. The consumer of this ' +
        'capability draws; it does not solve. Pose requests are keyed by stable id.',
    },
  ];

  return {
    id: 'animation',
    capabilities,
    actionDefs: [pose],
  };
}
