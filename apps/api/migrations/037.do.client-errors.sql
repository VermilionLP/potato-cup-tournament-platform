-- Errors from visitors' browsers (uncaught exceptions and rejected promises),
-- reported by the web app and read by admins on /errors. The same error
-- (message + where) is one row with a count; old rows are trimmed.
CREATE TABLE IF NOT EXISTS axsuck.client_errors (
  id SERIAL PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  player_id TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  first_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_errors_last_at ON axsuck.client_errors (last_at DESC);
