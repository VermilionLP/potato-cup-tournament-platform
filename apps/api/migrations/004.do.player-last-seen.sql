ALTER TABLE axsuck.players
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill from real activity so existing players are not all treated as inactive.
UPDATE axsuck.players p
SET last_seen_at = GREATEST(
  p.created_at,
  COALESCE((SELECT MAX(tp.registered_at) FROM axsuck.tournament_players tp WHERE tp.player_id = p.id), p.created_at),
  COALESCE((SELECT MAX(tv.created_at) FROM axsuck.time_votes tv WHERE tv.player_id = p.id), p.created_at),
  COALESCE((SELECT MAX(cv.created_at) FROM axsuck.custom_votes cv WHERE cv.player_id = p.id), p.created_at)
)
WHERE p.last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_players_last_seen
  ON axsuck.players(last_seen_at);
