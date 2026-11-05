-- Ban / Pick of a match, kept on the server (lib/banpick.js):
-- { rev, state, log }. Cleared when the match's players change (a rollback
-- or a re-seed puts other players in); kept after the result, so the vehicle
-- played stays on record.
ALTER TABLE axsuck.matches ADD COLUMN IF NOT EXISTS banpick JSONB;

CREATE OR REPLACE FUNCTION axsuck.clear_banpick() RETURNS trigger AS $$
BEGIN
  IF NEW.player1_id IS DISTINCT FROM OLD.player1_id
     OR NEW.player2_id IS DISTINCT FROM OLD.player2_id THEN
    NEW.banpick = NULL;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS matches_clear_banpick ON axsuck.matches;
CREATE TRIGGER matches_clear_banpick BEFORE UPDATE ON axsuck.matches
  FOR EACH ROW EXECUTE PROCEDURE axsuck.clear_banpick();
