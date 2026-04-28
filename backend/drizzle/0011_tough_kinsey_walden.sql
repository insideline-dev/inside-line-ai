ALTER TYPE "public"."pipeline_phase" ADD VALUE 'screening' BEFORE 'evaluation';--> statement-breakpoint
CREATE TABLE "startup_lens_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"pipeline_run_id" text,
	"lens_key" text NOT NULL,
	"score" integer NOT NULL,
	"signal" text NOT NULL,
	"rationale" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_id" text NOT NULL,
	"prompt_key" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "startup_lens_result" ADD CONSTRAINT "startup_lens_result_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "startup_lens_result" ADD CONSTRAINT "startup_lens_result_pipeline_run_id_pipeline_runs_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "startup_lens_result_startup_lens_idx" ON "startup_lens_result" USING btree ("startup_id","lens_key");--> statement-breakpoint
CREATE INDEX "startup_lens_result_run_idx" ON "startup_lens_result" USING btree ("pipeline_run_id");