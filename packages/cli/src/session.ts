import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Where this machine keeps which server it talks to and what it presents.
 *
 * This is configuration, not game state, which is why it is allowed to live
 * here at all. The iron rule from plan section 31 is that the CLI touches no
 * database and holds no game logic; remembering a base URL and a bearer token
 * is neither. Everything the CLI can DO still goes through the five primitives.
 *
 * The file is created 0600 because it holds a credential, and the directory
 * 0700 for the same reason. On a shared machine a 0644 token file is a
 * credential readable by every account on it.
 */

/** What a session needs in order to make a call. */
export interface StoredSession {
  readonly baseUrl: string;
  readonly token: string;
}

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

export function sessionPath(): string {
  return join(homedir(), '.agent-battle', 'session.json');
}

/** The stored session, or undefined when this machine has not logged in. */
export function readSession(path = sessionPath()): StoredSession | undefined {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'baseUrl' in parsed &&
      'token' in parsed &&
      typeof (parsed as { baseUrl: unknown }).baseUrl === 'string' &&
      typeof (parsed as { token: unknown }).token === 'string'
    ) {
      return parsed as StoredSession;
    }
  } catch {
    // A file that is not the JSON we wrote is not a session. Falling through
    // to "not logged in" is recoverable; throwing here would make a corrupted
    // file unfixable without a shell.
  }
  return undefined;
}

/** Stores the session, replacing whatever was there. */
export function writeSession(session: StoredSession, path = sessionPath()): void {
  mkdirSync(dirname(path), { recursive: true, mode: DIRECTORY_MODE });
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, { mode: FILE_MODE });
}

/** Removes the stored session. Absent is not an error: logging out twice is fine. */
export function clearSession(path = sessionPath()): void {
  try {
    writeFileSync(path, '{}\n', { mode: FILE_MODE });
  } catch {
    // Nothing to clear is the same end state.
  }
}
