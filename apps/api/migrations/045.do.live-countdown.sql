-- Match start countdown of a live channel: the OBS overlays show the time
-- left on every scene but the in-game HUD, and switch to the HUD when it
-- runs out. Cleared by hand, or when the scene is changed after it ended.
ALTER TABLE axsuck.live_channels ADD COLUMN IF NOT EXISTS countdown_end TIMESTAMPTZ;
