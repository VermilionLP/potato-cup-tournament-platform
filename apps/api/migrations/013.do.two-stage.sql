SET search_path TO axsuck, public;

-- Two-stage events: Swiss group stage, then an elimination playoff.
-- playoff_format NULL means a single-stage event.
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS playoff_format TEXT
    CHECK (playoff_format IS NULL OR playoff_format IN ('single_elim', 'double_elim')),
  ADD COLUMN IF NOT EXISTS swiss_group_size SMALLINT
    CHECK (swiss_group_size IS NULL OR swiss_group_size BETWEEN 2 AND 64),
  ADD COLUMN IF NOT EXISTS advance_per_group SMALLINT
    CHECK (advance_per_group IS NULL OR advance_per_group BETWEEN 1 AND 64),
  ADD COLUMN IF NOT EXISTS current_stage TEXT NOT NULL DEFAULT 'group'
    CHECK (current_stage IN ('group', 'playoff'));

-- Group of each player and each Swiss match (1 = A, 2 = B, ...).
ALTER TABLE tournament_players
  ADD COLUMN IF NOT EXISTS swiss_group SMALLINT;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS swiss_group SMALLINT;
