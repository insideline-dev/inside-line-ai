CREATE TABLE "pipeline_state_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"pipeline_run_id" text NOT NULL,
	"status" "pipeline_run_status" DEFAULT 'completed' NOT NULL,
	"reusable" boolean DEFAULT true NOT NULL,
	"snapshot_version" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"source_fingerprint" text,
	"invalid_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_prompts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_prompt_definitions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_prompt_revisions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_context_config_revisions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipeline_flow_configs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_agent_schema_revisions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_prompts" CASCADE;--> statement-breakpoint
DROP TABLE "ai_prompt_definitions" CASCADE;--> statement-breakpoint
DROP TABLE "ai_prompt_revisions" CASCADE;--> statement-breakpoint
DROP TABLE "ai_context_config_revisions" CASCADE;--> statement-breakpoint
DROP TABLE "ai_model_config_revisions" CASCADE;--> statement-breakpoint
DROP TABLE "pipeline_flow_configs" CASCADE;--> statement-breakpoint
DROP TABLE "ai_agent_schema_revisions" CASCADE;--> statement-breakpoint
ALTER TABLE "pipeline_failures" DROP CONSTRAINT "pipeline_failures_pipeline_run_id_pipeline_runs_pipeline_run_id";
--> statement-breakpoint
ALTER TABLE "pipeline_agent_runs" DROP CONSTRAINT "pipeline_agent_runs_pipeline_run_id_pipeline_runs_pipeline_run_";
--> statement-breakpoint
ALTER TABLE "ai_agent_configs" DROP CONSTRAINT "ai_agent_configs_prompt_definition_id_ai_prompt_definitions_id_";
--> statement-breakpoint
DROP INDEX "verification_identifier_idx";--> statement-breakpoint
DROP INDEX "investor_profile_user_idx";--> statement-breakpoint
DROP INDEX "investor_thesis_user_idx";--> statement-breakpoint
DROP INDEX "stage_scoring_weight_stage_idx";--> statement-breakpoint
DROP INDEX "match_investor_saved_idx";--> statement-breakpoint
DROP INDEX "match_investor_score_idx";--> statement-breakpoint
DROP INDEX "match_investor_status_idx";--> statement-breakpoint
DROP INDEX "match_startup_idx";--> statement-breakpoint
DROP INDEX "team_member_thesis_idx";--> statement-breakpoint
DROP INDEX "team_member_user_idx";--> statement-breakpoint
DROP INDEX "admin_review_reviewer_idx";--> statement-breakpoint
DROP INDEX "admin_review_startup_idx";--> statement-breakpoint
DROP INDEX "startup_evaluation_startup_idx";--> statement-breakpoint
DROP INDEX "agent_message_conversation_idx";--> statement-breakpoint
DROP INDEX "agent_message_created_idx";--> statement-breakpoint
DROP INDEX "attachment_download_inbox_message_idx";--> statement-breakpoint
DROP INDEX "account_provider_accountId_idx";--> statement-breakpoint
DROP INDEX "account_userId_idx";--> statement-breakpoint
DROP INDEX "refresh_token_family_idx";--> statement-breakpoint
DROP INDEX "refresh_token_userId_idx";--> statement-breakpoint
DROP INDEX "asset_project_idx";--> statement-breakpoint
DROP INDEX "asset_type_idx";--> statement-breakpoint
DROP INDEX "asset_user_idx";--> statement-breakpoint
DROP INDEX "notification_user_read_created_idx";--> statement-breakpoint
DROP INDEX "startup_draft_startupId_updated_idx";--> statement-breakpoint
DROP INDEX "startup_draft_userId_idx";--> statement-breakpoint
DROP INDEX "data_room_category_idx";--> statement-breakpoint
DROP INDEX "data_room_startup_idx";--> statement-breakpoint
DROP INDEX "investor_interest_investor_idx";--> statement-breakpoint
DROP INDEX "investor_interest_startup_idx";--> statement-breakpoint
DROP INDEX "investor_interest_status_idx";--> statement-breakpoint
DROP INDEX "meeting_investor_idx";--> statement-breakpoint
DROP INDEX "meeting_startup_idx";--> statement-breakpoint
DROP INDEX "meeting_status_idx";--> statement-breakpoint
DROP INDEX "team_invite_code_idx";--> statement-breakpoint
DROP INDEX "team_invite_email_idx";--> statement-breakpoint
DROP INDEX "team_invite_thesis_idx";--> statement-breakpoint
DROP INDEX "investor_note_investor_idx";--> statement-breakpoint
DROP INDEX "investor_note_investor_startup_idx";--> statement-breakpoint
DROP INDEX "investor_note_startup_idx";--> statement-breakpoint
DROP INDEX "investor_portfolio_investor_idx";--> statement-breakpoint
DROP INDEX "investor_portfolio_startup_idx";--> statement-breakpoint
DROP INDEX "portal_slug_idx";--> statement-breakpoint
DROP INDEX "portal_user_idx";--> statement-breakpoint
DROP INDEX "portal_submission_portal_submitted_idx";--> statement-breakpoint
DROP INDEX "portal_submission_startup_idx";--> statement-breakpoint
DROP INDEX "scout_application_investor_status_idx";--> statement-breakpoint
DROP INDEX "scout_application_user_idx";--> statement-breakpoint
DROP INDEX "scout_submission_investor_created_idx";--> statement-breakpoint
DROP INDEX "scout_submission_scout_idx";--> statement-breakpoint
DROP INDEX "scout_commission_scout_idx";--> statement-breakpoint
DROP INDEX "scout_commission_status_idx";--> statement-breakpoint
DROP INDEX "scout_commission_submission_idx";--> statement-breakpoint
DROP INDEX "analysis_job_startup_type_idx";--> statement-breakpoint
DROP INDEX "analysis_job_status_priority_created_idx";--> statement-breakpoint
DROP INDEX "email_thread_user_last_message_idx";--> statement-breakpoint
DROP INDEX "webhook_source_processed_created_idx";--> statement-breakpoint
DROP INDEX "linkedin_cache_url_expires_idx";--> statement-breakpoint
DROP INDEX "linkedin_cache_user_id_idx";--> statement-breakpoint
DROP INDEX "agent_conversation_email_idx";--> statement-breakpoint
DROP INDEX "agent_conversation_investor_idx";--> statement-breakpoint
DROP INDEX "agent_conversation_status_idx";--> statement-breakpoint
DROP INDEX "startup_geo_level1_idx";--> statement-breakpoint
DROP INDEX "startup_geo_level2_idx";--> statement-breakpoint
DROP INDEX "startup_geo_level3_idx";--> statement-breakpoint
DROP INDEX "startup_industry_idx";--> statement-breakpoint
DROP INDEX "startup_location_idx";--> statement-breakpoint
DROP INDEX "startup_slug_idx";--> statement-breakpoint
DROP INDEX "startup_stage_idx";--> statement-breakpoint
DROP INDEX "startup_status_created_idx";--> statement-breakpoint
DROP INDEX "startup_userId_status_idx";--> statement-breakpoint
DROP INDEX "investor_scoring_preference_investor_stage_idx";--> statement-breakpoint
DROP INDEX "pipeline_runs_startup_idx";--> statement-breakpoint
DROP INDEX "pipeline_runs_status_started_idx";--> statement-breakpoint
DROP INDEX "pipeline_failures_pipeline_idx";--> statement-breakpoint
DROP INDEX "pipeline_failures_startup_phase_idx";--> statement-breakpoint
DROP INDEX "agentmail_config_inbox_id_idx";--> statement-breakpoint
DROP INDEX "agentmail_config_user_id_idx";--> statement-breakpoint
DROP INDEX "pipeline_feedback_consumed_idx";--> statement-breakpoint
DROP INDEX "pipeline_feedback_startup_agent_idx";--> statement-breakpoint
DROP INDEX "pipeline_feedback_startup_phase_idx";--> statement-breakpoint
DROP INDEX "clara_conv_investor_email_idx";--> statement-breakpoint
DROP INDEX "clara_conv_startup_id_idx";--> statement-breakpoint
DROP INDEX "clara_conv_status_idx";--> statement-breakpoint
DROP INDEX "clara_conv_thread_id_idx";--> statement-breakpoint
DROP INDEX "clara_msg_conversation_id_idx";--> statement-breakpoint
DROP INDEX "clara_msg_direction_idx";--> statement-breakpoint
DROP INDEX "clara_msg_message_id_idx";--> statement-breakpoint
DROP INDEX "waitlist_entries_created_idx";--> statement-breakpoint
DROP INDEX "early_access_invites_email_idx";--> statement-breakpoint
DROP INDEX "early_access_invites_status_idx";--> statement-breakpoint
DROP INDEX "pipeline_agent_runs_created_idx";--> statement-breakpoint
DROP INDEX "pipeline_agent_runs_pipeline_idx";--> statement-breakpoint
DROP INDEX "pipeline_agent_runs_startup_idx";--> statement-breakpoint
DROP INDEX "pipeline_agent_runs_startup_phase_agent_idx";--> statement-breakpoint
DROP INDEX "pipeline_agent_runs_startup_run_kind_phase_step_started_idx";--> statement-breakpoint
DROP INDEX "ai_agent_config_orchestrator_idx";--> statement-breakpoint
DROP INDEX "ai_agent_config_unique_agent_idx";--> statement-breakpoint
DROP INDEX "pipeline_template_flow_status_idx";--> statement-breakpoint
DROP INDEX "pipeline_template_flow_version_unique";--> statement-breakpoint
ALTER TABLE "startup_matches" ADD COLUMN "thesis_fit_fallback" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ai_agent_configs" ADD COLUMN "prompt_key" varchar(120);--> statement-breakpoint
ALTER TABLE "pipeline_state_snapshots" ADD CONSTRAINT "pipeline_state_snapshots_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_state_snapshots" ADD CONSTRAINT "pipeline_state_snapshots_pipeline_run_id_pipeline_runs_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_state_snapshot_run_idx" ON "pipeline_state_snapshots" USING btree ("pipeline_run_id");--> statement-breakpoint
CREATE INDEX "pipeline_state_snapshot_startup_created_idx" ON "pipeline_state_snapshots" USING btree ("startup_id","created_at");--> statement-breakpoint
CREATE INDEX "pipeline_state_snapshot_reusable_created_idx" ON "pipeline_state_snapshots" USING btree ("startup_id","reusable","created_at");--> statement-breakpoint
ALTER TABLE "pipeline_failures" ADD CONSTRAINT "pipeline_failures_pipeline_run_id_pipeline_runs_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_agent_runs" ADD CONSTRAINT "pipeline_agent_runs_pipeline_run_id_pipeline_runs_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "investor_profile_user_idx" ON "investor_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investor_thesis_user_idx" ON "investor_theses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stage_scoring_weight_stage_idx" ON "stage_scoring_weights" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "match_investor_saved_idx" ON "startup_matches" USING btree ("investor_id","is_saved");--> statement-breakpoint
CREATE INDEX "match_investor_score_idx" ON "startup_matches" USING btree ("investor_id","overall_score");--> statement-breakpoint
CREATE INDEX "match_investor_status_idx" ON "startup_matches" USING btree ("investor_id","status");--> statement-breakpoint
CREATE INDEX "match_startup_idx" ON "startup_matches" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "team_member_thesis_idx" ON "team_members" USING btree ("investor_thesis_id");--> statement-breakpoint
CREATE INDEX "team_member_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_review_reviewer_idx" ON "admin_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "admin_review_startup_idx" ON "admin_reviews" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "startup_evaluation_startup_idx" ON "startup_evaluations" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "agent_message_conversation_idx" ON "agent_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_message_created_idx" ON "agent_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "attachment_download_inbox_message_idx" ON "attachment_downloads" USING btree ("inbox_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_accountId_idx" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_family_idx" ON "refresh_tokens" USING btree ("family");--> statement-breakpoint
CREATE INDEX "refresh_token_userId_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_project_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "asset_type_idx" ON "assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "asset_user_idx" ON "assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_user_read_created_idx" ON "notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "startup_draft_startupId_updated_idx" ON "startup_drafts" USING btree ("startup_id","updated_at");--> statement-breakpoint
CREATE INDEX "startup_draft_userId_idx" ON "startup_drafts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "data_room_category_idx" ON "data_rooms" USING btree ("category");--> statement-breakpoint
CREATE INDEX "data_room_startup_idx" ON "data_rooms" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "investor_interest_investor_idx" ON "investor_interests" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_interest_startup_idx" ON "investor_interests" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "investor_interest_status_idx" ON "investor_interests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meeting_investor_idx" ON "meetings" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "meeting_startup_idx" ON "meetings" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "meeting_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "team_invite_code_idx" ON "team_invites" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "team_invite_email_idx" ON "team_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "team_invite_thesis_idx" ON "team_invites" USING btree ("investor_thesis_id");--> statement-breakpoint
CREATE INDEX "investor_note_investor_idx" ON "investor_notes" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_note_investor_startup_idx" ON "investor_notes" USING btree ("investor_id","startup_id");--> statement-breakpoint
CREATE INDEX "investor_note_startup_idx" ON "investor_notes" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "investor_portfolio_investor_idx" ON "investor_portfolios" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_portfolio_startup_idx" ON "investor_portfolios" USING btree ("startup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_slug_idx" ON "portals" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "portal_user_idx" ON "portals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portal_submission_portal_submitted_idx" ON "portal_submissions" USING btree ("portal_id","submitted_at");--> statement-breakpoint
CREATE INDEX "portal_submission_startup_idx" ON "portal_submissions" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "scout_application_investor_status_idx" ON "scout_applications" USING btree ("investor_id","status");--> statement-breakpoint
CREATE INDEX "scout_application_user_idx" ON "scout_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scout_submission_investor_created_idx" ON "scout_submissions" USING btree ("investor_id","created_at");--> statement-breakpoint
CREATE INDEX "scout_submission_scout_idx" ON "scout_submissions" USING btree ("scout_id");--> statement-breakpoint
CREATE INDEX "scout_commission_scout_idx" ON "scout_commissions" USING btree ("scout_id");--> statement-breakpoint
CREATE INDEX "scout_commission_status_idx" ON "scout_commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scout_commission_submission_idx" ON "scout_commissions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "analysis_job_startup_type_idx" ON "analysis_jobs" USING btree ("startup_id","job_type");--> statement-breakpoint
CREATE INDEX "analysis_job_status_priority_created_idx" ON "analysis_jobs" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "email_thread_user_last_message_idx" ON "email_threads" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "webhook_source_processed_created_idx" ON "integration_webhooks" USING btree ("source","processed","created_at");--> statement-breakpoint
CREATE INDEX "linkedin_cache_url_expires_idx" ON "linkedin_profile_caches" USING btree ("linkedin_url","expires_at");--> statement-breakpoint
CREATE INDEX "linkedin_cache_user_id_idx" ON "linkedin_profile_caches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_conversation_email_idx" ON "agent_conversations" USING btree ("sender_email");--> statement-breakpoint
CREATE INDEX "agent_conversation_investor_idx" ON "agent_conversations" USING btree ("investor_profile_id");--> statement-breakpoint
CREATE INDEX "agent_conversation_status_idx" ON "agent_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "startup_geo_level1_idx" ON "startups" USING btree ("geo_level_1");--> statement-breakpoint
CREATE INDEX "startup_geo_level2_idx" ON "startups" USING btree ("geo_level_2");--> statement-breakpoint
CREATE INDEX "startup_geo_level3_idx" ON "startups" USING btree ("geo_level_3");--> statement-breakpoint
CREATE INDEX "startup_industry_idx" ON "startups" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "startup_location_idx" ON "startups" USING btree ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "startup_slug_idx" ON "startups" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "startup_stage_idx" ON "startups" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "startup_status_created_idx" ON "startups" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "startup_userId_status_idx" ON "startups" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "investor_scoring_preference_investor_stage_idx" ON "investor_scoring_preferences" USING btree ("investor_id","stage");--> statement-breakpoint
CREATE INDEX "pipeline_runs_startup_idx" ON "pipeline_runs" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_status_started_idx" ON "pipeline_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "pipeline_failures_pipeline_idx" ON "pipeline_failures" USING btree ("pipeline_run_id");--> statement-breakpoint
CREATE INDEX "pipeline_failures_startup_phase_idx" ON "pipeline_failures" USING btree ("startup_id","phase");--> statement-breakpoint
CREATE UNIQUE INDEX "agentmail_config_inbox_id_idx" ON "agentmail_configs" USING btree ("inbox_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agentmail_config_user_id_idx" ON "agentmail_configs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pipeline_feedback_consumed_idx" ON "pipeline_feedback" USING btree ("consumed_at");--> statement-breakpoint
CREATE INDEX "pipeline_feedback_startup_agent_idx" ON "pipeline_feedback" USING btree ("startup_id","agent_key");--> statement-breakpoint
CREATE INDEX "pipeline_feedback_startup_phase_idx" ON "pipeline_feedback" USING btree ("startup_id","phase");--> statement-breakpoint
CREATE INDEX "clara_conv_investor_email_idx" ON "clara_conversations" USING btree ("investor_email");--> statement-breakpoint
CREATE INDEX "clara_conv_startup_id_idx" ON "clara_conversations" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "clara_conv_status_idx" ON "clara_conversations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "clara_conv_thread_id_idx" ON "clara_conversations" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "clara_msg_conversation_id_idx" ON "clara_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "clara_msg_direction_idx" ON "clara_messages" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "clara_msg_message_id_idx" ON "clara_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "waitlist_entries_created_idx" ON "waitlist_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "early_access_invites_email_idx" ON "early_access_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "early_access_invites_status_idx" ON "early_access_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_created_idx" ON "pipeline_agent_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_pipeline_idx" ON "pipeline_agent_runs" USING btree ("pipeline_run_id");--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_startup_idx" ON "pipeline_agent_runs" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_startup_phase_agent_idx" ON "pipeline_agent_runs" USING btree ("startup_id","phase","agent_key");--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_startup_run_kind_phase_step_started_idx" ON "pipeline_agent_runs" USING btree ("startup_id","pipeline_run_id","trace_kind","phase","step_key","started_at");--> statement-breakpoint
CREATE INDEX "ai_agent_config_orchestrator_idx" ON "ai_agent_configs" USING btree ("flow_id","orchestrator_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_config_unique_agent_idx" ON "ai_agent_configs" USING btree ("flow_id","orchestrator_node_id","agent_key");--> statement-breakpoint
CREATE INDEX "pipeline_template_flow_status_idx" ON "pipeline_templates" USING btree ("flow_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_template_flow_version_unique" ON "pipeline_templates" USING btree ("flow_id","version");--> statement-breakpoint
ALTER TABLE "ai_agent_configs" DROP COLUMN "prompt_definition_id";--> statement-breakpoint
DROP TYPE "public"."agent_category";--> statement-breakpoint
DROP TYPE "public"."ai_prompt_search_mode";--> statement-breakpoint
DROP TYPE "public"."ai_prompt_status";--> statement-breakpoint
DROP TYPE "public"."ai_prompt_surface";--> statement-breakpoint
DROP TYPE "public"."pipeline_flow_config_status";