import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { agents } from '../platform.js';

/**
 * A character, and the buildings standing in its base.
 *
 * ## Why this row is keyed on the AGENT and not the session
 *
 * §10.2's death rule is "HP 0 NEVER kills the character; only the SESSION
 * fails", and a row keyed on a session would quietly contradict it: the base
 * would leave with the run. The key is the agent's, so a character that has
 * closed every session it has is still here tomorrow. That is the whole content
 * of M5's "close all sessions, reopen next day" clause — not a timer, a key.
 *
 * ## What is NOT here
 *
 * No resources, no crafting, no territory, no housing. §17.8's risk 8 bans
 * MMO-shaped features from the MVP and a persistent world is the easiest place
 * to smuggle one in. What is here is a base, a building table, and continuity.
 */
export const agentBases = pgTable(
  'agent_bases',
  {
    agentId: uuid('agent_id')
      .primaryKey()
      .references(() => agents.id, { onDelete: 'cascade' }),
    /**
     * The buildings standing, keyed by building id.
     *
     * A MAP rather than a column per building, because the building table lives
     * in the feature and this package may not import it — the same rule that
     * makes `build` a text column the adapter narrows. Adding a building is then
     * a change to the feature's table and nothing else here, which is what keeps
     * "a feature is removable with rm -rf" true of this file too.
     */
    buildingsJson: jsonb('buildings_json').$type<Record<string, number>>().notNull().default({}),
    /**
     * When the base last changed.
     *
     * A stored instant rather than a read-time one, so a rehydrated base reports
     * the same `updatedAt` it had before the process died. `read time` made this
     * mean "now" and returned a different value on every read of an unchanged
     * row, which would have made a cold-restart comparison meaningless: the
     * whole M5 test is that the state is byte-identical after a restart, and a
     * column that changes when you look at it cannot be part of that.
     */
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // A building's LEVEL, not a count of anything. No upper bound: §10.2's tiers
    // are open-ended by design and a cap here would be a rule nobody wrote down.
    // Only a negative value is meaningless, and only because it is arithmetic on
    // a number rather than a game concept.
    //
    // Written as `jsonb_path_exists` rather than a subquery over
    // `jsonb_each_text`, because PostgreSQL refuses a subquery in a CHECK and
    // the first version of this constraint could not be created at all. The
    // scalar form is IMMUTABLE, so it is legal there, and it rejects a negative
    // level — verified against a real table, because a constraint that is
    // accepted and enforces nothing is the worst of the three outcomes.
    check(
      'agent_bases_building_levels_non_negative',
      sql`NOT jsonb_path_exists(${table.buildingsJson}, '$.keyvalue() ? (@.value < 0)')`,
    ),
  ],
);
