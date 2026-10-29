-- Look up a player's matches without scanning the whole table: deleting a
-- player (has played?), merges and renames (move player1 / player2 /
-- winner). Small today, but these run on every merge.
CREATE INDEX IF NOT EXISTS idx_matches_player1 ON axsuck.matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2 ON axsuck.matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_winner ON axsuck.matches(winner_id);
