SET search_path TO axsuck, public;

-- Potato Cup leaderboard seasons. Admins pick the current season (the
-- default for new events) and end a season: its leaderboard and Winter
-- Finals list are then frozen in `snapshot` and its events' points locked.
CREATE TABLE IF NOT EXISTS points_seasons (
  season TEXT PRIMARY KEY CHECK (season ~ '^\d{4}$'),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  ended_at TIMESTAMPTZ,
  snapshot JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS points_seasons_one_current ON points_seasons (is_current) WHERE is_current;
