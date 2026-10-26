SET search_path TO axsuck, public;

-- Old ids of players that were merged or renamed: alias -> the player it
-- became. The Liquipedia import maps these names to the kept player so a
-- manual merge survives a re-import.
CREATE TABLE IF NOT EXISTS player_aliases (
  alias TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_aliases_player ON player_aliases(player_id);
