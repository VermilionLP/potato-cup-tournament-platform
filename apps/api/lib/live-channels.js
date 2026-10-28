// Live channels (migration 029): several streams of one event, each with its
// own live match and overlay scene / stage. Channel 1 is the default one.

export const MAX_LIVE_CHANNELS = 9;
export const OVERLAY_SCENES = ['auto', 'intro', 'ingame', 'intermission', 'hybrid'];
export const OVERLAY_STAGE_RE = /^(main|wb|lb|gf|sw|gse|gwb|glb):\d{1,3}$/;

/** Channel number from a request (1 when left out); null when invalid. */
export function parseChannel(value) {
  if (value === undefined || value === null || value === '') return 1;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LIVE_CHANNELS ? n : null;
}

/** State of a channel with no stored row. */
export function emptyChannel(channel) {
  return { channel, active_match_id: null, overlay_scene: 'auto', overlay_round: null, overlay_stage: null };
}

/**
 * The event's channels for GET /tournaments/:id, by number. Channel 1 is
 * always there, so a console or overlay without ?channel= has a state.
 */
export function liveChannelsView(rows = []) {
  const byChannel = new Map(rows.map((r) => [Number(r.channel), r]));
  if (!byChannel.has(1)) byChannel.set(1, emptyChannel(1));
  return [...byChannel.values()]
    .map((r) => ({
      channel: Number(r.channel),
      active_match_id: r.active_match_id ?? null,
      overlay_scene: r.overlay_scene || 'auto',
      overlay_round: r.overlay_round ?? null,
      overlay_stage: r.overlay_stage ?? null,
    }))
    .sort((a, b) => a.channel - b.channel);
}
