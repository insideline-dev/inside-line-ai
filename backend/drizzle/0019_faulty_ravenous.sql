CREATE TABLE "investor_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investor_event" ADD CONSTRAINT "investor_event_investor_user_id_users_id_fk" FOREIGN KEY ("investor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investor_event_user_created_idx" ON "investor_event" USING btree ("investor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "investor_event_type_created_idx" ON "investor_event" USING btree ("type","created_at" DESC NULLS LAST);