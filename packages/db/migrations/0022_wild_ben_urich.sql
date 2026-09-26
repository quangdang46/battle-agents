CREATE TABLE "agent_bases" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"buildings_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_bases_building_levels_non_negative" CHECK (NOT jsonb_path_exists("agent_bases"."buildings_json", '$.keyvalue() ? (@.value < 0)'))
);
--> statement-breakpoint
ALTER TABLE "agent_bases" ADD CONSTRAINT "agent_bases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;