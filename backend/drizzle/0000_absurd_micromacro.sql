CREATE TYPE "public"."user_role" AS ENUM('founder', 'investor', 'admin', 'scout');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('info', 'success', 'warning', 'error', 'match');--> statement-breakpoint
CREATE TYPE "public"."raise_type" AS ENUM('safe', 'convertible_note', 'equity', 'safe_equity', 'undecided');--> statement-breakpoint
CREATE TYPE "public"."startup_stage" AS ENUM('pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'series_e', 'series_f_plus');--> statement-breakpoint
CREATE TYPE "public"."startup_status" AS ENUM('draft', 'submitted', 'analyzing', 'pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."trl" AS ENUM('idea', 'mvp', 'scaling', 'mature');--> statement-breakpoint
CREATE TYPE "public"."valuation_type" AS ENUM('pre_money', 'post_money');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."portal_submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."scout_application_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."admin_review_decision" AS ENUM('approved', 'rejected', 'needs_revision');--> statement-breakpoint
CREATE TYPE "public"."analysis_job_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."analysis_job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."analysis_job_type" AS ENUM('scoring', 'pdf', 'matching', 'market_analysis');--> statement-breakpoint
CREATE TYPE "public"."webhook_source" AS ENUM('agentmail', 'twilio');--> statement-breakpoint
CREATE TYPE "public"."agent_category" AS ENUM('orchestrator', 'analysis', 'synthesis');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('email', 'whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'waiting_response', 'resolved', 'archived');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."message_intent" AS ENUM('question', 'submission', 'follow_up', 'greeting', 'unknown');--> statement-breakpoint
CREATE TABLE "account" (
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
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "refresh_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"family" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "refresh_token" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'founder' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"type" text DEFAULT 'magic_link' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" text,
	"title" text,
	"linkedin_url" text,
	"bio" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "asset" (
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
	CONSTRAINT "asset_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "asset" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification" (
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
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "startup" (
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
	CONSTRAINT "startup_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "startup" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "startup_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "startup_draft_startup_id_unique" UNIQUE("startup_id")
);
--> statement-breakpoint
ALTER TABLE "startup_draft" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "investor_profile" (
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
	CONSTRAINT "investor_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "investor_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "investor_scoring_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"stage" "startup_stage" NOT NULL,
	"use_custom_weights" boolean DEFAULT false NOT NULL,
	"custom_weights" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investor_scoring_preference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "investor_thesis" (
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
	CONSTRAINT "investor_thesis_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "investor_thesis" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scoring_weight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"market_weight" integer DEFAULT 20 NOT NULL,
	"team_weight" integer DEFAULT 20 NOT NULL,
	"product_weight" integer DEFAULT 20 NOT NULL,
	"traction_weight" integer DEFAULT 20 NOT NULL,
	"financials_weight" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_weight_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "weights_sum_100" CHECK ("scoring_weight"."market_weight" + "scoring_weight"."team_weight" + "scoring_weight"."product_weight" + "scoring_weight"."traction_weight" + "scoring_weight"."financials_weight" = 100)
);
--> statement-breakpoint
ALTER TABLE "scoring_weight" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stage_scoring_weight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage" "startup_stage" NOT NULL,
	"weights" jsonb NOT NULL,
	"rationale" jsonb NOT NULL,
	"overall_rationale" text,
	"last_modified_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stage_scoring_weight_stage_unique" UNIQUE("stage")
);
--> statement-breakpoint
ALTER TABLE "stage_scoring_weight" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "startup_match" (
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "startup_match" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_invite" (
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
	CONSTRAINT "team_invite_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
ALTER TABLE "team_invite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_thesis_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "team_role" NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "portal" (
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
	CONSTRAINT "portal_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "portal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "portal_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"status" "portal_submission_status" DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_submission" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scout_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"bio" text,
	"linkedin_url" text,
	"portfolio" text[],
	"status" "scout_application_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by" uuid,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_application" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scout_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scout_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"commission_rate" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scout_submission" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "admin_review" (
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
ALTER TABLE "admin_review" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "analysis_job" (
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
ALTER TABLE "analysis_job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "startup_evaluation" (
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
	CONSTRAINT "startup_evaluation_startup_id_unique" UNIQUE("startup_id")
);
--> statement-breakpoint
ALTER TABLE "startup_evaluation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_thread" (
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
ALTER TABLE "email_thread" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "integration_webhook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "webhook_source" NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_webhook" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "linkedin_profile_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"linkedin_url" text NOT NULL,
	"linkedin_identifier" text NOT NULL,
	"profile_data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "linkedin_profile_cache_linkedin_url_unique" UNIQUE("linkedin_url")
);
--> statement-breakpoint
ALTER TABLE "linkedin_profile_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_conversation" (
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
ALTER TABLE "agent_conversation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_inbox" (
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
ALTER TABLE "agent_inbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_message" (
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
ALTER TABLE "agent_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agent_prompt" (
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
	CONSTRAINT "agent_prompt_agent_key_unique" UNIQUE("agent_key")
);
--> statement-breakpoint
ALTER TABLE "agent_prompt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attachment_download" (
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
ALTER TABLE "attachment_download" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup" ADD CONSTRAINT "startup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup" ADD CONSTRAINT "startup_scout_id_user_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_draft" ADD CONSTRAINT "startup_draft_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_draft" ADD CONSTRAINT "startup_draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_profile" ADD CONSTRAINT "investor_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_scoring_preference" ADD CONSTRAINT "investor_scoring_preference_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_thesis" ADD CONSTRAINT "investor_thesis_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_weight" ADD CONSTRAINT "scoring_weight_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_scoring_weight" ADD CONSTRAINT "stage_scoring_weight_last_modified_by_user_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_match" ADD CONSTRAINT "startup_match_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_match" ADD CONSTRAINT "startup_match_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invite" ADD CONSTRAINT "team_invite_investor_thesis_id_investor_thesis_id_fk" FOREIGN KEY ("investor_thesis_id") REFERENCES "public"."investor_thesis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invite" ADD CONSTRAINT "team_invite_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invite" ADD CONSTRAINT "team_invite_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_investor_thesis_id_investor_thesis_id_fk" FOREIGN KEY ("investor_thesis_id") REFERENCES "public"."investor_thesis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal" ADD CONSTRAINT "portal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_submission" ADD CONSTRAINT "portal_submission_portal_id_portal_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_submission" ADD CONSTRAINT "portal_submission_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_application" ADD CONSTRAINT "scout_application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_application" ADD CONSTRAINT "scout_application_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_application" ADD CONSTRAINT "scout_application_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_submission" ADD CONSTRAINT "scout_submission_scout_id_user_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_submission" ADD CONSTRAINT "scout_submission_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_submission" ADD CONSTRAINT "scout_submission_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_review" ADD CONSTRAINT "admin_review_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_review" ADD CONSTRAINT "admin_review_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_job" ADD CONSTRAINT "analysis_job_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_evaluation" ADD CONSTRAINT "startup_evaluation_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread" ADD CONSTRAINT "email_thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linkedin_profile_cache" ADD CONSTRAINT "linkedin_profile_cache_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_investor_profile_id_investor_profile_id_fk" FOREIGN KEY ("investor_profile_id") REFERENCES "public"."investor_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_current_startup_id_startup_id_fk" FOREIGN KEY ("current_startup_id") REFERENCES "public"."startup"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_conversation_id_agent_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_prompt" ADD CONSTRAINT "agent_prompt_last_modified_by_user_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_accountId_idx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_userId_idx" ON "refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_token_family_idx" ON "refresh_token" USING btree ("family");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "asset_user_idx" ON "asset" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_project_idx" ON "asset" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "asset_type_idx" ON "asset" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notification_user_read_created_idx" ON "notification" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "startup_userId_status_idx" ON "startup" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "startup_status_created_idx" ON "startup" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "startup_industry_idx" ON "startup" USING btree ("industry");--> statement-breakpoint
CREATE INDEX "startup_stage_idx" ON "startup" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "startup_location_idx" ON "startup" USING btree ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "startup_slug_idx" ON "startup" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "startup_draft_startupId_updated_idx" ON "startup_draft" USING btree ("startup_id","updated_at");--> statement-breakpoint
CREATE INDEX "startup_draft_userId_idx" ON "startup_draft" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investor_profile_user_idx" ON "investor_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investor_scoring_preference_investor_stage_idx" ON "investor_scoring_preference" USING btree ("investor_id","stage");--> statement-breakpoint
CREATE INDEX "investor_thesis_user_idx" ON "investor_thesis" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scoring_weight_user_idx" ON "scoring_weight" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stage_scoring_weight_stage_idx" ON "stage_scoring_weight" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "match_investor_score_idx" ON "startup_match" USING btree ("investor_id","overall_score");--> statement-breakpoint
CREATE INDEX "match_startup_idx" ON "startup_match" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "match_investor_saved_idx" ON "startup_match" USING btree ("investor_id","is_saved");--> statement-breakpoint
CREATE INDEX "team_invite_thesis_idx" ON "team_invite" USING btree ("investor_thesis_id");--> statement-breakpoint
CREATE INDEX "team_invite_code_idx" ON "team_invite" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "team_invite_email_idx" ON "team_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "team_member_thesis_idx" ON "team_member" USING btree ("investor_thesis_id");--> statement-breakpoint
CREATE INDEX "team_member_user_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_slug_idx" ON "portal" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "portal_user_idx" ON "portal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portal_submission_portal_submitted_idx" ON "portal_submission" USING btree ("portal_id","submitted_at");--> statement-breakpoint
CREATE INDEX "portal_submission_startup_idx" ON "portal_submission" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "scout_application_user_idx" ON "scout_application" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scout_application_investor_status_idx" ON "scout_application" USING btree ("investor_id","status");--> statement-breakpoint
CREATE INDEX "scout_submission_scout_idx" ON "scout_submission" USING btree ("scout_id");--> statement-breakpoint
CREATE INDEX "scout_submission_investor_created_idx" ON "scout_submission" USING btree ("investor_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_review_startup_idx" ON "admin_review" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "admin_review_reviewer_idx" ON "admin_review" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "analysis_job_startup_type_idx" ON "analysis_job" USING btree ("startup_id","job_type");--> statement-breakpoint
CREATE INDEX "analysis_job_status_priority_created_idx" ON "analysis_job" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "startup_evaluation_startup_idx" ON "startup_evaluation" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "email_thread_user_last_message_idx" ON "email_thread" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "webhook_source_processed_created_idx" ON "integration_webhook" USING btree ("source","processed","created_at");--> statement-breakpoint
CREATE INDEX "linkedin_cache_url_expires_idx" ON "linkedin_profile_cache" USING btree ("linkedin_url","expires_at");--> statement-breakpoint
CREATE INDEX "linkedin_cache_user_id_idx" ON "linkedin_profile_cache" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_conversation_investor_idx" ON "agent_conversation" USING btree ("investor_profile_id");--> statement-breakpoint
CREATE INDEX "agent_conversation_email_idx" ON "agent_conversation" USING btree ("sender_email");--> statement-breakpoint
CREATE INDEX "agent_conversation_status_idx" ON "agent_conversation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_message_conversation_idx" ON "agent_message" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_message_created_idx" ON "agent_message" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_prompt_key_idx" ON "agent_prompt" USING btree ("agent_key");--> statement-breakpoint
CREATE INDEX "attachment_download_inbox_message_idx" ON "attachment_download" USING btree ("inbox_id","message_id");--> statement-breakpoint
CREATE POLICY "select_own" ON "account" AS PERMISSIVE FOR SELECT TO "app_user" USING ("account"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "account" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("account"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "account" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("account"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("account"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "account" AS PERMISSIVE FOR DELETE TO "app_user" USING ("account"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "refresh_token" AS PERMISSIVE FOR SELECT TO "app_user" USING ("refresh_token"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "refresh_token" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("refresh_token"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "refresh_token" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("refresh_token"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("refresh_token"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "refresh_token" AS PERMISSIVE FOR DELETE TO "app_user" USING ("refresh_token"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "user" AS PERMISSIVE FOR SELECT TO "app_user" USING ("user"."id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "user" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("user"."id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "user" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("user"."id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("user"."id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "user" AS PERMISSIVE FOR DELETE TO "app_user" USING ("user"."id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "user_profile" AS PERMISSIVE FOR SELECT TO "app_user" USING ("user_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "user_profile" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("user_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "user_profile" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("user_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("user_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "user_profile" AS PERMISSIVE FOR DELETE TO "app_user" USING ("user_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "asset" AS PERMISSIVE FOR SELECT TO "app_user" USING ("asset"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "asset" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("asset"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "asset" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("asset"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("asset"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "asset" AS PERMISSIVE FOR DELETE TO "app_user" USING ("asset"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "notification" AS PERMISSIVE FOR SELECT TO "app_user" USING ("notification"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "notification" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("notification"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "notification" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("notification"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("notification"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "notification" AS PERMISSIVE FOR DELETE TO "app_user" USING ("notification"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "startup" AS PERMISSIVE FOR SELECT TO "app_user" USING ("startup"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "startup" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("startup"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "startup" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("startup"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("startup"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "startup" AS PERMISSIVE FOR DELETE TO "app_user" USING ("startup"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "startup_investor_view" ON "startup" AS PERMISSIVE FOR SELECT TO "app_user" USING ("startup"."status" = 'approved');--> statement-breakpoint
CREATE POLICY "select_own" ON "startup_draft" AS PERMISSIVE FOR SELECT TO "app_user" USING ("startup_draft"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "startup_draft" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("startup_draft"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "startup_draft" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("startup_draft"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("startup_draft"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "startup_draft" AS PERMISSIVE FOR DELETE TO "app_user" USING ("startup_draft"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "investor_profile" AS PERMISSIVE FOR SELECT TO "app_user" USING ("investor_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "investor_profile" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("investor_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "investor_profile" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("investor_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("investor_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "investor_profile" AS PERMISSIVE FOR DELETE TO "app_user" USING ("investor_profile"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "investor_scoring_preference" AS PERMISSIVE FOR SELECT TO "app_user" USING ("investor_scoring_preference"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "investor_scoring_preference" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("investor_scoring_preference"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "investor_scoring_preference" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("investor_scoring_preference"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("investor_scoring_preference"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "investor_scoring_preference" AS PERMISSIVE FOR DELETE TO "app_user" USING ("investor_scoring_preference"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "investor_thesis" AS PERMISSIVE FOR SELECT TO "app_user" USING ("investor_thesis"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "investor_thesis" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("investor_thesis"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "investor_thesis" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("investor_thesis"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("investor_thesis"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "investor_thesis" AS PERMISSIVE FOR DELETE TO "app_user" USING ("investor_thesis"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "scoring_weight" AS PERMISSIVE FOR SELECT TO "app_user" USING ("scoring_weight"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "scoring_weight" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("scoring_weight"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "scoring_weight" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("scoring_weight"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("scoring_weight"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "scoring_weight" AS PERMISSIVE FOR DELETE TO "app_user" USING ("scoring_weight"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "stage_scoring_weight_select" ON "stage_scoring_weight" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "stage_scoring_weight_admin_insert" ON "stage_scoring_weight" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "stage_scoring_weight_admin_update" ON "stage_scoring_weight" AS PERMISSIVE FOR UPDATE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "startup_match" AS PERMISSIVE FOR SELECT TO "app_user" USING ("startup_match"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "startup_match" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("startup_match"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "startup_match" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("startup_match"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("startup_match"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "startup_match" AS PERMISSIVE FOR DELETE TO "app_user" USING ("startup_match"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "team_invite" AS PERMISSIVE FOR SELECT TO "app_user" USING ("team_invite"."invited_by_user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "team_invite" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("team_invite"."invited_by_user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "team_invite" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("team_invite"."invited_by_user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("team_invite"."invited_by_user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "team_invite" AS PERMISSIVE FOR DELETE TO "app_user" USING ("team_invite"."invited_by_user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "team_member" AS PERMISSIVE FOR SELECT TO "app_user" USING ("team_member"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "team_member" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("team_member"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "team_member" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("team_member"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("team_member"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "team_member" AS PERMISSIVE FOR DELETE TO "app_user" USING ("team_member"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "portal" AS PERMISSIVE FOR SELECT TO "app_user" USING ("portal"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "portal" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("portal"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "portal" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("portal"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("portal"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "portal" AS PERMISSIVE FOR DELETE TO "app_user" USING ("portal"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "portal_public_view" ON "portal" AS PERMISSIVE FOR SELECT TO "app_user" USING ("portal"."is_active" = true);--> statement-breakpoint
CREATE POLICY "submission_portal_owner_select" ON "portal_submission" AS PERMISSIVE FOR SELECT TO "app_user" USING (EXISTS (
        SELECT 1 FROM portal
        WHERE portal.id = "portal_submission"."portal_id"
        AND (portal.user_id = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin')
      ));--> statement-breakpoint
CREATE POLICY "submission_portal_owner_update" ON "portal_submission" AS PERMISSIVE FOR UPDATE TO "app_user" USING (EXISTS (
        SELECT 1 FROM portal
        WHERE portal.id = "portal_submission"."portal_id"
        AND (portal.user_id = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin')
      ));--> statement-breakpoint
CREATE POLICY "submission_startup_insert" ON "portal_submission" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (EXISTS (
        SELECT 1 FROM startup
        WHERE startup.id = "portal_submission"."startup_id"
        AND (startup.user_id = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin')
      ));--> statement-breakpoint
CREATE POLICY "submission_startup_owner_select" ON "portal_submission" AS PERMISSIVE FOR SELECT TO "app_user" USING (EXISTS (
        SELECT 1 FROM startup
        WHERE startup.id = "portal_submission"."startup_id"
        AND (startup.user_id = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin')
      ));--> statement-breakpoint
CREATE POLICY "scout_app_owner_select" ON "scout_application" AS PERMISSIVE FOR SELECT TO "app_user" USING ("scout_application"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "scout_app_owner_insert" ON "scout_application" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("scout_application"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "scout_app_owner_update" ON "scout_application" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("scout_application"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("scout_application"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "scout_app_investor_select" ON "scout_application" AS PERMISSIVE FOR SELECT TO "app_user" USING ("scout_application"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "scout_app_investor_update" ON "scout_application" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("scout_application"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "scout_sub_owner_select" ON "scout_submission" AS PERMISSIVE FOR SELECT TO "app_user" USING ("scout_submission"."scout_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "scout_sub_owner_insert" ON "scout_submission" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("scout_submission"."scout_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "scout_sub_owner_update" ON "scout_submission" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("scout_submission"."scout_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "scout_sub_investor_select" ON "scout_submission" AS PERMISSIVE FOR SELECT TO "app_user" USING ("scout_submission"."investor_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "admin_review_admin_select" ON "admin_review" AS PERMISSIVE FOR SELECT TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "admin_review_admin_insert" ON "admin_review" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "admin_review_admin_update" ON "admin_review" AS PERMISSIVE FOR UPDATE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "analysis_job_startup_owner_select" ON "analysis_job" AS PERMISSIVE FOR SELECT TO "app_user" USING (EXISTS (
        SELECT 1 FROM startup
        WHERE startup.id = "analysis_job"."startup_id"
        AND (startup.user_id = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin')
      ));--> statement-breakpoint
CREATE POLICY "analysis_job_admin_insert" ON "analysis_job" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "analysis_job_admin_update" ON "analysis_job" AS PERMISSIVE FOR UPDATE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "analysis_job_admin_delete" ON "analysis_job" AS PERMISSIVE FOR DELETE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "startup_evaluation_owner_select" ON "startup_evaluation" AS PERMISSIVE FOR SELECT TO "app_user" USING (EXISTS (
        SELECT 1 FROM startup
        WHERE startup.id = "startup_evaluation"."startup_id"
        AND (startup.user_id = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin')
      ));--> statement-breakpoint
CREATE POLICY "startup_evaluation_admin_insert" ON "startup_evaluation" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "startup_evaluation_admin_update" ON "startup_evaluation" AS PERMISSIVE FOR UPDATE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "email_thread" AS PERMISSIVE FOR SELECT TO "app_user" USING ("email_thread"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "email_thread" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("email_thread"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "email_thread" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("email_thread"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("email_thread"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "email_thread" AS PERMISSIVE FOR DELETE TO "app_user" USING ("email_thread"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "webhook_admin_select" ON "integration_webhook" AS PERMISSIVE FOR SELECT TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "webhook_admin_insert" ON "integration_webhook" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "webhook_admin_update" ON "integration_webhook" AS PERMISSIVE FOR UPDATE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "webhook_admin_delete" ON "integration_webhook" AS PERMISSIVE FOR DELETE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "select_own" ON "linkedin_profile_cache" AS PERMISSIVE FOR SELECT TO "app_user" USING ("linkedin_profile_cache"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "insert_own" ON "linkedin_profile_cache" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ("linkedin_profile_cache"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "update_own" ON "linkedin_profile_cache" AS PERMISSIVE FOR UPDATE TO "app_user" USING ("linkedin_profile_cache"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin') WITH CHECK ("linkedin_profile_cache"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "delete_own" ON "linkedin_profile_cache" AS PERMISSIVE FOR DELETE TO "app_user" USING ("linkedin_profile_cache"."user_id" = current_setting('app.current_user_id', true)::uuid OR current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_conversation_admin_select" ON "agent_conversation" AS PERMISSIVE FOR SELECT TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_conversation_admin_insert" ON "agent_conversation" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_conversation_admin_update" ON "agent_conversation" AS PERMISSIVE FOR UPDATE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_inbox_admin_select" ON "agent_inbox" AS PERMISSIVE FOR SELECT TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_inbox_admin_insert" ON "agent_inbox" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_inbox_admin_update" ON "agent_inbox" AS PERMISSIVE FOR UPDATE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_message_admin_select" ON "agent_message" AS PERMISSIVE FOR SELECT TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_message_admin_insert" ON "agent_message" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_prompt_select" ON "agent_prompt" AS PERMISSIVE FOR SELECT TO "app_user" USING (true);--> statement-breakpoint
CREATE POLICY "agent_prompt_admin_insert" ON "agent_prompt" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_prompt_admin_update" ON "agent_prompt" AS PERMISSIVE FOR UPDATE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "agent_prompt_admin_delete" ON "agent_prompt" AS PERMISSIVE FOR DELETE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "attachment_download_admin_select" ON "attachment_download" AS PERMISSIVE FOR SELECT TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "attachment_download_admin_insert" ON "attachment_download" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (current_setting('app.current_user_role', true) = 'admin');--> statement-breakpoint
CREATE POLICY "attachment_download_admin_update" ON "attachment_download" AS PERMISSIVE FOR UPDATE TO "app_user" USING (current_setting('app.current_user_role', true) = 'admin');