ALTER TABLE "account" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "refresh_token" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_profile" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "asset" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "startup" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "startup_draft" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "investor_profile" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "investor_scoring_preference" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "investor_thesis" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scoring_weight" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stage_scoring_weight" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "startup_match" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_invite" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_member" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "portal" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "portal_submission" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_application" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scout_submission" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_review" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analysis_job" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "startup_evaluation" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_thread" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "integration_webhook" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "linkedin_profile_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_conversation" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_inbox" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_message" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_prompt" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attachment_download" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "select_own" ON "account" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "account" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "account" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "account" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "refresh_token" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "refresh_token" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "refresh_token" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "refresh_token" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "user" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "user" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "user" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "user" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "user_profile" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "user_profile" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "user_profile" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "user_profile" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "asset" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "asset" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "asset" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "asset" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "notification" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "notification" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "notification" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "notification" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "startup" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "startup" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "startup" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "startup" CASCADE;--> statement-breakpoint
DROP POLICY "startup_investor_view" ON "startup" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "startup_draft" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "startup_draft" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "startup_draft" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "startup_draft" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "investor_profile" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "investor_profile" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "investor_profile" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "investor_profile" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "investor_scoring_preference" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "investor_scoring_preference" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "investor_scoring_preference" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "investor_scoring_preference" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "investor_thesis" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "investor_thesis" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "investor_thesis" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "investor_thesis" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "scoring_weight" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "scoring_weight" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "scoring_weight" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "scoring_weight" CASCADE;--> statement-breakpoint
DROP POLICY "stage_scoring_weight_select" ON "stage_scoring_weight" CASCADE;--> statement-breakpoint
DROP POLICY "stage_scoring_weight_admin_insert" ON "stage_scoring_weight" CASCADE;--> statement-breakpoint
DROP POLICY "stage_scoring_weight_admin_update" ON "stage_scoring_weight" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "startup_match" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "startup_match" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "startup_match" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "startup_match" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "team_invite" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "team_invite" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "team_invite" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "team_invite" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "team_member" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "team_member" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "team_member" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "team_member" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "portal" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "portal" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "portal" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "portal" CASCADE;--> statement-breakpoint
DROP POLICY "portal_public_view" ON "portal" CASCADE;--> statement-breakpoint
DROP POLICY "submission_portal_owner_select" ON "portal_submission" CASCADE;--> statement-breakpoint
DROP POLICY "submission_portal_owner_update" ON "portal_submission" CASCADE;--> statement-breakpoint
DROP POLICY "submission_startup_insert" ON "portal_submission" CASCADE;--> statement-breakpoint
DROP POLICY "submission_startup_owner_select" ON "portal_submission" CASCADE;--> statement-breakpoint
DROP POLICY "scout_app_owner_select" ON "scout_application" CASCADE;--> statement-breakpoint
DROP POLICY "scout_app_owner_insert" ON "scout_application" CASCADE;--> statement-breakpoint
DROP POLICY "scout_app_owner_update" ON "scout_application" CASCADE;--> statement-breakpoint
DROP POLICY "scout_app_investor_select" ON "scout_application" CASCADE;--> statement-breakpoint
DROP POLICY "scout_app_investor_update" ON "scout_application" CASCADE;--> statement-breakpoint
DROP POLICY "scout_sub_owner_select" ON "scout_submission" CASCADE;--> statement-breakpoint
DROP POLICY "scout_sub_owner_insert" ON "scout_submission" CASCADE;--> statement-breakpoint
DROP POLICY "scout_sub_owner_update" ON "scout_submission" CASCADE;--> statement-breakpoint
DROP POLICY "scout_sub_investor_select" ON "scout_submission" CASCADE;--> statement-breakpoint
DROP POLICY "admin_review_admin_select" ON "admin_review" CASCADE;--> statement-breakpoint
DROP POLICY "admin_review_admin_insert" ON "admin_review" CASCADE;--> statement-breakpoint
DROP POLICY "admin_review_admin_update" ON "admin_review" CASCADE;--> statement-breakpoint
DROP POLICY "analysis_job_startup_owner_select" ON "analysis_job" CASCADE;--> statement-breakpoint
DROP POLICY "analysis_job_admin_insert" ON "analysis_job" CASCADE;--> statement-breakpoint
DROP POLICY "analysis_job_admin_update" ON "analysis_job" CASCADE;--> statement-breakpoint
DROP POLICY "analysis_job_admin_delete" ON "analysis_job" CASCADE;--> statement-breakpoint
DROP POLICY "startup_evaluation_owner_select" ON "startup_evaluation" CASCADE;--> statement-breakpoint
DROP POLICY "startup_evaluation_admin_insert" ON "startup_evaluation" CASCADE;--> statement-breakpoint
DROP POLICY "startup_evaluation_admin_update" ON "startup_evaluation" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "email_thread" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "email_thread" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "email_thread" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "email_thread" CASCADE;--> statement-breakpoint
DROP POLICY "webhook_admin_select" ON "integration_webhook" CASCADE;--> statement-breakpoint
DROP POLICY "webhook_admin_insert" ON "integration_webhook" CASCADE;--> statement-breakpoint
DROP POLICY "webhook_admin_update" ON "integration_webhook" CASCADE;--> statement-breakpoint
DROP POLICY "webhook_admin_delete" ON "integration_webhook" CASCADE;--> statement-breakpoint
DROP POLICY "select_own" ON "linkedin_profile_cache" CASCADE;--> statement-breakpoint
DROP POLICY "insert_own" ON "linkedin_profile_cache" CASCADE;--> statement-breakpoint
DROP POLICY "update_own" ON "linkedin_profile_cache" CASCADE;--> statement-breakpoint
DROP POLICY "delete_own" ON "linkedin_profile_cache" CASCADE;--> statement-breakpoint
DROP POLICY "agent_conversation_admin_select" ON "agent_conversation" CASCADE;--> statement-breakpoint
DROP POLICY "agent_conversation_admin_insert" ON "agent_conversation" CASCADE;--> statement-breakpoint
DROP POLICY "agent_conversation_admin_update" ON "agent_conversation" CASCADE;--> statement-breakpoint
DROP POLICY "agent_inbox_admin_select" ON "agent_inbox" CASCADE;--> statement-breakpoint
DROP POLICY "agent_inbox_admin_insert" ON "agent_inbox" CASCADE;--> statement-breakpoint
DROP POLICY "agent_inbox_admin_update" ON "agent_inbox" CASCADE;--> statement-breakpoint
DROP POLICY "agent_message_admin_select" ON "agent_message" CASCADE;--> statement-breakpoint
DROP POLICY "agent_message_admin_insert" ON "agent_message" CASCADE;--> statement-breakpoint
DROP POLICY "agent_prompt_select" ON "agent_prompt" CASCADE;--> statement-breakpoint
DROP POLICY "agent_prompt_admin_insert" ON "agent_prompt" CASCADE;--> statement-breakpoint
DROP POLICY "agent_prompt_admin_update" ON "agent_prompt" CASCADE;--> statement-breakpoint
DROP POLICY "agent_prompt_admin_delete" ON "agent_prompt" CASCADE;--> statement-breakpoint
DROP POLICY "attachment_download_admin_select" ON "attachment_download" CASCADE;--> statement-breakpoint
DROP POLICY "attachment_download_admin_insert" ON "attachment_download" CASCADE;--> statement-breakpoint
DROP POLICY "attachment_download_admin_update" ON "attachment_download" CASCADE;