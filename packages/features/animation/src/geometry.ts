/**
 * Two numbers, and the 2D affine that moves them.
 *
 * A skeletal runtime is arithmetic before it is anything else, and this file is
 * the whole of the arithmetic. It has no imports at all — not from this package,
 * not from core, not from anywhere — so every other file in the package reaches
 * the maths through here and nothing else has to reimplement it.
 *
 * The affine convention is stated here because it is the one thing in this file
 * a caller cannot guess:
 *
 *     x' = a * x + c * y + tx
 *     y' = b * x + d * y + ty
 *
 * A column vector multiplied on the right, so composing a parent's world with
 * a child's local is `compose(parent, child)` and the child's local frame sits
 * closest to the point. Getting that backwards produces a rig that mirrors
 * about the wrong axis and a test that only catches it if a fixture happens to
 * be asymmetric; `composeAffine` is the only way this package builds one.
 */

import type { Affine, LocalFrame, Point } from './pose.js';

export type { Affine, Point };

/**
 * The transform that changes nothing.
 *
 * Exported as a value rather than built on demand because it is the fallback in
 * every lookup table in the package, and a fresh object per lookup is how an
 * evaluation quietly allocates in a loop.
 */
export const IDENTITY: Affine = Object.freeze({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

/** Builds an affine from its six numbers, in the convention documented above. */
export function affine(a: number, b: number, c: number, d: number, tx: number, ty: number): Affine {
  return Object.freeze({ a, b, c, d, tx, ty });
}

export function point(x: number, y: number): Point {
  return Object.freeze({ x, y });
}

/**
 * `outer` applied AFTER `inner`: a point is moved by `inner` and then by
 * `outer`.
 *
 * The order is the load-bearing part and the argument names say which is which,
 * because the failure is a rig that folds at the wrong joint and no error. A
 * chain is walked root-first, so each call reads
 * `composeAffine(parentWorld, localFrameOfThisBone)`.
 */
export function composeAffine(outer: Affine, inner: Affine): Affine {
  return Object.freeze({
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    tx: outer.a * inner.tx + outer.c * inner.ty + outer.tx,
    ty: outer.b * inner.tx + outer.d * inner.ty + outer.ty,
  });
}

/** Moves one point through an affine. */
export function applyPoint(m: Affine, p: Point): Point {
  return Object.freeze({
    x: m.a * p.x + m.c * p.y + m.tx,
    y: m.b * p.x + m.d * p.y + m.ty,
  });
}

/** Moves every point, returning a new array. The input is never mutated. */
export function applyPoints(m: Affine, points: readonly Point[]): readonly Point[] {
  return points.map((p) => applyPoint(m, p));
}

/**
 * A local frame as an affine: scale, then rotate, then translate.
 *
 * Applied right to left — a point is scaled, rotated, then moved — so a bone's
 * scale multiplies its children and its angle turns them, which is the
 * behaviour a parent bone is expected to have.
 */
export function localFrameToAffine(frame: LocalFrame): Affine {
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  return Object.freeze({
    a: cos * frame.scaleX,
    b: sin * frame.scaleX,
    c: -sin * frame.scaleY,
    d: cos * frame.scaleY,
    tx: frame.x,
    ty: frame.y,
  });
}

/**
 * An affine's translation and rotation, recovered from its matrix.
 *
 * Needed because the next bone down a chain wants a LOCAL frame and the stage
 * above it produces a WORLD one. Recovering the angle from the matrix rather
 * than storing it separately is what keeps the two from disagreeing after an IK
 * solve has rewritten a joint.
 */
export function affineToLocalFrame(m: Affine): LocalFrame {
  const scaleX = Math.hypot(m.a, m.b);
  // The sign of the determinant is the half of the scale that a length cannot
  // carry, so a mirrored rig stays mirrored instead of snapping back upright.
  const mirrored = m.a * m.d - m.b * m.c < 0;
  return Object.freeze({
    x: m.tx,
    y: m.ty,
    angle: Math.atan2(m.b, m.a),
    scaleX: mirrored ? -scaleX : scaleX,
    scaleY: Math.hypot(m.c, m.d),
  });
}

/** The four corners of a unit quad mapped through an affine, in draw order. */
export function affineCorners(m: Affine): readonly [Point, Point, Point, Point] {
  return [
    applyPoint(m, point(0, 0)),
    applyPoint(m, point(1, 0)),
    applyPoint(m, point(1, 1)),
    applyPoint(m, point(0, 1)),
  ];
}

export function pointsEqual(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}
