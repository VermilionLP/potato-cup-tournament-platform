-- Recreates the empty table (the votes themselves are gone).
CREATE TABLE IF NOT EXISTS axsuck.custom_votes (
  id SERIAL PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES axsuck.tournaments(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES axsuck.players(id),
  topic TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, player_id, topic, value)
);
CREATE INDEX IF NOT EXISTS idx_custom_votes_tournament ON axsuck.custom_votes(tournament_id);
