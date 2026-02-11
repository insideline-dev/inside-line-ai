CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  CREATE TYPE "public"."pipeline_run_status" AS ENUM(
    'running',
    'completed',
    'failed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "public"."pipeline_phase" AS ENUM(
    'extraction',
    'scraping',
    'research',
    'evaluation',
    'synthesis'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pipeline_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pipeline_run_id" text NOT NULL,
  "startup_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" "pipeline_run_status" DEFAULT 'running' NOT NULL,
  "config" jsonb NOT NULL,
  "error" jsonb,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pipeline_runs_pipeline_run_id_unique" UNIQUE("pipeline_run_id")
);

CREATE TABLE IF NOT EXISTS "pipeline_failures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pipeline_run_id" text NOT NULL,
  "startup_id" uuid NOT NULL,
  "phase" "pipeline_phase" NOT NULL,
  "job_data" jsonb,
  "error" jsonb NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "attempted_at" timestamp DEFAULT now() NOT NULL
);

DO $$
DECLARE
  startup_table text;
  user_table text;
BEGIN
  IF to_regclass('public.startups') IS NOT NULL THEN
    startup_table := 'startups';
  ELSIF to_regclass('public.startup') IS NOT NULL THEN
    startup_table := 'startup';
  ELSE
    startup_table := NULL;
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    user_table := 'users';
  ELSIF to_regclass('public.user') IS NOT NULL THEN
    user_table := 'user';
  ELSE
    user_table := NULL;
  END IF;

  IF startup_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_runs_startup_id_fk'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES %I.%I("id") ON DELETE CASCADE',
      'public',
      startup_table
    );
  END IF;

  IF user_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_runs_user_id_fk'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_user_id_fk" FOREIGN KEY ("user_id") REFERENCES %I.%I("id") ON DELETE CASCADE',
      'public',
      user_table
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_failures_pipeline_run_id_fk'
  ) THEN
    ALTER TABLE "pipeline_failures"
      ADD CONSTRAINT "pipeline_failures_pipeline_run_id_fk"
      FOREIGN KEY ("pipeline_run_id")
      REFERENCES "public"."pipeline_runs"("pipeline_run_id")
      ON DELETE CASCADE;
  END IF;

  IF startup_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_failures_startup_id_fk'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "pipeline_failures" ADD CONSTRAINT "pipeline_failures_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES %I.%I("id") ON DELETE CASCADE',
      'public',
      startup_table
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pipeline_runs_startup_idx"
  ON "pipeline_runs" USING btree ("startup_id");

CREATE INDEX IF NOT EXISTS "pipeline_runs_status_started_idx"
  ON "pipeline_runs" USING btree ("status", "started_at");

CREATE INDEX IF NOT EXISTS "pipeline_failures_pipeline_idx"
  ON "pipeline_failures" USING btree ("pipeline_run_id");

CREATE INDEX IF NOT EXISTS "pipeline_failures_startup_phase_idx"
  ON "pipeline_failures" USING btree ("startup_id", "phase");
