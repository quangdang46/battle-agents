DROP INDEX "agents_user_id_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "agents_user_id_name_unique" ON "agents" USING btree ("user_id","name");