CREATE TYPE "public"."portal_link_integrity" AS ENUM('strict', 'standard', 'lenient');--> statement-breakpoint
CREATE TYPE "public"."portal_submission_audit_outcome" AS ENUM('accepted', 'duplicate_within_window', 'rate_limited', 'merged');--> statement-breakpoint
CREATE TABLE "portal_submission_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_id" uuid NOT NULL,
	"founder_email" text,
	"founder_email_hash" text NOT NULL,
	"ip_address" text,
	"submitted_company_name" text,
	"normalized_company_name" text,
	"outcome" "portal_submission_audit_outcome" NOT NULL,
	"startup_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portals" ADD COLUMN "link_integrity" "portal_link_integrity" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_submission_audit" ADD CONSTRAINT "portal_submission_audit_portal_id_portals_id_fk" FOREIGN KEY ("portal_id") REFERENCES "public"."portals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_submission_audit_portal_email_created_idx" ON "portal_submission_audit" USING btree ("portal_id","founder_email_hash","created_at");--> statement-breakpoint
CREATE INDEX "portal_submission_audit_portal_normalized_created_idx" ON "portal_submission_audit" USING btree ("portal_id","normalized_company_name","created_at");--> statement-breakpoint
CREATE INDEX "portal_submission_audit_ip_created_idx" ON "portal_submission_audit" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "portal_submission_audit_portal_created_idx" ON "portal_submission_audit" USING btree ("portal_id","created_at");