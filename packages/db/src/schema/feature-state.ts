import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Per-feature durable state, one row per feature.
 *
 * The frozen Extension API says where this goes: "A feature keeps its own state
 * through `StateStore` under its own id." Until now no feature needed it, and
 * `DrizzleStateStore.load`/`save` threw rather than guess a shape — the comment
 * there said the first feature to need it would decide the shape. The battle
 * feature is that feature, and the shape it decided is the narrowest one the
 * interface allows: `load` takes a feature id and no key, so a slice is a single
 * value per feature and a table with a composite key would be inventing a key
 * the contract does not have.
 *
 * ## What this is for, and what it is not for
 *
 * State that can be DERIVED from the event log does not belong here, and putting
 * it here would be a second source free to disagree with the log. What the battle
 * feature keeps is the part the log cannot rebuild: which agent a session
 * belongs to is available from `session.started`, but the in-flight behaviour
 * counters are incremented by `file.write`, `thinking` and `tool.completed`, which
 * the platform's persistence policy does not write down. Re-deriving them would
 * mean asking to change that policy, which is a bigger decision than this table.
 *
 * ## The single-writer limit, stated rather than assumed
 *
 * A slice is read whole and written whole, so two processes incrementing the same
 * feature's counters concurrently would lose one increment. That is a real limit
 * and it is not solved here: the platform runs one web host today, and a
 * counter that feeds a display-only stat line is the wrong thing to build a
 * distributed counter for. A feature that needs cross-process counters wants its
 * own table with an atomic UPDATE, not a shared blob. Written down because an
 * undocumented limit is discovered as a bug.
 */
export const featureState = pgTable('feature_state', {
  /** The feature id, exactly as the feature passes it to `store.load`. */
  feature: text('feature').primaryKey(),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
