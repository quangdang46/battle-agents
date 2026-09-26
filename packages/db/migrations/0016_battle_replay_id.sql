ALTER TABLE "battles" ADD COLUMN "replay_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "battles_replay_id_unique" ON "battles" USING btree ("replay_id");