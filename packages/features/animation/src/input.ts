/**
 * What the action accepts, and how a bad input is refused.
 *
 * A wire boundary, and the reason it is typed as `unknown` and then narrowed
 * rather than declared: the value arrives from a CLI, an MCP tool or an HTTP
 * body, so its type is a claim somebody else made. Narrowing here is where that
 * claim stops being trusted, and the narrowing is total — every field is checked
 * before anything reads it.
 *
 * Rejection is by throw with a message naming the field, not by returning a
 * sentinel. The same reason `animationForState` throws: a rejected input that
 * comes back as a value has to be checked by its caller, and the caller that
 * forgets is the one that renders an empty character.
 */

import { CHANNEL_PROPERTIES } from './pose.js';
import type { LocalFrame, Point } from './pose.js';

/** The one action's shape, described for `inspect` and for a caller reading the source. */
export const ANIMATION_POSE_SHAPE =
  'Posing takes a skeletonId, an animationId and an atMs, each present. ' +
  'boneOverrides and ikTargets are optional and keyed by stable id.';

export interface AnimationPoseInput {
  readonly skeletonId: string;
  readonly animationId: string;
  readonly atMs: number;
  readonly boneOverrides?: Readonly<Record<string, Partial<LocalFrame>>>;
  readonly ikTargets?: Readonly<Record<string, Point>>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): value is Point {
  return (
    typeof value === 'object' &&
    value !== null &&
    isFiniteNumber((value as { x?: unknown }).x) &&
    isFiniteNumber((value as { y?: unknown }).y)
  );
}

/**
 * A `boneOverrides` entry.
 *
 * Checked against `CHANNEL_PROPERTIES` rather than by shape alone, because a
 * typo'd key on an otherwise well-formed object would otherwise be accepted and
 * then quietly do nothing: a caller that spelled `rotation` instead of `angle`
 * gets a request that succeeds and a pose that does not move.
 */
function isLocalFrameOverride(value: unknown): value is Partial<LocalFrame> {
  if (typeof value !== 'object' || value === null) return false;
  for (const [key, entry] of Object.entries(value)) {
    if (!(CHANNEL_PROPERTIES as readonly string[]).includes(key)) return false;
    if (!isFiniteNumber(entry)) return false;
  }
  return true;
}

function isRecordOf<T>(
  value: unknown,
  check: (entry: unknown) => entry is T,
): value is Record<string, T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => check(entry));
}

/** Whether a value is a usable `animation.pose` input. The narrowing, and the only one. */
export function isAnimationPoseInput(value: unknown): value is AnimationPoseInput {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate['skeletonId'])) return false;
  if (!isNonEmptyString(candidate['animationId'])) return false;
  if (!isFiniteNumber(candidate['atMs'])) return false;
  if ((candidate['atMs'] as number) < 0) return false;

  const overrides = candidate['boneOverrides'];
  if (overrides !== undefined && !isRecordOf(overrides, isLocalFrameOverride)) return false;

  const targets = candidate['ikTargets'];
  if (targets !== undefined && !isRecordOf(targets, isPoint)) return false;

  return true;
}

/** Why an input was refused, in one sentence naming the field. */
export function animationInputRejected(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return 'animation.pose takes an object, not ' + (value === null ? 'null' : typeof value);
  }
  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate['skeletonId'])) return 'skeletonId must be a non-empty string';
  if (!isNonEmptyString(candidate['animationId'])) return 'animationId must be a non-empty string';
  if (!isFiniteNumber(candidate['atMs'])) return 'atMs must be a finite number';
  if ((candidate['atMs'] as number) < 0) return 'atMs must not be negative';
  if (candidate['boneOverrides'] !== undefined) {
    const overrides = candidate['boneOverrides'];
    if (!isRecordOf(overrides, isLocalFrameOverride)) {
      const channels = CHANNEL_PROPERTIES.join(', ');
      return `boneOverrides must map a bone id to some of ${channels}, each a finite number`;
    }
  }
  if (candidate['ikTargets'] !== undefined) {
    const targets = candidate['ikTargets'];
    if (!isRecordOf(targets, isPoint)) {
      return 'ikTargets must map a constraint id to a point with finite x and y';
    }
  }
  // Every branch above returned. Reaching here means the guards and this message
  // disagree, which is a bug in this file rather than in the caller's input —
  // and a message that says so beats one that invents a reason.
  return 'animation.pose input is not shaped the way the guards expect; this is a bug in the animation feature';
}
