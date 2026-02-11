CREATE TYPE "public"."match_status" AS ENUM('new', 'reviewing', 'engaged', 'closed', 'passed');--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "status" "match_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "status_changed_at" timestamp;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "pass_reason" text;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "pass_notes" text;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "investment_amount" double precision;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "investment_currency" text DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "investment_date" timestamp;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "investment_notes" text;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "meeting_requested" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "meeting_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "thesis_fit_score" integer;--> statement-breakpoint
ALTER TABLE "startup_match" ADD COLUMN "fit_rationale" text;--> statement-breakpoint
CREATE INDEX "match_investor_status_idx" ON "startup_match" USING btree ("investor_id","status");