-- Pairs of players an admin marked as different people, so the duplicate
-- finder on the player list stops suggesting them (player_a < player_b).
CREATE TABLE IF NOT EXISTS axsuck.player_not_duplicates (
  player_a TEXT NOT NULL REFERENCES axsuck.players(id) ON DELETE CASCADE ON UPDATE CASCADE,
  player_b TEXT NOT NULL REFERENCES axsuck.players(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_a, player_b),
  CHECK (player_a < player_b)
);
