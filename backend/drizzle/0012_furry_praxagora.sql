DROP TABLE "ai_context_config_revisions" CASCADE;--> statement-breakpoint
DROP TABLE "ai_model_config_revisions" CASCADE;--> statement-breakpoint
ALTER TABLE "early_access_invites" ADD COLUMN "role" "user_role" DEFAULT 'founder' NOT NULL;--> statement-breakpoint
DROP TYPE "public"."ai_prompt_search_mode";