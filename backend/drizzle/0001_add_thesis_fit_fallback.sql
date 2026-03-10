-- Migration: Add thesisFitFallback column to startup_matches
-- This flag indicates when a match was created using a fallback score
-- because AI thesis alignment failed (e.g., model/runtime error).
-- Admins can use this to identify matches that require manual review.

ALTER TABLE "startup_matches" ADD COLUMN IF NOT EXISTS "thesis_fit_fallback" boolean DEFAULT false;
