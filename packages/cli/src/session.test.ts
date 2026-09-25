import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { clearSession, readSession, writeSession } from './session.js';

/**
 * The file holds a bearer token, so the assertions that matter are about
 * permissions and about a corrupted file not bricking the command.
 */
function scratchFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'agent-battle-')), 'session.json');
}

describe('the stored session', () => {
  it('round-trips a base URL and token', () => {
    const path = scratchFile();
    writeSession({ baseUrl: 'http://api.test', token: 'secret' }, path);

    expect(readSession(path)).toEqual({ baseUrl: 'http://api.test', token: 'secret' });
  });

  it('creates the file so only its owner can read it', () => {
    // A credential readable by every account on a shared machine is a leaked
    // credential, and the mode is the only thing standing between them.
    const path = scratchFile();
    writeSession({ baseUrl: 'http://api.test', token: 'secret' }, path);

    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('reports no session when the file is absent', () => {
    expect(readSession(join(scratchFile(), 'never-created.json'))).toBeUndefined();
  });

  it('treats a corrupted file as no session rather than throwing', () => {
    // Throwing here would make the file unfixable without a shell, and the
    // recoverable answer and the same answer: not logged in.
    const path = scratchFile();
    writeFileSync(path, 'not json at all');

    expect(readSession(path)).toBeUndefined();
  });

  it('treats a file of the wrong shape as no session', () => {
    const path = scratchFile();
    writeFileSync(path, JSON.stringify({ baseUrl: 42, token: null }));

    expect(readSession(path)).toBeUndefined();
  });

  it('logs out without complaining that there was nothing to log out of', () => {
    const path = scratchFile();
    writeSession({ baseUrl: 'http://api.test', token: 'secret' }, path);

    clearSession(path);
    expect(readSession(path)).toBeUndefined();

    expect(() => {
      clearSession(path);
    }).not.toThrow();
  });
});
