import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Finding Goose's session logs.
 *
 * **This is the part of the Goose adapter that is least trustworthy, and the
 * reason is written here rather than discovered by the next person.**
 *
 * The bead this implements says Goose "writes one JSONL file per session under
 * `~/.local/share/goose/sessions/`". Goose is not installed on the machine this
 * was written on, so that path could not be checked against anything. Reading
 * Goose's own source instead says two things that contradict the sentence:
 *
 * 1. **The path is not one path.** `config/paths.rs` resolves the data
 *    directory through the `etcetera` crate with
 *    `{ top_level_domain: "Block", author: "Block", app_name: "goose" }`. Its
 *    own comment spells out the macOS result:
 *    `~/Library/Application Support/Block/goose/`. The XDG form is what Linux
 *    gets. And `GOOSE_PATH_ROOT`, if set to an absolute path, bypasses `etcetera`
 *    entirely and yields `$GOOSE_PATH_ROOT/data`. Three layouts, none of which
 *    is the one in the brief on macOS.
 * 2. **Current Goose does not write JSONL at all.** It writes SQLite — see the
 *    header in `parser.ts`, which is the long version of this. `session/legacy.rs`
 *    is the code that READS the JSONL files, and `list_sessions` in it filters
 *    for a `.jsonl` extension precisely because those files are from the past.
 *
 * So this module searches a LIST of candidate roots rather than asserting one.
 * That is the honest shape for a format nobody has observed on this machine: it
 * covers the layouts the source and the brief each name, and `sessionsDirectory`
 * on the watcher lets a caller state the truth directly. Guessing a single path
 * and hardcoding it would be a guess that looks like a fact, which is the
 * failure this repository keeps paying for.
 *
 * What is NOT guessed: the file-name pattern, the record shape, the role
 * vocabulary and the tool blocks. Those are read out of Goose's own source and
 * its own test fixtures, and `parser.ts` says which file each claim came from.
 */

const SESSIONS_DIRECTORY = 'sessions';
const SESSION_LOG_SUFFIX = '.jsonl';

/**
 * Every directory that could hold Goose session logs, in the order they are
 * searched.
 *
 * Injectable through the watcher rather than hardcoded, because a list of
 * guesses is only better than one guess if the caller can replace it.
 */
export function gooseSessionRoots(
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const roots: string[] = [];

  // An explicit root overrides the platform search entirely: `Paths::get_dir`
  // joins `data` onto it and never appends the app name, so the session
  // directory is `<root>/data/sessions`.
  const pathRoot = env['GOOSE_PATH_ROOT'];
  if (pathRoot !== undefined && pathRoot !== '' && pathRoot.startsWith('/')) {
    roots.push(join(pathRoot, 'data', SESSIONS_DIRECTORY));
  }

  // The XDG form, honouring an override, then its default. The brief names this
  // one and it is right for a Linux install.
  const xdgDataHome = env['XDG_DATA_HOME'];
  if (xdgDataHome !== undefined && xdgDataHome !== '') {
    roots.push(join(xdgDataHome, 'goose', SESSIONS_DIRECTORY));
  }
  roots.push(join(home, '.local', 'share', 'goose', SESSIONS_DIRECTORY));

  // What `etcetera` produces on macOS, per the comment in `config/paths.rs`.
  roots.push(join(home, 'Library', 'Application Support', 'Block', 'goose', SESSIONS_DIRECTORY));

  return roots;
}

/**
 * Every session log under any of `roots`, in a stable order.
 *
 * Sorted so two runs over an unchanged set of directories discover the same
 * files in the same sequence. Without it the order comes from the filesystem,
 * and a test that appends to two session files could see them picked up in
 * either order on two different machines — a flake that would be read as a race
 * in the watcher.
 */
export async function listSessionFiles(roots: readonly string[]): Promise<readonly string[]> {
  const found: string[] = [];
  for (const root of roots) {
    await collect(root, found);
  }
  return found.sort();
}

async function collect(directory: string, found: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    // A directory that vanished or was never created is the normal state of a
    // machine where Goose has not run yet, not a failure to report.
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
 * The suffix test, not the extension test: an editor or a crash can leave
 * `20240101_120000.jsonl.bak` beside the live file, and a backup is a full copy
 * of the session. Tailing one would re-emit every event that session ever
 * produced, as a second agent doing the same work.
 */
function isSessionLog(name: string): boolean {
  return name.endsWith(SESSION_LOG_SUFFIX);
}

export { SESSION_LOG_SUFFIX };
