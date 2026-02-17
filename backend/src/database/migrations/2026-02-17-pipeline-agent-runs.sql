DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'pipeline_agent_run_status'
  ) THEN
    CREATE TYPE pipeline_agent_run_status AS ENUM (
      'running',
      'completed',
      'failed',
      'fallback'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pipeline_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id text NOT NULL REFERENCES pipeline_runs(pipeline_run_id) ON DELETE CASCADE,
  startup_id uuid NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  phase pipeline_phase NOT NULL,
  agent_key text NOT NULL,
  status pipeline_agent_run_status NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  retry_count integer NOT NULL DEFAULT 0,
  used_fallback boolean NOT NULL DEFAULT false,
  input_prompt text,
  output_text text,
  output_json jsonb,
  error text,
  started_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_agent_runs_startup_idx
  ON pipeline_agent_runs (startup_id);
CREATE INDEX IF NOT EXISTS pipeline_agent_runs_pipeline_idx
  ON pipeline_agent_runs (pipeline_run_id);
CREATE INDEX IF NOT EXISTS pipeline_agent_runs_startup_phase_agent_idx
  ON pipeline_agent_runs (startup_id, phase, agent_key);
CREATE INDEX IF NOT EXISTS pipeline_agent_runs_created_idx
  ON pipeline_agent_runs (created_at);

