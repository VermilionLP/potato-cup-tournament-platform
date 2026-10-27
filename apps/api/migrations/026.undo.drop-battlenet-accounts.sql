SET search_path TO axsuck, public;

-- Structure only; restore the data from a backup if needed.
ALTER TABLE players ADD COLUMN IF NOT EXISTS bnet_ids TEXT DEFAULT '[]';
CREATE TABLE IF NOT EXISTS tournament_player_accounts (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  account_key TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  account_name TEXT DEFAULT '',
  url TEXT DEFAULT '',
  toon_handle TEXT,
  region TEXT,
  subregion INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, account_key)
);
CREATE INDEX IF NOT EXISTS idx_tournament_player_accounts_player
  ON tournament_player_accounts(tournament_id, player_id);
