-- Liquipedia export of War Thunder TSS tournaments (tss.warthunder.com,
-- routes/tss.js): the export settings an admin saved for each TSS
-- tournament (lib/tss/settings.js), so the next export of the same event
-- starts from them and a new event of the same kind (1v1 or teams) starts
-- from the last one. The TSS data itself is read live and not stored.
CREATE TABLE IF NOT EXISTS axsuck.tss_exports (
  tss_id TEXT PRIMARY KEY CHECK (tss_id ~ '^[1-9][0-9]{0,9}$'),
  name TEXT NOT NULL DEFAULT '',
  solo BOOLEAN NOT NULL DEFAULT FALSE,
  settings JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tss_exports_recent ON axsuck.tss_exports (updated_at DESC);
