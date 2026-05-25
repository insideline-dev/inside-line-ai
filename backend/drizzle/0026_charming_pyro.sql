CREATE TABLE "screening_decision_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screening_decision_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"previous_classification" text NOT NULL,
	"new_classification" text NOT NULL,
	"reason" text NOT NULL,
	"reason_code" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investor_dealbreaker_rule_version" ADD COLUMN "structured_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "screening_decision_override" ADD CONSTRAINT "screening_decision_override_screening_decision_id_screening_decision_id_fk" FOREIGN KEY ("screening_decision_id") REFERENCES "public"."screening_decision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decision_override" ADD CONSTRAINT "screening_decision_override_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decision_override" ADD CONSTRAINT "screening_decision_override_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "screening_decision_override_decision_created_idx" ON "screening_decision_override" USING btree ("screening_decision_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "screening_decision_override_startup_created_idx" ON "screening_decision_override" USING btree ("startup_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "screening_decision_override_actor_created_idx" ON "screening_decision_override" USING btree ("actor_user_id","created_at" DESC NULLS LAST);