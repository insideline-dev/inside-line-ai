CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Keep this guarded enum creation here because this migration can run before
-- pipeline-orchestration in some environments.
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

CREATE TABLE IF NOT EXISTS "pipeline_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "startup_id" uuid NOT NULL,
  "phase" "pipeline_phase" NOT NULL,
  "agent_key" text,
  "feedback" text NOT NULL,
  "metadata" jsonb,
  "created_by" uuid NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
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
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_feedback_startup_id_fk'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "pipeline_feedback" ADD CONSTRAINT "pipeline_feedback_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES %I.%I("id") ON DELETE CASCADE',
      'public',
      startup_table
    );
  END IF;

  IF user_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_feedback_created_by_fk'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "pipeline_feedback" ADD CONSTRAINT "pipeline_feedback_created_by_fk" FOREIGN KEY ("created_by") REFERENCES %I.%I("id") ON DELETE CASCADE',
      'public',
      user_table
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pipeline_feedback_startup_phase_idx"
  ON "pipeline_feedback" USING btree ("startup_id", "phase");

CREATE INDEX IF NOT EXISTS "pipeline_feedback_startup_agent_idx"
  ON "pipeline_feedback" USING btree ("startup_id", "agent_key");

CREATE INDEX IF NOT EXISTS "pipeline_feedback_consumed_idx"
  ON "pipeline_feedback" USING btree ("consumed_at");
