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
ALTER TABLE "ai_agent_schema_revisions" ADD CONSTRAINT "ai_agent_schema_revisions_definition_id_ai_prompt_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."ai_prompt_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_schema_revisions" ADD CONSTRAINT "ai_agent_schema_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agent_schema_revisions" ADD CONSTRAINT "ai_agent_schema_revisions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_agent_schema_rev_definition_idx" ON "ai_agent_schema_revisions" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "ai_agent_schema_rev_def_stage_status_idx" ON "ai_agent_schema_revisions" USING btree ("definition_id","stage","status");