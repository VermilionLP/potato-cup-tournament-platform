SET search_path TO axsuck, public;

-- Players created by the Liquipedia import got last_seen_at = the moment of
-- the import, so every historical player looked recently active. For players
-- who have only ever appeared in imported events (never registered, voted or
-- reported from the platform) use the date of their last event instead.
UPDATE players p
SET last_seen_at = last.played
FROM (
  SELECT tp.player_id, MAX(COALESCE(t.played_at, t.created_at)) AS played
  FROM tournament_players tp
  JOIN tournaments t ON t.id = tp.tournament_id
  GROUP BY tp.player_id
) last
WHERE last.player_id = p.id
  AND p.last_ip IS NULL
  AND NOT EXISTS (SELECT 1 FROM tournament_players o
                  WHERE o.player_id = p.id AND o.tournament_id NOT LIKE 'lp-%')
  AND NOT EXISTS (SELECT 1 FROM time_votes v WHERE v.player_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM custom_votes v WHERE v.player_id = p.id);
