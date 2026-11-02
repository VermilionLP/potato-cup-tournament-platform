DROP TABLE IF EXISTS axsuck.push_match_notices;
DROP INDEX IF EXISTS axsuck.idx_push_subscriptions_player;
ALTER TABLE axsuck.push_subscriptions DROP COLUMN IF EXISTS player_id;
DROP INDEX IF EXISTS axsuck.idx_matches_pending_report;
ALTER TABLE axsuck.matches DROP COLUMN IF EXISTS pending_report;
ALTER TABLE axsuck.tournament_players
  DROP COLUMN IF EXISTS checked_in_at,
  DROP COLUMN IF EXISTS forfeited;
ALTER TABLE axsuck.tournaments DROP COLUMN IF EXISTS checkin_enabled;
