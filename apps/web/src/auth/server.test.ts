import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MissingAuthConfigurationError, readAuthEnvironment } from './server.js';

const SERVER_SOURCE = fileURLToPath(new URL('./server.ts', import.meta.url));

const COMPLETE = {
  BETTER_AUTH_SECRET: 'a-secret-that-is-long-enough-for-the-check',
  BETTER_AUTH_URL: 'http://127.0.0.1:3000',
  GITHUB_CLIENT_ID: 'dev-client-id',
  GITHUB_CLIENT_SECRET: 'dev-client-secret',
  DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:5443/battle_test',
} as const;

/**
 * Plan section 38's hard separation, asserted.
 *
 * Better Auth owns the human and nothing else. The failure this guards is slow
 * and expensive: an agent token added to an auth config looks reasonable, works,
 * and then cannot be separated from session cookies without rewriting every
 * login. Catching it here costs a test; catching it later costs an extraction.
 */
describe('Better Auth owns the human and nothing else', () => {
  it('names no game concept in its configuration', () => {
    const source = readFileSync(SERVER_SOURCE, 'utf8');

    // Comments are stripped first, because this file's whole argument is in its
    // prose: "no agents, no characters" would otherwise trip its own guard.
    //
    // The workspace namespace is stripped too, and word boundaries are used.
    // Both because of a false positive this guard hit immediately: the package
    // is @battle-agents, so a substring search for "agent" flags every import
    // from the database layer — and a hyphen is a word boundary, so boundaries
    // alone are not enough either. A guard that fires on the project's own
    // namespace is noise that gets switched off, which is how the credential
    // gate in this repo went dead twice.
    const code = stripComments(source).replace(/@battle-agents[\w/-]*/g, '@pkg');

    for (const reserved of [
      'agents?',
      'characters?',
      'installations?',
      'sessions?\\.started',
      'progressions?',
      'levels?',
      'reputations?',
      'bount(?:y|ies)',
    ]) {
      expect(code, `"${reserved}" must not appear in the auth config`).not.toMatch(
        new RegExp(`\\b${reserved}\\b`, 'i'),
      );
    }
  });

  it('leaves the game account to our own bootstrap, not a callback', () => {
    const source = readFileSync(SERVER_SOURCE, 'utf8');

    // Comments are stripped before this check, and that is not a technicality:
    // the file's own comment explains at length why mapProfileToUser must not
    // come back, which a raw substring search would read as its presence.
    const code = stripComments(source);

    expect(code).not.toContain('mapProfileToUser');
    expect(readFileSync(new URL('./bootstrap.ts', import.meta.url), 'utf8')).toContain(
      'bootstrapGameAccount',
    );
    expect(code).not.toMatch(/createAgent|agents\.(insert|values)/);
  });
});

describe('reading the auth configuration', () => {
  it('accepts a complete environment', () => {
    const environment = readAuthEnvironment({ ...COMPLETE });

    expect(environment).toMatchObject({
      baseUrl: 'http://127.0.0.1:3000',
      githubClientId: 'dev-client-id',
    });
  });

  it('names every missing variable at once rather than one per restart', () => {
    const failure = (() => {
      try {
        readAuthEnvironment({ BETTER_AUTH_URL: 'http://127.0.0.1:3000' });
        return null;
      } catch (error) {
        return error as MissingAuthConfigurationError;
      }
    })();

    expect(failure).toBeInstanceOf(MissingAuthConfigurationError);
    expect(failure?.missing).toEqual([
      'BETTER_AUTH_SECRET',
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
    ]);
  });

  it('treats a blank value as missing', () => {
    expect(() => readAuthEnvironment({ ...COMPLETE, GITHUB_CLIENT_SECRET: '   ' })).toThrow(
      /GITHUB_CLIENT_SECRET/,
    );
  });

  it('spells out the two URLs GitHub has to be given', () => {
    // redirect_uri_mismatch is the most likely reason a newcomer's first run
    // fails, and an error that says which two URLs to register is worth more
    // than one that says "invalid client".
    const failure = (() => {
      try {
        readAuthEnvironment({});
        return null;
      } catch (error) {
        return error as Error;
      }
    })();

    expect(failure?.message).toContain('http://127.0.0.1:3000/api/auth/callback/github');
    expect(failure?.message).toContain('redirect_uri_mismatch');
  });

  it('refuses a localhost base URL, because GitHub will not accept one', () => {
    // The scenario this test used to fake. It passed 127.0.0.1 in and asserted
    // 127.0.0.1 came out, which describes the fixture rather than the code: a
    // real caller who sets localhost got it accepted silently and then failed at
    // GitHub with redirect_uri_mismatch, after the app was up and the OAuth app
    // was registered. The function checks now, so this asserts the check.
    expect(() =>
      readAuthEnvironment({ ...COMPLETE, BETTER_AUTH_URL: 'http://localhost:3000' }),
    ).toThrow(/Use 127\.0\.0\.1/);
    expect(() =>
      readAuthEnvironment({ ...COMPLETE, BETTER_AUTH_URL: 'http://localhost:3000' }),
    ).toThrow(/redirect_uri_mismatch/);
  });

  it('accepts the loopback address GitHub is told to use', () => {
    const environment = readAuthEnvironment({ ...COMPLETE });

    expect(environment.baseUrl).toBe('http://127.0.0.1:3000');
  });
});

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
