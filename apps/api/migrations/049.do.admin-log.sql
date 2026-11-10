-- What admins changed (lib/admin-log.js): one row per successful admin
-- write — scores, walkovers, settings, status, players, pools. `actor` is
-- the player ID the admin's browser was signed in with (the admin token is
-- shared). Event name and match players are copied in, so a row still
-- reads right after the event is renamed or deleted.
CREATE TABLE IF NOT EXISTS axsuck.admin_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT,
  action TEXT NOT NULL,
  tournament_id TEXT,
  tournament_name TEXT,
  match_id INTEGER,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_admin_log_at ON axsuck.admin_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_log_tournament ON axsuck.admin_log (tournament_id, at DESC);
