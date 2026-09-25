CREATE TABLE "github_delivery_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"action" text NOT NULL,
	"fact" text,
	"repository" text,
	"subject" text,
	"subject_number" integer,
	"published_at" timestamp with time zone,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "github_delivery_claims_delivery_id_key" ON "github_delivery_claims" USING btree ("delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_delivery_claims_fact_key" ON "github_delivery_claims" USING btree ("fact","repository","subject","subject_number");
