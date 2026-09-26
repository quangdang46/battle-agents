import { mkdtemp, rm, stat, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readNewLines, type ReadAt } from './reader.js';

/**
 * The byte cursor, tested against the failure it exists to prevent.
 *
 * Every test here is written so that reversing the slice/decode order, or
 * removing the short-read loop, makes it go RED. That was checked by doing both
 * and watching them fail — see the note on each test rather than taking this
 * comment's word for it.
 */

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'goose-reader-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function write(name: string, content: string): Promise<string> {
  const path = join(directory, name);
  await writeFile(path, content, 'utf8');
  return path;
}

describe('readNewLines', () => {
  it('returns complete records and leaves a partial tail for the next poll', async () => {
    const path = await write('s.jsonl', '{"a":1}\n{"b":2}\n{"c":');

    const first = await readNewLines(path, 0);

    // The torn record is NOT returned. Parsing half a JSON document is how a
    // tailer invents events, and Goose writes its header before appending, so
    // the first poll of a new session is the one most likely to catch a half
    // line.
    expect(first.lines).toEqual(['{"a":1}', '{"b":2}']);
    // 16 = 7 bytes of the first record + newline + 7 of the second + newline.
    // The cursor sits just PAST the newline that terminated a complete record.
    expect(first.offset).toBe(16);
  });

  it('picks the partial tail up on the next call, from the byte offset it returned', async () => {
    const path = await write('s.jsonl', '{"a":1}\n{"b":');

    const first = await readNewLines(path, 0);
    expect(first.lines).toEqual(['{"a":1}']);
    expect(first.lines.join('')).not.toContain('{"b"');

    await appendFile(path, '2}\n', 'utf8');

    const second = await readNewLines(path, first.offset);
    expect(second.lines).toEqual(['{"b":2}']);
  });

  /**
   * The non-ASCII test, and the reason this module exists.
   *
   * WATCHED FAILING: with the slice moved after the decode, the second poll
   * returns `0":"9"..."` instead of the whole record — the byte index is used to
   * index a decoded string, so every multi-byte character already passed shifts
   * the start of the next record. The record then fails to parse and would be
   * counted as unreadable, while the session still looks alive.
   */
  it('slices by byte so a multi-byte character in a record does not shift the cursor', async () => {
    const prompt = '日本語 🐛 مرحبا';
    const first = '{"id":"a","role":"user","created":1704110400,"content":[{"type":"text"}]}\n';
    const second = `{"id":"b","text":"${prompt}","role":"user","created":1704110401}\n`;

    // First poll sees ONLY the first record. The second is written afterwards,
    // because a single read over both would return both lines and prove nothing
    // about where the cursor resumes.
    const path = await write('s.jsonl', first);
    const one = await readNewLines(path, 0);
    expect(one.lines).toEqual([first.trimEnd()]);

    // The byte cursor advanced by the BYTE length, which is longer than the
    // string length because the fixture's emoji and accents are multi-byte.
    expect(one.offset).toBe(Buffer.byteLength(first, 'utf8'));
    expect(one.offset).toBe(first.length);

    await appendFile(path, second, 'utf8');

    // Resuming from the byte offset finds the second record whole. Decoding
    // first and slicing the string at that same index starts this read some
    // characters INTO the record instead.
    const resumed = await readNewLines(path, one.offset);
    expect(resumed.lines).toEqual([second.trimEnd()]);
    expect(JSON.parse(resumed.lines[0] as string)['text']).toBe(prompt);
  });

  it('would drift if the cursor advanced by character count instead of byte count', async () => {
    // The negative control for the test above, in the direction the bug goes.
    //
    // The multi-byte characters have to be in the record ALREADY PASSED, not in
    // the one about to be read: the cursor is what has to be short, and it only
    // falls short when the bytes it skipped over outnumbered the characters it
    // counted. A first record of pure ASCII has byteLength === length, and the
    // two cursors coincide — which is precisely why the bug survives on an
    // all-ASCII session and then appears on the first accented prompt.
    const first = `{"id":"a","text":"日本語 🐛 مرحبا"}\n`;
    const second = '{"id":"b","role":"user","created":1704110401}\n';
    const path = await write('s.jsonl', first + second);

    expect(Buffer.byteLength(first, 'utf8')).toBeGreaterThan(first.length);

    const byteCount = await readNewLines(path, Buffer.byteLength(first, 'utf8'));
    const characterCount = await readNewLines(path, first.length);

    // From the byte cursor: exactly one record, the second, whole.
    expect(byteCount.lines).toEqual([second.trimEnd()]);

    // From the character cursor: one EXTRA line, the tail of the first record
    // cut at a character boundary that is not a byte boundary. The second
    // record still arrives — which is what makes this bug so quiet, because the
    // file keeps growing and the session keeps looking alive. The fragment is
    // the casualty: it fails to parse, and every one of those is a counted skip.
    expect(characterCount.lines).toHaveLength(2);
    expect(characterCount.lines[0]).not.toBe(second.trimEnd());
    expect(() => JSON.parse(characterCount.lines[0] as string)).toThrow();
  });

  it('survives a multi-byte character split across two reads by rejoining bytes before decoding', async () => {
    const path = await write('s.jsonl', '{"t":"🐛"}\n');

    // One byte at a time: the emoji's four bytes arrive in four separate
    // reads, so every one of the middle two lands mid-character.
    const oneByteAtATime: ReadAt = async (handle, buffer, offset, position) => {
      const { bytesRead } = await handle.read(buffer, offset, 1, position);
      return bytesRead;
    };

    const result = await readNewLines(path, 0, oneByteAtATime);

    expect(result.lines).toEqual(['{"t":"🐛"}']);
  });

  /**
   * WATCHED FAILING: with `break` replaced by a continue, this hangs rather than
   * returning, and the watcher stops delivering for every other session in the
   * directory. It is here to pin the termination condition, not the happy path.
   */
  it('stops on a zero-length read instead of looping forever at EOF', async () => {
    // Two records, and a reader that reports EOF after the first one even
    // though the file has more in it — the only way to reach the `count === 0`
    // branch at all, since a real file ends when `position` reaches `size`.
    const path = await write('s.jsonl', '{"a":1}\n{"b":2}\n');
    let calls = 0;
    const liesAboutEof: ReadAt = async (handle, buffer, offset, position) => {
      calls += 1;
      if (calls > 1) return 0;
      const { bytesRead } = await handle.read(buffer, offset, 8, position);
      return bytesRead;
    };

    const result = await readNewLines(path, 0, liesAboutEof);

    expect(result.lines).toEqual(['{"a":1}']);
    // Two calls, not one and not unbounded: the loop asked again and honoured
    // the zero. With `continue` in place of `break` this never returns.
    expect(calls).toBe(2);
  });

  /**
   * WATCHED FAILING: with the loop replaced by a single `read` call, this
   * returns only the first chunk and the rest of the file is dropped with no
   * error and no event — a session that just stops mid-way.
   */
  it('loops on a short read rather than treating a partial return as the end of the file', async () => {
    const path = await write('s.jsonl', '{"a":1}\n');
    let calls = 0;
    // Returns two bytes at a time: every call is short, and a reader that
    // trusted one call would see a 2-byte file.
    const dribbles: ReadAt = async (handle, buffer, offset, position) => {
      calls += 1;
      const { bytesRead } = await handle.read(buffer, offset, 2, position);
      return bytesRead;
    };

    const result = await readNewLines(path, 0, dribbles);

    expect(result.lines).toEqual(['{"a":1}']);
    expect(calls).toBeGreaterThan(1);
  });

  it('reads a file larger than one chunk, which a single-call reader would truncate', async () => {
    // Comfortably past READ_CHUNK_BYTES (64KiB) so the loop has to iterate,
    // with a known record count to assert against.
    const filler = `${'x'.repeat(300)}\n`;
    const lines = Math.ceil((70 * 1024) / (filler.length + 1));
    await write('big.jsonl', filler.repeat(lines));

    let calls = 0;
    const counting: ReadAt = async (handle, buffer, offset, position) => {
      calls += 1;
      const { bytesRead } = await handle.read(buffer, offset, buffer.length, position);
      return bytesRead;
    };

    const path = join(directory, 'big.jsonl');
    expect((await stat(path)).size).toBeGreaterThan(64 * 1024);

    const result = await readNewLines(path, 0, counting);

    expect(result.lines).toHaveLength(lines);
    expect(calls).toBeGreaterThan(1);
  });

  it('restarts the cursor when a file shrank, rather than reading from a stale offset', async () => {
    const path = await write('s.jsonl', '{"a":1}\n{"b":2}\n');
    const whole = await readNewLines(path, 0);
    expect(whole.lines).toHaveLength(2);

    // Rotated and replaced with a shorter file under the same name.
    await writeFile(path, '{"z":9}\n', 'utf8');

    const afterRotation = await readNewLines(path, whole.offset);
    expect(afterRotation.lines).toEqual(['{"z":9}']);
  });

  it('reports a missing file as no lines and an unchanged offset, not a throw', async () => {
    const result = await readNewLines(join(directory, 'never-existed.jsonl'), 0);
    expect(result).toEqual({ lines: [], offset: 0 });
  });

  it('propagates a reader failure instead of swallowing it as an empty poll', async () => {
    const path = await write('s.jsonl', '{"a":1}\n');
    const exploding: ReadAt = async () => {
      throw new Error('disk went away');
    };

    // The handle is closed by the `finally` on this path. That is not asserted
    // directly — it would need a descriptor count, which is a worse flake than
    // the leak it guards. What IS asserted is that the failure propagates: a
    // silent empty poll would make a permissions problem look like an idle
    // agent, which is the failure the skipped counter exists to prevent.
    await expect(readNewLines(path, 0, exploding)).rejects.toThrow('disk went away');
  });
});
