-- Correct databases where 004 was first applied with DEFAULT NOW(): the
-- existing rows were stamped with the migration time instead of real activity.
UPDATE axsuck.players p
SET last_seen_at = GREATEST(
  p.created_at,
  COALESCE((SELECT MAX(tp.registered_at) FROM axsuck.tournament_players tp WHERE tp.player_id = p.id), p.created_at),
  COALESCE((SELECT MAX(tv.created_at) FROM axsuck.time_votes tv WHERE tv.player_id = p.id), p.created_at),
  COALESCE((SELECT MAX(cv.created_at) FROM axsuck.custom_votes cv WHERE cv.player_id = p.id), p.created_at)
);
