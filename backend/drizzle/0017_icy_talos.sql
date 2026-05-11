ALTER TABLE "startup_lens_result" ADD COLUMN "lens_version" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "startup_lens_result" ADD COLUMN "prompt_version" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "screening_decision" ADD COLUMN "lens_versions" jsonb DEFAULT '{}'::jsonb NOT NULL;