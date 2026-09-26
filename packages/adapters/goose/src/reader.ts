import { open, stat, type FileHandle } from 'node:fs/promises';

/**
 * Reading a session log from wherever the cursor left off.
 *
 * The offset in and out of this module is a BYTE offset, and it has to be:
 * `stat` reports bytes, and a file being appended to between two polls is the
 * normal case, not the edge case. Everything below exists because of one
 * decision — slice the bytes, THEN decode — and getting that order wrong is the
 * single most damaging bug this adapter could ship.
 *
 * **What goes wrong the other way round.** Decoding first and slicing the
 * decoded string at a byte offset reads too far in. Every character outside
 * ASCII is one code unit but two or more bytes, so the byte index and the
 * string index drift apart by one per such character the reader has already
 * passed, and each poll starts its next record that many characters late. The
 * records then arrive as fragments, fail to parse, and get counted as
 * unreadable — while the session still looks perfectly alive. Any prompt, diff
 * or path with an accent, an emoji or a CJK character in it is enough to start
 * it. The Pi adapter measured 33 silently-corrupted records out of 750 on a
 * real session for exactly this reason, and Goose writes non-ASCII in prompts
 * routinely, so the trap is live here and not hypothetical.
 *
 * Slicing before decoding is also what stops a multi-byte character that is
 * half-written at the tail from corrupting a line that did arrive whole.
 *
 * **A trailing line with no newline is left for the next poll.** A JSON
 * document cut in half is not a document, and parsing half of one is how a
 * tailer invents events. Goose creates a session file by writing its header and
 * then appending, so the very first poll of a brand new session is the poll
 * most likely to catch a half-written line.
 */

/** The byte a JSONL record ends with, as a Buffer searches for it: a value, not a string. */
const NEWLINE = 0x0a;

/**
 * How many bytes one `read` call asks for.
 *
 * Not a tuning knob: it exists so the short-read loop below has something to
 * shorten. A single read is allowed to return fewer bytes than were asked for
 * and still more may be coming, so a reader that trusts one call is a reader
 * that silently drops the rest of the file.
 */
const READ_CHUNK_BYTES = 64 * 1024;

/**
 * One read from an open file at a position. Injectable so the short-read loop
 * can be tested without a device that actually short-reads.
 *
 * A test on a local filesystem would never see one: `read` on a regular file
 * returns the full count every time, so a loop that ignored the returned length
 * would pass against a real file forever. The loop is the thing under test and
 * it needs a reader that can violate its contract on demand.
 */
export type ReadAt = (
  handle: FileHandle,
  buffer: Buffer,
  offset: number,
  position: number,
) => Promise<number>;

/** The default reader: one `fs` call, honouring nothing about future calls. */
const readAt: ReadAt = async (handle, buffer, offset, position) => {
  const { bytesRead } = await handle.read(buffer, offset, buffer.length, position);
  return bytesRead;
};

export interface ReadResult {
  /** Complete records, decoded. Never contains a partial line. */
  readonly lines: readonly string[];
  /** The byte offset to resume from: what was actually consumed, not what was read. */
  readonly offset: number;
}

/**
 * Reads whatever a session log has appended since `offset`.
 *
 * A file that shrank — rotated, or replaced — restarts the cursor from zero
 * rather than reading from a stale offset into whatever now occupies the path.
 */
export async function readNewLines(
  path: string,
  offset: number,
  read: ReadAt = readAt,
): Promise<ReadResult> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return { lines: [], offset };
  }
  if (size === 0) return { lines: [], offset };
  if (size < offset) return readNewLines(path, 0, read);

  const handle = await open(path, 'r');
  try {
    const fresh = await readFrom(handle, offset, size, read);
    const lastNewline = fresh.lastIndexOf(NEWLINE);
    if (lastNewline === -1) return { lines: [], offset };
    return {
      // Decode AFTER the slice, and only up to the last newline: everything
      // after it is a record the harness has not finished writing.
      lines: fresh.toString('utf8', 0, lastNewline).split('\n'),
      offset: offset + lastNewline + 1,
    };
  } finally {
    await handle.close();
  }
}

/**
 * The short-read loop, which is the reason this function takes a `ReadAt`.
 *
 * Two things it must get right, and both are things a one-shot read gets wrong
 * on some filesystem or under some load:
 *
 * - It loops until the buffer is full or EOF. A `read` returning fewer bytes
 *   than asked for is NORMAL, not EOF, and treating it as EOF truncates the
 *   file silently — no error, no event, a session that just stops mid-way.
 * - A `read` that returns ZERO before the expected end is EOF, and must break.
 *   Looping on it forever is the other failure, and it is worse: the poll hangs
 *   and the watcher stops delivering for every other session in the directory.
 *
 * It accumulates into one buffer and concatenates, so a multi-byte character
 * split across two reads is rejoined in bytes before anything is decoded.
 */
async function readFrom(
  handle: FileHandle,
  from: number,
  size: number,
  read: ReadAt,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let filled = 0;
  let position = from;

  while (position < size) {
    const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, size - position));
    const count = await read(handle, buffer, 0, position);
    if (count === 0) break;
    chunks.push(buffer.subarray(0, count));
    filled += count;
    position += count;
  }

  return Buffer.concat(chunks, filled);
}
