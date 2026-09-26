import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Finding Aider's chat transcript.
 *
 * THE LOCATION, and it is not the one the bead this implements named. Aider has
 * no `~/.aider/chat.history.md` and no `~/.aider/conversations/`. What exists is
 * one Markdown file in the PROJECT, named by `--chat-history-file` and
 * defaulting to a constant in the git root:
 *
 *   <git-root>/.aider.chat.history.md
 *
 * Established by reading aider-chat 0.86.2 (the sdist, Apache-2.0) rather than
 * by looking at a user's disk, because Aider is not installed on the machine
 * this adapter was written against. `aider/args.py:274` builds the default from
 * `git_root`, falling back to the cwd when there is no git repo. Nothing in
 * `~/.aider/` holds conversation history: that directory holds `analytics.json`,
 * `installs.json`, `oauth-keys.env` and `caches/`, and it is where Aider keeps
 * MODEL metadata, not sessions. The full inventory is in the parser header,
 * because "which file do we read" is the question this bead exists to answer and
 * the answer is not the obvious one.
 *
 * Aider adds `.aider*` to the project's `.gitignore` on its first run
 * (`aider/main.py:163`), so this file is a local artifact by design and is not
 * committed. That is why nothing in a checkout can stand in for a captured
 * transcript, and why the fixtures beside the parser are reconstructed from the
 * writers in Aider's source rather than captured from a run. See
 * `parsers/transcript.ts`.
 *
 * THE PROJECT IS THE UNIT. Every other adapter watches a directory the harness
 * owns; Aider writes into the user's repository, so there is no such directory
 * to scan. A watcher is pointed at one project, or at a parent of projects, and
 * the file is found by name inside it. `--chat-history-file` can point
 * anywhere, so a caller with a non-default path passes it in directly; only the
 * default name is discovered, exactly as the Cursor adapter discovers only
 * Cursor's own layout and takes everything else by an explicit path.
 */

export const AIDER_CHAT_HISTORY_BASENAME = '.aider.chat.history.md';

export interface TranscriptFile {
  readonly path: string;
  /** The project the transcript belongs to, which is the directory holding it. */
  readonly projectId: string;
  readonly size: number;
  /** The transcript's mtime, because no Aider record carries a timestamp. */
  readonly modified: string;
}

/**
 * Every Aider chat transcript under `root`.
 *
 * Walked rather than globbed: the transcript sits in a project directory whose
 * name cannot be predicted, so the shape to match is a file NAME at an unknown
 * depth. A glob of one known depth would silently miss every project but the
 * first, and a watcher that misses sessions is not broken in any way a test
 * notices.
 *
 * The sort is what makes a test that counts batches reproducible. Without it the
 * order comes from the filesystem and two runs over an unchanged tree disagree.
 *
 * Symlinks are not followed: `readdir` with `withFileTypes` reports one as
 * neither a directory nor a file, so a link pointing at an ancestor cannot make
 * the walk unbounded.
 */
export async function listTranscriptFiles(root: string): Promise<readonly TranscriptFile[]> {
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
      if (entry.name !== AIDER_CHAT_HISTORY_BASENAME) continue;
      try {
        const stats = await stat(full);
        found.push({
          path: full,
          projectId: directory,
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
