CREATE TYPE "public"."pipeline_trace_kind" AS ENUM('ai_agent', 'phase_step');--> statement-breakpoint
CREATE TYPE "public"."pipeline_flow_config_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
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
ALTER TABLE "pipeline_agent_runs" ADD COLUMN "trace_kind" "pipeline_trace_kind" DEFAULT 'ai_agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_agent_runs" ADD COLUMN "step_key" text;--> statement-breakpoint
ALTER TABLE "pipeline_agent_runs" ADD COLUMN "input_json" jsonb;--> statement-breakpoint
ALTER TABLE "pipeline_agent_runs" ADD COLUMN "meta" jsonb;--> statement-breakpoint
ALTER TABLE "pipeline_flow_configs" ADD CONSTRAINT "pipeline_flow_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_flow_configs" ADD CONSTRAINT "pipeline_flow_configs_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_flow_config_status_idx" ON "pipeline_flow_configs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pipeline_flow_config_created_at_idx" ON "pipeline_flow_configs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pipeline_agent_runs_startup_run_kind_phase_step_started_idx" ON "pipeline_agent_runs" USING btree ("startup_id","pipeline_run_id","trace_kind","phase","step_key","started_at");