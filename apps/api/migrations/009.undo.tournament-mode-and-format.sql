SET search_path TO axsuck, public;

ALTER TABLE tournaments ALTER COLUMN loser_advances SET DEFAULT 1;

ALTER TABLE tournaments
  DROP COLUMN IF EXISTS format,
  DROP COLUMN IF EXISTS vehicle_pool,
  DROP COLUMN IF EXISTS game_mode;
