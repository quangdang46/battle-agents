CREATE TABLE "reputation_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"bounty_id" text NOT NULL,
	"kind" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reputation_outcomes_bounty_id_not_empty" CHECK (length(trim("reputation_outcomes"."bounty_id")) > 0),
	CONSTRAINT "reputation_outcomes_kind_known" CHECK ("reputation_outcomes"."kind" IN ('completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "agent_reputation" ADD COLUMN "refused_outcomes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reputation_outcomes" ADD CONSTRAINT "reputation_outcomes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reputation_outcomes_bounty_kind_key" ON "reputation_outcomes" USING btree ("bounty_id","kind");--> statement-breakpoint
ALTER TABLE "agent_reputation" ADD CONSTRAINT "agent_reputation_refused_outcomes_non_negative" CHECK ("agent_reputation"."refused_outcomes" >= 0);