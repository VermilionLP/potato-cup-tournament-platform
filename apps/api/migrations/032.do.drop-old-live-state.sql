-- The live match and overlay state moved to axsuck.live_channels
-- (migration 029); the old columns on tournaments are no longer used.
ALTER TABLE axsuck.tournaments DROP CONSTRAINT IF EXISTS fk_tournaments_active_match;
ALTER TABLE axsuck.tournaments
  DROP COLUMN IF EXISTS active_match_id,
  DROP COLUMN IF EXISTS overlay_scene,
  DROP COLUMN IF EXISTS overlay_round,
  DROP COLUMN IF EXISTS overlay_stage;
