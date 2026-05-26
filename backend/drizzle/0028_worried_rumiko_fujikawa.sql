CREATE TYPE "public"."data_gate_status" AS ENUM('pending', 'skipped', 'complete');--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "data_gate_status" "data_gate_status";--> statement-breakpoint
ALTER TABLE "investor_theses" ADD COLUMN "required_doc_types" text[] DEFAULT '{"pitch_deck","financial"}';--> statement-breakpoint
ALTER TABLE "investor_theses" ADD COLUMN "auto_advance_data_gate" boolean DEFAULT false NOT NULL;