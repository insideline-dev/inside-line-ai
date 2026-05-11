CREATE TABLE "investor_calibration_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"summary" jsonb,
	"status" text NOT NULL,
	"last_job_id" text,
	"last_error" text,
	"computed_at" timestamp with time zone,
	"enqueued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investor_calibration_snapshots_investor_id_unique" UNIQUE("investor_id")
);
--> statement-breakpoint
ALTER TABLE "investor_calibration_snapshots" ADD CONSTRAINT "investor_calibration_snapshots_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investor_calibration_snapshots_status_idx" ON "investor_calibration_snapshots" USING btree ("status");