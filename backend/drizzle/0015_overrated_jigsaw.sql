CREATE TYPE "public"."investor_deal_verdict" AS ENUM('advance', 'pass', 'hold');--> statement-breakpoint
CREATE TABLE "investor_deal_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investor_id" uuid NOT NULL,
	"startup_id" uuid NOT NULL,
	"verdict" "investor_deal_verdict" NOT NULL,
	"reason_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"triage_classification_at_decision" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investor_deal_decisions" ADD CONSTRAINT "investor_deal_decisions_investor_id_users_id_fk" FOREIGN KEY ("investor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investor_deal_decisions" ADD CONSTRAINT "investor_deal_decisions_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investor_deal_decisions_investor_startup_idx" ON "investor_deal_decisions" USING btree ("investor_id","startup_id","decided_at");--> statement-breakpoint
CREATE INDEX "investor_deal_decisions_investor_decided_idx" ON "investor_deal_decisions" USING btree ("investor_id","decided_at");