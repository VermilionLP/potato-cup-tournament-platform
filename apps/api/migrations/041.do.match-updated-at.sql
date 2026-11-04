-- When each match last changed, so live updates can send only the matches
-- that changed (GET /tournaments/:id/live?since=). Kept by a trigger, so
-- every UPDATE counts without touching the queries.
ALTER TABLE axsuck.matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION axsuck.touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS matches_touch_updated_at ON axsuck.matches;
CREATE TRIGGER matches_touch_updated_at BEFORE UPDATE ON axsuck.matches
  FOR EACH ROW EXECUTE PROCEDURE axsuck.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_matches_tournament_updated ON axsuck.matches(tournament_id, updated_at);
