-- Live channels: several streams of one event, each with its own live match
-- and overlay scene / stage. Consoles and OBS overlays pick a channel
-- (?channel=2); channel 1 is the default and takes over the state that was
-- on axsuck.tournaments (active_match_id, overlay_*), which is no longer read.
CREATE TABLE IF NOT EXISTS axsuck.live_channels (
  tournament_id TEXT NOT NULL REFERENCES axsuck.tournaments(id) ON DELETE CASCADE,
  channel SMALLINT NOT NULL CHECK (channel BETWEEN 1 AND 9),
  active_match_id INTEGER REFERENCES axsuck.matches(id) ON DELETE SET NULL,
  overlay_scene TEXT NOT NULL DEFAULT 'auto',
  overlay_round INTEGER,
  overlay_stage TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, channel)
);

-- A match is live on at most one channel of its event.
CREATE UNIQUE INDEX IF NOT EXISTS live_channels_active_match
  ON axsuck.live_channels (active_match_id) WHERE active_match_id IS NOT NULL;

INSERT INTO axsuck.live_channels (tournament_id, channel, active_match_id, overlay_scene, overlay_round, overlay_stage)
SELECT id, 1, active_match_id, COALESCE(overlay_scene, 'auto'), overlay_round, overlay_stage
FROM axsuck.tournaments
WHERE active_match_id IS NOT NULL
   OR COALESCE(overlay_scene, 'auto') <> 'auto'
   OR overlay_round IS NOT NULL
   OR overlay_stage IS NOT NULL
ON CONFLICT (tournament_id, channel) DO NOTHING;
