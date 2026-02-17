CREATE TYPE "public"."ai_prompt_search_mode" AS ENUM('off', 'provider_grounded_search');--> statement-breakpoint
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
ALTER TABLE "ai_context_config_revisions" ADD CONSTRAINT "ai_context_config_revisions_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_config_revisions" ADD CONSTRAINT "ai_context_config_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_context_config_revisions" ADD CONSTRAINT "ai_context_config_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_definition_idx" ON "ai_context_config_revisions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_status_idx" ON "ai_context_config_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_stage_idx" ON "ai_context_config_revisions" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "ai_context_config_revision_def_stage_status_idx" ON "ai_context_config_revisions" USING btree ("definition_id","stage","status");--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_definition_idx" ON "ai_model_config_revisions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_status_idx" ON "ai_model_config_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_stage_idx" ON "ai_model_config_revisions" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "ai_model_config_revision_def_stage_status_idx" ON "ai_model_config_revisions" USING btree ("definition_id","stage","status");