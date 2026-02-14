CREATE TYPE "public"."early_access_invite_status" AS ENUM('pending', 'redeemed', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "investor_inbox_submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"inbox_id" text NOT NULL,
	"subject" text,
	"body_text" text,
	"from_email" text NOT NULL,
	"attachment_keys" jsonb DEFAULT '[]'::jsonb,
	"suggested_company_name" text,
	"startup_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "early_access_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "early_access_invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"redeemed_at" timestamp,
	"redeemed_by_user_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "early_access_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company_name" text NOT NULL,
	"role" text NOT NULL,
	"website" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "investor_inbox_submission" ADD CONSTRAINT "investor_inbox_submission_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_inbox_submission" ADD CONSTRAINT "investor_inbox_submission_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_access_invites" ADD CONSTRAINT "early_access_invites_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_access_invites" ADD CONSTRAINT "early_access_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "early_access_invites_email_idx" ON "early_access_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "early_access_invites_status_idx" ON "early_access_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "waitlist_entries_created_idx" ON "waitlist_entries" USING btree ("created_at");