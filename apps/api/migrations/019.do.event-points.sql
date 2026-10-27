SET search_path TO axsuck, public;

-- Potato Cup points (积分榜): an event's points per placing,
-- [{ "from": 1, "to": 1, "points": 100 }, ...], and the leaderboard season
-- (a year such as '2026') it counts towards. NULL = no points.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS points_table JSONB;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS points_season TEXT;
