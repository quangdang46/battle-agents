/**
 * Stage 0: a moment in an animation, expressed as one local frame per bone.
 *
 * Runs before the pipeline the bead names, because there is nothing to forward-
 * kinematic until the bones are placed. The order the bead does name — FK, then
 * IK, then skinning, then region transform — is `evaluate.ts`, and this is the
 * one stage that feeds it.
 *
 * Interpolation is linear and the only shape here is a keyframe. A bezier
 * curve, a stepped curve and a per-channel easing handle are all authoring-tool
 * concerns; the reference study the bead points at has all three and describes
 * itself as a research prototype, so importing the curve system would import
 * the editor's requirements along with it.
 */

import { UnknownAnimationError } from './pose.js';
import type { LocalFrame, PoseRequest } from './pose.js';
import { animationsOf } from './skeleton.js';
import type { Animation, Channel, Id, Keyframe, Skeleton } from './skeleton.js';

/**
 * Where in an animation a moment actually falls.
 *
 * Wrapping for a loop and clamping for a one-shot, which is the difference
 * between a walk cycle that keeps walking and a hit that holds its last frame.
 * Written as an explicit branch because `%` on a negative time returns a
 * negative remainder, and a request with a negative `atMs` is the kind of thing
 * a caller produces by accident rather than on purpose.
 */
export function sampleTime(animation: Animation, atMs: number): number {
  const duration = animation.durationMs;
  if (duration <= 0) return 0;
  if (animation.loop) {
    const wrapped = atMs % duration;
    return wrapped < 0 ? wrapped + duration : wrapped;
  }
  return Math.min(Math.max(atMs, 0), duration);
}

/**
 * One channel's value at a moment, from keys already in ascending order.
 *
 * Held flat outside the keyframed span, so a channel that animates only the
 * first 200ms of a 1000ms animation returns the setup value afterwards rather
 * than the first key.
 */
export function sampleKeysAt(keys: readonly Keyframe[], atMs: number, fallback: number): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) return fallback;
  if (atMs <= first.atMs) return first.value;
  if (atMs >= last.atMs) return last.value;

  for (let index = 1; index < keys.length; index += 1) {
    const right = keys[index]!;
    if (atMs > right.atMs) continue;
    const left = keys[index - 1]!;
    const span = right.atMs - left.atMs;
    // Two keys at the same millisecond carry no interval to interpolate across,
    // and the later one is the one the author meant to see.
    if (span <= 0) return right.value;
    return left.value + ((right.value - left.value) * (atMs - left.atMs)) / span;
  }
  return last.value;
}

/**
 * Every bone's local frame at a request's moment.
 *
 * Three passes over one map: rest pose, then the animation's channels, then
 * whatever the request overrode. The order is the design — an override is a
 * correction to a sampled pose, so it lands last, and a request that pins a
 * bone's angle gets the same answer whether or not the animation also animates
 * that angle.
 */
export function sampleLocals(
  skeleton: Skeleton,
  request: PoseRequest,
): ReadonlyMap<Id, LocalFrame> {
  const animation = animationsOf(skeleton).get(request.animationId);
  if (animation === undefined) {
    throw new UnknownAnimationError(skeleton.id, request.animationId);
  }

  const locals = new Map<Id, LocalFrame>();
  for (const bone of skeleton.bones) locals.set(bone.id, { ...bone.setup });

  const at = sampleTime(animation, request.atMs);
  const channelsByBone = new Map<
    Id,
    readonly { readonly channel: Channel; readonly keys: readonly Keyframe[] }[]
  >();
  for (const channel of animation.channels) {
    const entry = {
      channel,
      keys: [...channel.keys].sort((left, right) => left.atMs - right.atMs),
    };
    const existing = channelsByBone.get(channel.boneId);
    if (existing === undefined) channelsByBone.set(channel.boneId, [entry]);
    else
      (existing as { readonly channel: Channel; readonly keys: readonly Keyframe[] }[]).push(entry);
  }

  for (const [boneId, entries] of channelsByBone) {
    const base = locals.get(boneId);
    if (base === undefined) continue;
    // Accumulated rather than read back out of the map each time, so a channel's
    // fallback is the value the PREVIOUS channel on the same bone left — two
    // channels on one bone is a rig where one property eases in from another's
    // mid-animation value, and reading from a half-written map would have the
    // second channel fall back to the rest pose instead.
    let current: LocalFrame = base;
    for (const { channel, keys } of entries) {
      const property = channel.property;
      current = { ...current, [property]: sampleKeysAt(keys, at, current[property]) };
    }
    locals.set(boneId, current);
  }

  for (const [boneId, override] of Object.entries(request.boneOverrides ?? {})) {
    const base = locals.get(boneId);
    // An override for a bone the rig does not have is ignored rather than
    // rejected, and the asymmetry is deliberate: validateSkeleton has already
    // refused a rig whose own references dangle, so this can only be a caller
    // addressing a bone that was renamed out from under it. Creating a phantom
    // bone would put one in the pose with a rest transform nobody authored.
    if (base === undefined) continue;
    locals.set(boneId, { ...base, ...override });
  }

  return locals;
}

/** The rest pose, as a set of local frames. What a rig looks like unposed. */
export function restLocals(skeleton: Skeleton): ReadonlyMap<Id, LocalFrame> {
  const locals = new Map<Id, LocalFrame>();
  for (const bone of skeleton.bones) locals.set(bone.id, { ...bone.setup });
  return locals;
}

/** Every pose a rig can be put into, in author order. */
export function animationIds(skeleton: Skeleton): readonly string[] {
  return skeleton.animations.map((animation) => animation.id);
}

/** Whether a rig can be put into a named pose. For validating a request cheaply. */
export function hasAnimation(skeleton: Skeleton, animationId: string): boolean {
  return animationsOf(skeleton).has(animationId);
}
