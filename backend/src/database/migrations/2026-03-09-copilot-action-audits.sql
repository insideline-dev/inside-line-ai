CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  CREATE TYPE "public"."copilot_action_audit_status" AS ENUM(
    'proposed',
    'executed',
    'cancelled',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "copilot_action_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid,
  "actor_user_id" uuid,
  "actor_email" text NOT NULL,
  "actor_role" text,
  "channel" text NOT NULL,
  "thread_id" text NOT NULL,
  "action_key" text NOT NULL,
  "status" "copilot_action_audit_status" NOT NULL,
  "startup_id" uuid,
  "target_summary" text,
  "payload" jsonb,
  "result" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'copilot_action_audits_conversation_id_fk'
  ) THEN
    ALTER TABLE "copilot_action_audits" ADD CONSTRAINT "copilot_action_audits_conversation_id_fk"
      FOREIGN KEY ("conversation_id") REFERENCES "clara_conversations"("id") ON DELETE SET NULL;
  END IF;

  IF user_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'copilot_action_audits_actor_user_id_fk'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "copilot_action_audits" ADD CONSTRAINT "copilot_action_audits_actor_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES %I.%I("id") ON DELETE SET NULL',
      'public',
      user_table
    );
  END IF;

  IF startup_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'copilot_action_audits_startup_id_fk'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "copilot_action_audits" ADD CONSTRAINT "copilot_action_audits_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES %I.%I("id") ON DELETE SET NULL',
      'public',
      startup_table
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "copilot_action_audit_conversation_idx"
  ON "copilot_action_audits" USING btree ("conversation_id");

CREATE INDEX IF NOT EXISTS "copilot_action_audit_actor_idx"
  ON "copilot_action_audits" USING btree ("actor_user_id");

CREATE INDEX IF NOT EXISTS "copilot_action_audit_startup_idx"
  ON "copilot_action_audits" USING btree ("startup_id");

CREATE INDEX IF NOT EXISTS "copilot_action_audit_thread_idx"
  ON "copilot_action_audits" USING btree ("thread_id");
