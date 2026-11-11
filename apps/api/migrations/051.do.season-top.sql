-- The season's Top 20 (lib/season-top.js): the ranking admins confirm
-- (player ids, #1 first) and when the reveal starts; one player is revealed
-- per day from the last place to #1. announced: how many reveals the QQ
-- group has been told about.
CREATE TABLE IF NOT EXISTS axsuck.season_top (
  season TEXT PRIMARY KEY,
  ranking JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_at TIMESTAMPTZ,
  announced INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
