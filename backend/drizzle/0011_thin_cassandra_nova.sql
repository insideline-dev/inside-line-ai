ALTER TABLE "early_access_invites"
ADD COLUMN IF NOT EXISTS "role" "user_role" DEFAULT 'founder' NOT NULL;
