CREATE TYPE "public"."investor_interest_status" AS ENUM('interested', 'passed', 'meeting_scheduled');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scout_commission_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TABLE "data_room" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"category" text NOT NULL,
	"visible_to_investors" jsonb DEFAULT '[]'::jsonb,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"status" "investor_interest_status" DEFAULT 'interested' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"investor_id" uuid NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"duration" integer DEFAULT 30 NOT NULL,
	"location" text,
	"notes" text,
	"status" "meeting_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"content" text NOT NULL,
	"category" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investor_portfolio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"deal_size" integer,
	"deal_stage" text,
	"invested_at" timestamp NOT NULL,
	"exited_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_commission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scout_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"deal_size" integer NOT NULL,
	"commission_rate" integer NOT NULL,
	"commission_amount" integer NOT NULL,
	"status" "scout_commission_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scout_application" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "scout_application" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "scout_application" ADD COLUMN "experience" text;--> statement-breakpoint
ALTER TABLE "scout_application" ADD COLUMN "motivation" text;--> statement-breakpoint
ALTER TABLE "scout_application" ADD COLUMN "dealflow_sources" text;--> statement-breakpoint
ALTER TABLE "data_room" ADD CONSTRAINT "data_room_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_room" ADD CONSTRAINT "data_room_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_interest" ADD CONSTRAINT "investor_interest_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_interest" ADD CONSTRAINT "investor_interest_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_note" ADD CONSTRAINT "investor_note_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_note" ADD CONSTRAINT "investor_note_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_portfolio" ADD CONSTRAINT "investor_portfolio_investor_id_user_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_portfolio" ADD CONSTRAINT "investor_portfolio_startup_id_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_commission" ADD CONSTRAINT "scout_commission_scout_id_user_id_fk" FOREIGN KEY ("scout_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_commission" ADD CONSTRAINT "scout_commission_submission_id_scout_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."scout_submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_room_startup_idx" ON "data_room" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "data_room_category_idx" ON "data_room" USING btree ("category");--> statement-breakpoint
CREATE INDEX "investor_interest_investor_idx" ON "investor_interest" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_interest_startup_idx" ON "investor_interest" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "investor_interest_status_idx" ON "investor_interest" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meeting_startup_idx" ON "meeting" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "meeting_investor_idx" ON "meeting" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "meeting_status_idx" ON "meeting" USING btree ("status");--> statement-breakpoint
CREATE INDEX "investor_note_investor_idx" ON "investor_note" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_note_startup_idx" ON "investor_note" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "investor_note_investor_startup_idx" ON "investor_note" USING btree ("investor_id","startup_id");--> statement-breakpoint
CREATE INDEX "investor_portfolio_investor_idx" ON "investor_portfolio" USING btree ("investor_id");--> statement-breakpoint
CREATE INDEX "investor_portfolio_startup_idx" ON "investor_portfolio" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "scout_commission_scout_idx" ON "scout_commission" USING btree ("scout_id");--> statement-breakpoint
CREATE INDEX "scout_commission_submission_idx" ON "scout_commission" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "scout_commission_status_idx" ON "scout_commission" USING btree ("status");--> statement-breakpoint
ALTER TABLE "scout_application" DROP COLUMN "bio";