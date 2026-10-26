SET search_path TO axsuck, public;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'rb'
    CHECK (game_mode IN ('ab', 'rb', 'sb')),
  ADD COLUMN IF NOT EXISTS vehicle_pool TEXT NOT NULL DEFAULT 'proleague',
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'single_elim'
    CHECK (format IN ('single_elim', 'double_elim', 'swiss'));

-- New tournaments advance the winner of a match by default. Existing rows keep
-- their stored value, so historical "loser advances" events are untouched.
ALTER TABLE tournaments ALTER COLUMN loser_advances SET DEFAULT 0;
