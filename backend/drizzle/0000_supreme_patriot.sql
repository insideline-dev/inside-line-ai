CREATE TYPE "public"."admin_review_decision" AS ENUM('approved', 'rejected', 'needs_revision');--> statement-breakpoint
CREATE TYPE "public"."agent_category" AS ENUM('orchestrator', 'analysis', 'synthesis');--> statement-breakpoint
CREATE TYPE "public"."ai_flow_node_kind" AS ENUM('prompt', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_prompt_search_mode" AS ENUM('off', 'provider_grounded_search', 'brave_tool_search', 'provider_and_brave_search');--> statement-breakpoint
CREATE TYPE "public"."ai_prompt_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ai_prompt_surface" AS ENUM('pipeline', 'clara');--> statement-breakpoint
CREATE TYPE "public"."analysis_job_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."analysis_job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."analysis_job_type" AS ENUM('scoring', 'pdf', 'matching', 'market_analysis');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('email', 'whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."clara_conversation_status" AS ENUM('active', 'awaiting_info', 'processing', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."clara_message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'waiting_response', 'resolved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."early_access_invite_status" AS ENUM('pending', 'redeemed', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."investor_interest_status" AS ENUM('interested', 'passed', 'meeting_scheduled');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('new', 'reviewing', 'engaged', 'closed', 'passed');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."message_intent" AS ENUM('question', 'submission', 'follow_up', 'greeting', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('info', 'success', 'warning', 'error', 'match');--> statement-breakpoint
CREATE TYPE "public"."pipeline_agent_run_status" AS ENUM('running', 'completed', 'failed', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."pipeline_flow_config_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pipeline_phase" AS ENUM('extraction', 'enrichment', 'scraping', 'research', 'evaluation', 'synthesis');--> statement-breakpoint
CREATE TYPE "public"."pipeline_run_status" AS ENUM('running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pipeline_template_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pipeline_trace_kind" AS ENUM('ai_agent', 'phase_step');--> statement-breakpoint
CREATE TYPE "public"."portal_submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."raise_type" AS ENUM('safe', 'convertible_note', 'equity', 'safe_equity', 'undecided');--> statement-breakpoint
CREATE TYPE "public"."scout_application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."scout_commission_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."startup_stage" AS ENUM('pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'series_e', 'series_f_plus');--> statement-breakpoint
CREATE TYPE "public"."startup_status" AS ENUM('draft', 'submitted', 'analyzing', 'pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."trl" AS ENUM('idea', 'mvp', 'scaling', 'mature');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('founder', 'investor', 'admin', 'scout');--> statement-breakpoint
CREATE TYPE "public"."valuation_type" AS ENUM('pre_money', 'post_money');--> statement-breakpoint
CREATE TYPE "public"."webhook_source" AS ENUM('agentmail', 'twilio');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'founder' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
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
	"geographic_focus_nodes" text[],
	"min_thesis_fit_score" integer,
	"min_startup_score" integer,
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
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
	"fit_rationale" text
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
	"linkedin_url" text,
	"portfolio" text[],
	"status" "scout_application_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" uuid,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"name" text,
	"email" text,
	"experience" text,
	"motivation" text,
	"dealflow_sources" text
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
	"geo_country_code" text,
	"geo_level_1" text,
	"geo_level_2" text,
	"geo_level_3" text,
	"geo_path" text[],
	CONSTRAINT "startups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "investor_scoring_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"stage" "startup_stage" NOT NULL,
	"use_custom_weights" boolean DEFAULT false NOT NULL,
	"custom_weights" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"custom_rationale" jsonb
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
CREATE TABLE "investor_inbox_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"inbox_id" text NOT NULL,
	"subject" text,
	"body_text" text,
	"from_email" text NOT NULL,
	"attachment_keys" jsonb DEFAULT '[]'::jsonb,
	"suggested_company_name" text,
	"startup_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"surface" "ai_prompt_surface" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"stage" "startup_stage",
	"status" "ai_prompt_status" DEFAULT 'draft' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"user_prompt" text NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company_name" text NOT NULL,
	"role" text NOT NULL,
	"website" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"consent_to_share_info" boolean DEFAULT false NOT NULL,
	"consent_to_early_access" boolean DEFAULT false NOT NULL,
	CONSTRAINT "waitlist_entries_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "early_access_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "early_access_invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"redeemed_at" timestamp,
	"redeemed_by_user_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" "user_role" DEFAULT 'founder' NOT NULL,
	CONSTRAINT "early_access_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pipeline_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_run_id" text NOT NULL,
	"startup_id" uuid NOT NULL,
	"phase" "pipeline_phase" NOT NULL,
	"agent_key" text NOT NULL,
	"status" "pipeline_agent_run_status" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"used_fallback" boolean DEFAULT false NOT NULL,
	"input_prompt" text,
	"output_text" text,
	"output_json" jsonb,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"trace_kind" "pipeline_trace_kind" DEFAULT 'ai_agent' NOT NULL,
	"step_key" text,
	"input_json" jsonb,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_context_config_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"stage" "startup_stage",
	"status" "ai_prompt_status" DEFAULT 'draft' NOT NULL,
	"config_json" jsonb NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_config_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"stage" "startup_stage",
	"status" "ai_prompt_status" DEFAULT 'draft' NOT NULL,
	"model_name" varchar(120) NOT NULL,
	"search_mode" "ai_prompt_search_mode" DEFAULT 'off' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_flow_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "pipeline_flow_config_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"flow_definition" jsonb NOT NULL,
	"pipeline_config" jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_schema_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" uuid NOT NULL,
	"stage" "startup_stage",
	"status" "ai_prompt_status" DEFAULT 'draft' NOT NULL,
	"schema_json" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" varchar(50) NOT NULL,
	"orchestrator_node_id" varchar(120) NOT NULL,
	"agent_key" varchar(120) NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"kind" "ai_flow_node_kind" DEFAULT 'prompt' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"prompt_definition_id" uuid,
	"execution_phase" integer DEFAULT 1 NOT NULL,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" varchar(50) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "pipeline_template_status" DEFAULT 'draft' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investor_profiles" ADD CONSTRAINT "investor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_theses" ADD CONSTRAINT "investor_theses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_scoring_weights" ADD CONSTRAINT "stage_scoring_weights_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_matches" ADD CONSTRAINT "startup_matches_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_matches" ADD CONSTRAINT "startup_matches_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_investor_thesis_id_investor_theses_id_fk" FOREIGN KEY ("investor_thesis_id") REFERENCES "public"."investor_theses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_evaluations" ADD CONSTRAINT "startup_evaluations_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_drafts" ADD CONSTRAINT "startup_drafts_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_drafts" ADD CONSTRAINT "startup_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_rooms" ADD CONSTRAINT "data_rooms_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_rooms" ADD CONSTRAINT "data_rooms_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_interests" ADD CONSTRAINT "investor_interests_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_interests" ADD CONSTRAINT "investor_interests_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_investor_thesis_id_investor_theses_id_fk" FOREIGN KEY ("investor_thesis_id") REFERENCES "public"."investor_theses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_profile_caches" ADD CONSTRAINT "linkedin_profile_caches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_investor_profile_id_investor_profiles_id_fk" FOREIGN KEY ("investor_profile_id") REFERENCES "public"."investor_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_current_startup_id_startups_id_fk" FOREIGN KEY ("current_startup_id") REFERENCES "public"."startups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompts" ADD CONSTRAINT "agent_prompts_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startups" ADD CONSTRAINT "startups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startups" ADD CONSTRAINT "startups_scout_id_users_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_scoring_preferences" ADD CONSTRAINT "investor_scoring_preferences_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_failures" ADD CONSTRAINT "pipeline_failures_pipeline_run_id_pipeline_runs_pipeline_run_id" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_failures" ADD CONSTRAINT "pipeline_failures_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agentmail_configs" ADD CONSTRAINT "agentmail_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_feedback" ADD CONSTRAINT "pipeline_feedback_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_feedback" ADD CONSTRAINT "pipeline_feedback_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clara_conversations" ADD CONSTRAINT "clara_conversations_investor_user_id_users_id_fk" FOREIGN KEY ("investor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clara_conversations" ADD CONSTRAINT "clara_conversations_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clara_messages" ADD CONSTRAINT "clara_messages_conversation_id_clara_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."clara_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_inbox_submission" ADD CONSTRAINT "investor_inbox_submission_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_inbox_submission" ADD CONSTRAINT "investor_inbox_submission_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_access_invites" ADD CONSTRAINT "early_access_invites_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_access_invites" ADD CONSTRAINT "early_access_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_agent_runs" ADD CONSTRAINT "pipeline_agent_runs_pipeline_run_id_pipeline_runs_pipeline_run_" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_agent_runs" ADD CONSTRAINT "pipeline_agent_runs_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_config_revisions" ADD CONSTRAINT "ai_context_config_revisions_definition_id_ai_prompt_definitions" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_config_revisions" ADD CONSTRAINT "ai_context_config_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_config_revisions" ADD CONSTRAINT "ai_context_config_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_definition_id_ai_prompt_definitions_i" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_flow_configs" ADD CONSTRAINT "pipeline_flow_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_flow_configs" ADD CONSTRAINT "pipeline_flow_configs_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_schema_revisions" ADD CONSTRAINT "ai_agent_schema_revisions_definition_id_ai_prompt_definitions_i" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_schema_revisions" ADD CONSTRAINT "ai_agent_schema_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_schema_revisions" ADD CONSTRAINT "ai_agent_schema_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_configs" ADD CONSTRAINT "ai_agent_configs_prompt_definition_id_ai_prompt_definitions_id_" FOREIGN KEY ("prompt_definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_configs" ADD CONSTRAINT "ai_agent_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_templates" ADD CONSTRAINT "pipeline_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_templates" ADD CONSTRAINT "pipeline_templates_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verifications" USING btree ("identifier" text_ops);--> statement-breakpoint
CREATE INDEX "investor_profile_user_idx" ON "investor_profiles" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_thesis_user_idx" ON "investor_theses" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "stage_scoring_weight_stage_idx" ON "stage_scoring_weights" USING btree ("stage" enum_ops);--> statement-breakpoint
CREATE INDEX "match_investor_saved_idx" ON "startup_matches" USING btree ("investor_id" uuid_ops,"is_saved" bool_ops);--> statement-breakpoint
CREATE INDEX "match_investor_score_idx" ON "startup_matches" USING btree ("investor_id" int4_ops,"overall_score" uuid_ops);--> statement-breakpoint
CREATE INDEX "match_investor_status_idx" ON "startup_matches" USING btree ("investor_id" enum_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "match_startup_idx" ON "startup_matches" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "team_member_thesis_idx" ON "team_members" USING btree ("investor_thesis_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "team_member_user_idx" ON "team_members" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "admin_review_reviewer_idx" ON "admin_reviews" USING btree ("reviewer_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "admin_review_startup_idx" ON "admin_reviews" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "startup_evaluation_startup_idx" ON "startup_evaluations" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "agent_message_conversation_idx" ON "agent_messages" USING btree ("conversation_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "agent_message_created_idx" ON "agent_messages" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "attachment_download_inbox_message_idx" ON "attachment_downloads" USING btree ("inbox_id" text_ops,"message_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_accountId_idx" ON "accounts" USING btree ("provider_id" text_ops,"account_id" text_ops);--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "accounts" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "refresh_token_family_idx" ON "refresh_tokens" USING btree ("family" text_ops);--> statement-breakpoint
CREATE INDEX "refresh_token_userId_idx" ON "refresh_tokens" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "asset_project_idx" ON "assets" USING btree ("project_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "asset_type_idx" ON "assets" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "asset_user_idx" ON "assets" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "notification_user_read_created_idx" ON "notifications" USING btree ("user_id" timestamp_ops,"read" timestamp_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "startup_draft_startupId_updated_idx" ON "startup_drafts" USING btree ("startup_id" timestamp_ops,"updated_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "startup_draft_userId_idx" ON "startup_drafts" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "data_room_category_idx" ON "data_rooms" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "data_room_startup_idx" ON "data_rooms" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_interest_investor_idx" ON "investor_interests" USING btree ("investor_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_interest_startup_idx" ON "investor_interests" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_interest_status_idx" ON "investor_interests" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "meeting_investor_idx" ON "meetings" USING btree ("investor_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "meeting_startup_idx" ON "meetings" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "meeting_status_idx" ON "meetings" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "team_invite_code_idx" ON "team_invites" USING btree ("invite_code" text_ops);--> statement-breakpoint
CREATE INDEX "team_invite_email_idx" ON "team_invites" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "team_invite_thesis_idx" ON "team_invites" USING btree ("investor_thesis_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_note_investor_idx" ON "investor_notes" USING btree ("investor_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_note_investor_startup_idx" ON "investor_notes" USING btree ("investor_id" uuid_ops,"startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_note_startup_idx" ON "investor_notes" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_portfolio_investor_idx" ON "investor_portfolios" USING btree ("investor_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_portfolio_startup_idx" ON "investor_portfolios" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "portal_slug_idx" ON "portals" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "portal_user_idx" ON "portals" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "portal_submission_portal_submitted_idx" ON "portal_submissions" USING btree ("portal_id" timestamp_ops,"submitted_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "portal_submission_startup_idx" ON "portal_submissions" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "scout_application_investor_status_idx" ON "scout_applications" USING btree ("investor_id" uuid_ops,"status" uuid_ops);--> statement-breakpoint
CREATE INDEX "scout_application_user_idx" ON "scout_applications" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "scout_submission_investor_created_idx" ON "scout_submissions" USING btree ("investor_id" timestamp_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "scout_submission_scout_idx" ON "scout_submissions" USING btree ("scout_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "scout_commission_scout_idx" ON "scout_commissions" USING btree ("scout_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "scout_commission_status_idx" ON "scout_commissions" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "scout_commission_submission_idx" ON "scout_commissions" USING btree ("submission_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "analysis_job_startup_type_idx" ON "analysis_jobs" USING btree ("startup_id" uuid_ops,"job_type" uuid_ops);--> statement-breakpoint
CREATE INDEX "analysis_job_status_priority_created_idx" ON "analysis_jobs" USING btree ("status" timestamp_ops,"priority" timestamp_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "email_thread_user_last_message_idx" ON "email_threads" USING btree ("user_id" timestamp_ops,"last_message_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "webhook_source_processed_created_idx" ON "integration_webhooks" USING btree ("source" timestamp_ops,"processed" timestamp_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "linkedin_cache_url_expires_idx" ON "linkedin_profile_caches" USING btree ("linkedin_url" timestamp_ops,"expires_at" text_ops);--> statement-breakpoint
CREATE INDEX "linkedin_cache_user_id_idx" ON "linkedin_profile_caches" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "agent_conversation_email_idx" ON "agent_conversations" USING btree ("sender_email" text_ops);--> statement-breakpoint
CREATE INDEX "agent_conversation_investor_idx" ON "agent_conversations" USING btree ("investor_profile_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "agent_conversation_status_idx" ON "agent_conversations" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "agent_prompt_key_idx" ON "agent_prompts" USING btree ("agent_key" text_ops);--> statement-breakpoint
CREATE INDEX "startup_geo_level1_idx" ON "startups" USING btree ("geo_level_1" text_ops);--> statement-breakpoint
CREATE INDEX "startup_geo_level2_idx" ON "startups" USING btree ("geo_level_2" text_ops);--> statement-breakpoint
CREATE INDEX "startup_geo_level3_idx" ON "startups" USING btree ("geo_level_3" text_ops);--> statement-breakpoint
CREATE INDEX "startup_industry_idx" ON "startups" USING btree ("industry" text_ops);--> statement-breakpoint
CREATE INDEX "startup_location_idx" ON "startups" USING btree ("location" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "startup_slug_idx" ON "startups" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "startup_stage_idx" ON "startups" USING btree ("stage" enum_ops);--> statement-breakpoint
CREATE INDEX "startup_status_created_idx" ON "startups" USING btree ("status" timestamp_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "startup_userId_status_idx" ON "startups" USING btree ("user_id" uuid_ops,"status" uuid_ops);--> statement-breakpoint
CREATE INDEX "investor_scoring_preference_investor_stage_idx" ON "investor_scoring_preferences" USING btree ("investor_id" uuid_ops,"stage" uuid_ops);--> statement-breakpoint
CREATE INDEX "pipeline_runs_startup_idx" ON "pipeline_runs" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "pipeline_runs_status_started_idx" ON "pipeline_runs" USING btree ("status" timestamp_ops,"started_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "pipeline_failures_pipeline_idx" ON "pipeline_failures" USING btree ("pipeline_run_id" text_ops);--> statement-breakpoint
CREATE INDEX "pipeline_failures_startup_phase_idx" ON "pipeline_failures" USING btree ("startup_id" uuid_ops,"phase" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "agentmail_config_inbox_id_idx" ON "agentmail_configs" USING btree ("inbox_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "agentmail_config_user_id_idx" ON "agentmail_configs" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "pipeline_feedback_consumed_idx" ON "pipeline_feedback" USING btree ("consumed_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "pipeline_feedback_startup_agent_idx" ON "pipeline_feedback" USING btree ("startup_id" uuid_ops,"agent_key" uuid_ops);--> statement-breakpoint
CREATE INDEX "pipeline_feedback_startup_phase_idx" ON "pipeline_feedback" USING btree ("startup_id" uuid_ops,"phase" uuid_ops);--> statement-breakpoint
CREATE INDEX "clara_conv_investor_email_idx" ON "clara_conversations" USING btree ("investor_email" text_ops);--> statement-breakpoint
CREATE INDEX "clara_conv_startup_id_idx" ON "clara_conversations" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "clara_conv_status_idx" ON "clara_conversations" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "clara_conv_thread_id_idx" ON "clara_conversations" USING btree ("thread_id" text_ops);--> statement-breakpoint
CREATE INDEX "clara_msg_conversation_id_idx" ON "clara_messages" USING btree ("conversation_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "clara_msg_direction_idx" ON "clara_messages" USING btree ("direction" enum_ops);--> statement-breakpoint
CREATE INDEX "clara_msg_message_id_idx" ON "clara_messages" USING btree ("message_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_definition_key_idx" ON "ai_prompt_definitions" USING btree ("key" text_ops);--> statement-breakpoint
CREATE INDEX "ai_prompt_revision_def_stage_status_idx" ON "ai_prompt_revisions" USING btree ("definition_id" uuid_ops,"stage" enum_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "ai_prompt_revision_definition_idx" ON "ai_prompt_revisions" USING btree ("definition_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ai_prompt_revision_stage_idx" ON "ai_prompt_revisions" USING btree ("stage" enum_ops);--> statement-breakpoint
CREATE INDEX "ai_prompt_revision_status_idx" ON "ai_prompt_revisions" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "waitlist_entries_created_idx" ON "waitlist_entries" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "early_access_invites_email_idx" ON "early_access_invites" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "early_access_invites_status_idx" ON "early_access_invites" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_created_idx" ON "pipeline_agent_runs" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_pipeline_idx" ON "pipeline_agent_runs" USING btree ("pipeline_run_id" text_ops);--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_startup_idx" ON "pipeline_agent_runs" USING btree ("startup_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_startup_phase_agent_idx" ON "pipeline_agent_runs" USING btree ("startup_id" text_ops,"phase" enum_ops,"agent_key" uuid_ops);--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_startup_run_kind_phase_step_started_idx" ON "pipeline_agent_runs" USING btree ("startup_id" text_ops,"pipeline_run_id" timestamp_ops,"trace_kind" text_ops,"phase" text_ops,"step_key" text_ops,"started_at" text_ops);--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_def_stage_status_idx" ON "ai_context_config_revisions" USING btree ("definition_id" uuid_ops,"stage" enum_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_definition_idx" ON "ai_context_config_revisions" USING btree ("definition_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_stage_idx" ON "ai_context_config_revisions" USING btree ("stage" enum_ops);--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_status_idx" ON "ai_context_config_revisions" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_def_stage_status_idx" ON "ai_model_config_revisions" USING btree ("definition_id" uuid_ops,"stage" enum_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_definition_idx" ON "ai_model_config_revisions" USING btree ("definition_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_stage_idx" ON "ai_model_config_revisions" USING btree ("stage" enum_ops);--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_status_idx" ON "ai_model_config_revisions" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "pipeline_flow_config_created_at_idx" ON "pipeline_flow_configs" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "pipeline_flow_config_status_idx" ON "pipeline_flow_configs" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "ai_agent_schema_rev_def_stage_status_idx" ON "ai_agent_schema_revisions" USING btree ("definition_id" uuid_ops,"stage" uuid_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "ai_agent_schema_rev_definition_idx" ON "ai_agent_schema_revisions" USING btree ("definition_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "ai_agent_config_orchestrator_idx" ON "ai_agent_configs" USING btree ("flow_id" text_ops,"orchestrator_node_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ai_agent_config_unique_agent_idx" ON "ai_agent_configs" USING btree ("flow_id" text_ops,"orchestrator_node_id" text_ops,"agent_key" text_ops);--> statement-breakpoint
CREATE INDEX "pipeline_template_flow_status_idx" ON "pipeline_templates" USING btree ("flow_id" enum_ops,"status" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_template_flow_version_unique" ON "pipeline_templates" USING btree ("flow_id" text_ops,"version" text_ops);
