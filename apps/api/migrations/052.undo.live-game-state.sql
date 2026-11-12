ALTER TABLE axsuck.live_channels
  DROP COLUMN IF EXISTS game_state,
  DROP COLUMN IF EXISTS game_match_id,
  DROP COLUMN IF EXISTS game_changed_at,
  DROP COLUMN IF EXISTS game_seen_at,
  DROP COLUMN IF EXISTS autoscene_paused,
  DROP COLUMN IF EXISTS overlay_set_at;
