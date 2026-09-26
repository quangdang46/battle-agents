-- ba-bounty-modes-tiers-seasons-62l: the bounty mode vocabulary.
--
-- The mode taxonomy now exists (packages/features/bounty/src/modes.ts) and its
-- four names are not the four §11.3 printed. Each mode is named after the RULE
-- that decides a bounty rather than after a format, which is what stops the
-- bounty list and the battle list (BATTLE_MODES) sharing a word: `team` and
-- `tournament` meant a match shape in one and a resolution rule in the other,
-- and both columns are text, so a caller asking the wrong feature got a
-- plausible answer instead of an error.
--
-- FOUR UPDATES, not one, because the rename is not a formality. A row that
-- carried 'race' would, after this file, be a row whose mode this build cannot
-- name: the claim path leaves an unrecognised mode on its older exclusive
-- reading, and 'tournament' would quietly become a claim nobody chose. The
-- backfill is the whole point of doing the rename in a migration rather than in
-- code, and the four statements are the four words that changed.
--
-- The four are distinct rows and cannot be folded into one CASE, because two of
-- the old names ('open', 'team') are also values of OTHER columns and a reader
-- skimming a CASE has to check which column it is about.
--
-- The CHECK is added last, so it validates a table that has already been
-- backfilled rather than failing on rows this file is here to fix. It is a copy
-- of the feature's list because infrastructure may not import the layer that
-- consumes it — the same arrangement `payout_intents_state_known` uses, and
-- tests/unit/bounty-mode-vocabulary.test.ts fails the build if the two copies
-- ever disagree.
UPDATE "bounties" SET "mode" = 'first-valid' WHERE "mode" = 'race';
--> statement-breakpoint
UPDATE "bounties" SET "mode" = 'maintainer-picks' WHERE "mode" = 'open';
--> statement-breakpoint
UPDATE "bounties" SET "mode" = 'best-validated' WHERE "mode" = 'tournament';
--> statement-breakpoint
UPDATE "bounties" SET "mode" = 'single-pr' WHERE "mode" = 'team';
--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_mode_known" CHECK ("bounties"."mode" IN ('first-valid', 'maintainer-picks', 'best-validated', 'single-pr'));
