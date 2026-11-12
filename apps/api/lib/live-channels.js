// Live channels (migration 029): several streams of one event, each with its
// own live match and overlay scene / stage. Channel 1 is the default one.

export const MAX_LIVE_CHANNELS = 9;
export const OVERLAY_SCENES = ['auto', 'intro', 'ingame', 'intermission', 'hybrid', 'banpick', 'versus'];
export const OVERLAY_STAGE_RE = /^(main|wb|lb|gf|sw|gse|gwb|glb):\d{1,3}$/;

/** Channel number from a request (1 when left out); null when invalid. */
export function parseChannel(value) {
  if (value === undefined || value === null || value === '') return 1;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_LIVE_CHANNELS ? n : null;
}

/** State of a channel with no stored row. */
export function emptyChannel(channel) {
  return { channel, active_match_id: null, overlay_scene: 'auto', overlay_round: null, overlay_stage: null, countdown_end: null, overlay_set_at: null, game: null };
}

// Game states the auto-scene script reports (tools/wt-autoscene).
export const GAME_STATES = ['hangar', 'battle', 'ended'];
// The script checks in every 10 s; the server tells pages at most this often
// that it is still there, and pages count it gone after GAME_STALE_MS.
export const GAME_HEARTBEAT_MS = 30_000;
export const GAME_STALE_MS = 75_000;

/** A channel row's game part for pages, or null when no script ever reported. */
export function gameView(r = {}) {
  if (!r.game_seen_at && !r.autoscene_paused) return null;
  return {
    state: r.game_state ?? null,
    match_id: r.game_match_id ?? null,
    changed_at: r.game_changed_at ?? null,
    seen_at: r.game_seen_at ?? null,
    paused: Boolean(r.autoscene_paused),
  };
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
      countdown_end: r.countdown_end ?? null,
      overlay_set_at: r.overlay_set_at ?? null,
      game: r.game !== undefined ? r.game : gameView(r),
    }))
    .sort((a, b) => a.channel - b.channel);
}

// Longest match start countdown (24 hours).
export const MAX_COUNTDOWN_SECONDS = 24 * 60 * 60;

/**
 * End time of a countdown from a request body: { seconds } from now, or an
 * { end } time. null clears it; undefined = invalid (in the past, too far
 * ahead or not a time).
 */
export function countdownEnd(body = {}, now = Date.now()) {
  if (body.seconds === null || body.end === null || body.clear === true) return null;
  let end;
  if (body.seconds !== undefined) {
    const s = Number(body.seconds);
    if (!Number.isFinite(s)) return undefined;
    end = now + Math.round(s) * 1000;
  } else if (body.end !== undefined) {
    end = new Date(String(body.end)).getTime();
  } else return undefined;
  if (!Number.isFinite(end) || end <= now || end > now + MAX_COUNTDOWN_SECONDS * 1000) return undefined;
  return new Date(end);
}
