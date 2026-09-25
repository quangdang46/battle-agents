import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverTranscripts, SessionCursors } from './transcript.js';

/**
 * Which transcript a tail should be reading, and when it should move on.
 *
 * This had no test at all, which meant the partition the ingest endpoint
 * enforces had no proof: `POST /api/events` refuses a batch carrying two
 * sessionIds with a 400 that emits nothing, and the thing standing between a
 * glob over every project and that 400 is this file.
 *
 * Modification time, not name, is what orders these — so the ordering is set
 * explicitly with `utimes` rather than left to whatever order the filesystem
 * happened to create the files in.
 */

/** A projects root, with a mtime this test controls. */
function projectsRoot(): string {
  return mkdtempSync(join(tmpdir(), 'claude-projects-'));
}

function transcript(
  root: string,
  project: string,
  sessionId: string,
  mtimeSeconds: number,
): string {
  const directory = join(root, project);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${sessionId}.jsonl`);
  writeFileSync(path, '', 'utf8');
  utimesSync(path, mtimeSeconds, mtimeSeconds);
  return path;
}

describe('finding the session that is live', () => {
  it('reads the session id out of the filename, across every project', async () => {
    // The partition is free only because Claude names each transcript after the
    // session it belongs to. A file that could not say which session it was
    // would have to be opened to find out, and a batch is decided at send time.
    const root = projectsRoot();
    transcript(root, 'project-one', 'aaaaaaaa-1111', 1_000);
    transcript(root, 'project-two', 'bbbbbbbb-2222', 2_000);

    const found = await discoverTranscripts(root);

    expect(found.map((entry) => entry.sessionId).sort()).toEqual([
      'aaaaaaaa-1111',
      'bbbbbbbb-2222',
    ]);
  });

  it('puts the most recently written session first, because that is the live one', async () => {
    // The watcher follows the head of this list, so the sort is not cosmetic:
    // reversed, a long-running tail would follow a session that ended hours ago.
    const root = projectsRoot();
    transcript(root, 'project', 'older-session', 1_000);
    transcript(root, 'project', 'newer-session', 9_000);

    const [first] = await discoverTranscripts(root);

    expect(first?.sessionId).toBe('newer-session');
  });

  it('does NOT descend into a project directory, which is where most files are', async () => {
    // Beside the transcripts a project directory also holds `workflows/`,
    // `subagents/` and `memory/`, and those carry transcripts of their own. A
    // recursive walk would follow sessions this watcher was never asked about and
    // report work that did not happen in the session being watched.
    const root = projectsRoot();
    transcript(root, 'project', 'real-session', 5_000);
    const nested = join(root, 'project', 'subagents');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'other-session.jsonl'), '', 'utf8');
    utimesSync(join(nested, 'other-session.jsonl'), 9_000, 9_000);

    const found = await discoverTranscripts(root);

    // Newest overall, which is the trap: the nested file is the most recent
    // thing on disk and is still not a session this tail follows.
    expect(found.map((entry) => entry.sessionId)).toEqual(['real-session']);
  });

  it('skips a dotfile that merely ends in the extension, which has no session id', async () => {
    // `basename('.jsonl', '.jsonl')` is the empty string, and the protocol's
    // identifier is a string of at least one character. What actually excludes
    // it is `extname`: a name beginning with a dot is a dotfile, so `extname`
    // reads `.jsonl` as having NO extension and the file is not a transcript.
    // The alternative — accepting it — would hand the watcher a session named "",
    // whose events the endpoint refuses, in place of the real session.
    const root = projectsRoot();
    const directory = join(root, 'project');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, '.jsonl'), '', 'utf8');
    transcript(root, 'project', 'real-session', 5_000);

    const found = await discoverTranscripts(root);

    expect(found.map((entry) => entry.sessionId)).toEqual(['real-session']);
  });

  it('ignores files that are not transcripts', async () => {
    const root = projectsRoot();
    const directory = join(root, 'project');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'notes.md'), '', 'utf8');

    expect(await discoverTranscripts(root)).toEqual([]);
  });

  it('returns nothing for a root that is not there, rather than throwing', async () => {
    // `~/.claude/projects` accumulates a directory per project somebody has ever
    // opened, and a machine that has never run Claude Code has none at all. A
    // watcher that cannot start because a directory is missing reports the same
    // silence as an agent that did nothing.
    expect(await discoverTranscripts(join(projectsRoot(), 'never-created'))).toEqual([]);
  });
});

describe('where a session resumes', () => {
  it('starts a session it has never read at the beginning', () => {
    expect(new SessionCursors().offsetFor('never-seen')).toBe(0);
  });

  it('resumes where it stopped, per session', () => {
    // One shared offset would restart a returning session at byte zero of a
    // transcript that can reach tens of megabytes, and re-report all of it.
    const cursors = new SessionCursors();
    cursors.advanceTo('session-a', 4_096);
    cursors.advanceTo('session-b', 512);

    expect(cursors.offsetFor('session-a')).toBe(4_096);
    expect(cursors.offsetFor('session-b')).toBe(512);
    expect(cursors.size).toBe(2);
  });
});
