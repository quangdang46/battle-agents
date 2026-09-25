CREATE TABLE "agent_reputation" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"acceptance_rate" integer DEFAULT 0 NOT NULL,
	"review_score" integer DEFAULT 0 NOT NULL,
	"earned_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "agent_reputation_completed_non_negative" CHECK ("agent_reputation"."completed" >= 0),
	CONSTRAINT "agent_reputation_failed_non_negative" CHECK ("agent_reputation"."failed" >= 0),
	CONSTRAINT "agent_reputation_acceptance_rate_in_range" CHECK ("agent_reputation"."acceptance_rate" >= 0 AND "agent_reputation"."acceptance_rate" <= 10000),
	CONSTRAINT "agent_reputation_review_score_in_range" CHECK ("agent_reputation"."review_score" >= 0 AND "agent_reputation"."review_score" <= 500),
	CONSTRAINT "agent_reputation_earned_cents_non_negative" CHECK ("agent_reputation"."earned_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_reputation" ADD CONSTRAINT "agent_reputation_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_reputation_agent_unique" ON "agent_reputation" USING btree ("agent_id");