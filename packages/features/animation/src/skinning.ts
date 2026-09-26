/**
 * Stage 3: mesh skinning. A deformed attachment, in world space.
 *
 * A region is a mesh with one vertex, so this is the general case and
 * `regions.ts` is the specialisation. Splitting them is not tidiness: it is what
 * lets the boundary test say "the renderer receives finished vertices" about
 * both, rather than about a type that sometimes carries a matrix and sometimes
 * carries points.
 *
 * ## The maths, and the one part worth reading
 *
 * Linear blend skinning. Mesh vertices live in **model space** — one space for
 * the whole mesh — and every influence remembers the world transform its bone
 * had when the mesh was authored, its *bind world*. A vertex is placed by
 * summing, over its influences, the bone's motion since bind applied to the
 * rest position:
 *
 *     world(v) = Σ weight_i · ( B_cur,i · B_bind,i⁻¹ ) · v
 *
 * The bind transform is the whole reason a mesh can bend, and it is also what
 * makes a rig return to its rest shape. When nothing is animating, every
 * `B_cur` equals its `B_bind`, each bracket collapses to the identity, and the
 * vertex lands back exactly where it was authored. Drop the bind term and the
 * only thing a mesh can do is follow its bones rigidly, which means bending is
 * unrepresentable and a "mesh" is a decal on a stick.
 */

import type { Affine, Point } from './pose.js';
import type { BoneWorlds } from './fk.js';
import type { Id, MeshAttachment } from './skeleton.js';

const IDENTITY_SPACE: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/**
 * The inverse of an affine, falling back to the identity when there is none.
 *
 * The fallback rather than a throw: a zero-scale bone has no inverse, and a
 * vertex that stops following that bone is a rendering artefact, while a throw
 * here would take down the whole evaluation including every other character on
 * the map. `solveTwoBone` has the same shape for the same reason, and in both
 * cases the pose snapshot's refusal of non-finite numbers is what turns a
 * silently wrong frame into a loud one.
 */
export function invertAffine(m: Affine): Affine {
  const determinant = m.a * m.d - m.b * m.c;
  if (determinant === 0) return IDENTITY_SPACE;
  return {
    a: m.d / determinant,
    b: -m.b / determinant,
    c: -m.c / determinant,
    d: m.a / determinant,
    tx: (m.c * m.ty - m.d * m.tx) / determinant,
    ty: (m.b * m.tx - m.a * m.ty) / determinant,
  };
}

function transformPoint(m: Affine, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty };
}

/** One vertex's rest position through one bone's motion since bind. */
function throughMotion(bindWorld: Affine, currentWorld: Affine, rest: Point): Point {
  // current · bind⁻¹, folded into one matrix before it touches the point so the
  // vertex is transformed once rather than twice — which is not an optimisation,
  // it is the difference between one rounding and two in a golden.
  const inverse = invertAffine(bindWorld);
  const motion: Affine = {
    a: currentWorld.a * inverse.a + currentWorld.c * inverse.b,
    b: currentWorld.b * inverse.a + currentWorld.d * inverse.b,
    c: currentWorld.a * inverse.c + currentWorld.c * inverse.d,
    d: currentWorld.b * inverse.c + currentWorld.d * inverse.d,
    tx: currentWorld.a * inverse.tx + currentWorld.c * inverse.ty + currentWorld.tx,
    ty: currentWorld.b * inverse.tx + currentWorld.d * inverse.ty + currentWorld.ty,
  };
  return transformPoint(motion, rest);
}

/**
 * Every vertex of a mesh, in world space.
 *
 * A vertex with no usable influence lands on the origin rather than on its rest
 * position. That is deliberate: the alternative — leaving it at rest — is a
 * vertex that stays behind when the bone it was authored on moves, and the
 * artefact is a spike in the mesh pointing at the origin. Both are wrong; this
 * one is wrong where it is visible, and `validateSkeleton` already refuses a
 * vertex with no influence, so reaching it means a bone went missing between
 * validation and evaluation.
 */
export function skinMesh(mesh: MeshAttachment, worlds: BoneWorlds): readonly Point[] {
  return mesh.vertices.map((rest, index) => {
    let x = 0;
    let y = 0;
    for (const binding of mesh.bindings[index] ?? []) {
      const current = worlds.get(binding.boneId)?.world;
      if (current === undefined || binding.weight === 0) continue;
      const moved = throughMotion(binding.bindWorld, current, rest);
      x += moved.x * binding.weight;
      y += moved.y * binding.weight;
    }
    return { x, y };
  });
}

/** The world transform a bone has right now — the bind world to author a mesh against. */
export function bindWorldOf(boneId: Id, worlds: BoneWorlds): Affine {
  return worlds.get(boneId)?.world ?? IDENTITY_SPACE;
}

/** A single-influence binding. What a mesh that follows one bone rigidly needs. */
export function rigidBinding(
  boneId: Id,
  bindWorld: Affine,
): { readonly boneId: Id; readonly weight: number; readonly bindWorld: Affine } {
  return { boneId, weight: 1, bindWorld };
}
