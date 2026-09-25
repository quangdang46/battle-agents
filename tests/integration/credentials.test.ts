import { hashToken, issueCredential } from '@battle-agents/agent';
import { authenticate, AuthenticationError } from '@battle-agents/db';
import {
  agents,
  closeDatabasePool,
  createDatabase,
  DrizzleCredentialStore,
  installations,
  users,
  type Database,
} from '@battle-agents/db';
import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The credential lifecycle against a live Postgres: issue, use, rotate, revoke.
 *
 * The unit tests prove the rules with an in-memory store. These prove the
 * database behaves — above all that the token it holds is a hash, which is the
 * one claim here that unit tests structurally cannot make.
 */

const DATABASE_URL_VARIABLE = 'DATABASE_URL';
const POOL_MAX_CONNECTIONS = 4;
const NOW = '2026-09-24T12:00:00.000Z';
const HOUR_MS = 60 * 60 * 1000;

let pool: Pool;
let database: Database;
let store: DrizzleCredentialStore;
let installationId = '';
let ownerUserId = '';

function at(msFromNow: number): string {
  return new Date(Date.parse(NOW) + msFromNow).toISOString();
}

function bearer(token: string) {
  return {
    headers: new Map([['authorization', `Bearer ${token}`]]) as unknown as {
      get(name: string): string | null;
    },
    url: 'https://agentbattle.gg/api/events',
  };
}

beforeAll(async () => {
  const connectionString = process.env[DATABASE_URL_VARIABLE];
  if (connectionString === undefined) {
    throw new Error(
      `${DATABASE_URL_VARIABLE} is not set. Run through scripts/test-m0.sh so the compose Postgres is up, or export it before running this suite.`,
    );
  }
  pool = new Pool({ connectionString, max: POOL_MAX_CONNECTIONS });
  database = createDatabase(pool);
  store = new DrizzleCredentialStore(database);

  const githubId = `${randomUUID()}-credentials`;
  const [owner] = await database
    .insert(users)
    .values({ githubId, login: githubId })
    .returning({ id: users.id });
  ownerUserId = owner?.id ?? '';
  const [installation] = await database
    .insert(installations)
    .values({ userId: ownerUserId, installationKey: `${randomUUID()}-credentials` })
    .returning({ id: installations.id });
  installationId = installation?.id ?? '';
});

afterAll(async () => {
  if (ownerUserId !== '') {
    // Cascades to installations and to the credentials hanging off them.
    await database.delete(users).where(eq(users.id, ownerUserId));
  }
  await closeDatabasePool(pool);
});

async function issue(id: string, scopes: readonly string[] = ['agent.read']) {
  const issued = issueCredential(NOW);
  await store.insert({
    id,
    tokenHash: issued.hash,
    installationId,
    agentId: null,
    scopes,
    expiresAt: issued.expiresAt,
  });
  return { id, token: issued.token, hash: issued.hash };
}

describe('a credential against Postgres', () => {
  it('stores a hash and never the token', async () => {
    const issued = await issue(randomUUID());

    // Read the row the way an attacker with a database dump would: the whole
    // row, as text. The token must not be anywhere in it.
    const result = await database.execute<{ row: Record<string, unknown> }>(
      sql`SELECT row_to_json(agent_credentials) AS row FROM agent_credentials WHERE id = ${issued.id}`,
    );
    const row = result.rows[0]?.row as { token_hash: string } | undefined;
    expect(JSON.stringify(result.rows)).not.toContain(issued.token);
    expect(row?.token_hash).toBe(issued.hash);
  });

  it('authenticates a token it issued', async () => {
    const issued = await issue(randomUUID());

    const caller = await authenticate({ store, now: NOW }, bearer(issued.token));

    expect(caller.installationId).toBe(installationId);
  });

  it('refuses a token it never issued', async () => {
    await expect(
      authenticate({ store, now: NOW }, bearer(issueCredential(NOW).token)),
    ).rejects.toThrow(/no such credential/);
  });

  it('refuses an expired token, and says so', async () => {
    const issued = await issue(randomUUID());

    await expect(
      authenticate({ store, now: at(HOUR_MS) }, bearer(issued.token)),
    ).rejects.toMatchObject({ failure: { reason: 'expired' } });
  });

  it('refuses a revoked token, and says so', async () => {
    const issued = await issue(randomUUID());

    await store.revoke(issued.id, NOW);

    const failure = await authenticate({ store, now: NOW }, bearer(issued.token)).catch(
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(AuthenticationError);
    expect((failure as AuthenticationError).failure).toEqual({ reason: 'revoked' });
  });

  it('refuses a token that lacks a required scope, and names the scope', async () => {
    const issued = await issue(randomUUID(), ['agent.read']);

    await expect(
      authenticate({ store, now: NOW, requiredScopes: ['bounty.claim'] }, bearer(issued.token)),
    ).rejects.toMatchObject({ failure: { reason: 'scope-missing', required: 'bounty.claim' } });
  });
});

describe('rotating a credential', () => {
  it('replaces the old one without leaving a gap', async () => {
    const original = await issue(randomUUID());

    // Issue the replacement first. Revoking first and issuing second would
    // leave a window where the installation has no working credential at all,
    // which is the opposite of a rotation that is meant to be invisible.
    const replacement = await issue(randomUUID());
    const revoked = await store.revokeAllExcept(installationId, replacement.id, at(1));

    expect(revoked).toBeGreaterThan(0);
    await expect(authenticate({ store, now: at(2) }, bearer(original.token))).rejects.toMatchObject(
      { failure: { reason: 'revoked' } },
    );
    await expect(
      authenticate({ store, now: at(2) }, bearer(replacement.token)),
    ).resolves.toMatchObject({ installationId });
  });

  it('leaves the replacement working', async () => {
    // The bug this catches: revokeAllExcept that forgot to exclude the
    // replacement, which would revoke the token it had just issued and leave
    // the installation with nothing that works.
    const replacement = await issue(randomUUID());
    await store.revokeAllExcept(installationId, replacement.id, at(1));

    const record = await store.findByHash(hashToken(replacement.token));
    expect(record?.revokedAt).toBeNull();
  });

  it('does not revoke another installation’s credentials', async () => {
    // A second installation, which is the multi-machine case the plan calls
    // out: rotating one must not lock out the other.
    const githubId = `${randomUUID()}-second-installation`;
    const [owner] = await database
      .insert(users)
      .values({ githubId, login: githubId })
      .returning({ id: users.id });
    const [second] = await database
      .insert(installations)
      .values({ userId: owner?.id ?? '', installationKey: `${randomUUID()}-second` })
      .returning({ id: installations.id });

    const other = issueCredential(NOW);
    await store.insert({
      id: randomUUID(),
      tokenHash: other.hash,
      installationId: second?.id ?? '',
      agentId: null,
      scopes: [],
      expiresAt: other.expiresAt,
    });

    const replacement = await issue(randomUUID());
    await store.revokeAllExcept(installationId, replacement.id, at(1));

    expect((await store.findByHash(hashToken(other.token)))?.revokedAt).toBeNull();
    await database.delete(users).where(eq(users.id, owner?.id ?? ''));
  });

  it('lists an installation’s credentials newest first', async () => {
    const githubId = `${randomUUID()}-listing`;
    const [owner] = await database
      .insert(users)
      .values({ githubId, login: githubId })
      .returning({ id: users.id });
    const [installation] = await database
      .insert(installations)
      .values({ userId: owner?.id ?? '', installationKey: `${randomUUID()}-listing` })
      .returning({ id: installations.id });
    const ownerInstallation = installation?.id ?? '';

    // Two credentials on this installation and none on the shared one, so the
    // assertion is about scoping as much as about order.
    const hashes: string[] = [];
    for (const _attempt of [1, 2]) {
      const issued = issueCredential(NOW);
      hashes.push(issued.hash);
      await store.insert({
        id: randomUUID(),
        tokenHash: issued.hash,
        installationId: ownerInstallation,
        agentId: null,
        scopes: ['agent.read'],
        expiresAt: issued.expiresAt,
      });
    }

    const listed = await store.listForInstallation(ownerInstallation);

    expect(listed).toHaveLength(2);
    // Newest first, which is what a "what is this machine holding" panel
    // wants: the credential most likely to be the live one.
    expect(listed.map((each) => each.tokenHash)).toEqual(hashes.reverse());

    await database.delete(users).where(eq(users.id, owner?.id ?? ''));
  });
});

describe('credentials and characters', () => {
  it('can be bound to a character, and that binding survives the round trip', async () => {
    const githubId = `${randomUUID()}-bound`;
    const [owner] = await database
      .insert(users)
      .values({ githubId, login: githubId })
      .returning({ id: users.id });
    const [agent] = await database
      .insert(agents)
      .values({ userId: owner?.id ?? '', name: 'BoundAgent', harness: 'claude' })
      .returning({ id: agents.id });
    const [installation] = await database
      .insert(installations)
      .values({ userId: owner?.id ?? '', installationKey: `${randomUUID()}-bound` })
      .returning({ id: installations.id });

    const issued = issueCredential(NOW);
    await store.insert({
      id: randomUUID(),
      tokenHash: issued.hash,
      installationId: installation?.id ?? '',
      agentId: agent?.id ?? '',
      scopes: ['agent.read'],
      expiresAt: issued.expiresAt,
    });

    const caller = await authenticate({ store, now: NOW }, bearer(issued.token));

    expect(caller).toMatchObject({ agentId: agent?.id, installationId: installation?.id });
    await database.delete(users).where(eq(users.id, owner?.id ?? ''));
  });
});
