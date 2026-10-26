SET search_path TO axsuck, public;

DELETE FROM axsuck.matches WHERE bracket = 'sw';

ALTER TABLE axsuck.matches DROP CONSTRAINT IF EXISTS matches_bracket_check;
ALTER TABLE axsuck.matches
  ADD CONSTRAINT matches_bracket_check
  CHECK (bracket IN ('main', 'wb', 'lb', 'gf'));

ALTER TABLE axsuck.tournaments DROP COLUMN IF EXISTS swiss_rounds;
