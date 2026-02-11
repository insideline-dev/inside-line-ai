-- ============================================================================
-- Inside Line Platform Schema Migration
-- Creates all tables for the startup-investor matching platform
-- ============================================================================

-- Create the application role if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
END
$$;

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Startup enums
DO $$ BEGIN
  CREATE TYPE startup_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE startup_stage AS ENUM ('pre-seed', 'seed', 'series-a', 'series-b+');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notification enums
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('info', 'success', 'warning', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Portal enums
DO $$ BEGIN
  CREATE TYPE portal_submission_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Scout enums
DO $$ BEGIN
  CREATE TYPE scout_application_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Analysis enums
DO $$ BEGIN
  CREATE TYPE analysis_job_type AS ENUM ('scoring', 'pdf', 'matching', 'market_analysis');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE analysis_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE analysis_job_priority AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Integration enums
DO $$ BEGIN
  CREATE TYPE webhook_source AS ENUM ('agentmail', 'twilio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- STARTUP TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS startup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  website TEXT NOT NULL,
  location TEXT NOT NULL,
  industry TEXT NOT NULL,
  stage startup_stage NOT NULL,
  funding_target INTEGER NOT NULL,
  team_size INTEGER NOT NULL,

  -- Status workflow
  status startup_status NOT NULL DEFAULT 'draft',

  -- Media URLs
  pitch_deck_url TEXT,
  demo_url TEXT,
  logo_url TEXT,

  -- Workflow timestamps
  submitted_at TIMESTAMP,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,

  -- Standard timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS startup_userId_status_idx ON startup(user_id, status);
CREATE INDEX IF NOT EXISTS startup_status_created_idx ON startup(status, created_at DESC);
CREATE INDEX IF NOT EXISTS startup_industry_idx ON startup(industry);
CREATE INDEX IF NOT EXISTS startup_stage_idx ON startup(stage);
CREATE INDEX IF NOT EXISTS startup_location_idx ON startup(location);
CREATE UNIQUE INDEX IF NOT EXISTS startup_slug_idx ON startup(slug);

-- Enable RLS
ALTER TABLE startup ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS startup_select_own ON startup;
CREATE POLICY startup_select_own ON startup
  FOR SELECT TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS startup_insert_own ON startup;
CREATE POLICY startup_insert_own ON startup
  FOR INSERT TO app_user
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS startup_update_own ON startup;
CREATE POLICY startup_update_own ON startup
  FOR UPDATE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS startup_delete_own ON startup;
CREATE POLICY startup_delete_own ON startup
  FOR DELETE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS startup_investor_view ON startup;
CREATE POLICY startup_investor_view ON startup
  FOR SELECT TO app_user
  USING (status = 'approved');

-- ============================================================================
-- STARTUP DRAFT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS startup_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id UUID UNIQUE REFERENCES startup(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  draft_data JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS startup_draft_startupId_updated_idx ON startup_draft(startup_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS startup_draft_userId_idx ON startup_draft(user_id);

-- Enable RLS
ALTER TABLE startup_draft ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS draft_select_own ON startup_draft;
CREATE POLICY draft_select_own ON startup_draft
  FOR SELECT TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS draft_insert_own ON startup_draft;
CREATE POLICY draft_insert_own ON startup_draft
  FOR INSERT TO app_user
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS draft_update_own ON startup_draft;
CREATE POLICY draft_update_own ON startup_draft
  FOR UPDATE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS draft_delete_own ON startup_draft;
CREATE POLICY draft_delete_own ON startup_draft
  FOR DELETE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- INVESTOR THESIS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS investor_thesis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,

  -- Investment criteria
  industries TEXT[],
  stages TEXT[],
  check_size_min INTEGER,
  check_size_max INTEGER,
  geographic_focus TEXT[],

  -- Preferences
  must_have_features TEXT[],
  deal_breakers TEXT[],
  notes TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS investor_thesis_user_idx ON investor_thesis(user_id);

-- Enable RLS
ALTER TABLE investor_thesis ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS thesis_select_own ON investor_thesis;
CREATE POLICY thesis_select_own ON investor_thesis
  FOR SELECT TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS thesis_insert_own ON investor_thesis;
CREATE POLICY thesis_insert_own ON investor_thesis
  FOR INSERT TO app_user
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS thesis_update_own ON investor_thesis;
CREATE POLICY thesis_update_own ON investor_thesis
  FOR UPDATE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS thesis_delete_own ON investor_thesis;
CREATE POLICY thesis_delete_own ON investor_thesis
  FOR DELETE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- SCORING WEIGHTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS scoring_weight (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,

  -- Weights (must sum to 100)
  market_weight INTEGER NOT NULL DEFAULT 20,
  team_weight INTEGER NOT NULL DEFAULT 20,
  product_weight INTEGER NOT NULL DEFAULT 20,
  traction_weight INTEGER NOT NULL DEFAULT 20,
  financials_weight INTEGER NOT NULL DEFAULT 20,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraint: weights must sum to 100
  CONSTRAINT weights_sum_100 CHECK (
    market_weight + team_weight + product_weight + traction_weight + financials_weight = 100
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS scoring_weight_user_idx ON scoring_weight(user_id);

-- Enable RLS
ALTER TABLE scoring_weight ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS weights_select_own ON scoring_weight;
CREATE POLICY weights_select_own ON scoring_weight
  FOR SELECT TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS weights_insert_own ON scoring_weight;
CREATE POLICY weights_insert_own ON scoring_weight
  FOR INSERT TO app_user
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS weights_update_own ON scoring_weight;
CREATE POLICY weights_update_own ON scoring_weight
  FOR UPDATE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS weights_delete_own ON scoring_weight;
CREATE POLICY weights_delete_own ON scoring_weight
  FOR DELETE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- STARTUP MATCHES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS startup_match (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES startup(id) ON DELETE CASCADE,

  -- Scores (0-100)
  overall_score INTEGER NOT NULL,
  market_score INTEGER,
  team_score INTEGER,
  product_score INTEGER,
  traction_score INTEGER,
  financials_score INTEGER,

  -- Metadata
  match_reason TEXT,
  is_saved BOOLEAN NOT NULL DEFAULT false,
  viewed_at TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS match_investor_score_idx ON startup_match(investor_id, overall_score DESC);
CREATE INDEX IF NOT EXISTS match_startup_idx ON startup_match(startup_id);
CREATE INDEX IF NOT EXISTS match_investor_saved_idx ON startup_match(investor_id, is_saved);

-- Enable RLS
ALTER TABLE startup_match ENABLE ROW LEVEL SECURITY;

-- RLS Policies (investor_id is the owner)
DROP POLICY IF EXISTS match_select_own ON startup_match;
CREATE POLICY match_select_own ON startup_match
  FOR SELECT TO app_user
  USING (investor_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS match_insert_own ON startup_match;
CREATE POLICY match_insert_own ON startup_match
  FOR INSERT TO app_user
  WITH CHECK (investor_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS match_update_own ON startup_match;
CREATE POLICY match_update_own ON startup_match
  FOR UPDATE TO app_user
  USING (investor_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  WITH CHECK (investor_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS match_delete_own ON startup_match;
CREATE POLICY match_delete_own ON startup_match
  FOR DELETE TO app_user
  USING (investor_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- NOTIFICATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type notification_type NOT NULL DEFAULT 'info',
  link TEXT,

  -- Status
  read BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS notification_user_read_created_idx ON notification(user_id, read, created_at DESC);

-- Enable RLS
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS notification_select_own ON notification;
CREATE POLICY notification_select_own ON notification
  FOR SELECT TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS notification_insert_own ON notification;
CREATE POLICY notification_insert_own ON notification
  FOR INSERT TO app_user
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS notification_update_own ON notification;
CREATE POLICY notification_update_own ON notification
  FOR UPDATE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS notification_delete_own ON notification;
CREATE POLICY notification_delete_own ON notification
  FOR DELETE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- PORTAL TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Branding
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  brand_color TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS portal_slug_idx ON portal(slug);
CREATE INDEX IF NOT EXISTS portal_user_idx ON portal(user_id);

-- Enable RLS
ALTER TABLE portal ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS portal_select_own ON portal;
CREATE POLICY portal_select_own ON portal
  FOR SELECT TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS portal_insert_own ON portal;
CREATE POLICY portal_insert_own ON portal
  FOR INSERT TO app_user
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS portal_update_own ON portal;
CREATE POLICY portal_update_own ON portal
  FOR UPDATE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS portal_delete_own ON portal;
CREATE POLICY portal_delete_own ON portal
  FOR DELETE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS portal_public_view ON portal;
CREATE POLICY portal_public_view ON portal
  FOR SELECT TO app_user
  USING (is_active = true);

-- ============================================================================
-- PORTAL SUBMISSION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS portal_submission (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id UUID NOT NULL REFERENCES portal(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES startup(id) ON DELETE CASCADE,

  -- Status
  status portal_submission_status NOT NULL DEFAULT 'pending',

  submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS portal_submission_portal_submitted_idx ON portal_submission(portal_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS portal_submission_startup_idx ON portal_submission(startup_id);

-- Enable RLS
ALTER TABLE portal_submission ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS submission_portal_owner_select ON portal_submission;
CREATE POLICY submission_portal_owner_select ON portal_submission
  FOR SELECT TO app_user
  USING (EXISTS (
    SELECT 1 FROM portal
    WHERE portal.id = portal_submission.portal_id
    AND (portal.user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  ));

DROP POLICY IF EXISTS submission_portal_owner_update ON portal_submission;
CREATE POLICY submission_portal_owner_update ON portal_submission
  FOR UPDATE TO app_user
  USING (EXISTS (
    SELECT 1 FROM portal
    WHERE portal.id = portal_submission.portal_id
    AND (portal.user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  ));

DROP POLICY IF EXISTS submission_startup_insert ON portal_submission;
CREATE POLICY submission_startup_insert ON portal_submission
  FOR INSERT TO app_user
  WITH CHECK (EXISTS (
    SELECT 1 FROM startup
    WHERE startup.id = portal_submission.startup_id
    AND (startup.user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  ));

DROP POLICY IF EXISTS submission_startup_owner_select ON portal_submission;
CREATE POLICY submission_startup_owner_select ON portal_submission
  FOR SELECT TO app_user
  USING (EXISTS (
    SELECT 1 FROM startup
    WHERE startup.id = portal_submission.startup_id
    AND (startup.user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  ));

-- ============================================================================
-- SCOUT APPLICATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS scout_application (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Application details
  bio TEXT,
  linkedin_url TEXT,
  portfolio TEXT[],

  -- Review workflow
  status scout_application_status NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
  rejection_reason TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS scout_application_user_idx ON scout_application(user_id);
CREATE INDEX IF NOT EXISTS scout_application_investor_status_idx ON scout_application(investor_id, status);

-- Enable RLS
ALTER TABLE scout_application ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS scout_app_owner_select ON scout_application;
CREATE POLICY scout_app_owner_select ON scout_application
  FOR SELECT TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS scout_app_owner_insert ON scout_application;
CREATE POLICY scout_app_owner_insert ON scout_application
  FOR INSERT TO app_user
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS scout_app_owner_update ON scout_application;
CREATE POLICY scout_app_owner_update ON scout_application
  FOR UPDATE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS scout_app_investor_select ON scout_application;
CREATE POLICY scout_app_investor_select ON scout_application
  FOR SELECT TO app_user
  USING (investor_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS scout_app_investor_update ON scout_application;
CREATE POLICY scout_app_investor_update ON scout_application
  FOR UPDATE TO app_user
  USING (investor_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- SCOUT SUBMISSION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS scout_submission (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  startup_id UUID NOT NULL REFERENCES startup(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- Commission (basis points, e.g., 100 = 1%)
  commission_rate INTEGER,
  notes TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS scout_submission_scout_idx ON scout_submission(scout_id);
CREATE INDEX IF NOT EXISTS scout_submission_investor_created_idx ON scout_submission(investor_id, created_at DESC);

-- Enable RLS
ALTER TABLE scout_submission ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS scout_sub_owner_select ON scout_submission;
CREATE POLICY scout_sub_owner_select ON scout_submission
  FOR SELECT TO app_user
  USING (scout_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS scout_sub_owner_insert ON scout_submission;
CREATE POLICY scout_sub_owner_insert ON scout_submission
  FOR INSERT TO app_user
  WITH CHECK (scout_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS scout_sub_owner_update ON scout_submission;
CREATE POLICY scout_sub_owner_update ON scout_submission
  FOR UPDATE TO app_user
  USING (scout_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS scout_sub_investor_select ON scout_submission;
CREATE POLICY scout_sub_investor_select ON scout_submission
  FOR SELECT TO app_user
  USING (investor_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- ANALYSIS JOB TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS analysis_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id UUID NOT NULL REFERENCES startup(id) ON DELETE CASCADE,

  -- Job config
  job_type analysis_job_type NOT NULL,
  status analysis_job_status NOT NULL DEFAULT 'pending',
  priority analysis_job_priority NOT NULL DEFAULT 'medium',

  -- Results
  result JSONB,
  error_message TEXT,

  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS analysis_job_startup_type_idx ON analysis_job(startup_id, job_type);
CREATE INDEX IF NOT EXISTS analysis_job_status_priority_created_idx ON analysis_job(status, priority, created_at);

-- Enable RLS
ALTER TABLE analysis_job ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS analysis_job_startup_owner_select ON analysis_job;
CREATE POLICY analysis_job_startup_owner_select ON analysis_job
  FOR SELECT TO app_user
  USING (EXISTS (
    SELECT 1 FROM startup
    WHERE startup.id = analysis_job.startup_id
    AND (startup.user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  ));

DROP POLICY IF EXISTS analysis_job_admin_insert ON analysis_job;
CREATE POLICY analysis_job_admin_insert ON analysis_job
  FOR INSERT TO app_user
  WITH CHECK (current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS analysis_job_admin_update ON analysis_job;
CREATE POLICY analysis_job_admin_update ON analysis_job
  FOR UPDATE TO app_user
  USING (current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS analysis_job_admin_delete ON analysis_job;
CREATE POLICY analysis_job_admin_delete ON analysis_job
  FOR DELETE TO app_user
  USING (current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- INTEGRATION WEBHOOK TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_webhook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Webhook metadata
  source webhook_source NOT NULL,
  event_type TEXT NOT NULL,

  -- Payload
  payload JSONB NOT NULL,

  -- Processing
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS webhook_source_processed_created_idx ON integration_webhook(source, processed, created_at);

-- Enable RLS
ALTER TABLE integration_webhook ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin only)
DROP POLICY IF EXISTS webhook_admin_select ON integration_webhook;
CREATE POLICY webhook_admin_select ON integration_webhook
  FOR SELECT TO app_user
  USING (current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS webhook_admin_insert ON integration_webhook;
CREATE POLICY webhook_admin_insert ON integration_webhook
  FOR INSERT TO app_user
  WITH CHECK (current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS webhook_admin_update ON integration_webhook;
CREATE POLICY webhook_admin_update ON integration_webhook
  FOR UPDATE TO app_user
  USING (current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS webhook_admin_delete ON integration_webhook;
CREATE POLICY webhook_admin_delete ON integration_webhook
  FOR DELETE TO app_user
  USING (current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- EMAIL THREAD TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_thread (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  -- External reference
  thread_id TEXT NOT NULL,

  -- Metadata
  subject TEXT,
  participants TEXT[],

  -- Status
  last_message_at TIMESTAMP,
  unread_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS email_thread_user_last_message_idx ON email_thread(user_id, last_message_at DESC);

-- Enable RLS
ALTER TABLE email_thread ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS email_thread_select_own ON email_thread;
CREATE POLICY email_thread_select_own ON email_thread
  FOR SELECT TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS email_thread_insert_own ON email_thread;
CREATE POLICY email_thread_insert_own ON email_thread
  FOR INSERT TO app_user
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS email_thread_update_own ON email_thread;
CREATE POLICY email_thread_update_own ON email_thread
  FOR UPDATE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin')
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid
              OR current_setting('app.current_user_role', true) = 'admin');

DROP POLICY IF EXISTS email_thread_delete_own ON email_thread;
CREATE POLICY email_thread_delete_own ON email_thread
  FOR DELETE TO app_user
  USING (user_id = current_setting('app.current_user_id', true)::uuid
         OR current_setting('app.current_user_role', true) = 'admin');

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
