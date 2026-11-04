DROP TRIGGER IF EXISTS matches_clear_live_score ON axsuck.matches;
DROP FUNCTION IF EXISTS axsuck.clear_live_score();
ALTER TABLE axsuck.matches
  DROP COLUMN IF EXISTS live_score1,
  DROP COLUMN IF EXISTS live_score2,
  DROP COLUMN IF EXISTS live_score_at;
