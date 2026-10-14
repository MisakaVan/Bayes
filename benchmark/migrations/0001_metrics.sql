CREATE TABLE IF NOT EXISTS benchmark_samples (
  sample_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  scenario TEXT NOT NULL,
  script_name TEXT NOT NULL,
  version_id TEXT,
  status INTEGER,
  outcome TEXT NOT NULL,
  cpu_ms REAL,
  handler_ms REAL,
  completion_ms REAL,
  operations TEXT NOT NULL,
  dependency_ms TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_benchmark_run_scenario ON benchmark_samples(run_id, scenario);
CREATE INDEX IF NOT EXISTS idx_benchmark_retention ON benchmark_samples(recorded_at);
