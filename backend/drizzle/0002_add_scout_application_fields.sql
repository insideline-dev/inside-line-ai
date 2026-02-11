-- ============================================================================
-- Add new fields to scout_application table
-- These fields support the enhanced scout application form
-- ============================================================================

ALTER TABLE scout_application
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS experience TEXT,
ADD COLUMN IF NOT EXISTS motivation TEXT,
ADD COLUMN IF NOT EXISTS dealflow_sources TEXT;
