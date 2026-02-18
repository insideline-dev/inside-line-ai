CREATE TYPE "public"."pipeline_agent_run_status" AS ENUM('running', 'completed', 'failed', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."ai_prompt_search_mode" AS ENUM('off', 'provider_grounded_search');--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL
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
ALTER TABLE "pipeline_agent_runs" ADD CONSTRAINT "pipeline_agent_runs_pipeline_run_id_pipeline_runs_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_agent_runs" ADD CONSTRAINT "pipeline_agent_runs_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_config_revisions" ADD CONSTRAINT "ai_context_config_revisions_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_config_revisions" ADD CONSTRAINT "ai_context_config_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_config_revisions" ADD CONSTRAINT "ai_context_config_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_startup_idx" ON "pipeline_agent_runs" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_pipeline_idx" ON "pipeline_agent_runs" USING btree ("pipeline_run_id");--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_startup_phase_agent_idx" ON "pipeline_agent_runs" USING btree ("startup_id","phase","agent_key");--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_created_idx" ON "pipeline_agent_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_definition_idx" ON "ai_context_config_revisions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_status_idx" ON "ai_context_config_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_stage_idx" ON "ai_context_config_revisions" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_def_stage_status_idx" ON "ai_context_config_revisions" USING btree ("definition_id","stage","status");--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_definition_idx" ON "ai_model_config_revisions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_status_idx" ON "ai_model_config_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_stage_idx" ON "ai_model_config_revisions" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_def_stage_status_idx" ON "ai_model_config_revisions" USING btree ("definition_id","stage","status");