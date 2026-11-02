-- Check-in, opponent-confirmed results and personal push notices.

-- Check-in: an event can ask registered players to check in during the
-- 30 minutes before it starts; at the start an admin removes the players
-- who did not, or keeps them as forfeited (their matches are walkovers).
ALTER TABLE axsuck.tournaments
  ADD COLUMN IF NOT EXISTS checkin_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE axsuck.tournament_players
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forfeited BOOLEAN NOT NULL DEFAULT FALSE;

-- A result a player reported, waiting for the opponent (a score) or an
-- admin (a walkover claim): { kind, by, score1, score2, winner_id, at,
-- disputed, counter: { by, score1, score2, at } }. NULL once settled.
ALTER TABLE axsuck.matches
  ADD COLUMN IF NOT EXISTS pending_report JSONB;
CREATE INDEX IF NOT EXISTS idx_matches_pending_report
  ON axsuck.matches ((pending_report IS NOT NULL)) WHERE pending_report IS NOT NULL;

-- Push subscriptions remember the player who subscribed (when known), so
-- notices like "your match is ready" reach only that player.
ALTER TABLE axsuck.push_subscriptions
  ADD COLUMN IF NOT EXISTS player_id TEXT;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_player ON axsuck.push_subscriptions(player_id);

-- Personal notices already sent, so each goes out once.
CREATE TABLE IF NOT EXISTS axsuck.push_match_notices (
  match_id INTEGER NOT NULL REFERENCES axsuck.matches(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, kind)
);
