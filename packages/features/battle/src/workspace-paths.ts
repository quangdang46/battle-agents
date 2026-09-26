/**
 * Path containment, on its own, because two modules need it and they must not
 * need each other.
 *
 * `workspace.ts` needs it to confine a handle; `gates.ts` needs it to decide
 * whether a destructive command stays inside the participant's own root. If
 * either imported the other for this, the two would form a cycle, and a cycle
 * between a module that spawns processes and a module that decides what runs is
 * the kind of thing that works until an import is reordered.
 *
 * Nothing here touches a file. It is string and `realpath` arithmetic, and
 * `workspace.test.ts` is where it is proved — including against a symlink,
 * which is the only input that makes the difference between a prefix check and
 * a containment check.
 */

import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Why a path was refused. Named because "no" is not a diagnostic. */
export type WorkspaceEscapeReason =
  /** The caller asked for an absolute path, which is never inside a root. */
  | 'absolute-path'
  /** The path leaves the root once `..` segments are resolved. */
  | 'leaves-root'
  /** The path leaves the root only after a symlink is followed. */
  | 'symlink-leaves-root';

export class WorkspaceEscape extends Error {
  readonly reason: WorkspaceEscapeReason;
  readonly requested: string;

  constructor(requested: string, reason: WorkspaceEscapeReason) {
    super(
      `workspace refused "${requested}" (${reason}): a participant's handle is confined to ` +
        'its own root, including through symlinks',
    );
    this.name = 'WorkspaceEscape';
    this.reason = reason;
    this.requested = requested;
  }
}

/**
 * Whether `candidate` is `root` or something under it.
 *
 * `relative` rather than `startsWith`, because `/tmp/battle-abc` and
 * `/tmp/battle-abcdef` share a string prefix and differ by one character, and a
 * prefix check reports the second as inside the first. Both are real directory
 * names here — the provisioner makes one per session — so this is not a
 * theoretical sibling.
 */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * The real path of the deepest ancestor of `target` that exists, with the
 * remaining segments re-appended.
 *
 * `realpathSync` throws on a path that does not exist, and a workspace holds
 * plenty of paths that do not exist yet — that is what a file the judge has not
 * read yet looks like. Walking up to the first existing ancestor resolves
 * whatever symlinks ARE on the way, which is the only part that can point
 * outside the root.
 */
export function realpathOfNearestExisting(target: string): string {
  let current = target;
  const tail: string[] = [];
  for (;;) {
    if (existsSync(current)) {
      return tail.length === 0 ? realpathSync(current) : join(realpathSync(current), ...tail);
    }
    const parent = resolve(current, '..');
    if (parent === current) return target;
    tail.unshift(current.slice(parent.length + 1));
    current = parent;
  }
}

/**
 * The absolute path `requested` names inside `root`, or a refusal.
 *
 * Three refusals and they are not interchangeable, because "the guard fired" is
 * not a diagnosis:
 *
 *   absolute-path       A caller handing this an absolute path is a caller that
 *                       believes it may name anything. Refusing rather than
 *                       reinterpreting is the point: a path that happens to
 *                       already be inside the root would otherwise be accepted
 *                       while the same call naming a sibling's path is
 *                       rejected, and the rule would be "sometimes".
 *   leaves-root         `..` traversal, visible in the literal path.
 *   symlink-leaves-root The literal path is inside and the destination is not.
 *                       This is the one a string prefix check misses entirely,
 *                       and the reason the second check below resolves the
 *                       nearest existing ancestor rather than only `target`.
 */
export function resolveInside(root: string, requested: string): string {
  if (isAbsolute(requested)) {
    throw new WorkspaceEscape(requested, 'absolute-path');
  }
  const realRoot = realpathSync(root);
  const target = resolve(realRoot, requested);
  if (!isInside(realRoot, target)) {
    throw new WorkspaceEscape(requested, 'leaves-root');
  }
  if (!isInside(realRoot, realpathOfNearestExisting(target))) {
    throw new WorkspaceEscape(requested, 'symlink-leaves-root');
  }
  return target;
}
