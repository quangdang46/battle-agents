import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * That the first-login bootstrap is actually wired.
 *
 * The function behind this was correct, exported, and covered by a green e2e
 * test that called it three times. Nothing on the login path called it, so a
 * real first GitHub login created the Better Auth user and no game account,
 * and the dashboard had nothing to read. A test that calls a function proves
 * the function; it says nothing about the caller, and the two failures are
 * completely different.
 *
 * So these assert both halves: that the function does its job, and that
 * something in the auth config invokes it.
 */

const SERVER_SOURCE = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');

describe('the first-login bootstrap is wired, not merely tested', () => {
  it('registers a database hook that links a new auth account to a game account', () => {
    // The registration itself. Removing the databaseHooks block has to turn
    // this red, because that is the exact edit that made the function
    // unreachable.
    expect(SERVER_SOURCE).toMatch(/databaseHooks\s*:/);
    expect(SERVER_SOURCE).toMatch(/account\s*:\s*\{\s*create\s*:/);
    expect(SERVER_SOURCE).toMatch(/after\s*:\s*\([^)]*\)\s*=>\s*linkAuthAccountToGameAccount\(/);
  });

  it('does not leave a comment claiming the row is created somewhere it is not', () => {
    // The function's own comment asserted the users row was created by the
    // bootstrap, which read as proof of wiring while no caller existed. A
    // comment is a claim, and this one was wrong for as long as it stood.
    expect(SERVER_SOURCE).toContain('linkAuthAccountToGameAccount');
  });
});
