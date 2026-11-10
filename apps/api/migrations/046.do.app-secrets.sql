-- Values the server makes for itself and must keep, such as the web push
-- (VAPID) key pair: generated on first use when .env has none, so browser
-- notifications work without setting anything up (lib/push-keys.js).
CREATE TABLE IF NOT EXISTS axsuck.app_secrets (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
