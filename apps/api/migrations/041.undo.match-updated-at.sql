DROP TRIGGER IF EXISTS matches_touch_updated_at ON axsuck.matches;
DROP FUNCTION IF EXISTS axsuck.touch_updated_at();
DROP INDEX IF EXISTS axsuck.idx_matches_tournament_updated;
ALTER TABLE axsuck.matches DROP COLUMN IF EXISTS updated_at;
