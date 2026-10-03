import { sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import {
  agentCredentials,
  agents,
  eventLog,
  installations,
  projects,
  sessions,
  users,
} from '../schema/index.js';
import {
  SEED_CHALLENGER_AGENT,
  SEED_CHALLENGER_SESSION,
  SEED_CREDENTIAL,
  SEED_EVENTS,
  SEED_INSTALLATION,
  SEED_OPPONENT_AGENT,
  SEED_OPPONENT_SESSION,
  SEED_PROJECT,
  SEED_USER,
} from './fixtures.js';

/**
 * Every fixture row carries a fixed id, so a conflict always means "this exact
 * row already exists" and the upsert restores it to its canonical value. Row
 * counts therefore stay stable no matter how often the seed runs.
 */
export async function seedDatabase(database: Database): Promise<void> {
  await database.transaction(async (tx) => {
    await seedPlatform(tx);
    await seedSessionFixtures(tx);
    await seedActivityFixtures(tx);
  });
  await alignEventLogSequence(database);
}

type SeedTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

async function seedPlatform(tx: SeedTransaction): Promise<void> {
  await tx
    .insert(users)
    .values(SEED_USER)
    .onConflictDoUpdate({
      target: users.id,
      set: { githubId: SEED_USER.githubId, login: SEED_USER.login, avatarUrl: SEED_USER.avatarUrl },
    });

  await tx
    .insert(installations)
    .values(SEED_INSTALLATION)
    .onConflictDoUpdate({
      target: installations.id,
      set: { userId: SEED_INSTALLATION.userId, installationKey: SEED_INSTALLATION.installationKey },
    });

  // One statement PER ROW, not one statement for both, and the reason applies to
  // every multi-row upsert in this file: `onConflictDoUpdate` carries a single
  // `set`, applied to whichever row conflicted. Two agents in one statement
  // meant the OPPONENT was updated with the CHALLENGER's name and harness, and
  // on the second run that renamed `RustMantis` to `CodeKnight` — colliding
  // with `agents_user_id_name_unique` and failing the whole seed with "duplicate
  // key value violates unique constraint". The first run passed, which is why
  // this survived: a seed that only ever runs once is a seed nobody re-ran.
  for (const agent of [SEED_CHALLENGER_AGENT, SEED_OPPONENT_AGENT]) {
    await tx
      .insert(agents)
      .values(agent)
      .onConflictDoUpdate({
        target: agents.id,
        set: { userId: agent.userId, name: agent.name, harness: agent.harness },
      });
  }

  await tx
    .insert(agentCredentials)
    .values(SEED_CREDENTIAL)
    .onConflictDoUpdate({
      target: agentCredentials.id,
      set: {
        tokenHash: SEED_CREDENTIAL.tokenHash,
        scopes: SEED_CREDENTIAL.scopes,
        revokedAt: SEED_CREDENTIAL.revokedAt,
      },
    });

  await tx
    .insert(projects)
    .values(SEED_PROJECT)
    .onConflictDoUpdate({
      target: projects.id,
      set: { userId: SEED_PROJECT.userId, repoUrl: SEED_PROJECT.repoUrl, name: SEED_PROJECT.name },
    });
}

async function seedSessionFixtures(tx: SeedTransaction): Promise<void> {
  // Per row, for the reason the agents upsert above gives.
  for (const session of [SEED_CHALLENGER_SESSION, SEED_OPPONENT_SESSION]) {
    await tx
      .insert(sessions)
      .values(session)
      .onConflictDoUpdate({
        target: sessions.id,
        set: { status: session.status, harnessSessionRef: session.harnessSessionRef },
      });
  }
}

async function seedActivityFixtures(tx: SeedTransaction): Promise<void> {
  await tx
    .insert(eventLog)
    .values([...SEED_EVENTS])
    .onConflictDoNothing();
}

/**
 * Seeding explicit bigserial ids leaves the sequence behind the inserted rows,
 * which would make the next runtime insert collide. Re-advance it so the log
 * stays writable after a seed.
 */
async function alignEventLogSequence(database: Database): Promise<void> {
  await database.execute(sql`
    SELECT setval(
      pg_get_serial_sequence('event_log', 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM event_log), 1), 1)
    )
  `);
}
