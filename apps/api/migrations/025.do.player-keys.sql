SET search_path TO axsuck, public;

-- Device keys (see apps/api/lib/player-key.js): the SHA-256 of a random key
-- bound to a player ID by the first device that uses it. Kept out of the
-- players table so SELECT * on players can never expose it.
CREATE TABLE IF NOT EXISTS player_keys (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE ON UPDATE CASCADE,
  key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
