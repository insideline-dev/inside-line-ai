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
CREATE TABLE "ai_model_overrides" (
	"purpose" varchar(50) PRIMARY KEY NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_flow_configs" ADD CONSTRAINT "pipeline_flow_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_flow_configs" ADD CONSTRAINT "pipeline_flow_configs_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_overrides" ADD CONSTRAINT "ai_model_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_flow_config_status_idx" ON "pipeline_flow_configs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pipeline_flow_config_created_at_idx" ON "pipeline_flow_configs" USING btree ("created_at");