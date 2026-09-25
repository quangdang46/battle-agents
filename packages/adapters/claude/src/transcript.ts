import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { transcriptsDirectory } from './parsers/jsonl.js';

/**
 * Finding the transcript of a session that is still running.
 *
 * The brief says tail every transcript under the projects directory, and
 * taking that as a single recursive glob is the trap it names: a glob across
 * every project mixes concurrent sessions into one stream, and `POST
 * /api/events` refuses a batch carrying two sessionIds with a 400 that emits
 * nothing. So discovery partitions by session rather than by file, and the
 * partition is free — Claude names each transcript after the session it
 * belongs to, `<session-uuid>.jsonl`, inside a directory named after the
 * project. The id is in the filename, so the tail can tell two sessions apart
 * without opening either.
 *
 * Exactly one directory deep, and that is not a simplification. Beside the
 * transcripts, a project directory also holds `workflows/`, `subagents/` and
 * `memory/`, and those contain transcripts of their own: on the machine this
 * was written against, 74 session transcripts sat one level down and 3,304
 * more sat deeper still. A recursive walk would not merely find more files, it
 * would report 45x the work that happened, and each one belongs to a session
 * this watcher is not following.
 *
 * There is deliberately no second check for a name that yields no session id.
 * `extname` already covers it: a name beginning with a dot is a dotfile, so
 * `extname('.jsonl')` is empty and the file is not a transcript at all. Any name
 * that DOES pass the extension check has a non-empty stem by construction, so a
 * guard against the empty session id could never run — and a guard that cannot
 * run is a comment claiming a safety that does not exist.
 */

const TRANSCRIPT_EXTENSION = '.jsonl';

/** One session's transcript, as found on disk. */
export interface DiscoveredTranscript {
  /** The harness's own session id, which is the filename without its extension. */
  readonly sessionId: string;
  readonly path: string;
  /** Last write time, which is how a watcher decides which session is current. */
  readonly modifiedAtMs: number;
}

/**
 * Every transcript under a projects root, most recently written first.
 *
 * Modification time rather than name, because the name is a uuid and carries no
 * information about which session is running. An unreadable directory is skipped
 * rather than fatal: `~/.claude/projects` accumulates a directory per project
 * somebody has ever opened, and one of them being unreadable must not stop the
 * adapter from watching the session that is live right now.
 */
export async function discoverTranscripts(
  root = transcriptsDirectory(),
): Promise<readonly DiscoveredTranscript[]> {
  let projects: Dirent[];
  try {
    projects = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: DiscoveredTranscript[] = [];
  for (const project of projects) {
    if (!project.isDirectory()) {
      continue;
    }
    const directory = join(root, project.name);
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (extname(entry) !== TRANSCRIPT_EXTENSION) {
        continue;
      }
      const path = join(directory, entry);
      let modifiedAtMs: number;
      try {
        modifiedAtMs = (await stat(path)).mtimeMs;
      } catch {
        continue;
      }
      found.push({ sessionId: basename(entry, TRANSCRIPT_EXTENSION), path, modifiedAtMs });
    }
  }

  return found.sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
}

/**
 * The sessions a tail has already read from, one cursor each.
 *
 * A per-session cursor rather than one, because a session that is resumed has to
 * continue where it stopped. A single shared offset would restart a returning
 * session at the beginning of a transcript that can reach tens of megabytes, and
 * re-report everything in it.
 */
export class SessionCursors {
  readonly #offsets = new Map<string, number>();

  /** Where to resume reading a session, or 0 for one never read. */
  offsetFor(sessionId: string): number {
    return this.#offsets.get(sessionId) ?? 0;
  }

  /** Records how far a session has been read. */
  advanceTo(sessionId: string, offset: number): void {
    this.#offsets.set(sessionId, offset);
  }

  /** How many sessions are being tracked, so an unbounded map is visible. */
  get size(): number {
    return this.#offsets.size;
  }
}
