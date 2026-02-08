CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Conversation status enum
DO $$
BEGIN
  CREATE TYPE "public"."clara_conversation_status" AS ENUM(
    'active',
    'awaiting_info',
    'processing',
    'completed',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Message direction enum
DO $$
BEGIN
  CREATE TYPE "public"."clara_message_direction" AS ENUM(
    'inbound',
    'outbound'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Clara conversations table
CREATE TABLE IF NOT EXISTS "clara_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" text NOT NULL,
  "investor_user_id" uuid,
  "investor_email" text NOT NULL,
  "investor_name" text,
  "startup_id" uuid,
  "status" "clara_conversation_status" DEFAULT 'active' NOT NULL,
  "last_intent" text,
  "message_count" integer DEFAULT 0 NOT NULL,
  "context" jsonb DEFAULT '{}' NOT NULL,
  "last_message_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Clara messages table
CREATE TABLE IF NOT EXISTS "clara_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "message_id" text NOT NULL,
  "direction" "clara_message_direction" NOT NULL,
  "from_email" text NOT NULL,
  "subject" text,
  "body_text" text,
  "intent" text,
  "intent_confidence" real,
  "attachments" jsonb,
  "processed" boolean DEFAULT false NOT NULL,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign keys
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

  IF user_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clara_conv_investor_user_id_fk'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "clara_conversations" ADD CONSTRAINT "clara_conv_investor_user_id_fk" FOREIGN KEY ("investor_user_id") REFERENCES %I.%I("id") ON DELETE SET NULL',
      'public', user_table
    );
  END IF;

  IF startup_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clara_conv_startup_id_fk'
  ) THEN
    EXECUTE format(
      'ALTER TABLE "clara_conversations" ADD CONSTRAINT "clara_conv_startup_id_fk" FOREIGN KEY ("startup_id") REFERENCES %I.%I("id") ON DELETE SET NULL',
      'public', startup_table
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clara_msg_conversation_id_fk'
  ) THEN
    ALTER TABLE "clara_messages" ADD CONSTRAINT "clara_msg_conversation_id_fk"
      FOREIGN KEY ("conversation_id") REFERENCES "clara_conversations"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for clara_conversations
CREATE UNIQUE INDEX IF NOT EXISTS "clara_conv_thread_id_idx"
  ON "clara_conversations" USING btree ("thread_id");
CREATE INDEX IF NOT EXISTS "clara_conv_investor_email_idx"
  ON "clara_conversations" USING btree ("investor_email");
CREATE INDEX IF NOT EXISTS "clara_conv_startup_id_idx"
  ON "clara_conversations" USING btree ("startup_id");
CREATE INDEX IF NOT EXISTS "clara_conv_status_idx"
  ON "clara_conversations" USING btree ("status");

-- Indexes for clara_messages
CREATE INDEX IF NOT EXISTS "clara_msg_conversation_id_idx"
  ON "clara_messages" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "clara_msg_message_id_idx"
  ON "clara_messages" USING btree ("message_id");
CREATE INDEX IF NOT EXISTS "clara_msg_direction_idx"
  ON "clara_messages" USING btree ("direction");
