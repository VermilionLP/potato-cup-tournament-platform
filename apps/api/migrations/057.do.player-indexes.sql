-- Indexes for lookups by player: a player's events (statistics, profile,
-- merges, deletes) and a player's time votes (merges, deletes). Both tables
-- were only indexed by tournament first.
CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON axsuck.tournament_players (player_id);
CREATE INDEX IF NOT EXISTS idx_time_votes_player ON axsuck.time_votes (player_id);
