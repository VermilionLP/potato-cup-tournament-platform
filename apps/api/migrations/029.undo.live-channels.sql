-- Channel 1 goes back onto axsuck.tournaments; other channels are dropped.
UPDATE axsuck.tournaments t
SET active_match_id = c.active_match_id,
    overlay_scene = c.overlay_scene,
    overlay_round = c.overlay_round,
    overlay_stage = c.overlay_stage
FROM axsuck.live_channels c
WHERE c.tournament_id = t.id AND c.channel = 1;

DROP TABLE IF EXISTS axsuck.live_channels;
