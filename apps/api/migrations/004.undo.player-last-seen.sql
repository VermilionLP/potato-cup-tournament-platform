DROP INDEX IF EXISTS axsuck.idx_players_last_seen;
ALTER TABLE axsuck.players DROP COLUMN IF EXISTS last_seen_at;
