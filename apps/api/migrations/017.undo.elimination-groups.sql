SET search_path TO axsuck, public;

DELETE FROM matches WHERE bracket IN ('gse', 'gwb', 'glb');
DROP INDEX IF EXISTS matches_bracket_slot_key;
ALTER TABLE matches
  ADD CONSTRAINT matches_bracket_slot_key UNIQUE (tournament_id, bracket, round, position);
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_bracket_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_bracket_check
  CHECK (bracket IN ('main', 'wb', 'lb', 'gf', 'sw'));
