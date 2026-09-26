CREATE TABLE IF NOT EXISTS "agent_bases" (
	"agent_id" uuid PRIMARY KEY REFERENCES "agents"("id") ON DELETE cascade,
	"buildings_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_bases_building_levels_non_negative" CHECK (NOT jsonb_path_exists("buildings_json", '$.keyvalue() ? (@.value < 0)'))
);
