CREATE TYPE "public"."ai_prompt_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ai_prompt_surface" AS ENUM('pipeline', 'clara');--> statement-breakpoint
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
ALTER TABLE "startups" ADD COLUMN "geo_country_code" text;--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "geo_level_1" text;--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "geo_level_2" text;--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "geo_level_3" text;--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "geo_path" text[];--> statement-breakpoint
ALTER TABLE "investor_theses" ADD COLUMN "geographic_focus_nodes" text[];--> statement-breakpoint
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_revisions" ADD CONSTRAINT "ai_prompt_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_prompt_definition_key_idx" ON "ai_prompt_definitions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "ai_prompt_revision_definition_idx" ON "ai_prompt_revisions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "ai_prompt_revision_status_idx" ON "ai_prompt_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_prompt_revision_stage_idx" ON "ai_prompt_revisions" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "ai_prompt_revision_def_stage_status_idx" ON "ai_prompt_revisions" USING btree ("definition_id","stage","status");--> statement-breakpoint
CREATE INDEX "startup_geo_level1_idx" ON "startups" USING btree ("geo_level_1");--> statement-breakpoint
CREATE INDEX "startup_geo_level2_idx" ON "startups" USING btree ("geo_level_2");--> statement-breakpoint
CREATE INDEX "startup_geo_level3_idx" ON "startups" USING btree ("geo_level_3");