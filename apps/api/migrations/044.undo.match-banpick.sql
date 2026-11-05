DROP TRIGGER IF EXISTS matches_clear_banpick ON axsuck.matches;
DROP FUNCTION IF EXISTS axsuck.clear_banpick();
ALTER TABLE axsuck.matches DROP COLUMN IF EXISTS banpick;
