-- Migration: Drop unused DB-backed prompt/revision tables
-- These tables are replaced by the filesystem-based prompt library.

-- 1. Drop tables with foreign keys first (child tables)
DROP TABLE IF EXISTS "ai_agent_schema_revisions" CASCADE;
DROP TABLE IF EXISTS "ai_model_config_revisions" CASCADE;
DROP TABLE IF EXISTS "ai_context_config_revisions" CASCADE;
DROP TABLE IF EXISTS "ai_prompt_revisions" CASCADE;

-- 2. Drop parent table
DROP TABLE IF EXISTS "ai_prompt_definitions" CASCADE;

-- 3. Drop legacy agent_prompts table (unused)
DROP TABLE IF EXISTS "agent_prompts" CASCADE;

-- 4. Drop orphaned enums
DROP TYPE IF EXISTS "ai_prompt_status" CASCADE;
DROP TYPE IF EXISTS "ai_prompt_surface" CASCADE;
DROP TYPE IF EXISTS "ai_prompt_search_mode" CASCADE;
DROP TYPE IF EXISTS "agent_category" CASCADE;

-- 5. Modify ai_agent_configs: drop promptDefinitionId FK, add promptKey varchar
ALTER TABLE "ai_agent_configs" DROP COLUMN IF EXISTS "prompt_definition_id";
ALTER TABLE "ai_agent_configs" ADD COLUMN IF NOT EXISTS "prompt_key" varchar(120);
