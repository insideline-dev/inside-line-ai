CREATE TYPE "public"."pipeline_template_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
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
ALTER TABLE "pipeline_templates" ADD CONSTRAINT "pipeline_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_templates" ADD CONSTRAINT "pipeline_templates_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_template_flow_version_unique" ON "pipeline_templates" USING btree ("flow_id","version");--> statement-breakpoint
CREATE INDEX "pipeline_template_flow_status_idx" ON "pipeline_templates" USING btree ("flow_id","status");