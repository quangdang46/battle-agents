CREATE TABLE "agent_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"agent_id" uuid,
	"token_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"harness" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"build" text,
	"status" text DEFAULT 'offline' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_level_min" CHECK ("agents"."level" >= 1),
	CONSTRAINT "agents_xp_non_negative" CHECK ("agents"."xp" >= 0),
	CONSTRAINT "agents_reputation_non_negative" CHECK ("agents"."reputation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"session_id" uuid,
	"causation_id" text,
	"payload" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"installation_key" text NOT NULL,
	"label" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"repo_url" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"project_id" uuid,
	"harness_session_ref" text,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" text NOT NULL,
	"login" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"code" text NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_participants" (
	"battle_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"score_json" jsonb,
	CONSTRAINT "battle_participants_pk" PRIMARY KEY("battle_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"bounty_id" uuid,
	"weights_json" jsonb,
	"status" text DEFAULT 'running' NOT NULL,
	"winner_session_id" uuid,
	"replay_json" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bounties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quest_id" uuid,
	"repo_owner" text NOT NULL,
	"repo_name" text NOT NULL,
	"issue_number" integer NOT NULL,
	"issue_url" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"sponsor_user_id" uuid,
	"claimed_agent_id" uuid,
	"pr_url" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bounty_funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"sponsor_user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bounty_funds_amount_cents_non_negative" CHECK ("bounty_funds"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_stats" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"prs_opened" integer DEFAULT 0 NOT NULL,
	"prs_merged" integer DEFAULT 0 NOT NULL,
	"prs_rejected" integer DEFAULT 0 NOT NULL,
	"tests_passed" integer DEFAULT 0 NOT NULL,
	"tests_failed" integer DEFAULT 0 NOT NULL,
	"recoveries" integer DEFAULT 0 NOT NULL,
	"battles_won" integer DEFAULT 0 NOT NULL,
	"battles_lost" integer DEFAULT 0 NOT NULL,
	"skills_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "agent_stats_prs_opened_non_negative" CHECK ("agent_stats"."prs_opened" >= 0),
	CONSTRAINT "agent_stats_prs_merged_non_negative" CHECK ("agent_stats"."prs_merged" >= 0),
	CONSTRAINT "agent_stats_prs_rejected_non_negative" CHECK ("agent_stats"."prs_rejected" >= 0),
	CONSTRAINT "agent_stats_tests_passed_non_negative" CHECK ("agent_stats"."tests_passed" >= 0),
	CONSTRAINT "agent_stats_tests_failed_non_negative" CHECK ("agent_stats"."tests_failed" >= 0),
	CONSTRAINT "agent_stats_recoveries_non_negative" CHECK ("agent_stats"."recoveries" >= 0),
	CONSTRAINT "agent_stats_battles_won_non_negative" CHECK ("agent_stats"."battles_won" >= 0),
	CONSTRAINT "agent_stats_battles_lost_non_negative" CHECK ("agent_stats"."battles_lost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"xp_reward" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_agent_id" uuid NOT NULL,
	"to_agent_id" uuid,
	"guild_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_credentials" ADD CONSTRAINT "agent_credentials_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD CONSTRAINT "battle_participants_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD CONSTRAINT "battle_participants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_winner_session_id_sessions_id_fk" FOREIGN KEY ("winner_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_sponsor_user_id_users_id_fk" FOREIGN KEY ("sponsor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_claimed_agent_id_agents_id_fk" FOREIGN KEY ("claimed_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_funds" ADD CONSTRAINT "bounty_funds_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bounty_funds" ADD CONSTRAINT "bounty_funds_sponsor_user_id_users_id_fk" FOREIGN KEY ("sponsor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_stats" ADD CONSTRAINT "agent_stats_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_credentials_token_hash_unique" ON "agent_credentials" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "agent_credentials_installation_id_idx" ON "agent_credentials" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "agent_credentials_agent_id_idx" ON "agent_credentials" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agents_user_id_name_unique" ON "agents" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "event_log_occurred_at_idx" ON "event_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "event_log_type_occurred_at_idx" ON "event_log" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "event_log_actor_id_occurred_at_idx" ON "event_log" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "event_log_session_id_occurred_at_idx" ON "event_log" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "installations_installation_key_unique" ON "installations" USING btree ("installation_key");--> statement-breakpoint
CREATE INDEX "installations_user_id_idx" ON "installations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_agent_id_idx" ON "sessions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "sessions_installation_id_idx" ON "sessions" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "sessions_status_last_heartbeat_at_idx" ON "sessions" USING btree ("status","last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_github_id_unique" ON "users" USING btree ("github_id");--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_agent_id_code_unique" ON "achievements" USING btree ("agent_id","code");--> statement-breakpoint
CREATE INDEX "battle_participants_session_id_idx" ON "battle_participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "battles_bounty_id_idx" ON "battles" USING btree ("bounty_id");--> statement-breakpoint
CREATE INDEX "battles_status_idx" ON "battles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bounties_quest_id_idx" ON "bounties" USING btree ("quest_id");--> statement-breakpoint
CREATE INDEX "bounties_status_idx" ON "bounties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bounties_claimed_agent_id_idx" ON "bounties" USING btree ("claimed_agent_id");--> statement-breakpoint
CREATE INDEX "bounty_funds_bounty_id_idx" ON "bounty_funds" USING btree ("bounty_id");--> statement-breakpoint
CREATE INDEX "bounty_funds_sponsor_user_id_idx" ON "bounty_funds" USING btree ("sponsor_user_id");--> statement-breakpoint
CREATE INDEX "quests_project_id_idx" ON "quests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "quests_status_idx" ON "quests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_to_agent_id_created_at_idx" ON "messages" USING btree ("to_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_from_agent_id_idx" ON "messages" USING btree ("from_agent_id");--> statement-breakpoint
CREATE VIEW "public"."bounty_funding_totals" AS (
  SELECT b.id AS bounty_id,
         COALESCE(SUM(f.amount_cents), 0)::integer AS funded_cents,
         COUNT(f.id)::integer AS sponsor_count
  FROM "bounties" b
  LEFT JOIN "bounty_funds" f ON f.bounty_id = b.id
  GROUP BY b.id
);