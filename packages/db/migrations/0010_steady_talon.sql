CREATE TABLE "payout_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"state" text NOT NULL,
	"mode" text DEFAULT 'intent-only' NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"reported_by" text NOT NULL,
	CONSTRAINT "payout_intents_amount_cents_non_negative" CHECK ("payout_intents"."amount_cents" >= 0),
	CONSTRAINT "payout_intents_reported_by_not_empty" CHECK (length(trim("payout_intents"."reported_by")) > 0)
);
--> statement-breakpoint
DROP VIEW "public"."bounty_funding_totals";--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "mode" text DEFAULT 'race' NOT NULL;--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "merged_by" text;--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "merged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payout_intents" ADD CONSTRAINT "payout_intents_bounty_id_bounties_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payout_intents_bounty_id_key" ON "payout_intents" USING btree ("bounty_id");--> statement-breakpoint
CREATE INDEX "bounties_pr_url_idx" ON "bounties" USING btree ("pr_url");--> statement-breakpoint
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_issue_number_positive" CHECK ("bounties"."issue_number" > 0);--> statement-breakpoint
CREATE VIEW "public"."bounty_funding_totals" AS (
  SELECT b.id AS bounty_id,
         COALESCE(SUM(f.amount_cents), 0)::integer AS funded_cents,
         COUNT(f.id)::integer AS sponsor_count,
         MIN(f.created_at) AS funded_at
  FROM "bounties" b
  LEFT JOIN "bounty_funds" f ON f.bounty_id = b.id
  GROUP BY b.id
);