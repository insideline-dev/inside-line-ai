CREATE TABLE "screening_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"pipeline_run_id" text,
	"classification" text NOT NULL,
	"overall_score" integer NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lens_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screening_decision" ADD CONSTRAINT "screening_decision_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decision" ADD CONSTRAINT "screening_decision_pipeline_run_id_pipeline_runs_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "screening_decision_startup_created_idx" ON "screening_decision" USING btree ("startup_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "screening_decision_run_idx" ON "screening_decision" USING btree ("pipeline_run_id");