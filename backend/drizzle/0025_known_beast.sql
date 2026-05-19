ALTER TYPE "public"."match_status" ADD VALUE IF NOT EXISTS 'bookmarked';--> statement-breakpoint
CREATE TABLE "investor_dealbreaker_rule_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_user_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"rules" text[] NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dd_open_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"seed_source" text DEFAULT 'screening_seed' NOT NULL,
	"screening_source" text,
	"status" text DEFAULT 'open' NOT NULL,
	"owner_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "startup_matches" ADD COLUMN IF NOT EXISTS "status_before_bookmark" text;--> statement-breakpoint
UPDATE "startup_matches" SET status = 'bookmarked', status_before_bookmark = status WHERE is_saved = true AND status::text != 'bookmarked';--> statement-breakpoint
ALTER TABLE "investor_dealbreaker_rule_version" ADD CONSTRAINT "investor_dealbreaker_rule_version_investor_user_id_users_id_fk" FOREIGN KEY ("investor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_dealbreaker_rule_version" ADD CONSTRAINT "investor_dealbreaker_rule_version_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dd_open_question" ADD CONSTRAINT "dd_open_question_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dd_open_question" ADD CONSTRAINT "dd_open_question_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investor_dealbreaker_version_user_num_idx" ON "investor_dealbreaker_rule_version" USING btree ("investor_user_id","version_number");--> statement-breakpoint
CREATE INDEX "investor_dealbreaker_version_user_created_idx" ON "investor_dealbreaker_rule_version" USING btree ("investor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "dd_open_question_startup_key_idx" ON "dd_open_question" USING btree ("startup_id","key");--> statement-breakpoint
CREATE INDEX "dd_open_question_startup_status_idx" ON "dd_open_question" USING btree ("startup_id","status");--> statement-breakpoint
CREATE INDEX "startup_source_path_idx" ON "startups" USING btree ("source_path");