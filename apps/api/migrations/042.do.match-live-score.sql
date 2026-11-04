-- Live score of a match being played (POST .../live-score): saved during
-- the match, no winner, no advancement. Cleared by the trigger whenever the
-- match's status or players change (a result, a walkover, a rollback).
ALTER TABLE axsuck.matches
  ADD COLUMN IF NOT EXISTS live_score1 INTEGER,
  ADD COLUMN IF NOT EXISTS live_score2 INTEGER,
  ADD COLUMN IF NOT EXISTS live_score_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION axsuck.clear_live_score() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.player1_id IS DISTINCT FROM OLD.player1_id
     OR NEW.player2_id IS DISTINCT FROM OLD.player2_id THEN
    NEW.live_score1 = NULL;
    NEW.live_score2 = NULL;
    NEW.live_score_at = NULL;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS matches_clear_live_score ON axsuck.matches;
CREATE TRIGGER matches_clear_live_score BEFORE UPDATE ON axsuck.matches
  FOR EACH ROW EXECUTE PROCEDURE axsuck.clear_live_score();
