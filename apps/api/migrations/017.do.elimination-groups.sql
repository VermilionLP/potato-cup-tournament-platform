SET search_path TO axsuck, public;

-- Two-stage events can now play their group stage as single- or
-- double-elimination brackets per group: 'gse' (single elimination),
-- 'gwb' / 'glb' (winners / losers bracket of a double-elimination group).
-- For a two-stage event tournaments.format is the group-stage format and
-- playoff_format the playoff.
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_bracket_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_bracket_check
  CHECK (bracket IN ('main', 'wb', 'lb', 'gf', 'sw', 'gse', 'gwb', 'glb'));

-- Every group has its own bracket, so a group's rounds and positions may
-- repeat another group's: the group becomes part of the match key.
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_bracket_slot_key;
CREATE UNIQUE INDEX IF NOT EXISTS matches_bracket_slot_key
  ON matches (tournament_id, bracket, round, position, COALESCE(swiss_group, 0));
