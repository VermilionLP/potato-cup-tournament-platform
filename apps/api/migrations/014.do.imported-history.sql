SET search_path TO axsuck, public;

-- Past events imported from Liquipedia: when they were played and where the
-- results came from. played_at drives the ladder order; NULL falls back to the
-- scheduled time, then to created_at.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_title TEXT;
