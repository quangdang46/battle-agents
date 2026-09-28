import { sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import {
  achievements,
  agentCredentials,
  agentStats,
  agents,
  battleParticipants,
  battles,
  bountyFunds,
  bounties,
  eventLog,
  installations,
  messages,
  projects,
  quests,
  sessions,
  users,
} from '../schema/index.js';
import {
  SEED_ACHIEVEMENT,
  SEED_AGENT_STATS,
  SEED_BATTLE,
  SEED_BATTLE_PARTICIPANTS,
  SEED_BOUNTY,
  SEED_CHALLENGER_AGENT,
  SEED_CHALLENGER_SESSION,
  SEED_CREDENTIAL,
  SEED_EVENTS,
  SEED_INSTALLATION,
  SEED_LEAD_FUNDING,
  SEED_MATCHING_FUNDING,
  SEED_MESSAGE,
  SEED_OPPONENT_AGENT,
  SEED_OPPONENT_SESSION,
  SEED_PROJECT,
  SEED_QUEST,
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
    await seedQuestAndBountyFixtures(tx);
    await seedBattleFixtures(tx);
    await seedSocialFixtures(tx);
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

  // This one gave the OPPONENT the CHALLENGER's skills, which is worse than a
  // stale value: `progression.read` answers both characters with the same eight
  // skills, and a reader comparing two agents sees a roster rather than a bug.
  for (const stats of SEED_AGENT_STATS) {
    await tx
      .insert(agentStats)
      .values(stats)
      .onConflictDoUpdate({ target: agentStats.agentId, set: { skillsJson: stats.skillsJson } });
  }
}

async function seedQuestAndBountyFixtures(tx: SeedTransaction): Promise<void> {
  await tx
    .insert(quests)
    .values(SEED_QUEST)
    .onConflictDoUpdate({
      target: quests.id,
      set: {
        title: SEED_QUEST.title,
        body: SEED_QUEST.body,
        difficulty: SEED_QUEST.difficulty,
        xpReward: SEED_QUEST.xpReward,
        status: SEED_QUEST.status,
      },
    });

  await tx
    .insert(bounties)
    .values(SEED_BOUNTY)
    .onConflictDoUpdate({
      target: bounties.id,
      set: {
        requirements: SEED_BOUNTY.requirements,
        status: SEED_BOUNTY.status,
        sponsorUserId: SEED_BOUNTY.sponsorUserId,
      },
    });

  // The FIXTURE's value, not the column, and the fixture's OWN row's value.
  //
  // `bountyFunds.amountCents` is a drizzle `Column`, and a `Column` is a legal
  // value for `set` — so the statement compiled, ran, and rendered as
  //
  //     "amount_cents" = "bounty_funds"."amount_cents"
  //
  // which is a tautology. Re-seeding silently left every funding row at whatever
  // it was, and `checkSeedIsIdempotent` could not see it because a no-op upsert
  // leaves the row COUNT identical. The one column where being wrong is worth
  // money, wrong in a way no gate in this repository could name.
  //
  // Fixing the tautology by naming `SEED_LEAD_FUNDING.amountCents` was the next
  // half of the same bug: one `set` for two rows gives BOTH grants the lead's
  // amount, so re-seeding doubled the sponsor's contribution and moved the
  // derived total off the amount the fixtures declare. `checkMoneyIsIntegerCents`
  // cannot see it either — both values are integers. This is the per-row rule
  // the agents upsert above gives, and it is the one the money table most needs.
  for (const funding of [SEED_LEAD_FUNDING, SEED_MATCHING_FUNDING]) {
    await tx
      .insert(bountyFunds)
      .values(funding)
      .onConflictDoUpdate({ target: bountyFunds.id, set: { amountCents: funding.amountCents } });
  }
}

async function seedBattleFixtures(tx: SeedTransaction): Promise<void> {
  await tx
    .insert(battles)
    .values(SEED_BATTLE)
    .onConflictDoUpdate({
      target: battles.id,
      set: {
        mode: SEED_BATTLE.mode,
        weightsJson: SEED_BATTLE.weightsJson,
        status: SEED_BATTLE.status,
      },
    });

  await tx
    .insert(battleParticipants)
    .values([...SEED_BATTLE_PARTICIPANTS])
    // `onConflictDoNothing`, not an `onConflictDoUpdate` with an empty `set`.
    //
    // DOING NOTHING on conflict is the right decision here and always was: this
    // upsert's conflict target is the PAIR (battleId, sessionId), and each
    // participant has its OWN score — 0.92 and 0.81. A `set` clause applies one
    // value to whichever row conflicted, so putting a fixture's score here gives
    // BOTH fighters the same number and makes the second one's result a copy of
    // the first. The `Column` reference that used to be here was a tautology
    // that changed nothing, which is what the right answer looks like on a
    // composite key with per-row values.
    //
    // What was wrong was the EXPRESSION of that decision, and it was not a
    // subtlety: `onConflictDoUpdate({ set: {} })` does not set nothing. Drizzle
    // calls `mapUpdateSet` while building the query, and that throws "No values
    // to set" on an empty object — so `pnpm db:seed` failed on a clean database
    // and the comment above the crash claimed the empty set was deliberate.
    // `onConflictDoNothing` is what "leave the conflicting row alone" actually
    // compiles to.
    .onConflictDoNothing({ target: [battleParticipants.battleId, battleParticipants.sessionId] });
}

async function seedSocialFixtures(tx: SeedTransaction): Promise<void> {
  await tx
    .insert(achievements)
    .values(SEED_ACHIEVEMENT)
    .onConflictDoUpdate({ target: achievements.id, set: { code: SEED_ACHIEVEMENT.code } });

  await tx
    .insert(messages)
    .values(SEED_MESSAGE)
    .onConflictDoUpdate({ target: messages.id, set: { body: SEED_MESSAGE.body } });
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
