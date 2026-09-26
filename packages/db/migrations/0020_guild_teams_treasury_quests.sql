-- 0020. ba-feature-guild-5g6: guild teams, a collective treasury, and guild
-- quests. M6.
--
-- SIX TABLES, and the count is the interesting part. A guild has members, a
-- treasury, quests, a ledger of what its members finished, and the evidence
-- behind their roles — and the reason there is no SEVENTH is the whole money
-- design. There is no `guilds.balance_cents` and no `guild_quests.progress`,
-- because a stored total is right until the second contribution arrives and
-- then is right about nothing. The bounties already solved this:
-- `bounties.amount_cents` is forbidden by `checkNoCachedTotals`, the total is
-- SUM over `bounty_funds`, and `bounty_funding_totals` exposes the sum as a
-- view. These tables follow the same shape, and this file is what makes the
-- guild's balance and its quest progress derivable rather than stored.
--
-- ONE LEDGER, READ THREE WAYS. `guild_work_log` is the guild's record of the
-- outcomes it counted, and it is simultaneously the dedup ledger that stops a
-- re-delivered GitHub merge counting twice, the source of a quest's progress,
-- and the only input to a weekly tally. Three tables each keeping their own
-- copy of "what this guild finished" is how those copies stop agreeing.
--
-- NO FOREIGN KEY TO `bounties`, and that is the removal test speaking. A guild
-- row that must point at a surviving `bounties` row makes removing the bounty
-- feature a decision about guild data — and `scripts/removal-test.sh` removes
-- every feature on every run. A commitment to a bounty that is no longer here
-- is a dangling reference, and that is the correct reading: the guild earmarked
-- money for work nobody finished. `onDelete: 'set null'` would have been worse
-- than either, because it would rewrite a commitment into a hole in a
-- contribution and lose the record of who was owed what.
--
-- The partial unique index on the treasury is what makes a retried `guild.fund`
-- idempotent, and it is PARTIAL because two contributions for the same bounty
-- must both be allowed: a guild can be topped up by several members. A blanket
-- unique on (guild_id, bounty_id) would have forbidden the second sponsor, which
-- is the exact thing the bounty's own funding rail exists to allow.
--
-- Generated against a database that had 0001-0019 applied, which is the
-- hazard 0019's header records at length: a migration generated from a state
-- nobody checked is an artefact that can disagree with the thing it describes.
-- This file creates guild tables and nothing else — no statement here repeats a
-- constraint an earlier file already creates.
--
CREATE TABLE "guild_members" (
	"guild_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_members_pk" PRIMARY KEY("guild_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "guild_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"title" text NOT NULL,
	"repository" text,
	"goal" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "guild_quests_title_not_empty" CHECK (length(trim("guild_quests"."title")) > 0),
	CONSTRAINT "guild_quests_goal_positive" CHECK ("guild_quests"."goal" > 0),
	CONSTRAINT "guild_quests_completed_at_ordered" CHECK ("guild_quests"."completed_at" IS NULL OR "guild_quests"."completed_at" >= "guild_quests"."created_at")
);
--> statement-breakpoint
CREATE TABLE "guild_role_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"role" text NOT NULL,
	"weight" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_role_signals_weight_positive" CHECK ("guild_role_signals"."weight" > 0),
	CONSTRAINT "guild_role_signals_role_known" CHECK ("guild_role_signals"."role" IN ('researcher', 'coder', 'tester', 'reviewer'))
);
--> statement-breakpoint
CREATE TABLE "guild_treasury_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"contributor_user_id" uuid,
	"bounty_id" uuid,
	"committed_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_treasury_entries_amount_cents_positive" CHECK ("guild_treasury_entries"."amount_cents" > 0),
	CONSTRAINT "guild_treasury_entries_shape_known" CHECK ((
        "guild_treasury_entries"."kind" = 'contribution'
        AND "guild_treasury_entries"."contributor_user_id" IS NOT NULL
        AND "guild_treasury_entries"."bounty_id" IS NULL
      ) OR (
        "guild_treasury_entries"."kind" = 'commitment'
        AND "guild_treasury_entries"."contributor_user_id" IS NULL
        AND "guild_treasury_entries"."bounty_id" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "guild_work_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"bounty_id" uuid NOT NULL,
	"repository" text NOT NULL,
	"source_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_work_log_repository_not_empty" CHECK (length(trim("guild_work_log"."repository")) > 0),
	CONSTRAINT "guild_work_log_source_type_not_empty" CHECK (length(trim("guild_work_log"."source_type")) > 0)
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"founded_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guilds_name_not_empty" CHECK (length(trim("guilds"."name")) > 0),
	CONSTRAINT "guilds_tag_not_empty" CHECK (length(trim("guilds"."tag")) > 0),
	CONSTRAINT "guilds_tag_bounded" CHECK (length("guilds"."tag") <= 32),
	CONSTRAINT "guilds_name_folded" CHECK ("guilds"."name" = lower("guilds"."name")),
	CONSTRAINT "guilds_tag_folded" CHECK ("guilds"."tag" = lower("guilds"."tag"))
);
--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_quests" ADD CONSTRAINT "guild_quests_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_role_signals" ADD CONSTRAINT "guild_role_signals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_treasury_entries" ADD CONSTRAINT "guild_treasury_entries_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_treasury_entries" ADD CONSTRAINT "guild_treasury_entries_contributor_user_id_users_id_fk" FOREIGN KEY ("contributor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_treasury_entries" ADD CONSTRAINT "guild_treasury_entries_committed_by_agent_id_agents_id_fk" FOREIGN KEY ("committed_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_work_log" ADD CONSTRAINT "guild_work_log_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_work_log" ADD CONSTRAINT "guild_work_log_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_founded_by_agent_id_agents_id_fk" FOREIGN KEY ("founded_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guild_members_agent_id_idx" ON "guild_members" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "guild_quests_guild_id_idx" ON "guild_quests" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_role_signals_agent_id_source_key_key" ON "guild_role_signals" USING btree ("agent_id","source_key");--> statement-breakpoint
CREATE INDEX "guild_role_signals_agent_id_idx" ON "guild_role_signals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "guild_treasury_entries_guild_id_idx" ON "guild_treasury_entries" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_treasury_entries_guild_id_bounty_id_key" ON "guild_treasury_entries" USING btree ("guild_id","bounty_id") WHERE "guild_treasury_entries"."kind" = 'commitment';--> statement-breakpoint
CREATE UNIQUE INDEX "guild_work_log_guild_id_bounty_id_key" ON "guild_work_log" USING btree ("guild_id","bounty_id");--> statement-breakpoint
CREATE INDEX "guild_work_log_guild_id_occurred_at_idx" ON "guild_work_log" USING btree ("guild_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guilds_name_key" ON "guilds" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "guilds_tag_key" ON "guilds" USING btree ("tag");--> statement-breakpoint
CREATE VIEW "public"."guild_treasury_balances" AS (
  SELECT g.id AS guild_id,
         COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'contribution'), 0)::integer
           AS contributed_cents,
         COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'commitment'), 0)::integer
           AS committed_cents,
         (COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'contribution'), 0)
           - COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'commitment'), 0))::integer
           AS balance_cents,
         COUNT(e.id)::integer AS entry_count
  FROM "guilds" g
  LEFT JOIN "guild_treasury_entries" e ON e.guild_id = g.id
  GROUP BY g.id
);