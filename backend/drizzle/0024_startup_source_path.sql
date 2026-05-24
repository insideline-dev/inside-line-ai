CREATE TYPE "public"."startup_source_path" AS ENUM('founder-submitted', 'founder-manual', 'investor-manual', 'scout-submitted', 'investor-inbox', 'clara', 'admin-manual', 'admin-csv');
--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "source_path" "startup_source_path";
--> statement-breakpoint
CREATE INDEX "startup_source_path_idx" ON "startups" USING btree ("source_path");
