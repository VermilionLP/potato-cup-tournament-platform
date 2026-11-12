-- The auto-scene script (tools/wt-autoscene) reports each live channel's game
-- state: hangar / battle / ended (left a battle), the live match it was for,
-- when it changed and when the script last checked in. The overlay follows
-- it (a battle shows the HUD, its end the bracket) unless the console picked
-- a scene after the change (overlay_set_at) or automation is paused.
ALTER TABLE axsuck.live_channels
  ADD COLUMN IF NOT EXISTS game_state TEXT CHECK (game_state IN ('hangar', 'battle', 'ended')),
  ADD COLUMN IF NOT EXISTS game_match_id INTEGER REFERENCES axsuck.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS game_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS game_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS autoscene_paused BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overlay_set_at TIMESTAMPTZ;
