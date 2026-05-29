ALTER TABLE "investor_theses" ALTER COLUMN "auto_advance_data_gate" SET DEFAULT true;
--> statement-breakpoint
UPDATE "investor_theses" SET "auto_advance_data_gate" = true WHERE "auto_advance_data_gate" = false;