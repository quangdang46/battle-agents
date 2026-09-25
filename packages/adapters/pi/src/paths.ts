import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Finding Pi's session logs.
 *
 * Pi keeps one append-only JSONL file per session under `~/.pi/agent/sessions`.
 * There is no socket to connect to and no bus to join: the session log IS the
 * plane, the same as a Codex rollout. What differs from Codex is the layout, and
 * the difference is the reason this file exists.
 *
 * The sessions directory holds two shapes at once, both verified against every
 * session on the machine that produced them:
 *
 *   `<sessions>/2026-08-22T02-34-12-009Z_01a02751-….jsonl`
 *   `<sessions>/--Users-tranquangdang21-Projects-hashline--/<same>.jsonl`
 *
 * The second nests the session under a directory named after the project
 * directory it ran in, with the path separators replaced by hyphens. A glob of
 * one shape silently misses the other, and a watcher that misses a shape is not
 * broken in any way a test notices — it just never sees those sessions again.
 * So discovery walks, rather than globbing one level.
 *
 * The encoded directory name is NOT decoded here. It is lossy and irrecoverable:
 * a project directory whose own name contains a hyphen is indistinguishable
 * from two path segments, so `--Users-a-b-c--` could be `/Users/a/b/c` or
 * `/Users/a-b/c`. Every real session header carries the real `cwd`, so there is
 * nothing to recover and a decoder would only be a plausible-looking guess.
 */

const PI_AGENT_DIRECTORY = '.pi';
const PI_SESSIONS_DIRECTORY = 'sessions';

/** Where Pi keeps its session logs. */
export function piSessionsDirectory(home = homedir()): string {
  return join(home, PI_AGENT_DIRECTORY, 'agent', PI_SESSIONS_DIRECTORY);
}

/**
 * Every session log under `root`, in a stable order.
 *
 * Sorted so that two runs over an unchanged directory discover the same files in
 * the same sequence. Without it the order comes from the filesystem, and a test
 * that appends to two session files could see them picked up in either order on
 * two different machines — a flake that would be read as a race in the watcher.
 *
 * The walk does not follow symlinks. `readdir` with `withFileTypes` reports a
 * symlink as a link rather than a directory, so a symlink loop cannot make this
 * recurse forever; a symlinked session directory is simply not descended into.
 */
export async function listSessionFiles(root: string): Promise<readonly string[]> {
  const found: string[] = [];
  await collect(root, found);
  return found.sort();
}

async function collect(directory: string, found: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    // A directory that vanished or was never created is the normal state of a
    // machine where Pi has not run yet, not a failure to report.
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(path, found);
      continue;
    }
    if (isSessionLog(entry.name)) found.push(path);
  }
}

/**
 * Whether a file name is a session log.
 *
 * The suffix test, not the extension test, and the difference is load-bearing:
 * Pi leaves `<session>.jsonl.bak` and `<session>.jsonl.bak.1` beside the live
 * file, and a backup is a full copy of the session. Tailing one would re-emit
 * every event that session ever produced, as a second agent doing the same work.
 */
function isSessionLog(name: string): boolean {
  return name.endsWith(SESSION_LOG_SUFFIX);
}

const SESSION_LOG_SUFFIX = '.jsonl';
