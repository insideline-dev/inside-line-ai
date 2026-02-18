CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS startup_name_trgm_idx ON startup USING gin (name gin_trgm_ops);
