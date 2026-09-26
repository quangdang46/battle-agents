ALTER TABLE "battles" ALTER COLUMN "weights_json" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "joined_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "won" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "resume_deadline" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "battle_participants_battle_won_idx" ON "battle_participants" USING btree ("battle_id","won");--> statement-breakpoint
CREATE INDEX "battles_resume_deadline_idx" ON "battles" USING btree ("resume_deadline");--> statement-breakpoint
ALTER TABLE "battle_participants" ADD CONSTRAINT "battle_participants_won_is_zero_or_one" CHECK ("battle_participants"."won" IN (0, 1));--> statement-breakpoint
ALTER TABLE "battle_participants" ADD CONSTRAINT "battle_participants_won_has_a_score" CHECK ("battle_participants"."won" = 0 OR "battle_participants"."score_json" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_status_known" CHECK ("battles"."status" IN ('running', 'paused', 'completed', 'abandoned', 'expired'));--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_paused_has_resume_deadline" CHECK ("battles"."status" <> 'paused'::text OR "battles"."resume_deadline" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_finished_has_finished_at" CHECK ("battles"."status" NOT IN ('completed', 'abandoned', 'expired') OR "battles"."finished_at" IS NOT NULL);