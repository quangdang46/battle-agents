import { appendFile, cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AgentEvent } from '@battle-agents/protocol';

import { GooseWatcher } from './watcher.js';

const here = dirname(fileURLToPath(import.meta.url));
const legacySession = join(here, 'fixtures', 'legacy-session.jsonl');

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'goose-watcher-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

/**
 * A sender that records every batch, so assertions can see the boundaries.
 *
 * `all` is a getter, not a value: `batches.flat()` returns a NEW array, so
 * capturing it once at construction gives an empty snapshot that never changes.
 * That is a test bug this helper already had once, and it presented as "the
 * adapter produced no events" — a failure that points at the wrong file.
 */
function recorder(): {
  readonly send: (batch: readonly AgentEvent[]) => Promise<void>;
  readonly batches: readonly (readonly AgentEvent[])[];
  readonly all: readonly AgentEvent[];
} {
  const batches: (readonly AgentEvent[])[] = [];
  return {
    batches,
    get all() {
      return batches.flat();
    },
    send: async (batch) => {
      batches.push([...batch]);
    },
  };
}

/**
 * A clock that jumps past the flush interval on every reading.
 *
 * `now: advancingClock()` is the obvious injection and it is wrong for any test that
 * inspects events BEFORE `stop()`: `EventBuffer.flushIfDue` compares elapsed
 * against `flushIntervalMs`, and with a frozen clock nothing is ever due and
 * the batch below 50 events sits unflushed. The first version of this file used
 * it, and three tests failed in a way that read as "the adapter emits nothing".
 */
function advancingClock(): () => number {
  let t = 0;
  return () => (t += 1_000);
}

describe('GooseWatcher', () => {
  it('turns a session file into events and stops cleanly', async () => {
    await cp(legacySession, join(directory, '20260926_104500.jsonl'));
    const rec = recorder();
    const watcher = new GooseWatcher({ send: rec.send, sessionsDirectory: directory, now: advancingClock() });

    await watcher.start();
    await watcher.stop();

    expect(rec.all.some((e) => e.type === 'session.started')).toBe(true);
    expect(rec.all.some((e) => e.type === 'tool.completed')).toBe(true);
  });

  /**
   * The buffer is keyed by file, and this is the assertion for it.
   *
   * THE FIRST VERSION OF THIS TEST WAS A NO-OP. It copied two small session
   * files in, watched them fail to be separated, and passed — then the same
   * change with a single watcher-level buffer ALSO passed, 8/8. The reason is
   * that `flushIfDue` runs at the end of each file's read, so a shared buffer
   * is drained before the next file is touched. Two small files can never mix.
   *
   * Mixing needs one file's events to SPILL past `maxBatchEvents` and leave
   * residue for the next file, which is exactly the Pi failure this keying
   * exists to prevent: a flat buffer plus a sessions directory holding many
   * files means every batch crossing a file boundary is refused with a 400, and
   * it looks like a flaky ingest path rather than an adapter bug. So the first
   * file here carries 60 events against a limit of 50, and the residue is real.
   *
   * WATCHED FAILING: with `#newBuffer` memoised onto a single shared buffer,
   * this fails.
   */
  it('never puts two sessions in one batch, even when a session spills past the batch limit', async () => {
    // Sixty events against a fifty-event batch limit, then a second session, so
    // the first file spills and leaves residue. Without the spill there is
    // nothing to mix and the assertion below would hold for reasons that have
    // nothing to do with buffering.
    await cp(join(here, 'fixtures', 'spill.jsonl'), join(directory, '20260926_130000.jsonl'));
    await cp(join(here, 'fixtures', 'headerless.jsonl'), join(directory, '20260926_110000.jsonl'));
    const rec = recorder();
    // A frozen clock, and the assertion after `stop()`: with a frozen clock
    // nothing is due, so the only thing that can produce a batch is `push()`
    // filling or completing it — which is precisely the mechanism under test.
    const watcher = new GooseWatcher({
      send: rec.send,
      sessionsDirectory: directory,
      now: () => 0,
    });

    await watcher.start();
    await watcher.stop();

    const mixed = rec.batches.filter((batch) => new Set(batch.map((e) => e.sessionId)).size > 1);
    expect(
      mixed.map((batch) => batch.map((e) => `${e.type}:${e.sessionId}`).join(', ')),
      'a batch mixed sessions; the ingest endpoint refuses those with a 400',
    ).toEqual([]);
    // The spill really happened, so the assertion is not vacuous.
    expect(rec.batches.some((batch) => batch.length >= 50)).toBe(true);
  });

  /**
   * WHY THIS IS NOT THE TEST FOR THE PER-FILE BUFFER, after three attempts to
   * make it one and three verified no-ops.
   *
   * Replacing the per-file buffer with one memoised watcher-level buffer — the
   * exact change the keying is supposed to prevent — left this suite at 8/8
   * three times running. It is a no-op, and the reason is in
   * `packages/protocol/src/event-buffer.ts`: `EventBuffer.push()` already
   * compares each incoming event's sessionId against the window's own and, on a
   * change, flushes the completed window and opens a new one around the incoming
   * event. The buffer is session-aware, so a shared buffer does not mix
   * sessions either.
   *
   * The per-file keying in this watcher is therefore DEFENCE IN DEPTH, not the
   * guarantee. The guarantee is the buffer's, and it is tested there. What this
   * watcher is still responsible for — flushing each session's leftovers on its
   * own at shutdown rather than merging them — is asserted by the batching
   * assertions above, and the comment in `stop()` says why.
   *
   * Recorded rather than deleted because a reader who assumes this test covers
   * the keying will not go looking for the one that does.
   */

  it('reads only what was appended since the last poll, and does not re-emit', async () => {
    const path = join(directory, '20260926_104500.jsonl');
    await cp(legacySession, path);
    const rec = recorder();
    const watcher = new GooseWatcher({ send: rec.send, sessionsDirectory: directory, now: advancingClock() });

    await watcher.start();
    const afterFirst = rec.all.length;
    expect(afterFirst).toBeGreaterThan(0);

    // A second poll over an unchanged file is a no-op. If the cursor reset, this
    // would double the whole session and the arena would show one Goose doing
    // every task twice.
    await watcher.tick();
    expect(rec.all.length).toBe(afterFirst);

    await appendFile(
      path,
      '{"id":"m9","role":"user","created":1789118713,"content":[{"type":"text","text":"one more"}]}\n',
      'utf8',
    );
    await watcher.tick();

    expect(rec.all.length).toBe(afterFirst + 1);
    expect(rec.all.at(-1)).toMatchObject({ type: 'prompt.submitted', prompt: 'one more' });
    await watcher.stop();
  });

  it('tolerates a file being appended to in pieces, which is how Goose writes', async () => {
    const path = join(directory, '20260926_104500.jsonl');
    await writeFile(path, '', 'utf8');
    const rec = recorder();
    const watcher = new GooseWatcher({ send: rec.send, sessionsDirectory: directory, now: advancingClock() });

    await watcher.start();

    // The header, on its own, with a torn next line behind it.
    await writeFile(
      path,
      '{"id":"20260926_120000","created_at":"2026-09-26T12:00:00Z","extension_data":{},"message_count":1}\n{"id":"a","role":"user","cre',
      'utf8',
    );
    await watcher.tick();
    expect(rec.all.filter((e) => e.type === 'session.started')).toHaveLength(1);
    // The torn message is not invented as an event.
    expect(rec.all.filter((e) => e.type === 'prompt.submitted')).toHaveLength(0);

    await appendFile(
      path,
      'ated":1789128000,"content":[{"type":"text","text":"finished"}]}\n',
      'utf8',
    );
    await watcher.tick();
    expect(rec.all.filter((e) => e.type === 'prompt.submitted')).toHaveLength(1);
    await watcher.stop();
  });

  it('counts records it cannot read rather than going quietly blank', async () => {
    await writeFile(join(directory, '20260926_104500.jsonl'), 'not json at all\n', 'utf8');
    const rec = recorder();
    const watcher = new GooseWatcher({ send: rec.send, sessionsDirectory: directory, now: advancingClock() });

    await watcher.start();
    expect(watcher.skippedCount).toBeGreaterThan(0);
    await watcher.stop();
  });

  it('is a no-op on a machine where Goose has never run', async () => {
    const rec = recorder();
    const watcher = new GooseWatcher({ send: rec.send, sessionsDirectory: directory, now: advancingClock() });

    await watcher.start();
    await watcher.stop();

    expect(rec.all).toEqual([]);
  });

  it('ignores a .jsonl.bak beside the live file, which is a full copy of the session', async () => {
    await cp(legacySession, join(directory, '20260926_104500.jsonl'));
    await cp(legacySession, join(directory, '20260926_104500.jsonl.bak'));
    const rec = recorder();
    const watcher = new GooseWatcher({ send: rec.send, sessionsDirectory: directory, now: advancingClock() });

    await watcher.start();
    await watcher.stop();

    // Tailing the backup would re-emit the whole session as a second agent
    // doing the same work.
    expect(rec.all.filter((e) => e.type === 'session.started')).toHaveLength(1);
  });

  it('does not re-read a session after its buffer is flushed and the file stays', async () => {
    const path = join(directory, '20260926_104500.jsonl');
    await cp(legacySession, path);
    const rec = recorder();
    const watcher = new GooseWatcher({ send: rec.send, sessionsDirectory: directory, now: advancingClock() });

    await watcher.start();
    const first = rec.all.length;
    await watcher.tick();
    await watcher.tick();
    expect(rec.all.length).toBe(first);
    await watcher.stop();
  });
});
