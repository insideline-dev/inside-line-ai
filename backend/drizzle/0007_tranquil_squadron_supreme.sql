ALTER TABLE "data_rooms" ADD COLUMN "classification_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "data_rooms" ADD COLUMN "classification_confidence" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "data_rooms" ADD COLUMN "routed_agents" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "data_rooms" ADD COLUMN "classification_error" text;--> statement-breakpoint
ALTER TABLE "data_rooms" ADD COLUMN "classified_at" timestamp;