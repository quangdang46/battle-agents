ALTER TABLE "battles" DROP CONSTRAINT "battles_winner_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "battles" DROP COLUMN "winner_session_id";