DROP INDEX "installations_installation_key_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "installations_user_id_installation_key_unique" ON "installations" USING btree ("user_id","installation_key");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_disconnected_has_ended_at" CHECK ("sessions"."status" <> 'disconnected'::text OR "sessions"."ended_at" IS NOT NULL);