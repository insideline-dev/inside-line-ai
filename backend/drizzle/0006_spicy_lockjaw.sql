CREATE TYPE "public"."private_investor_pipeline_status" AS ENUM('new', 'reviewing', 'engaged', 'closed', 'passed');--> statement-breakpoint
CREATE TYPE "public"."copilot_action_audit_status" AS ENUM('proposed', 'executed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "copilot_action_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"actor_user_id" uuid,
	"actor_email" text NOT NULL,
	"actor_role" text,
	"channel" text NOT NULL,
	"thread_id" text NOT NULL,
	"action_key" text NOT NULL,
	"status" "copilot_action_audit_status" NOT NULL,
	"startup_id" uuid,
	"target_summary" text,
	"payload" jsonb,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "private_investor_pipeline_status" "private_investor_pipeline_status";--> statement-breakpoint
ALTER TABLE "copilot_action_audits" ADD CONSTRAINT "copilot_action_audits_conversation_id_clara_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."clara_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_action_audits" ADD CONSTRAINT "copilot_action_audits_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copilot_action_audits" ADD CONSTRAINT "copilot_action_audits_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "copilot_action_audit_conversation_idx" ON "copilot_action_audits" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "copilot_action_audit_actor_idx" ON "copilot_action_audits" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "copilot_action_audit_startup_idx" ON "copilot_action_audits" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "copilot_action_audit_thread_idx" ON "copilot_action_audits" USING btree ("thread_id");