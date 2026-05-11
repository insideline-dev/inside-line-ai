CREATE TABLE "screening_dd_lens_delta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"pipeline_run_id" text,
	"investor_id" uuid,
	"lens_key" text NOT NULL,
	"screening_score" integer NOT NULL,
	"dd_score" integer NOT NULL,
	"delta" integer NOT NULL,
	"screening_lens_version" text,
	"dd_agent_version" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screening_dd_lens_delta" ADD CONSTRAINT "screening_dd_lens_delta_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_dd_lens_delta" ADD CONSTRAINT "screening_dd_lens_delta_pipeline_run_id_pipeline_runs_pipeline_run_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("pipeline_run_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_dd_lens_delta" ADD CONSTRAINT "screening_dd_lens_delta_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "screening_dd_lens_delta_unique_idx" ON "screening_dd_lens_delta" USING btree ("startup_id","pipeline_run_id","lens_key");--> statement-breakpoint
CREATE INDEX "screening_dd_lens_delta_investor_idx" ON "screening_dd_lens_delta" USING btree ("investor_id","computed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "screening_dd_lens_delta_startup_idx" ON "screening_dd_lens_delta" USING btree ("startup_id","computed_at" DESC NULLS LAST);