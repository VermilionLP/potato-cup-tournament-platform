SET search_path TO axsuck, public;

-- Restores the table dropped by 007.do.drop-match-replays.sql.
-- Replay upload/parsing routes no longer exist, so the table would stay empty.
CREATE TABLE IF NOT EXISTS match_replays (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  compressed_data BYTEA NOT NULL,
  parsed_data TEXT NOT NULL,
  winner TEXT,
  map_name TEXT,
  game_length INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_replays_match_id ON match_replays(match_id);
