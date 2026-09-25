import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Finding Cursor's agent transcripts.
 *
 * The layout, established by reading all 159 transcripts on the machine this
 * adapter was written against:
 *
 *   ~/.cursor/projects/<project-slug>/agent-transcripts/<uuid>/<uuid>.jsonl
 *
 * The project slug is lossy and NOT decoded here. It is a path with the
 * separators replaced, so a directory whose own name contains a hyphen is
 * indistinguishable from two path segments and a decoder would only be a
 * plausible-looking guess. Nothing in the transcript carries the real project
 * path, so there is nothing to recover.
 *
 * The uuid, by contrast, IS the session id, in full and untruncated — the
 * directory name and the file's base name are the same string, and every record
 * inside the file is silent about which session it belongs to. That is why the
 * session id comes from the path here and from the records in every other
 * adapter: for Cursor the path is the only place it exists.
 */

const CURSOR_DIRECTORY = '.cursor';
const PROJECTS_DIRECTORY = 'projects';

/** Where Cursor keeps its per-project state, and so its agent transcripts. */
export function cursorProjectsDirectory(home = homedir()): string {
  return join(home, CURSOR_DIRECTORY, PROJECTS_DIRECTORY);
}

export interface TranscriptFile {
  readonly path: string;
  /** The session this transcript is, which is also its file name without `.jsonl`. */
  readonly sessionId: string;
  /** The project slug from the path, which is the only project identity there is. */
  readonly projectId: string;
  readonly size: number;
  /** The transcript's mtime, because a transcript record carries no timestamp. */
  readonly modified: string;
}

/**
 * A UUID as Cursor writes one. Matched on the segments rather than as 32 hex
 * characters, because a transcript that failed to parse and was written under
 * some other name is not a session, and admitting it would produce a session id
 * the protocol has never seen.
 */
const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const TRANSCRIPT_SUFFIX = '.jsonl';

/**
 * Every agent transcript under `root`.
 *
 * Walked three levels deep rather than globbed, because the project directory is
 * named after a path and cannot be predicted, and the session directory inside
 * it is a uuid. A glob of one known shape silently misses the others, and a
 * watcher that misses a shape is not broken in any way a test notices — it just
 * never sees those sessions again.
 *
 * The sort is what makes a test that counts batches reproducible. Without it the
 * order comes from the filesystem and two runs over an unchanged tree can
 * disagree.
 *
 * Symlinks are not followed: `readdir` with `withFileTypes` reports one as
 * neither a directory nor a file, so a link pointing at an ancestor cannot make
 * the walk unbounded.
 */
export async function listTranscriptFiles(
  root = cursorProjectsDirectory(),
): Promise<readonly TranscriptFile[]> {
  const pending: string[] = [root];
  const found: TranscriptFile[] = [];
  while (pending.length > 0) {
    const directory = pending.pop() as string;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      // A project directory can be removed between polls. Nothing to read is a
      // normal answer here, not a failure to report.
      continue;
    }
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(full);
        continue;
      }
      const sessionId = sessionIdOf(entry.name);
      if (sessionId === undefined) continue;
      // Only a transcript inside `agent-transcripts/<uuid>/` is this adapter's.
      // A uuid-named jsonl anywhere else under projects/ is some other record,
      // and reading it would produce a session nobody ran.
      if (!isTranscriptPath(full, root)) continue;
      try {
        const stats = await stat(full);
        found.push({
          path: full,
          sessionId,
          projectId: projectSlugOf(full, root),
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      } catch {
        // Listed and then gone. A file that vanished cannot be the live session.
        continue;
      }
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/** The session a transcript file name names, or undefined if it names none. */
function sessionIdOf(name: string): string | undefined {
  if (!name.endsWith(TRANSCRIPT_SUFFIX)) return undefined;
  const base = name.slice(0, -TRANSCRIPT_SUFFIX.length);
  return SESSION_UUID.test(base) ? base : undefined;
}

/**
 * The layout, as segments rather than as a prefix string, because a prefix test
 * is satisfied by a project directory that merely STARTS with `agent-transcripts`
 * and not by a session directory that was renamed out from under us.
 */
const TRANSCRIPTS_SEGMENT = 'agent-transcripts';

/**
 * Whether a discovered file sits where a transcript is kept:
 * `<project-slug>/agent-transcripts/<uuid>/<uuid>.jsonl`.
 *
 * The session directory and the file are not required to share a name, even
 * though they do in all 159 transcripts surveyed. Requiring it would make a
 * future Cursor release that names them differently drop every session
 * silently, and a watcher that drops sessions is not broken in any way a test
 * notices.
 */
function isTranscriptPath(path: string, root: string): boolean {
  const segments = path.slice(root.length + 1).split('/');
  return (
    segments.length === 4 &&
    segments[1] === TRANSCRIPTS_SEGMENT &&
    segments[2] !== undefined &&
    segments[2] !== ''
  );
}

/**
 * The project slug a transcript path carries: the directory between the projects
 * root and `agent-transcripts`.
 *
 * Returned as-is, NOT decoded into a filesystem path. It is a path with the
 * separators replaced, so a directory whose own name contains a hyphen is
 * indistinguishable from two path segments, and a decoder would only be a
 * plausible-looking guess. The slug is a stable project identity, which is all
 * the protocol's `projectId` is asked to be.
 */
export function projectSlugOf(path: string, root: string): string {
  const segments = path.slice(root.length + 1).split('/');
  return segments[0] ?? path;
}
