CREATE TABLE "startup_funding_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"round_type" text NOT NULL,
	"announced_at" date,
	"amount" numeric(20, 2),
	"currency" text,
	"valuation_post_money" numeric(20, 2),
	"lead_investor" text,
	"investors" text[],
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_confidence" numeric(4, 3),
	"last_reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "startup_funding_history" ADD CONSTRAINT "startup_funding_history_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "startup_funding_history_startup_idx" ON "startup_funding_history" USING btree ("startup_id");--> statement-breakpoint
CREATE INDEX "startup_funding_history_round_idx" ON "startup_funding_history" USING btree ("startup_id","round_type");--> statement-breakpoint
CREATE UNIQUE INDEX "startup_funding_history_unique_round_idx" ON "startup_funding_history" USING btree ("startup_id","round_type","announced_at");