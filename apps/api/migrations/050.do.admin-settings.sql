-- Settings admins change on the site (/admin): who is told when a match
-- needs an admin (lib/admin-alerts.js), and the last database backups seen
-- (lib/backup-status.js). key -> JSON value.
CREATE TABLE IF NOT EXISTS axsuck.admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
