CREATE TYPE "public"."pipeline_phase" AS ENUM('extraction', 'scraping', 'research', 'evaluation', 'synthesis');--> statement-breakpoint
CREATE TYPE "public"."pipeline_run_status" AS ENUM('running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."clara_conversation_status" AS ENUM('active', 'awaiting_info', 'processing', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."clara_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"family" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'founder' NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"type" text DEFAULT 'magic_link' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" text,
	"title" text,
	"linkedin_url" text,
	"bio" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"key" text NOT NULL,
	"url" text NOT NULL,
	"type" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"provider" text,
	"job_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" "notification_type" DEFAULT 'info' NOT NULL,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "startups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"submitted_by_role" "user_role" DEFAULT 'founder',
	"scout_id" uuid,
	"is_private" boolean DEFAULT false,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tagline" text NOT NULL,
	"description" text NOT NULL,
	"website" text NOT NULL,
	"location" text NOT NULL,
	"normalized_region" text,
	"industry" text NOT NULL,
	"sector_industry_group" text,
	"sector_industry" text,
	"stage" "startup_stage" NOT NULL,
	"funding_target" integer NOT NULL,
	"team_size" integer NOT NULL,
	"status" "startup_status" DEFAULT 'draft' NOT NULL,
	"pitch_deck_url" text,
	"demo_url" text,
	"logo_url" text,
	"pitch_deck_path" text,
	"files" jsonb,
	"team_members" jsonb,
	"round_currency" text DEFAULT 'USD',
	"valuation" double precision,
	"valuation_known" boolean DEFAULT true,
	"valuation_type" "valuation_type",
	"raise_type" "raise_type",
	"lead_secured" boolean,
	"lead_investor_name" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"contact_phone_country_code" text,
	"has_previous_funding" boolean,
	"previous_funding_amount" double precision,
	"previous_funding_currency" text,
	"previous_investors" text,
	"previous_round_type" text,
	"overall_score" real,
	"percentile_rank" real,
	"product_description" text,
	"technology_readiness_level" "trl",
	"product_screenshots" jsonb,
	"demo_video_url" text,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "startups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "startup_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "startup_drafts_startup_id_unique" UNIQUE("startup_id")
);
--> statement-breakpoint
CREATE TABLE "data_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"category" text NOT NULL,
	"visible_to_investors" jsonb DEFAULT '[]'::jsonb,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"status" "investor_interest_status" DEFAULT 'interested' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration" integer DEFAULT 30 NOT NULL,
	"location" text,
	"notes" text,
	"status" "meeting_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fund_name" text NOT NULL,
	"fund_description" text,
	"aum" text,
	"team_size" integer,
	"website" text,
	"logo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investor_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "investor_scoring_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"stage" "startup_stage" NOT NULL,
	"use_custom_weights" boolean DEFAULT false NOT NULL,
	"custom_weights" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_theses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"industries" text[],
	"stages" text[],
	"check_size_min" integer,
	"check_size_max" integer,
	"geographic_focus" text[],
	"must_have_features" text[],
	"deal_breakers" text[],
	"notes" text,
	"business_models" text[],
	"min_revenue" integer,
	"min_growth_rate" real,
	"min_team_size" integer,
	"thesis_narrative" text,
	"anti_portfolio" text,
	"website" text,
	"fund_size" double precision,
	"thesis_summary" text,
	"portfolio_companies" jsonb,
	"thesis_summary_generated_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investor_theses_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "stage_scoring_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage" "startup_stage" NOT NULL,
	"weights" jsonb NOT NULL,
	"rationale" jsonb NOT NULL,
	"overall_rationale" text,
	"last_modified_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stage_scoring_weights_stage_unique" UNIQUE("stage")
);
--> statement-breakpoint
CREATE TABLE "startup_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"overall_score" integer NOT NULL,
	"market_score" integer,
	"team_score" integer,
	"product_score" integer,
	"traction_score" integer,
	"financials_score" integer,
	"match_reason" text,
	"is_saved" boolean DEFAULT false NOT NULL,
	"viewed_at" timestamp,
	"status" "match_status" DEFAULT 'new' NOT NULL,
	"status_changed_at" timestamp,
	"pass_reason" text,
	"pass_notes" text,
	"investment_amount" double precision,
	"investment_currency" text DEFAULT 'USD',
	"investment_date" timestamp,
	"investment_notes" text,
	"meeting_requested" boolean DEFAULT false,
	"meeting_requested_at" timestamp,
	"thesis_fit_score" integer,
	"fit_rationale" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_thesis_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "team_role" NOT NULL,
	"invite_code" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_thesis_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "team_role" NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"content" text NOT NULL,
	"category" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"deal_size" integer,
	"deal_stage" text,
	"invested_at" timestamp NOT NULL,
	"exited_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"logo_url" text,
	"brand_color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portals_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "portal_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"status" "portal_submission_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"name" text,
	"email" text,
	"linkedin_url" text,
	"experience" text,
	"motivation" text,
	"dealflow_sources" text,
	"portfolio" text[],
	"status" "scout_application_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" uuid,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scout_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"commission_rate" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scout_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"deal_size" integer NOT NULL,
	"commission_rate" integer NOT NULL,
	"commission_amount" integer NOT NULL,
	"status" "scout_commission_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"score_override" real,
	"memo_edits" jsonb,
	"admin_notes" text,
	"flagged_concerns" jsonb,
	"investor_visibility" jsonb,
	"decision" "admin_review_decision",
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"job_type" "analysis_job_type" NOT NULL,
	"status" "analysis_job_status" DEFAULT 'pending' NOT NULL,
	"priority" "analysis_job_priority" DEFAULT 'medium' NOT NULL,
	"result" jsonb,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "startup_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"website_data" jsonb,
	"website_score" real,
	"messaging_clarity_score" real,
	"deck_data" jsonb,
	"deck_score" real,
	"missing_slide_flags" jsonb,
	"team_data" jsonb,
	"team_member_evaluations" jsonb,
	"team_score" real,
	"founder_market_fit" real,
	"execution_risk_notes" text,
	"team_composition" jsonb,
	"market_data" jsonb,
	"market_score" real,
	"tam_validation" jsonb,
	"market_credibility" real,
	"product_data" jsonb,
	"product_score" real,
	"product_summary" text,
	"extracted_screenshots" jsonb,
	"extracted_demo_videos" jsonb,
	"extracted_features" jsonb,
	"extracted_tech_stack" jsonb,
	"traction_data" jsonb,
	"traction_score" real,
	"momentum_score" real,
	"traction_credibility" real,
	"business_model_data" jsonb,
	"business_model_score" real,
	"gtm_data" jsonb,
	"gtm_score" real,
	"financials_data" jsonb,
	"financials_score" real,
	"competitive_advantage_data" jsonb,
	"competitive_advantage_score" real,
	"legal_data" jsonb,
	"legal_score" real,
	"deal_terms_data" jsonb,
	"deal_terms_score" real,
	"exit_potential_data" jsonb,
	"exit_potential_score" real,
	"section_scores" jsonb,
	"overall_score" real,
	"percentile_rank" real,
	"key_strengths" jsonb,
	"key_risks" jsonb,
	"recommendations" jsonb,
	"data_confidence_notes" text,
	"executive_summary" text,
	"founder_report" jsonb,
	"investor_memo" jsonb,
	"sources" jsonb,
	"admin_feedback" jsonb,
	"web_research_data" jsonb,
	"deck_content" text,
	"deck_files_hash" text,
	"comprehensive_research_data" jsonb,
	"website_scraped" text,
	"analysis_progress" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "startup_evaluations_startup_id_unique" UNIQUE("startup_id")
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"subject" text,
	"participants" text[],
	"last_message_at" timestamp,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "webhook_source" NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linkedin_profile_caches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"linkedin_url" text NOT NULL,
	"linkedin_identifier" text NOT NULL,
	"profile_data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_profile_caches_linkedin_url_unique" UNIQUE("linkedin_url")
);
--> statement-breakpoint
CREATE TABLE "agentmail_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"inbox_id" text NOT NULL,
	"inbox_email" text,
	"display_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_profile_id" uuid,
	"sender_email" text,
	"sender_phone" text,
	"sender_name" text,
	"email_thread_id" text,
	"whatsapp_thread_id" text,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"current_startup_id" uuid,
	"context" jsonb,
	"message_count" integer DEFAULT 0 NOT NULL,
	"is_authenticated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_inboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agentmail_inbox_id" text,
	"email_address" text,
	"twilio_phone_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"welcome_message" text,
	"auto_reply_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"channel" "channel_type" NOT NULL,
	"direction" "message_direction" NOT NULL,
	"content" text NOT NULL,
	"intent" "message_intent",
	"extracted_entities" jsonb,
	"external_message_id" text,
	"in_reply_to_message_id" uuid,
	"attachments" jsonb,
	"ai_response_metadata" jsonb,
	"delivery_status" text,
	"delivery_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_key" varchar(50) NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"category" "agent_category" NOT NULL,
	"system_prompt" text NOT NULL,
	"human_prompt" text NOT NULL,
	"tools" jsonb,
	"inputs" jsonb,
	"outputs" jsonb,
	"parent_agent" text,
	"execution_order" integer DEFAULT 0,
	"is_parallel" boolean DEFAULT true,
	"version" integer DEFAULT 1 NOT NULL,
	"last_modified_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_prompts_agent_key_unique" UNIQUE("agent_key")
);
--> statement-breakpoint
CREATE TABLE "attachment_downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbox_id" text NOT NULL,
	"message_id" text NOT NULL,
	"attachment_id" text NOT NULL,
	"filename" text,
	"content_type" text,
	"download_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"saved_path" text,
	"file_size" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pipeline_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_run_id" text NOT NULL,
	"startup_id" uuid NOT NULL,
	"phase" "pipeline_phase" NOT NULL,
	"job_data" jsonb,
	"error" jsonb NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_run_id" text NOT NULL,
	"startup_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "pipeline_run_status" DEFAULT 'running' NOT NULL,
	"config" jsonb NOT NULL,
	"error" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_runs_pipeline_run_id_unique" UNIQUE("pipeline_run_id")
);
--> statement-breakpoint
CREATE TABLE "pipeline_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"phase" "pipeline_phase" NOT NULL,
	"agent_key" text,
	"feedback" text NOT NULL,
	"metadata" jsonb,
	"created_by" uuid NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clara_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" text NOT NULL,
	"investor_user_id" uuid,
	"investor_email" text NOT NULL,
	"investor_name" text,
	"startup_id" uuid,
	"status" "clara_conversation_status" DEFAULT 'active' NOT NULL,
	"last_intent" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clara_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"direction" "clara_message_direction" NOT NULL,
	"from_email" text NOT NULL,
	"subject" text,
	"body_text" text,
	"intent" text,
	"intent_confidence" real,
	"attachments" jsonb,
	"processed" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "account" CASCADE;--> statement-breakpoint
DROP TABLE "refresh_token" CASCADE;--> statement-breakpoint
DROP TABLE "user" CASCADE;--> statement-breakpoint
DROP TABLE "verification" CASCADE;--> statement-breakpoint
DROP TABLE "user_profile" CASCADE;--> statement-breakpoint
DROP TABLE "asset" CASCADE;--> statement-breakpoint
DROP TABLE "notification" CASCADE;--> statement-breakpoint
DROP TABLE "startup" CASCADE;--> statement-breakpoint
DROP TABLE "startup_draft" CASCADE;--> statement-breakpoint
DROP TABLE "data_room" CASCADE;--> statement-breakpoint
DROP TABLE "investor_interest" CASCADE;--> statement-breakpoint
DROP TABLE "meeting" CASCADE;--> statement-breakpoint
DROP TABLE "investor_profile" CASCADE;--> statement-breakpoint
DROP TABLE "investor_scoring_preference" CASCADE;--> statement-breakpoint
DROP TABLE "investor_thesis" CASCADE;--> statement-breakpoint
DROP TABLE "scoring_weight" CASCADE;--> statement-breakpoint
DROP TABLE "stage_scoring_weight" CASCADE;--> statement-breakpoint
DROP TABLE "startup_match" CASCADE;--> statement-breakpoint
DROP TABLE "team_invite" CASCADE;--> statement-breakpoint
DROP TABLE "team_member" CASCADE;--> statement-breakpoint
DROP TABLE "investor_note" CASCADE;--> statement-breakpoint
DROP TABLE "investor_portfolio" CASCADE;--> statement-breakpoint
DROP TABLE "portal" CASCADE;--> statement-breakpoint
DROP TABLE "portal_submission" CASCADE;--> statement-breakpoint
DROP TABLE "scout_application" CASCADE;--> statement-breakpoint
DROP TABLE "scout_submission" CASCADE;--> statement-breakpoint
DROP TABLE "scout_commission" CASCADE;--> statement-breakpoint
DROP TABLE "admin_review" CASCADE;--> statement-breakpoint
DROP TABLE "analysis_job" CASCADE;--> statement-breakpoint
DROP TABLE "startup_evaluation" CASCADE;--> statement-breakpoint
DROP TABLE "email_thread" CASCADE;--> statement-breakpoint
DROP TABLE "integration_webhook" CASCADE;--> statement-breakpoint
DROP TABLE "linkedin_profile_cache" CASCADE;--> statement-breakpoint
DROP TABLE "agent_conversation" CASCADE;--> statement-breakpoint
DROP TABLE "agent_inbox" CASCADE;--> statement-breakpoint
DROP TABLE "agent_message" CASCADE;--> statement-breakpoint
DROP TABLE "agent_prompt" CASCADE;--> statement-breakpoint
DROP TABLE "attachment_download" CASCADE;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startups" ADD CONSTRAINT "startups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startups" ADD CONSTRAINT "startups_scout_id_users_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_drafts" ADD CONSTRAINT "startup_drafts_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_drafts" ADD CONSTRAINT "startup_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_rooms" ADD CONSTRAINT "data_rooms_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_rooms" ADD CONSTRAINT "data_rooms_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_interests" ADD CONSTRAINT "investor_interests_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_interests" ADD CONSTRAINT "investor_interests_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_profiles" ADD CONSTRAINT "investor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_scoring_preferences" ADD CONSTRAINT "investor_scoring_preferences_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_theses" ADD CONSTRAINT "investor_theses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_scoring_weights" ADD CONSTRAINT "stage_scoring_weights_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_matches" ADD CONSTRAINT "startup_matches_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_matches" ADD CONSTRAINT "startup_matches_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_investor_thesis_id_investor_theses_id_fk" FOREIGN KEY ("investor_thesis_id") REFERENCES "public"."investor_theses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_investor_thesis_id_investor_theses_id_fk" FOREIGN KEY ("investor_thesis_id") REFERENCES "public"."investor_theses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_notes" ADD CONSTRAINT "investor_notes_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_notes" ADD CONSTRAINT "investor_notes_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_portfolios" ADD CONSTRAINT "investor_portfolios_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_portfolios" ADD CONSTRAINT "investor_portfolios_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portals" ADD CONSTRAINT "portals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_submissions" ADD CONSTRAINT "portal_submissions_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_submissions" ADD CONSTRAINT "portal_submissions_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_applications" ADD CONSTRAINT "scout_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_applications" ADD CONSTRAINT "scout_applications_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_applications" ADD CONSTRAINT "scout_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_submissions" ADD CONSTRAINT "scout_submissions_scout_id_users_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_submissions" ADD CONSTRAINT "scout_submissions_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_submissions" ADD CONSTRAINT "scout_submissions_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_commissions" ADD CONSTRAINT "scout_commissions_scout_id_users_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_commissions" ADD CONSTRAINT "scout_commissions_submission_id_scout_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."scout_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_evaluations" ADD CONSTRAINT "startup_evaluations_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_profile_caches" ADD CONSTRAINT "linkedin_profile_caches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentmail_configs" ADD CONSTRAINT "agentmail_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_investor_profile_id_investor_profiles_id_fk" FOREIGN KEY ("investor_profile_id") REFERENCES "public"."investor_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_current_startup_id_startups_id_fk" FOREIGN KEY ("current_startup_id") REFERENCES "public"."startups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompts" ADD CONSTRAINT "agent_prompts_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_failures" ADD CONSTRAINT "pipeline_failures_pipeline_run_id_pipeline_runs_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_failures" ADD CONSTRAINT "pipeline_failures_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_feedback" ADD CONSTRAINT "pipeline_feedback_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_feedback" ADD CONSTRAINT "pipeline_feedback_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clara_conversations" ADD CONSTRAINT "clara_conversations_investor_user_id_users_id_fk" FOREIGN KEY ("investor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clara_conversations" ADD CONSTRAINT "clara_conversations_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clara_messages" ADD CONSTRAINT "clara_messages_conversation_id_clara_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."clara_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_accountId_idx" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_userId_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_family_idx" ON "refresh_tokens" USING btree ("family");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "asset_user_idx" ON "assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_project_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "asset_type_idx" ON "assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notification_user_read_created_idx" ON "notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "startup_userId_status_idx" ON "startups" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "startup_status_created_idx" ON "startups" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "startup_industry_idx" ON "startups" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "startup_stage_idx" ON "startups" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "startup_location_idx" ON "startups" USING btree ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "startup_slug_idx" ON "startups" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "startup_draft_startupId_updated_idx" ON "startup_drafts" USING btree ("startup_id","updated_at");--> statement-breakpoint
CREATE INDEX "startup_draft_userId_idx" ON "startup_drafts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "data_room_startup_idx" ON "data_rooms" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "data_room_category_idx" ON "data_rooms" USING btree ("category");--> statement-breakpoint
CREATE INDEX "investor_interest_investor_idx" ON "investor_interests" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_interest_startup_idx" ON "investor_interests" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "investor_interest_status_idx" ON "investor_interests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meeting_startup_idx" ON "meetings" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "meeting_investor_idx" ON "meetings" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "meeting_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "investor_profile_user_idx" ON "investor_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investor_scoring_preference_investor_stage_idx" ON "investor_scoring_preferences" USING btree ("investor_id","stage");--> statement-breakpoint
CREATE INDEX "investor_thesis_user_idx" ON "investor_theses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stage_scoring_weight_stage_idx" ON "stage_scoring_weights" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "match_investor_score_idx" ON "startup_matches" USING btree ("investor_id","overall_score");--> statement-breakpoint
CREATE INDEX "match_startup_idx" ON "startup_matches" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "match_investor_saved_idx" ON "startup_matches" USING btree ("investor_id","is_saved");--> statement-breakpoint
CREATE INDEX "match_investor_status_idx" ON "startup_matches" USING btree ("investor_id","status");--> statement-breakpoint
CREATE INDEX "team_invite_thesis_idx" ON "team_invites" USING btree ("investor_thesis_id");--> statement-breakpoint
CREATE INDEX "team_invite_code_idx" ON "team_invites" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "team_invite_email_idx" ON "team_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "team_member_thesis_idx" ON "team_members" USING btree ("investor_thesis_id");--> statement-breakpoint
CREATE INDEX "team_member_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investor_note_investor_idx" ON "investor_notes" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_note_startup_idx" ON "investor_notes" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "investor_note_investor_startup_idx" ON "investor_notes" USING btree ("investor_id","startup_id");--> statement-breakpoint
CREATE INDEX "investor_portfolio_investor_idx" ON "investor_portfolios" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_portfolio_startup_idx" ON "investor_portfolios" USING btree ("startup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_slug_idx" ON "portals" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "portal_user_idx" ON "portals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portal_submission_portal_submitted_idx" ON "portal_submissions" USING btree ("portal_id","submitted_at");--> statement-breakpoint
CREATE INDEX "portal_submission_startup_idx" ON "portal_submissions" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "scout_application_user_idx" ON "scout_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scout_application_investor_status_idx" ON "scout_applications" USING btree ("investor_id","status");--> statement-breakpoint
CREATE INDEX "scout_submission_scout_idx" ON "scout_submissions" USING btree ("scout_id");--> statement-breakpoint
CREATE INDEX "scout_submission_investor_created_idx" ON "scout_submissions" USING btree ("investor_id","created_at");--> statement-breakpoint
CREATE INDEX "scout_commission_scout_idx" ON "scout_commissions" USING btree ("scout_id");--> statement-breakpoint
CREATE INDEX "scout_commission_submission_idx" ON "scout_commissions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "scout_commission_status_idx" ON "scout_commissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "admin_review_startup_idx" ON "admin_reviews" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "admin_review_reviewer_idx" ON "admin_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "analysis_job_startup_type_idx" ON "analysis_jobs" USING btree ("startup_id","job_type");--> statement-breakpoint
CREATE INDEX "analysis_job_status_priority_created_idx" ON "analysis_jobs" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "startup_evaluation_startup_idx" ON "startup_evaluations" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "email_thread_user_last_message_idx" ON "email_threads" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "webhook_source_processed_created_idx" ON "integration_webhooks" USING btree ("source","processed","created_at");--> statement-breakpoint
CREATE INDEX "linkedin_cache_url_expires_idx" ON "linkedin_profile_caches" USING btree ("linkedin_url","expires_at");--> statement-breakpoint
CREATE INDEX "linkedin_cache_user_id_idx" ON "linkedin_profile_caches" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agentmail_config_user_id_idx" ON "agentmail_configs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agentmail_config_inbox_id_idx" ON "agentmail_configs" USING btree ("inbox_id");--> statement-breakpoint
CREATE INDEX "agent_conversation_investor_idx" ON "agent_conversations" USING btree ("investor_profile_id");--> statement-breakpoint
CREATE INDEX "agent_conversation_email_idx" ON "agent_conversations" USING btree ("sender_email");--> statement-breakpoint
CREATE INDEX "agent_conversation_status_idx" ON "agent_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_message_conversation_idx" ON "agent_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_message_created_idx" ON "agent_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_prompt_key_idx" ON "agent_prompts" USING btree ("agent_key");--> statement-breakpoint
CREATE INDEX "attachment_download_inbox_message_idx" ON "attachment_downloads" USING btree ("inbox_id","message_id");--> statement-breakpoint
CREATE INDEX "pipeline_failures_pipeline_idx" ON "pipeline_failures" USING btree ("pipeline_run_id");--> statement-breakpoint
CREATE INDEX "pipeline_failures_startup_phase_idx" ON "pipeline_failures" USING btree ("startup_id","phase");--> statement-breakpoint
CREATE INDEX "pipeline_runs_startup_idx" ON "pipeline_runs" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_status_started_idx" ON "pipeline_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "pipeline_feedback_startup_phase_idx" ON "pipeline_feedback" USING btree ("startup_id","phase");--> statement-breakpoint
CREATE INDEX "pipeline_feedback_startup_agent_idx" ON "pipeline_feedback" USING btree ("startup_id","agent_key");--> statement-breakpoint
CREATE INDEX "pipeline_feedback_consumed_idx" ON "pipeline_feedback" USING btree ("consumed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clara_conv_thread_id_idx" ON "clara_conversations" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "clara_conv_investor_email_idx" ON "clara_conversations" USING btree ("investor_email");--> statement-breakpoint
CREATE INDEX "clara_conv_startup_id_idx" ON "clara_conversations" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "clara_conv_status_idx" ON "clara_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clara_msg_conversation_id_idx" ON "clara_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "clara_msg_message_id_idx" ON "clara_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "clara_msg_direction_idx" ON "clara_messages" USING btree ("direction");