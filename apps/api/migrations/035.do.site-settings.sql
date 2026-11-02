-- Site-wide settings kept by admins (key -> JSON). First user: the Discord
-- webhook announcements (lib/discord.js).
CREATE TABLE IF NOT EXISTS axsuck.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
