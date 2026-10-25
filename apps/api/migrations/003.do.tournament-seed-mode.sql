SET search_path TO axsuck, public;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS seed_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (seed_mode IN ('auto', 'manual'));

-- Completed historical tournaments keep their original draw; new tournaments
-- (and any tournament still in registration/voting) default to auto.
UPDATE tournaments SET seed_mode = 'manual' WHERE status = 'completed';
