ALTER TABLE "pipeline_agent_runs"
ADD COLUMN IF NOT EXISTS "system_prompt" text;
