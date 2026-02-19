DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'pipeline_trace_kind'
  ) THEN
    CREATE TYPE pipeline_trace_kind AS ENUM (
      'ai_agent',
      'phase_step'
    );
  END IF;
END $$;

ALTER TABLE pipeline_agent_runs
  ADD COLUMN IF NOT EXISTS trace_kind pipeline_trace_kind NOT NULL DEFAULT 'ai_agent';

ALTER TABLE pipeline_agent_runs
  ADD COLUMN IF NOT EXISTS step_key text;

ALTER TABLE pipeline_agent_runs
  ADD COLUMN IF NOT EXISTS input_json jsonb;

ALTER TABLE pipeline_agent_runs
  ADD COLUMN IF NOT EXISTS meta jsonb;

CREATE INDEX IF NOT EXISTS pipeline_agent_runs_startup_run_kind_phase_step_started_idx
  ON pipeline_agent_runs (
    startup_id,
    pipeline_run_id,
    trace_kind,
    phase,
    step_key,
    started_at
  );
