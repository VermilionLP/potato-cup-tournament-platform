SET search_path TO axsuck, public;

ALTER TABLE tournaments
  DROP COLUMN IF EXISTS played_at,
  DROP COLUMN IF EXISTS source_url,
  DROP COLUMN IF EXISTS source_title;
