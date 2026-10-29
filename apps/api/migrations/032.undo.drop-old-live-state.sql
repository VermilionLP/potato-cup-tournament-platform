-- Columns back, filled from channel 1.
ALTER TABLE axsuck.tournaments
  ADD COLUMN IF NOT EXISTS active_match_id INTEGER,
  ADD COLUMN IF NOT EXISTS overlay_scene TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS overlay_round INTEGER,
  ADD COLUMN IF NOT EXISTS overlay_stage TEXT;
ALTER TABLE axsuck.tournaments DROP CONSTRAINT IF EXISTS fk_tournaments_active_match;
ALTER TABLE axsuck.tournaments
  ADD CONSTRAINT fk_tournaments_active_match
  FOREIGN KEY (active_match_id) REFERENCES axsuck.matches(id) ON DELETE SET NULL;
UPDATE axsuck.tournaments t
SET active_match_id = c.active_match_id, overlay_scene = c.overlay_scene,
    overlay_round = c.overlay_round, overlay_stage = c.overlay_stage
FROM axsuck.live_channels c
WHERE c.tournament_id = t.id AND c.channel = 1;
