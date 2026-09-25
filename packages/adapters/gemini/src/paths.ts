import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Finding Gemini's chat store.
 *
 * The bead said "JSON logs under ~/.gemini", which is not a path. What is on
 * disk, read across every project directory on the machine this adapter was
 * written against, is:
 *
 *   ~/.gemini/tmp/<project>/chats/session-<ts>-<uuid8>.jsonl     (43 files)
 *   ~/.gemini/tmp/<project>/chats/session-<ts>-<uuid8>.json      (1 file)
 *
 * The `logs/` sibling directory exists in every project directory and is EMPTY
 * in every one of them, so an implementation that read the brief literally would
 * watch nothing and conclude Gemini is unobservable. It is not; `chats/` is the
 * store.
 *
 * There are two formats, not one, and both are handled:
 *
 * - `.jsonl` is append-only. Line 0 is a header carrying `sessionId`, and the
 *   rest are records plus interleaved `{"$set":…}` patches. Every one of the 42
 *   files is this shape.
 * - `.json` is a single whole-document rewrite — pretty-printed, with the
 *   session id at the top and a `messages` array. There is exactly one on this
 *   machine and it is the NEWEST store, three weeks later than every `.jsonl`,
 *   so the format changed and both are live. Its `project` directory is a sha256
 *   rather than a readable slug, which is part of the same change.
 *
 * So discovery takes both extensions and the parser knows both, and the two
 * readers are as different as the formats are: one is a byte cursor, the other
 * cannot be, because its file is rewritten in full every turn.
 */

const GEMINI_DIRECTORY = '.gemini';
const TMP_DIRECTORY = 'tmp';
const CHATS_DIRECTORY = 'chats';
const INSTALLATION_ID_FILE = 'installation_id';

export interface GeminiChatFile {
  readonly path: string;
  /**
   * Which of the two stores this is. The reader differs — a byte cursor against
   * an append-only file, a re-read against a rewritten one — and a caller that
   * guessed would either double-emit or never emit at all.
   */
  readonly shape: 'jsonl' | 'json';
  readonly size: number;
  /** mtime, so a poll can skip a `.json` file that has not changed. */
  readonly modified: string;
}

/** Where Gemini keeps its per-project scratch directories. */
export function geminiProjectsDirectory(home = homedir()): string {
  return join(home, GEMINI_DIRECTORY, TMP_DIRECTORY);
}

/**
 * Gemini writes an installation id, so unlike Cursor this adapter can name the
 * installation a session belongs to instead of inventing one.
 *
 * Falls back to the harness name when the file is absent — a machine where
 * Gemini has never run, or a home directory the caller injected for a test. The
 * protocol requires a non-empty identifier, not a truthful one, and a session
 * that cannot be attributed to an installation is still a real session.
 */
export async function geminiInstallationId(home = homedir()): Promise<string> {
  try {
    const raw = (await readFile(join(home, GEMINI_DIRECTORY, INSTALLATION_ID_FILE), 'utf8')).trim();
    return raw === '' ? 'gemini' : raw;
  } catch {
    return 'gemini';
  }
}

const SESSION_FILE = /^session-.*\.(jsonl|json)$/;

/**
 * Every chat file under `root`, in a stable order.
 *
 * Sorted so a poll reads files in the same sequence every time, which is what
 * makes a test that counts batches reproducible. The walk is depth-bounded to
 * `<project>/chats/` because that is the only place either format has ever been
 * observed, and a wider walk would pick up whatever else a future Gemini
 * release writes beside it.
 */
export async function listChatFiles(
  root = geminiProjectsDirectory(),
): Promise<readonly GeminiChatFile[]> {
  const found: GeminiChatFile[] = [];
  let projects;
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch {
    // A machine where Gemini has never run. Nothing to watch is the normal
    // answer here, not a failure to report.
    return [];
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const chats = join(root, project.name, CHATS_DIRECTORY);
    let entries;
    try {
      entries = await readdir(chats, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !SESSION_FILE.test(entry.name)) continue;
      const full = join(chats, entry.name);
      try {
        const stats = await stat(full);
        found.push({
          path: full,
          shape: entry.name.endsWith('.json') ? 'json' : 'jsonl',
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      } catch {
        continue;
      }
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}
